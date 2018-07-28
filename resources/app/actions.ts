import { List } from 'immutable'
import { createAsyncAction, createStandardAction } from 'typesafe-actions'

import { AlbumSelector, AlbumShuffleSelector, SubsetKeys } from './types'


export const toggleAlbumSelected = createStandardAction('playlistgen/toggleAlbumSelected')<{
    path: [number, number]
}>()

export const removeAlbum = createStandardAction('playlistgen/removeAlbum')<{
    path: [number, number]
}>()

export const newAlbumSelector = createStandardAction('playlistgen/newAlbumSelector')<{
    initial?: List<AlbumSelector>
}>()

export const controlChange = createStandardAction('playlistgen/controlChange')<{
    prop: SubsetKeys<AlbumShuffleSelector, string>
    value: string
}>()

export const fetchTracks = createAsyncAction('playlistgen/fetchTracksRequest', 'playlistgen/fetchTracksSuccess', 'playlistgen/fetchTracksFailure')<void, Object, Error>()
