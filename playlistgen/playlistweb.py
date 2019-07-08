from __future__ import print_function

import applescript
import arrow
import attr
import datetime
import functools
import logging
import marshmallow
import numpy
import random
import simplejson
import sys
import waitress
import webbrowser
from cornice import Service
from cornice.validators import marshmallow_validator
from marshmallow import Schema, fields
from pyramid.config import Configurator
from pyramid.httpexceptions import HTTPException
from pyramid.request import Request
from pyramid.response import Response
from pyramid.renderers import JSON
from pyramid.view import view_config

from . import playlistgen
from .playlistgen import typ

log = logging.getLogger(__name__)


def applescript_as_json(obj):
    if isinstance(obj, (list, tuple, set, frozenset)):
        return [applescript_as_json(x) for x in obj]
    elif isinstance(obj, dict):
        return {applescript_as_json(k): applescript_as_json(v)
                for k, v in obj.items()}
    elif isinstance(obj, applescript.AEType):
        return 'T_{}'.format(obj.code.strip().decode())
    elif isinstance(obj, applescript.AEEnum):
        if obj.code == 'kNon':
            return None
        else:
            return 'E_{}'.format(obj.code.strip().decode())
    elif isinstance(obj, datetime.datetime):
        return (arrow.get(obj)
                .replace(tzinfo='local')
                .to('utc')
                .strftime('%Y-%m-%dT%H:%M:%SZ'))
    elif isinstance(obj, numpy.integer):
        return int(obj)
    elif isinstance(obj, numpy.number):
        return float(obj)
    else:
        return obj


def serialize_applescript(obj, *a, **kw):
    return simplejson.dumps(applescript_as_json(obj), *a, **kw)


def track_methods(tracks, argv):
    tracks_list = tracks.get_tracks()
    tracks_by_id = {t[typ.pPIS]: t for t in tracks_list}

    def configurate(config):
        config.add_request_method(lambda _: argv, name='web_argv', reify=True)
        config.add_request_method(lambda _: tracks, name='tracks_obj', reify=True)
        config.add_request_method(lambda _: tracks_list, name='tracks', reify=True)
        config.add_request_method(lambda _: tracks_by_id, name='tracks_by_id', reify=True)

    return configurate


@view_config(route_name='index')
def index(request):
    subreq = Request.blank('/_static/site.html')
    response = request.invoke_subrequest(subreq)
    return response


@view_config(route_name='web_argv', renderer='json')
def web_argv(request):
    return {
        'dest_playlist': request.tracks_obj.dest_playlist,
        'web_argv': request.web_argv,
    }


@view_config(route_name='genius_albums', renderer='json')
def genius_albums(request):
    tracks = playlistgen.filter_tracks_to_genius_albums(
        [(0, t) for t in self.tracks])
    return {
        'albums': [t[typ.pPIS] for _, t in tracks],
    }


@view_config(route_name='playlists', renderer='json')
def playlists(request):
    return {
        'playlists': playlistgen.scripts.call('get_playlists'),
    }


class TrackField(fields.Field):
    def _serialize(self, value, attr, obj, **kwargs):
        raise NotImplementedError()

    def _deserialize(self, value, attr, data, **kwargs):
        return self.context['request'].tracks_by_id[value]


class DelimitedString(fields.Field):
    def __init__(self, delimiter, instance_factory, **kwargs):
        super().__init__(**kwargs)
        self.delimiter = delimiter
        self.instance_factory = instance_factory

    def _bind_to_schema(self, field_name, schema):
        super()._bind_to_schema(field_name, schema)
        self.inner = self.instance_factory()
        self.inner.parent = self
        self.inner.name = field_name

    def _serialize(self, value, attr, obj, **kwargs):
        if value is None:
            return None
        items = [self.inner._serialize(each, attr, obj, **kwargs) for each in value]
        return self.delimiter.join(items)

    def _deserialize(self, value, attr, data, **kwargs):
        splut = value.split(self.delimiter)
        return [self.inner._deserialize(each, attr, data, **kwargs) for each in splut]


tracks_service = Service(name='tracks', path='/_api/tracks')


class TracksQuerySchema(Schema):
    offset = fields.Integer(missing=0)
    count = fields.Integer(missing=250)
    by_id = DelimitedString(',', TrackField)


class TracksSchema(Schema):
    class Meta:
        unknown = marshmallow.EXCLUDE

    querystring = fields.Nested(TracksQuerySchema)


@tracks_service.get(schema=TracksSchema, validators=(marshmallow_validator,))
def tracks(request):
    parsed = request.validated['querystring']
    if 'by_id' in parsed:
        tracks = parsed['by_id']
    else:
        offset = parsed['offset']
        tracks = request.tracks[offset : offset + parsed['count']]
    return {'tracks': tracks}


pick_albums_service = Service(name='pick_albums', path='/_api/pick-albums')


