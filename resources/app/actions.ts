import { List } from 'immutable'
import { Lens } from 'monocle-ts';
import { createAsyncAction, createStandardAction } from 'typesafe-actions'

import { AlbumSelector, AlbumShuffleSelector, SubsetKeys, AlbumKey } from './types'


export const toggleAlbumSelected = createStandardAction('playlistgen/toggleAlbumSelected')<{
    lens: Lens<AlbumShuffleSelector, AlbumSelector>
}>()

export const removeAlbum = createStandardAction('playlistgen/removeAlbum')<{
    lens: Lens<AlbumShuffleSelector, List<AlbumSelector>>
    album: AlbumKey
}>()

export const newAlbumSelector = createStandardAction('playlistgen/newAlbumSelector')<{
    initial?: List<AlbumSelector>
}>()

export const addSelectionTo = createStandardAction('playlistgen/addSelectionTo')<{
    lens: Lens<AlbumShuffleSelector, List<AlbumSelector>>
}>()

export const controlChange = createStandardAction('playlistgen/controlChange')<{
    prop: SubsetKeys<AlbumShuffleSelector, string>
    value: string
}>()

export const updateSearch = createStandardAction('playlistgen/updateSearch')<{
    query: string
}>()

export const fetchTracks = createAsyncAction('playlistgen/fetchTracksRequest', 'playlistgen/fetchTracksSuccess', 'playlistgen/fetchTracksFailure')<void, Object, Error>()
