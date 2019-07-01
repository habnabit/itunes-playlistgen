import { Map, Seq } from 'immutable'
import * as qs from 'qs'
import { applyMiddleware, createStore, DeepPartial, Reducer, Store } from 'redux'
import { createEpicMiddleware, Epic } from 'redux-observable'
import { from } from 'rxjs'
import { debounceTime, filter, map, mergeMap, switchMap } from 'rxjs/operators'
import { ActionType, getType, isActionOf } from 'typesafe-actions'

import * as baseActions from '../actions'
import { AlbumKey, AlbumSelector, AlbumSelectors, AlbumShuffleSelector, isoTrackId, TrackId } from '../types'
import * as actions from './actions'
import { AllActions, TimefillSelector } from './types'


export default function timefillReducer(state = new TimefillSelector(), action: AllActions): TimefillSelector {
    console.log(action)
    switch (action.type) {
    case getType(actions.changeControl): {
        const { lens, value } = action.payload
        return lens.set(value)(state)
    }

    case getType(actions.addTarget):
        return state.update('targets', (l) => l.push(''))

    // case getType(actions.addWeight):
    //     const first = state.albums.keySeq().first<AlbumKey>()
    //     return state.update('weights', (l) => l.push([first, '']))

    // case getType(actions.changeWeight): {
    //     const { index, event } = action.payload
    //     return state.update('weights', (l) => l.update(index, ([key, weight]) => {
    //         if (event.target instanceof HTMLInputElement) {
    //             weight = event.target.value
    //         } else if (event.target instanceof HTMLSelectElement) {
    //             key = state.albums.toIndexedSeq().get(event.target.selectedIndex).key
    //         }
    //         return [key, weight]
    //     }))
    // }

    case getType(actions.toggleChoiceTrack): {
        const { lens, track } = action.payload
        const selection = state.currentSelection()
        return lens.modify((pl) =>
            pl.update('selected', (m) =>
                m.update(track, undefined, (cur) => cur === selection? undefined : selection))
        )(state)
    }

    case getType(actions.clearChoiceTrack): {
        const { track } = action.payload
        return state.withClearedSelection(track)
    }

    case getType(baseActions.setKeyboardAvailability):
        return state.merge({keyboardAvailable: action.payload.available, keysDown: Map()})

    case getType(baseActions.changeKey):
        if (state.keyboardAvailable) {
            return state.update('keysDown', (m) =>
                m.set(action.payload.key, action.payload.down))
        } else {
            return state
        }

    // case getType(actions.setHash):
    //     location.hash = "#" + JSON.stringify({
    //         name: state.name,
    //         targets: state.targets.toArray(),
    //         weights: state.weights.map(([k, w]) => [k.toJSON(), w]).toArray(),
    //     })
    //     return state

    case getType(baseActions.fetchTracks.success):
        return state.withTracksResponse(action.payload.tracks)

    case getType(actions.runTimefill.success):
        return state.withTimefillResponse(action.payload.json, action.payload.replace)

    default:
        return state
    }
}
