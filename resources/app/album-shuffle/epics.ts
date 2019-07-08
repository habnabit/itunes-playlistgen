import { Seq } from 'immutable'
import * as qs from 'qs'
import { applyMiddleware, combineReducers, createStore, DeepPartial, Reducer,Store } from 'redux'
import { combineEpics, createEpicMiddleware, Epic } from 'redux-observable'
import { EMPTY, from, of } from 'rxjs'
import { catchError, debounceTime, expand, filter, map, mergeMap, switchMap } from 'rxjs/operators'
import { ActionType, getType, isActionOf } from 'typesafe-actions'

import * as baseActions from '../actions'
import { isoTrackId, RemoteError, TrackId } from '../types'
import * as actions from './actions'
import { AlbumSelector, AlbumSelectors, AlbumShuffleSelector } from './types'

type AllActions = ActionType<typeof baseActions | typeof actions>

const shuffleTracksEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.shuffleTracks.request)),
        switchMap((action) => {
            const { lens } = action.payload
            const tracks = action.payload.tracks.map((t) => isoTrackId.unwrap(t.id)).toArray()
            const data = {tracks}
            return from(
                fetch('/_api/shuffle-together-albums', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data),
                })
                    .then((resp) => resp.json().then((json) => ({resp, json})))
            ).pipe(
                map(({resp, json}) => {
                    if (resp.status !== 200) {
                        throw new RemoteError(resp, json)
                    } else {
                        return actions.shuffleTracks.success({json, lens})
                    }
                }),
                catchError((err) => of(
                    actions.shuffleTracks.failure(err),
                    baseActions.showError(err),
                )),
            )
        })
    )
)

const searchDebounceEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        mergeMap((action) => {
            if (isActionOf(actions.changeControl, action) && action.payload.prop == 'searchQuery') {
                return of(true)
            } else {
                return EMPTY
            }
        }),
        debounceTime(250),
        map((_true) => actions.performSearch()),
    )
)

export default combineEpics(
    shuffleTracksEpic,
    searchDebounceEpic,
)
