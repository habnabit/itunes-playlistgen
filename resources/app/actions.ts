import { List } from 'immutable'
import { Lens } from 'monocle-ts'
import { createAsyncAction, createStandardAction } from 'typesafe-actions'

import { AlbumKey, AlbumSelector, AlbumSelectors, AlbumShuffleSelector, SubsetKeys, Track, TrackId } from './types'


export const toggleAlbumSelected = createStandardAction('playlistgen/toggleAlbumSelected')<{
    lens: Lens<AlbumShuffleSelector, AlbumSelector>
}>()

export const removeAlbum = createStandardAction('playlistgen/removeAlbum')<{
    lens: Lens<AlbumShuffleSelector, AlbumSelectors>
    album: AlbumKey
}>()

export const newAlbumSelector = createStandardAction('playlistgen/newAlbumSelector')<{
    initial?: AlbumSelectors
}>()

export const addSelectionTo = createStandardAction('playlistgen/addSelectionTo')<{
    lens: Lens<AlbumShuffleSelector, AlbumSelectors>
}>()

export const changeControl = createStandardAction('playlistgen/controlChange')<{
    prop: SubsetKeys<AlbumShuffleSelector, string>
    value: string
}>()

export const performSearch = createStandardAction('playlistgen/performSearch')()

export const addTarget = createStandardAction('playlistgen/addTarget')<{}>()

export const addWeight = createStandardAction('playlistgen/addWeight')<{}>()

export const changeWeight = createStandardAction('playlistgen/changeWeight')<{
    index: number
    event: React.ChangeEvent
}>()

export const setKeyboardAvailability = createStandardAction('playlistgen/setKeyboardAvailability')<{
    available: boolean
}>()

export const changeKey = createStandardAction('playlistgen/changeKey')<{
    key: string
    down: boolean
}>()

export const setHash = createStandardAction('playlistgen/setHash')<void>()

export const fetchTracks = createAsyncAction('playlistgen/fetchTracksRequest', 'playlistgen/fetchTracksSuccess', 'playlistgen/fetchTracksFailure')<void, {
    tracks: any[][]
}, Error>()

export const fetchTracksProgress = createStandardAction('playlistgen/fetchTracksProgress')<{
    offset: number
}>()

export const fetchPlaylists = createAsyncAction('playlistgen/fetchPlaylistsRequest', 'playlistgen/fetchPlaylistsSuccess', 'playlistgen/fetchPlaylistsFailure')<void, {json: any}, Error>()

export const shuffleTracks = createAsyncAction('playlistgen/shuffleTracksRequest', 'playlistgen/shuffleTracksSuccess', 'playlistgen/shuffleTracksFailure')<{
    tracks: List<Track>
    lens: Lens<AlbumShuffleSelector, AlbumSelectors>
}, {
    json: any
    lens: Lens<AlbumShuffleSelector, AlbumSelectors>
}, Error>()

export const savePlaylist = createAsyncAction('playlistgen/savePlaylistRequest', 'playlistgen/savePlaylistSuccess', 'playlistgen/savePlaylistFailure')<{
    name: string
    tracks: List<Track>
}, never, Error>()
