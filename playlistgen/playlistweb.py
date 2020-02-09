from __future__ import print_function

import arrow
import attr
import datetime
import functools
import iTunesLibrary
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
from .playlistgen import ppis

log = logging.getLogger(__name__)


def itunes_as_json(obj):
    if isinstance(obj, (list, tuple, set, frozenset)):
        return [itunes_as_json(x) for x in obj]
    elif isinstance(obj, dict):
        return {itunes_as_json(k): itunes_as_json(v)
                for k, v in obj.items()}
    elif isinstance(obj, iTunesLibrary.ITLibMediaItem):
        return {
            'ppis': ppis(obj),
            'albumPpis': ppis(obj.album()),

            'title': obj.title(),
            'artist': obj.artist().name(),
            'album': obj.album().title(),

            'totalTime': obj.totalTime() / 1000,
        }
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


def serialize_itunes(obj, *a, **kw):
    return simplejson.dumps(itunes_as_json(obj), *a, **kw)


def track_methods(tracks, argv):
    tracks_by_id = {ppis(t): t for t in tracks.tracklist}

    def configurate(config):
        config.add_request_method(lambda _: argv, name='web_argv', reify=True)
        config.add_request_method(lambda _: tracks, name='tracks', reify=True)
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
        'dest_playlist': request.tracks.dest_playlist,
        'web_argv': request.web_argv,
    }


@view_config(route_name='genius_albums', renderer='json')
def genius_albums(request):
    tracks = playlistgen.filter_tracks_to_genius_albums(
        [(0, t) for t in self.tracks])
    return {
        'albums': [t[typ.pPIS] for _, t in tracks],
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


playlists_service = Service(name='playlists', path='/_api/playlists')


class PlaylistsBodySchema(Schema):
    names = fields.List(fields.String(), missing=())


class PlaylistsSchema(Schema):
    class Meta:
        unknown = marshmallow.EXCLUDE

    body = fields.Nested(PlaylistsBodySchema)


@playlists_service.get()
def tracks(request):
    return {
        'playlists': playlistgen.scripts.call('get_playlists'),
    }


@playlists_service.post(schema=PlaylistsSchema, validators=(marshmallow_validator,))
def tracks(request):
    names = request.validated['body']['names']
    if len(names) > 0:
        playlists = [request.tracks.playlists_by_name[n] for n in names]
    else:
        playlists = request.tracks.library.allPlaylists()
    return {
        'playlists': [
            (pl.name(), [ppis(t) for t in pl.items()])
            for pl in playlists
        ],
    }


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
        tracks = request.tracks.tracklist[offset : offset + parsed['count']]
    return {'tracks': tracks}


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


timefill_criteria_service = Service(name='timefill_criteria', path='/_api/timefill-criteria')


class TimefillCriteriaBodySchema(Schema):
    pull_prev = fields.Integer()
    keep = fields.Integer()
    n_options = fields.Integer()
    iterations = fields.Integer()
    exclude = fields.List(TrackField(), missing=())
    criteria = fields.List(
        fields.Function(deserialize=lambda s: playlistgen.parse_criterion(s)), missing=())


class TimefillCriteriaSchema(Schema):
    class Meta:
        unknown = marshmallow.EXCLUDE

    body = fields.Nested(TimefillCriteriaBodySchema)


@timefill_criteria_service.post(schema=TimefillCriteriaSchema, validators=(marshmallow_validator,))
def timefill_criteria(request):
    parsed = request.validated['body']
    to_exclude = set(parsed.pop('exclude'))
    local_tracklist = list(set(request.tracks.tracklist) - to_exclude)
    raw_criteria = tuple(request.tracks.raw_criteria) + tuple(parsed.pop('criteria'))
    local_tracks = attr.evolve(request.tracks, raw_criteria=raw_criteria)
    selections = playlistgen.search_criteria(
        local_tracks, tracklist=local_tracklist, **parsed)
    playlists = [{
        'score': str(s.score),
        'tracks': list(s.track_persistent_ids),
        'explanations': [e.format() for e in s.explanations.collapsed()],
    } for s in selections]
    return {'playlists': playlists}


modify_playlists_service = Service(name='modify_playlists', path='/_api/modify-playlists')


class PlaylistModificationSchema(Schema):
    name = fields.String(required=True)
    add = fields.List(TrackField(), missing=())
    remove = fields.List(TrackField(), missing=())


class ModifyPlaylistsBodySchema(Schema):
    modifications = fields.List(fields.Nested(PlaylistModificationSchema()))


class ModifyPlaylistsSchema(Schema):
    class Meta:
        unknown = marshmallow.EXCLUDE

    body = fields.Nested(ModifyPlaylistsBodySchema)


@modify_playlists_service.post(schema=ModifyPlaylistsSchema, validators=(marshmallow_validator,))
def modify_playlists(request):
    parsed = request.validated['body']
    all_splut = []
    for mod in parsed['modifications']:
        splut = mod['name'].splitlines()
        all_splut.append(splut)
        playlistgen.scripts.call(
            'append_tracks', splut, [ppis(t) for t in mod['add']], False)
        playlistgen.scripts.call(
            'remove_tracks', splut, [ppis(t) for t in mod['remove']])
    playlists = playlistgen.scripts.call(
        'get_specific_playlists', all_splut)
    return {'done': True, 'playlists': playlists}


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
    request.tracks.set_default_dest(parsed['name'])
    tracklist = parsed['tracks']
    selection = playlistgen.Selection(tracklist, range(len(tracklist)))
    request.tracks.save_selection(selection)
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
    from . import playlistweb
    with Configurator() as config:
        config.include('cornice')
        config.include(track_methods(tracks, argv))
        config.add_renderer('json', JSON(serialize_itunes))
        config.scan(playlistweb)

        config.add_route('index', '')
        config.add_static_view(name='_static', path='playlistgen:static')

        with config.route_prefix_context('_api'):
            config.add_route('web_argv', 'argv')
            config.add_route('genius_albums', 'genius-albums')
            config.add_exception_view(api_exception_view, renderer='json')

        app = config.make_wsgi_app()
    return app


def run(tracks, listen, argv):
    app = build_app(tracks, argv)
    waitress.serve(app, listen=listen)
