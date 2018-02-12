from __future__ import print_function

import applescript
import arrow
import attr
import datetime
import functools
import json
import sys
import webbrowser
from klein import Klein
from twisted import logger
from twisted.internet import defer, endpoints
from twisted.internet.task import react
from twisted.web.server import Site
from twisted.web.static import File


log = logger.Logger()


def applescript_as_json(obj):
    if isinstance(obj, (list, tuple)):
        return [applescript_as_json(x) for x in obj]
    elif isinstance(obj, dict):
        return {applescript_as_json(k): applescript_as_json(v)
                for k, v in obj.items()}
    elif isinstance(obj, applescript.AEType):
        return 'T_{}'.format(obj.code.strip())
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
        }, default=applescript_as_json)

    return wrapper


@attr.s(hash=False)
class TrackWeb(object):
    app = Klein()
    log = logger.Logger()

    tracks_obj = attr.ib()
    static_resource = attr.ib()
    tracks = attr.ib(default=(), repr=False)
    done = attr.ib(default=attr.Factory(defer.Deferred))

    def load_tracks(self):
        self.tracks = applescript_as_json(
            self.tracks_obj.get_tracks())

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
        return self.tracks


def webbrowser_open(port):
    url = 'http://localhost:{0.port}/'.format(port.getHost())
    log.info('listening at {url}', url=url)
    webbrowser.open(url)


def _run(reactor, tracks):
    static = File('./_web_static')
    web = TrackWeb(tracks_obj=tracks, static_resource=static)
    web.load_tracks()

    logger.globalLogBeginner.beginLoggingTo([
        logger.textFileLogObserver(sys.stderr)])

    site = Site(web.app.resource())
    endpoint = endpoints.TCP6ServerEndpoint(reactor, 0, interface='::1')
    d = endpoint.listen(site)
    d.addCallback(webbrowser_open)
    d.addCallback(lambda ign: web.done)
    return d


def run(*args):
    react(_run, args)
