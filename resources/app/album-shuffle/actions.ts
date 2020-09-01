import { List } from 'immutable'
import { Lens } from 'monocle-ts'
import { createAction, createAsyncAction } from 'typesafe-actions'

import { AlbumId, SubsetKeys, Track, TrackId } from '../types'
import { AlbumSelector, AlbumSelectors, AlbumShuffleSelector } from './types'

export const toggleAlbumSelected = createAction(
    'playlistgen/album-shuffle/toggleAlbumSelected',
)<{
    lens: Lens<AlbumShuffleSelector, AlbumSelector>
}>()

export const removeAlbum = createAction(
    'playlistgen/album-shuffle/removeAlbum',
)<{
    album: AlbumId
}>()

export const addSelection = createAction(
    'playlistgen/album-shuffle/addSelection',
)()

export const changeControl = createAction(
    'playlistgen/album-shuffle/controlChange',
)<{
    prop: SubsetKeys<AlbumShuffleSelector, string>
    value: string
}>()

export const performSearch = createAction('playlistgen/performSearch')()

export const hoverTrack = createAction('playlistgen/album-shuffle/hoverTrack')<{
    idx: number
}>()

export const shuffleTracks = createAsyncAction(
    'playlistgen/album-shuffle/shuffleTracks/request',
    'playlistgen/album-shuffle/shuffleTracks/success',
    'playlistgen/album-shuffle/shuffleTracks/failure',
)<
    {
        tracks: List<Track>
    },
    {
        json: any
    },
    Error
>()
