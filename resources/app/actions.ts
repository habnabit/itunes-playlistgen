import { List } from 'immutable'
import { Lens } from 'monocle-ts'
import { createAsyncAction, createStandardAction } from 'typesafe-actions'

import { AlbumKey, SubsetKeys, Track } from './types'

export const performSearch = createStandardAction('playlistgen/performSearch')()

export const setKeyboardAvailability = createStandardAction('playlistgen/setKeyboardAvailability')<{
    available: boolean
}>()

export const changeKey = createStandardAction('playlistgen/changeKey')<{
    key: string
    down: boolean
}>()

export const showError = createStandardAction('playlistgen/showError')<Error>()

export const setHash = createStandardAction('playlistgen/setHash')<void>()

export const fetchArgv = createAsyncAction('playlistgen/fetchArgv/request', 'playlistgen/fetchArgv/success', 'playlistgen/fetchArgv/failure')<void, {
    json: any
}, Error>()

export const fetchTracks = createAsyncAction('playlistgen/fetchTracks/request', 'playlistgen/fetchTracks/success', 'playlistgen/fetchTracks/failure')<void, {
    tracks: any[][]
}, Error>()

export const fetchTracksProgress = createStandardAction('playlistgen/fetchTracks/progress')<{
    offset: number
}>()

export const fetchPlaylists = createAsyncAction('playlistgen/fetchPlaylists/request', 'playlistgen/fetchPlaylists/success', 'playlistgen/fetchPlaylists/failure')<void, {json: any}, Error>()

export const savePlaylist = createAsyncAction('playlistgen/savePlaylist/request', 'playlistgen/savePlaylist/success', 'playlistgen/savePlaylist/failure')<{
    name: string
    tracks: List<Track>
}, never, Error>()
