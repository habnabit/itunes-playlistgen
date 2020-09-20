import { List, Map } from 'immutable'
import { Random } from 'random-js'
import { getType } from 'typesafe-actions'

import * as baseActions from '../actions'
import * as actions from './actions'
import {
    AllActions,
    DiscogsMatchedSelector,
    DiscogsUnconfirmedSelector,
} from './types'

export function discogsUnconfirmedReducer(
    state = new DiscogsUnconfirmedSelector(),
    action: AllActions,
): DiscogsUnconfirmedSelector {
    switch (action.type) {
        case getType(actions.changeUrl): {
            const { lens, value } = action.payload
            return lens.modify((r) => r.set('url', value))(state)
        }

        case getType(actions.fetchUnconfirmedAlbums.success): {
            return state.withUnconfirmedAlbums(action.payload.json)
        }

        case getType(actions.fetchFromDiscogs.success): {
            const { lens, json } = action.payload
            return lens.modify((r) => r.set('json', json))(state)
        }

        case getType(actions.confirm.success): {
            const { confirmed } = action.payload.json
            return state.withConfirmedAlbum(confirmed)
        }

        default:
            return state
    }
}

export function discogsMatchedReducer(
    state = new DiscogsMatchedSelector(),
    action: AllActions,
): DiscogsMatchedSelector {
    switch (action.type) {
        case getType(actions.fetchMatchedAlbums.success): {
            return state.withMatchedAlbums(action.payload.json)
        }

        case getType(actions.changeYears): {
            return state.set('showYears', action.payload.years)
        }

        default:
            return state
    }
}
