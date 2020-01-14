import { List, Map, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import { createAsyncAction, createStandardAction } from 'typesafe-actions'

import { TrackId } from '../types'
import { Choice, ChoiceTrackSelection, TimefillSelector } from './types'

export const performSearch = createStandardAction('playlistgen/timefill/performSearch')()

export const changeControl = createStandardAction('playlistgen/timefill/changeControl')<{
    lens: Lens<TimefillSelector, string>
    value: string
}>()

export const addCriterion = createStandardAction('playlistgen/timefill/addCriterion')<{}>()
export const removeCriterion = createStandardAction('playlistgen/timefill/removeCriterion')<{
    index: number
}>()

// export const addWeight = createStandardAction('playlistgen/addWeight')<{}>()

// export const changeWeight = createStandardAction('playlistgen/changeWeight')<{
//     index: number
//     event: React.ChangeEvent
// }>()

export const clearAllForLoading = createStandardAction('playlistgen/clearAllForLoading')()

export const setLoading = createStandardAction('playlistgen/setLoading')<{
    lens: Lens<TimefillSelector, Choice>
    loading: boolean
}>()

export const toggleChoiceTrack = createStandardAction('playlistgen/toggleChoiceTrack')<{
    lens: Lens<TimefillSelector, Choice>
    track: TrackId
}>()

export const clearChoiceTrack = createStandardAction('playlistgen/clearChoiceTrack')<{
    track: TrackId
}>()

export const runTimefill = createAsyncAction('playlistgen/timefill/runTimefill/request', 'playlistgen/timefill/runTimefill/success', 'playlistgen/timefill/runTimefill/failure')<{
    criteria: List<string>
    selections: Map<ChoiceTrackSelection, Set<TrackId>>
    replace?: Lens<TimefillSelector, Choice>
}, {
    json: any
    replace?: Lens<TimefillSelector, Choice>
}, Error>()
