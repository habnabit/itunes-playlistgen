from __future__ import print_function

import applescript
import arrow
import attr
import datetime
import functools
import json
import playlistgen
import random
import sys
import webbrowser
from klein import Klein
from playlistgen import typ
from twisted import logger
from twisted.internet import defer, endpoints
from twisted.internet.task import react
from twisted.web.http import HTTPChannel
from twisted.web.server import Request, Site
from twisted.web.static import File
from txspinneret import query as q


log = logger.Logger()


class reify(object):
    """ Use as a class method decorator.  It operates almost exactly like the
    Python ``@property`` decorator, but it puts the result of the method it
    decorates into the instance dict after the first call, effectively
    replacing the function it decorates with an instance variable.  It is, in
    Python parlance, a non-data descriptor.  The following is an example and
    its usage:

    .. doctest::

        >>> from pyramid.decorator import reify

        >>> class Foo(object):
        ...     @reify
        ...     def jammy(self):
        ...         print('jammy called')
        ...         return 1

        >>> f = Foo()
        >>> v = f.jammy
        jammy called
        >>> print(v)
        1
        >>> f.jammy
        1
        >>> # jammy func not called the second time; it replaced itself with 1
        >>> # Note: reassignment is possible
        >>> f.jammy = 2
        >>> f.jammy
        2
    """
    def __init__(self, wrapped):
        self.wrapped = wrapped
        functools.update_wrapper(self, wrapped)

    def __get__(self, inst, objtype=None):
        if inst is None:
            return self
        val = self.wrapped(inst)
        setattr(inst, self.wrapped.__name__, val)
        return val


def applescript_as_json(obj):
    if isinstance(obj, (list, tuple, set, frozenset)):
        return [applescript_as_json(x) for x in obj]
    elif isinstance(obj, dict):
        return {applescript_as_json(k): applescript_as_json(v)
                for k, v in obj.items()}
    elif isinstance(obj, applescript.AEType):
        return ('T_{}'.format(obj.code.strip()))
    elif isinstance(obj, applescript.AEEnum):
        if obj.code == 'kNon':
            return None
        else:
            return 'E_{}'.format(obj.code.strip())
    elif isinstance(obj, datetime.datetime):
        return (arrow.get(obj)
                .replace(tzinfo='local')
                .to('utc')
                .strftime('%Y-%m-%dT%H:%M:%SZ'))
    else:
        return obj


def as_json(func):
    @functools.wraps(func)
    def wrapper(self, request, *a, **kw):
        request.setHeader('Content-Type', 'application/json')
        resp = func(self, request, *a, **kw)
        return json.dumps({
            'data': resp,
            'error': None,
        })

    return wrapper


@attr.s(hash=False)
class TrackWeb(object):
    app = Klein()
    log = logger.Logger()

    tracks_obj = attr.ib()
    static_resource = attr.ib()
    done = attr.ib(default=attr.Factory(defer.Deferred))

    @reify
    def tracks(self):
        return self.tracks_obj.get_tracks()

    @reify
    def tracks_by_id(self):
        return {t[typ.pPIS]: t for t in self.tracks}

    @reify
    def tracks_as_json(self):
        return applescript_as_json(self.tracks)

    @app.route('/', branch=True)
    def index(self, request):
        request.prepath.append(request.postpath.pop())
        return self.static_resource.getChild('site.html', request)

    @app.route('/_static/', branch=True)
    def static(self, request):
        return self.static_resource

    @app.route('/_api/all-tracks')
    @as_json
    def all_tracks(self, request):
        return self.tracks_as_json

    @app.route('/_api/pick-albums')
    @as_json
    def pick_albums(self, request):
        parsed = q.parse({
            'n_albums': q.one(q.Integer),
            'n_choices': q.one(q.Integer),
            'scoring': q.one(playlistgen.SCORING.get),
            'unrecentness': q.one(q.Integer),
        }, request.args)
        scoring_cls = parsed.pop('scoring') or playlistgen.ScoreUniform
        scoring = playlistgen.make(
            scoring_cls, rng=random, unrecentess=parsed.pop('unrecentness'))
        tracks = scoring.score(self.tracks)
        picks = [
            {
                'score': score,
                'albums': [
                    {
                        'score': score,
                        'name': name,
                        'tracks': [t[typ.pPIS] for t in tracks],
                    }
                    for score, name, tracks in albums
                ]
            }
            for score, _, albums
            in playlistgen.pick_albums(random, tracks, **parsed)
        ]
        return picks

    @app.route('/_api/shuffle-together-albums')
    @as_json
    def shuffle_together_albums(self, request):
        parsed = q.parse({
            'tracks': q.many(self.tracks_by_id.get),
        }, request.args)
        albums_dict = {}
        for track in parsed['tracks']:
            key = playlistgen.album_key(track)
            albums_dict.setdefault(key, []).append(track)
        albums_list = [(0, key, tracks) for key, tracks in albums_dict.iteritems()]
        _, playlist = playlistgen.shuffle_together_album_tracks(random, albums_list)
        return [t[typ.pPIS] for t in playlist]

    @app.route('/_api/genius-albums')
    @as_json
    def genius_albums(self, request):
        tracks = playlistgen.filter_tracks_to_genius_albums(
            [(0, t) for t in self.tracks])
        return [t[typ.pPIS] for _, t in tracks]

    @app.route('/_api/save-and-exit', methods=['POST'])
    @as_json
    def save_and_exit(self, request):
        parsed = q.parse({
            'name': q.one(q.Text),
            'tracks': q.many(self.tracks_by_id.get),
        }, request.args)
        self.tracks_obj.set_default_dest(parsed['name'])
        self.tracks_obj.set_tracks(parsed['tracks'])
        request.notifyClose().chainDeferred(self.done)
        return True


class OnCloseRequest(Request):
    def notifyClose(self):
        self.setHeader('connection', 'close')
        d = self.channel._closeDeferred = defer.Deferred()
        return d


class OnCloseHttpChannel(HTTPChannel):
    _closeDeferred = None

    def connectionLost(self, reason):
        if self._closeDeferred is not None:
            self._closeDeferred.errback(reason)
        HTTPChannel.connectionLost(self, reason)


class OnCloseSite(Site):
    requestFactory = OnCloseRequest
    protocol = OnCloseHttpChannel


def webbrowser_open(port):
    url = 'http://localhost:{0.port}/'.format(port.getHost())
    log.info('listening at {url}', url=url)
    webbrowser.open(url)


def _run(reactor, tracks):
    static = File('./resources/dist')
    web = TrackWeb(tracks_obj=tracks, static_resource=static)
    web.tracks_as_json

    logger.globalLogBeginner.beginLoggingTo([
        logger.textFileLogObserver(sys.stderr)])

    site = OnCloseSite(web.app.resource())
    endpoint = endpoints.TCP6ServerEndpoint(reactor, 0, interface='::1')
    d = endpoint.listen(site)
    d.addCallback(webbrowser_open)
    d.addCallback(lambda ign: web.done)
    return d


def run(*args):
    react(_run, args)
