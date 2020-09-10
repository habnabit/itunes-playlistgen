from __future__ import print_function

import arrow
import attr
import datetime
import functools
import iTunesLibrary
import json
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
from marshmallow import Schema, ValidationError, fields, validate
from pyramid.config import Configurator
from pyramid.httpexceptions import HTTPException, HTTPNotFound, HTTPNotImplemented
from pyramid.request import Request
from pyramid.response import Response
from pyramid.renderers import JSON
from pyramid.view import view_config

from . import _discogs_match, playlistgen
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
            'trackNumber': obj.trackNumber(),

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


class TrackField(fields.Field):
    def _serialize(self, value, attr, obj, **kwargs):
        raise NotImplementedError()

    def _deserialize(self, value, attr, data, **kwargs):
        tracks = self.context['request'].tracks_by_id
        if value not in tracks:
            raise ValidationError('no track by this id')
        return tracks[value]


class PlaylistField(fields.Field):
    def _serialize(self, value, attr, obj, **kwargs):
        raise NotImplementedError()

    def _deserialize(self, value, attr, data, **kwargs):
        playlists = self.context['request'].tracks.playlists_by_name
        if value not in playlists:
            raise ValidationError('no playlist by this name')
        return playlists[value]


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


def serialize_itunes(obj, *a, **kw):
    return simplejson.dumps(itunes_as_json(obj), *a, **kw)


def track_methods(tracks, argv):
    tracks_by_id = {ppis(t): t for t in tracks.all_songs}

    def configurate(config):
        config.add_request_method(lambda _: argv, name='web_argv', reify=True)
        config.add_request_method(lambda _: tracks, name='tracks', reify=True)
        config.add_request_method(lambda _: tracks_by_id, name='tracks_by_id', reify=True)
        config.add_request_method(
            lambda _: _discogs_match.Matcher.from_tracks(tracks),
            name='discogs_matcher', reify=True)

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


artwork_content_types = {
    iTunesLibrary.ITLibArtworkFormatBMP: 'image/bmp',
    iTunesLibrary.ITLibArtworkFormatGIF: 'image/gif',
    iTunesLibrary.ITLibArtworkFormatJPEG: 'image/jpeg',
    iTunesLibrary.ITLibArtworkFormatJPEG2000: 'image/jp2',
    iTunesLibrary.ITLibArtworkFormatPNG: 'image/png',
    iTunesLibrary.ITLibArtworkFormatTIFF: 'image/tiff',
}


@view_config(route_name='track_artwork')
def track_artwork(request):
    track = request.tracks_by_id.get(request.matchdict['id'])
    if track is None:
        raise HTTPNotFound()
    artwork = track.artwork()
    if artwork is None:
        raise HTTPNotFound()
    content_type = artwork_content_types.get(artwork.imageDataFormat())
    if content_type is None:
        raise HTTPNotImplemented()
    return Response(
        body=artwork.imageData().bytes(),
        content_type=content_type)


@view_config(route_name='unconfirmed_albums', renderer='json')
def unconfirmed_albums(request):
    m = request.discogs_matcher
    albums = m.group_by('album')
    for group in albums.values():
        group.tracks.sort(key=playlistgen.album_track_position)
    rows = list(m.random_unconfirmed_albums())
    for row in rows:
        row['album_discogs_id'] = row.pop('id')
        if row['discogs_data'] is not None:
            row['discogs_data'] = json.loads(row['discogs_data'])
        group = albums.get(row['album_pid'])
        row['tracks'] = group.tracks if group is not None else []
    return {'albums': rows}


confirm_service = Service(name='confirm', path='/_api/confirm')

class ConfirmBodySchema(Schema):
    db_id = fields.Integer(required=True)
    album_pid = fields.String(required=True)
    op = fields.String(required=True, validate=validate.OneOf([
        'found', 'missing', 'replace', 'later',
    ]))
    replace_with = fields.Raw(missing=None)
    rename = fields.List(
        fields.Tuple((TrackField(), fields.String())),
        missing=())