class PickAlbumsBodySchema(Schema):
    n_albums = fields.Integer(missing=5)
    n_choices = fields.Integer(missing=5)
    unrecentness = fields.Integer(missing=None)
    scoring_cls = fields.Method(
        deserialize='load_scoring_cls', missing=lambda: playlistgen.ScoreUniform)

    def load_scoring_cls(self, value):
        return playlistgen.SCORING[value]


class PickAlbumsSchema(Schema):
    class Meta:
        unknown = marshmallow.EXCLUDE

    body = fields.Nested(PickAlbumsBodySchema)


@pick_albums_service.post(schema=PickAlbumsSchema, validators=(marshmallow_validator,))
def pick_albums(request):
    parsed = request.validated['body']
    scoring = playlistgen.make(
        parsed.pop('scoring_cls'), unrecentess=parsed.pop('unrecentness'), rng=random)
    tracks = scoring.score(request.tracks)
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
            ],
        }
        for score, _, albums
        in playlistgen.pick_albums(random, tracks, **parsed)
    ]
    return {'picks': picks}


shuffle_together_albums_service = Service(
    name='shuffle_together_albums', path='/_api/shuffle-together-albums')


class ShuffleTogetherBodySchema(Schema):
    tracks = fields.List(TrackField(), required=True)


class ShuffleTogetherSchema(Schema):
    class Meta:
        unknown = marshmallow.EXCLUDE

    body = fields.Nested(ShuffleTogetherBodySchema)


@shuffle_together_albums_service.post(schema=ShuffleTogetherSchema, validators=(marshmallow_validator,))
def shuffle_together_albums(request):
    parsed = request.validated['body']
    albums_dict = {}
    for track in parsed['tracks']:
        key = playlistgen.album_key(track)
        albums_dict.setdefault(key, []).append(track)
    albums_list = [(0, key, tracks) for key, tracks in albums_dict.items()]
    info, playlist = playlistgen.shuffle_together_album_tracks(random, albums_list)
    return {
        'info': info,
        'tracks': [t[typ.pPIS] for t in playlist],
    }


timefill_targets_service = Service(name='timefill_targets', path='/_api/timefill-targets')


class TimefillTargetsBodySchema(Schema):
    pull_prev = fields.Integer()
    keep = fields.Integer()
    n_options = fields.Integer()
    iterations = fields.Integer()
    include = fields.List(TrackField(), missing=())
    exclude = fields.List(TrackField(), missing=())
    targets = fields.List(
        fields.Function(deserialize=playlistgen.parse_target), missing=())


class TimefillTargetsSchema(Schema):
    class Meta:
        unknown = marshmallow.EXCLUDE

    body = fields.Nested(TimefillTargetsBodySchema)


@timefill_targets_service.post(schema=TimefillTargetsSchema, validators=(marshmallow_validator,))
def timefill_targets(request):
    parsed = request.validated['body']
    to_exclude = {t[typ.pPIS] for t in parsed.pop('exclude')}
    local_tracks = [t for t in request.tracks if t[typ.pPIS] not in to_exclude]
    include_indexes = tuple({local_tracks.index(t) for t in parsed.pop('include')})
    playlists = playlistgen.timefill_search_targets(
        random, local_tracks, initial=include_indexes, **parsed)
    playlists = [{
        'score': score,
        'scores': scores,
        'tracks': [local_tracks[t][typ.pPIS] for t in tracks]
    } for score, scores, tracks in playlists]
    return {'playlists': playlists}


save_service = Service(name='save', path='/_api/save')


class SaveAndExitBodySchema(Schema):
    name = fields.String(required=True)
    tracks = fields.List(TrackField(), required=True)


class SaveAndExitSchema(Schema):
    class Meta:
        unknown = marshmallow.EXCLUDE

    body = fields.Nested(SaveAndExitBodySchema)


@save_service.post(schema=SaveAndExitSchema, validators=(marshmallow_validator,))
def save(request):
    parsed = request.validated['body']
    request.tracks_obj.set_default_dest(parsed['name'])
    request.tracks_obj.set_tracks(parsed['tracks'])
    return {'done': True}


def api_exception_view(exc, request):
    log.error('API error encountered', exc_info=request.exc_info)
    resp = request.response
    if isinstance(exc, HTTPException):
        resp.status = exc.code
    else:
        resp.status = 500
    return {
        'error': True,
    }


def build_app(tracks, argv):
    with Configurator() as config:
        config.include('cornice')
        config.include(track_methods(tracks, argv))
        config.add_renderer('json', JSON(serialize_applescript))
        config.scan()

        config.add_route('index', '')
        config.add_static_view(name='_static', path='playlistgen:static')

        with config.route_prefix_context('_api'):
            config.add_route('web_argv', 'argv')
            config.add_route('genius_albums', 'genius-albums')
            config.add_route('playlists', 'playlists')
            config.add_exception_view(api_exception_view, renderer='json')

        app = config.make_wsgi_app()
    return app


def run(tracks, listen, argv):
    app = build_app(tracks, argv)
    waitress.serve(app, listen=listen)
