import { List } from 'immutable'
import { Lens } from 'monocle-ts'
import { createAsyncAction, createStandardAction } from 'typesafe-actions'

import { AlbumId, SubsetKeys, Track } from '../types'
import { AlbumSelector, AlbumSelectors, AlbumShuffleSelector } from './types'

export const toggleAlbumSelected = createStandardAction('playlistgen/album-shuffle/toggleAlbumSelected')<{
    lens: Lens<AlbumShuffleSelector, AlbumSelector>
}>()

export const removeAlbum = createStandardAction('playlistgen/album-shuffle/removeAlbum')<{
    album: AlbumId
}>()

export const addSelection = createStandardAction('playlistgen/album-shuffle/addSelection')()

export const changeControl = createStandardAction('playlistgen/album-shuffle/controlChange')<{
    prop: SubsetKeys<AlbumShuffleSelector, string>
    value: string
}>()

export const performSearch = createStandardAction('playlistgen/performSearch')()

export const shuffleTracks = createAsyncAction('playlistgen/album-shuffle/shuffleTracks/request', 'playlistgen/album-shuffle/shuffleTracks/success', 'playlistgen/album-shuffle/shuffleTracks/failure')<{
    tracks: List<Track>
}, {
    json: any
}, Error>()
