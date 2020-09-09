import { List, Map, OrderedMap, Record, Seq, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import { ActionType } from 'typesafe-actions'

import * as baseActions from '../actions'
import {
    Album,
    AlbumId,
    RawTrack,
    Track,
    TrackId,
    collateAlbums,
    isoTrackId,
} from '../types'
import * as actions from './actions'

export type AllActions = ActionType<typeof baseActions | typeof actions>

export type DiscogsTrack = {
    title: string
    position: string
    type_: string
}

export type DiscogsMaster = {
    artists: {
        id: number
        name: string
    }[]
    data_quality: string
    id: number
    images: {
        uri150: string
    }[]
    title: string
    tracklist: DiscogsTrack[]
    uri: string
}

export const filterTracks = (
    tracklist: DiscogsTrack[],
): Seq.Indexed<DiscogsTrack> =>
    Seq(tracklist).filter((t) => t.type_ === 'track' || t.type_ === 'index')

export class UnconfirmedAlbum extends Record({
    albumDiscogsId: 0,
    albumId: undefined as AlbumId,
    artist: '',
    title: '',
    discogsData: {} as DiscogsMaster,
    tracks: List<Track>(),
}) {
    constructor(raw: RawUnconfirmedAlbum) {
        super({
            albumDiscogsId: raw.album_discogs_id,
            albumId: raw.album_pid,
            artist: raw.artist,
            title: raw.title,
            discogsData: raw.discogs_data,
            tracks: List(raw.tracks).map((raw) => new Track(raw)),
        })
    }
}

type RawUnconfirmedAlbum = {
    album_discogs_id: number
    album_pid: AlbumId
    artist: string
    title: string
    discogs_data: any
    tracks: RawTrack[]
}

type UnconfirmedAlbums = {
    albums: RawUnconfirmedAlbum[]
}

export class AlbumReselector extends Record({
    url: '',
    json: undefined as any,
}) {}

export class DiscogsSelector extends Record({
    unconfirmedAlbums: List<UnconfirmedAlbum>(),
    albumCounts: Map<AlbumId, number>(),
    albumReselection: Map<number, AlbumReselector>(),
}) {
    withUnconfirmedAlbums(results: UnconfirmedAlbums): this {
        const unconfirmedAlbums = List(results.albums).map(
            (raw) => new UnconfirmedAlbum(raw),
        )
        const albumCounts = unconfirmedAlbums
            .groupBy((a) => a.albumId)
            .map((c) => c.count())
            .toMap()
        return this.merge({ unconfirmedAlbums, albumCounts })
    }

    withConfirmedAlbum(album: AlbumId): this {
        return this.update('unconfirmedAlbums', (l) =>
            l.filter((a) => a.albumId !== album),
        )
    }
}
