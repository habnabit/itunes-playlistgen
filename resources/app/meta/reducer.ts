import { getType } from 'typesafe-actions'

import * as baseActions from '../actions'
import * as actions from './actions'
import { AllActions, Done, Loaded, Loading, MetaState } from './types'

export default function metaReducer(
    state: MetaState,
    action: AllActions,
): MetaState {
    if (!state) {
        return null
    }

    switch (action.type) {
        case getType(baseActions.fetchArgv.success): {
            return state.update('state', (s) => {
                return s instanceof Loading
                    ? s.set('gotArgv', true).checkNext()
                    : s
            })
        }

        case getType(baseActions.fetchPlaylists.success): {
            return state.update('state', (s) => {
                return s instanceof Loading
                    ? s.set('gotPlaylists', true).checkNext()
                    : s
            })
        }

        case getType(baseActions.fetchTracksProgress): {
            const { offset } = action.payload
            return state.update('state', (s) => {
                return s instanceof Loading ? s.set('tracks', offset) : s
            })
        }

        case getType(baseActions.fetchTracks.success): {
            return state.update('state', (s) => {
                return s instanceof Loading
                    ? s.set('tracks', true).checkNext()
                    : s
            })
        }

        case getType(baseActions.fetchConsole.success): {
            return state.set('console', action.payload.json.screen)
        }

        case getType(baseActions.showError):
        case getType(baseActions.fetchArgv.failure):
        case getType(baseActions.fetchTracks.failure):
        case getType(baseActions.fetchPlaylists.failure):
        case getType(baseActions.fetchConsole.failure):
        case getType(baseActions.savePlaylist.failure): {
            return state.update('errors', (l) => l.push(action.payload.stack))
        }

        case getType(actions.dismissError): {
            const { index } = action.payload
            return state.update('errors', (errors) => errors.remove(index))
        }

        case getType(actions.trackArtworkMissing):
            return state.update('artworkErroredFor', (s) =>
                s.add(action.payload.id),
            )

        default:
            return state
    }
}
