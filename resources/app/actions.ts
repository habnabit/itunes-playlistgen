import { List } from 'immutable'
import { createAction, createAsyncAction } from 'typesafe-actions'

import { Track } from './types'

export const performSearch = createAction('playlistgen/performSearch')()

export const setKeyboardAvailability = createAction(
    'playlistgen/setKeyboardAvailability',
)<{
    available: boolean
}>()

export const changeKey = createAction('playlistgen/changeKey')<{
    key: string
    down: boolean
}>()

export const showError = createAction('playlistgen/showError')<Error>()

export const setHash = createAction('playlistgen/setHash')<void>()

export const fetchArgv = createAsyncAction(
    'playlistgen/fetchArgv/request',
    'playlistgen/fetchArgv/success',
    'playlistgen/fetchArgv/failure',
)<
    void,
    {
        json: any
    },
    Error
>()

export const fetchTracks = createAsyncAction(
    'playlistgen/fetchTracks/request',
    'playlistgen/fetchTracks/success',
    'playlistgen/fetchTracks/failure',
)<
    void,
    {
        tracks: any[][]
    },
    Error
>()

export const fetchTracksProgress = createAction(
    'playlistgen/fetchTracks/progress',
)<{
    offset: number
}>()

export const fetchPlaylists = createAsyncAction(
    'playlistgen/fetchPlaylists/request',
    'playlistgen/fetchPlaylists/success',
    'playlistgen/fetchPlaylists/failure',
)<
    {
        names?: string[]
    },
    {
        json: any
    },
    Error
>()

export const finishedLoading = createAction('playlistgen/finishedLoading')<
    void
>()

export const fetchConsole = createAsyncAction(
    'playlistgen/fetchConsole/request',
    'playlistgen/fetchConsole/success',
    'playlistgen/fetchConsole/failure',
)<
    {
        hashed?: string
        poll_interval?: number
    },
    {
        json: any
    },
    Error
>()

export const savePlaylist = createAsyncAction(
    'playlistgen/savePlaylist/request',
    'playlistgen/savePlaylist/success',
    'playlistgen/savePlaylist/failure',
)<
    {
        name: string
        tracks: List<Track>
    },
    {
        json: any
    },
    Error
>()
