import { Epic, combineEpics } from 'redux-observable'
import { EMPTY, from, of } from 'rxjs'
import {
    catchError,
    debounceTime,
    filter,
    map,
    mergeMap,
    switchMap,
} from 'rxjs/operators'
import { isActionOf } from 'typesafe-actions'

import * as baseActions from '../actions'
import { postJSON } from '../funcs'
import { RemoteError, isoTrackId } from '../types'
import * as actions from './actions'
import { AllActions } from './types'

const shuffleTracksEpic: Epic<AllActions, AllActions> = (action$) =>
    action$.pipe(
        filter(isActionOf(actions.shuffleTracks.request)),
        switchMap((action) => {
            const tracks = action.payload.tracks
                .map((t) => isoTrackId.unwrap(t.id))
                .toArray()
            const data = { tracks }
            return from(
                fetch(
                    '/_api/shuffle-together-albums',
                    postJSON(data),
                ).then((resp) => resp.json().then((json) => ({ resp, json }))),
            ).pipe(
                map(({ resp, json }) => {
                    if (resp.status !== 200) {
                        throw new RemoteError(resp, json)
                    } else {
                        return actions.shuffleTracks.success({ json })
                    }
                }),
                catchError((err) =>
                    of(
                        actions.shuffleTracks.failure(err),
                        baseActions.showError(err),
                    ),
                ),
            )
        }),
    )

const searchDebounceEpic: Epic<AllActions, AllActions> = (action$) =>
    action$.pipe(
        mergeMap((action) => {
            if (
                isActionOf(actions.changeControl, action) &&
                action.payload.prop == 'searchQuery'
            ) {
                return of(true)
            } else {
                return EMPTY
            }
        }),
        debounceTime(250),
        map((_true) => actions.performSearch()),
    )

export default combineEpics(shuffleTracksEpic, searchDebounceEpic)
