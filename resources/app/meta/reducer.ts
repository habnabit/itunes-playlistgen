import { getType } from 'typesafe-actions'

import * as baseActions from '../actions'
import { AllActions, Done, Loaded, Loading, MetaState } from './types'


export default function metaReducer(state = new MetaState(), action: AllActions): MetaState {
    switch (action.type) {
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

    default:
        return state
    }
}
