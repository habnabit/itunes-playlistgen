import { List, Map, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import { createAsyncAction, createStandardAction } from 'typesafe-actions'

import { AlbumKey, AlbumSelector, AlbumSelectors, AlbumShuffleSelector, SubsetKeys, Track, TrackId } from '../types'
import { Choice, ChoiceTrackSelection, TimefillSelector } from './types'


export const performSearch = createStandardAction('playlistgen/timefill/performSearch')()

export const changeControl = createStandardAction('playlistgen/timefill/changeControl')<{
    lens: Lens<TimefillSelector, string>
    value: string
}>()

export const addTarget = createStandardAction('playlistgen/timefill/addTarget')<{}>()
export const removeTarget = createStandardAction('playlistgen/timefill/removeTarget')<{
    index: number
}>()

// export const addWeight = createStandardAction('playlistgen/addWeight')<{}>()

// export const changeWeight = createStandardAction('playlistgen/changeWeight')<{
//     index: number
//     event: React.ChangeEvent
// }>()

export const toggleChoiceTrack = createStandardAction('playlistgen/toggleChoiceTrack')<{
    lens: Lens<TimefillSelector, Choice>
    track: TrackId
}>()

export const clearChoiceTrack = createStandardAction('playlistgen/clearChoiceTrack')<{
    track: TrackId
}>()

// export const setKeyboardAvailability = createStandardAction('playlistgen/setKeyboardAvailability')<{
//     available: boolean
// }>()

export const runTimefill = createAsyncAction('playlistgen/timefill/runTimefill/request', 'playlistgen/timefill/runTimefill/success', 'playlistgen/timefill/runTimefill/failure')<{
    targets: List<string>
    selections: Map<ChoiceTrackSelection, Set<TrackId>>
    replace?: Lens<TimefillSelector, Choice>
}, {
    json: any
    replace?: Lens<TimefillSelector, Choice>
}, Error>()