class ConfirmSchema(Schema):
    class Meta:
        unknown = marshmallow.EXCLUDE

    body = fields.Nested(ConfirmBodySchema)


@confirm_service.post(schema=ConfirmSchema, validators=(marshmallow_validator,))
def confirm(request):
    data = request.validated['body']
    db = request.discogs_matcher.db

    if data['rename']:
        playlistgen.scripts.call(
            'rename_tracks', [[ppis(t), n] for t, n in data['rename']])

    if data['op'] == 'found':
        db.query("""
            update album_discogs
            set confirmed = true
            where not confirmed
                and id = :db_id
        """, **data)
    elif data['op'] == 'missing':
        db.query("""
            update album_discogs
            set confirmed = true,
                discogs_id = NULL,
                discogs_data = NULL
            where not confirmed
                and id = :db_id
        """, **data)
    elif data['op'] == 'later':
        db.query("""
            delete from album_discogs
            where not confirmed
                and id = :db_id
        """, **data)
    elif data['op'] == 'replace':
        db.query("""
            update album_discogs
            set confirmed = true,
                discogs_id = :discogs_id,
                discogs_data = :discogs_data
            where not confirmed
                and id = :id
        """,
            discogs_id=data['replace_with']['id'],
            discogs_data=json.dumps(data['replace_with']),
            id=data['db_id'],
        )

    db.query("""
        delete from album_discogs
        where not confirmed
            and id != :db_id
            and album_pid = :album_pid
    """, **data)

    return {'confirmed': data['album_pid']}


playlists_service = Service(name='playlists', path='/_api/playlists')


class PlaylistsBodySchema(Schema):
    names = fields.List(PlaylistField(), missing=())


class PlaylistsSchema(Schema):
    class Meta:
        unknown = marshmallow.EXCLUDE

    body = fields.Nested(PlaylistsBodySchema)


def _default_playlists(tracks):
    return [
        pl
        for pl in tracks.library.allPlaylists()
        if pl.kind() in {iTunesLibrary.ITLibPlaylistKindRegular, iTunesLibrary.ITLibPlaylistKindSmart}
        and pl.distinguishedKind() == iTunesLibrary.ITLibDistinguishedPlaylistKindNone
        and not pl.name().startswith('<')
    ]


def _playlists_response(playlists, tracks):
    return {
        'playlists': [
            (pl.name(), [ppis(t) for t in pl.items()])
            for pl in playlists
        ],
    }


@playlists_service.get()
def get_playlists(request):
    return _playlists_response(_default_playlists(request.tracks), request.tracks)


@playlists_service.post(schema=PlaylistsSchema, validators=(marshmallow_validator,))
def get_specific_playlists(request):
    playlists = request.validated['body']['names']
    if len(playlists) == 0:
        playlists = _default_playlists(request.tracks)
    return _playlists_response(playlists, request.tracks)


tracks_service = Service(name='tracks', path='/_api/tracks')


class TracksQuerySchema(Schema):
    offset = fields.Integer(missing=0)
    count = fields.Integer(missing=2500)
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
        'tracks': [ppis(t) for t in playlist],
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
    name = PlaylistField(required=True)
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
    all_playlists = []
    for mod in parsed['modifications']:
        playlist = mod['name']
        all_playlists.append(playlist)
        playlistgen.scripts.call(
            'append_tracks', ppis(playlist), [ppis(t) for t in mod['add']], False)
        playlistgen.scripts.call(
            'remove_tracks', ppis(playlist), [ppis(t) for t in mod['remove']])
    return _playlists_response(all_playlists, request.tracks)


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
            config.add_route('track_artwork', 'track/{id}/artwork')
            config.add_route('unconfirmed_albums', 'unconfirmed/albums')
            config.add_exception_view(api_exception_view, renderer='json')

        app = config.make_wsgi_app()
    return app


def run(tracks, listen, argv):
    app = build_app(tracks, argv)
    waitress.serve(app, listen=listen)
