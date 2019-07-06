import { getType } from 'typesafe-actions'

import * as baseActions from '../actions'
import { AllActions, Done, Loaded, Loading, MetaState } from './types'

export default function metaReducer(state = new MetaState(), action: AllActions): MetaState {
    switch (action.type) {
    case getType(baseActions.fetchArgv.success): {
        return state.set('gotArgv', true)
    }

    case getType(baseActions.fetchTracksProgress): {
        const { offset } = action.payload
        return state.update('state', (s) => {
            if (s instanceof Loading) {
                return s.set('tracks', offset)
            } else {
                return s
            }
        })
    }

    case getType(baseActions.fetchTracks.success): {
        return state.update('state', (s) => {
            if (s instanceof Loading) {
                return new Loaded()
            } else {
                return s
            }
        })
    }

    case getType(baseActions.savePlaylist.success): {
        return state.update('state', (s) => {
            if (s instanceof Loaded) {
                return new Done()
            } else {
                return s
            }
        })
    }

    case getType(baseActions.showError):
    case getType(baseActions.fetchArgv.failure):
    case getType(baseActions.fetchTracks.failure):
    case getType(baseActions.fetchPlaylists.failure): {
        const err = action.payload
        const message = `${err.name}: ${err.message}; ${err.stack}`
        return state.update('errors', (l) => l.push(message))
    }

    default:
        return state
    }
}
