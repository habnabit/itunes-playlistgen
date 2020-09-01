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

export type UnconfirmedAlbum = {
    album_discogs_id: number
    album_pid: AlbumId
    artist: string
    title: string
    discogs_data: any
    tracks: RawTrack[]
}

type UnconfirmedAlbums = {
    albums: UnconfirmedAlbum[]
}

export class DiscogsSelector extends Record({
    unconfirmedAlbums: List<UnconfirmedAlbum>(),
}) {
    withUnconfirmedAlbums(results: UnconfirmedAlbums): this {
        return this.set('unconfirmedAlbums', List(results.albums))
    }
}
