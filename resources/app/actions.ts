import { List } from 'immutable'
import { Lens } from 'monocle-ts'
import { createAsyncAction, createStandardAction } from 'typesafe-actions'

import { AlbumSelector, AlbumShuffleSelector, SubsetKeys, AlbumKey, AlbumSelectors, Track, TimefillSelector, Playlist, TrackId } from './types'


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

export const updateSearch = createStandardAction('playlistgen/updateSearch')<{
    query: string
}>()

export const addTarget = createStandardAction('playlistgen/addTarget')<{}>()

export const changeTarget = createStandardAction('playlistgen/changeTarget')<{
    index: number
    value: string
}>()

export const togglePlaylistTrack = createStandardAction('playlistgen/togglePlaylistTrack')<{
    lens: Lens<TimefillSelector, Playlist>
    track: TrackId
}>()

export const setKeyboardAvailability = createStandardAction('playlistgen/setKeyboardAvailability')<{
    available: boolean
}>()

export const changeKey = createStandardAction('playlistgen/changeKey')<{
    key: string
    down: boolean
}>()

export const fetchTracks = createAsyncAction('playlistgen/fetchTracksRequest', 'playlistgen/fetchTracksSuccess', 'playlistgen/fetchTracksFailure')<void, {json: any}, Error>()

export const shuffleTracks = createAsyncAction('playlistgen/shuffleTracksRequest', 'playlistgen/shuffleTracksSuccess', 'playlistgen/shuffleTracksFailure')<{
    tracks: List<Track>
    lens: Lens<AlbumShuffleSelector, AlbumSelectors>
}, {
    json: any
    lens: Lens<AlbumShuffleSelector, AlbumSelectors>
}, Error>()

export const runTimefill = createAsyncAction('playlistgen/runTimefillRequest', 'playlistgen/runTimefillSuccess', 'playlistgen/runTimefillFailure')<{
    targets: List<string>
}, {
    json: any
}, Error>()

export const savePlaylist = createAsyncAction('playlistgen/savePlaylistRequest', 'playlistgen/savePlaylistSuccess', 'playlistgen/savePlaylistFailure')<{
    name: string
    tracks: List<Track>
}, never, Error>()
