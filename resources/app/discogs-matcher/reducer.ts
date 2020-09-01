import { List, Map } from 'immutable'
import { Random } from 'random-js'
import { getType } from 'typesafe-actions'

import * as baseActions from '../actions'
import * as actions from './actions'
import { AllActions, DiscogsSelector } from './types'

export default function discogsReducer(
    state = new DiscogsSelector(),
    action: AllActions,
): DiscogsSelector {
    switch (action.type) {
        case getType(actions.fetchUnconfirmedAlbums.success): {
            return state.withUnconfirmedAlbums(action.payload.json)
        }

        default:
            return state
    }
}
