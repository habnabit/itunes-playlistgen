import { List, Record, Set } from 'immutable'
import { ActionType } from 'typesafe-actions'

import * as baseActions from '../actions'
import { TrackId } from '../types'
import * as actions from './actions'

export type AllActions = ActionType<typeof baseActions | typeof actions>

export type InitialFetch = {
    argv?: {}
    tracks?: {}
    playlists?: {
        names?: string[]
    }
}

export class Loading extends Record({
    fetch: {} as InitialFetch,
    tracks: 0 as number | true,
    gotArgv: false,
    gotPlaylists: false,
}) {
    checkNext(): this | Loaded {
        if (this.tracks === true && this.gotArgv && this.gotPlaylists) {
            return new Loaded()
        } else {
            return this
        }
    }

    description(): List<[string, boolean]> {
        return List([
            [
                this.tracks === true ? 'all tracks' : `${this.tracks} tracks`,
                this.tracks === true,
            ],
            ['argv', this.gotArgv],
            ['playlists', this.gotPlaylists],
        ])
    }
}

export class Loaded extends Record({}) {}

export class Done extends Record({}) {}

export type OverallState = Loading | Loaded | Done

export class MetaState extends Record({
    state: new Loading() as OverallState,
    errors: List<string>(),
    artworkErroredFor: Set<TrackId>(),
    console: [] as string[],
}) {
    constructor(fetch: InitialFetch) {
        super({
            state: new Loading({
                fetch,
                tracks: fetch.tracks === undefined ? true : 0,
                gotArgv: fetch.argv === undefined,
                gotPlaylists: fetch.playlists === undefined,
            }),
        })
    }
}
