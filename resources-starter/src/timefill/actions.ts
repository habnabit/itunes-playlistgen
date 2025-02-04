import { Argv, Playlists, Tracks } from '../meta'
import {
    Choice,
    ChoiceTrackSelection,
    PlaylistModification,
    TimefillSelector,
} from './types'
import { List, Map, Set } from 'immutable'
import { createAction, createAsyncAction } from 'typesafe-actions'

import { Lens } from 'monocle-ts'
import { TrackId } from '../types'
import { URLSearchParamsInit } from 'react-router-dom'

export const initialFetched = createAction(
    'playlistgen/timefill/initialFetched',
)<{
    argv: Argv
    tracks: Tracks
    playlists: Playlists
    searchParams: URLSearchParams
}>()

export const performSearch = createAction(
    'playlistgen/timefill/performSearch',
)()

export const changeControl = createAction(
    'playlistgen/timefill/changeControl',
)<{
    lens: Lens<TimefillSelector, string>
    value: string
}>()

export const addCriterion = createAction(
    'playlistgen/timefill/addCriterion',
)<{}>()
export const removeCriterion = createAction(
    'playlistgen/timefill/removeCriterion',
)<{
    index: number
}>()

// export const addWeight = createAction('playlistgen/addWeight')<{}>()

// export const changeWeight = createAction('playlistgen/changeWeight')<{
//     index: number
//     event: React.ChangeEvent
// }>()

export const clearAllForLoading = createAction(
    'playlistgen/clearAllForLoading',
)()

export const setLoading = createAction('playlistgen/setLoading')<{
    lens: Lens<TimefillSelector, Choice>
    loading: boolean
}>()

export const shuffleChoice = createAction('playlistgen/shuffleChoice')<{
    lens: Lens<TimefillSelector, Choice>
}>()

export const updateKeys = createAction('playlistgen/updateKeys')<{
    keysDown: Map<string, boolean>
}>()

export const toggleChoiceTrack = createAction('playlistgen/toggleChoiceTrack')<{
    lens: Lens<TimefillSelector, Choice>
    track: TrackId
    selection: ChoiceTrackSelection | '_current'
}>()

export const clearChoiceTrack = createAction('playlistgen/clearChoiceTrack')<{
    track: TrackId
}>()

export const runTimefill = createAsyncAction(
    'playlistgen/timefill/runTimefill/request',
    'playlistgen/timefill/runTimefill/success',
    'playlistgen/timefill/runTimefill/failure',
)<
    {
        criteria: List<string>
        selections: Map<ChoiceTrackSelection, Set<TrackId>>
        type: 'wide' | 'narrow' | 'daily'
        replace?: Lens<TimefillSelector, Choice>
    },
    {
        json: any
        replace?: Lens<TimefillSelector, Choice>
    },
    Error
>()

export const modifyPlaylists = createAsyncAction(
    'playlistgen/timefill/modifyPlaylists/request',
    'playlistgen/timefill/modifyPlaylists/success',
    'playlistgen/timefill/modifyPlaylists/failure',
)<
    {
        modifications: PlaylistModification[]
    },
    {
        json: any
    },
    Error
>()

export const mustUpdateSearchParams = createAction(
    'playlistgen/timefill/mustUpdateSearchParams',
)<{
    setSearchParams: (p: URLSearchParamsInit) => void
}>()
