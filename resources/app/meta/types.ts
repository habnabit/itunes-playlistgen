import { List, Record, Set } from 'immutable'
import { ActionType } from 'typesafe-actions'

import * as baseActions from '../actions'
import { TrackId } from '../types'

export type AllActions = ActionType<typeof baseActions>

export type InitialFetch = {
    argv?: {}
    tracks?: {}
    playlists?: {
        names?: string[]
    }
}
