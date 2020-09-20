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

export type DiscogsTrack = Readonly<{
    title: string
    position: string
    type_: string
}>

export type DiscogsArtist = Readonly<{
    id: number
    name: string
}>

export type DiscogsMaster = Readonly<{
    artists: DiscogsArtist[]
    data_quality: string
    id: number
    images: {
        uri150: string
    }[]
    thumb: string
    title: string
    tracklist: DiscogsTrack[]
    uri: string
    year: number
}>

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

type RawUnconfirmedAlbum = Readonly<{
    album_discogs_id: number
    album_pid: AlbumId
    artist: string
    title: string
    discogs_data: any
    tracks: RawTrack[]
}>

type UnconfirmedAlbums = Readonly<{
    albums: RawUnconfirmedAlbum[]
}>

export class AlbumReselector extends Record({
    url: '',
    json: undefined as any,
}) {}

export class DiscogsUnconfirmedSelector extends Record({
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

export class Artist extends Record({
    id: 0,
    name: '',
}) {}

export type MatchedAlbum = Readonly<
    DiscogsMaster & {
        matched: boolean
    }
>

export type YearMap = Map<Artist, List<MatchedAlbum>>
export type MatchedMap = Map<number, YearMap>

type RawMatched = Readonly<{
    albums: Readonly<{
        discogs_data: DiscogsMaster
        matched: 0 | 1
    }>[]
}>

export class DiscogsMatchedSelector extends Record({
    showYears: Set<number>(),
    matched: Map() as MatchedMap,
}) {
    withMatchedAlbums(r: RawMatched): this {
        const artistMemo = Map<Artist, Artist>().asMutable()
        var ret: MatchedMap = Map()
        ret = ret.withMutations((m) => {
            for (const album of r.albums) {
                const data: MatchedAlbum = {
                    ...album.discogs_data,
                    matched: album.matched === 1,
                }
                m.update(data.year, Map(), (mm) =>
                    List(album.discogs_data.artists).reduce(
                        (artistMap, artist) => {
                            const pArtistKey = new Artist(artist)
                            var artistKey = artistMemo.get(pArtistKey)
                            if (artistKey === undefined) {
                                artistMemo.set(pArtistKey, pArtistKey)
                                artistKey = pArtistKey
                            }
                            return artistMap.update(artistKey, List(), (l) =>
                                l.push(data),
                            )
                        },
                        mm,
                    ),
                )
            }
        })
        return this.set('matched', ret)
    }
}
