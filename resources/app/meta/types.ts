import { Record } from 'immutable'
import { ActionType } from 'typesafe-actions'

import * as baseActions from '../actions'


export type AllActions = ActionType<typeof baseActions>

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
}) {

}
