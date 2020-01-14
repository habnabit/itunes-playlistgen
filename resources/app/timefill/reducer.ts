import { Map, List } from 'immutable'
import { getType } from 'typesafe-actions'

import * as baseActions from '../actions'
import * as actions from './actions'
import { AllActions, Choice, TimefillSelector } from './types'

export default function timefillReducer(state = new TimefillSelector(), action: AllActions): TimefillSelector {
    switch (action.type) {
    case getType(actions.changeControl): {
        const { lens, value } = action.payload
        return lens.set(value)(state)
    }

    case getType(actions.addCriterion):
        return state.update('criteria', (l) => l.push(''))

    case getType(actions.removeCriterion): {
        const { index } = action.payload
        return state.update('criteria', (criteria) => criteria.remove(index))
    }

    case getType(actions.clearAllForLoading): {
        const loading = new Choice({loading: true})
        return state.set('choices', List([loading]))
    }

    case getType(actions.setLoading): {
        const { lens, loading } = action.payload
        return lens.modify((pl) => pl.set('loading', loading))(state)
    }

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

    case getType(baseActions.fetchArgv.success):
        return state.withArgv(action.payload.json)

    case getType(baseActions.fetchTracks.success):
        return state.withTracksResponse(action.payload.tracks)

    case getType(actions.runTimefill.success):
        return state.withTimefillResponse(action.payload.json, action.payload.replace)

    default:
        return state
    }
}
