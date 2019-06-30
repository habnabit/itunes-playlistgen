import { Map, Seq } from 'immutable'
import * as qs from 'qs'
import { applyMiddleware, createStore, DeepPartial, Reducer, Store } from 'redux'
import { combineEpics, createEpicMiddleware, Epic } from 'redux-observable'
import { from } from 'rxjs'
import { debounceTime, filter, map, mergeMap, switchMap } from 'rxjs/operators'
import { ActionType, getType, isActionOf } from 'typesafe-actions'

import * as baseActions from '../actions'
import { AlbumKey, AlbumSelector, AlbumSelectors, AlbumShuffleSelector, isoTrackId, TrackId } from '../types'
import * as actions from './actions'
import { AllActions, TimefillSelector } from './types'


const runTimefillEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.runTimefill.request)),
        switchMap((action) => {
            const { replace } = action.payload
            const targets = action.payload.targets.toArray()
            const data = {targets, ...action.payload.selections}
            return from(
                fetch('/_api/timefill-targets', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data),
                })
                    .then((resp) => resp.json())
                    .then(
                        (json) => actions.runTimefill.success({json, replace}),
                        actions.runTimefill.failure)
            )
        })
    )
)

export default combineEpics(
    runTimefillEpic,
)
