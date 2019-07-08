import { List, Record } from 'immutable'
import { ActionType } from 'typesafe-actions'

import * as baseActions from '../actions'
import * as actions from './actions'

export type AllActions = ActionType<typeof baseActions | typeof actions>

export class Loading extends Record({
    tracks: 0,
}) {

}

export class Loaded extends Record({
}) {

}

export class Done extends Record({
}) {

}

export type OverallState = Loading | Loaded | Done

export class MetaState extends Record({
    state: new Loading() as OverallState,
    gotArgv: false,
    errors: List<string>(),
}) {

}
