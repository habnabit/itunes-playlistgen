import { combineEpics, Epic } from 'redux-observable'
import { from, of } from 'rxjs'
import { catchError, filter, map, switchMap } from 'rxjs/operators'
import { isActionOf } from 'typesafe-actions'

import * as baseActions from '../actions'
import { RemoteError } from '../types'
import * as actions from './actions'
import { AllActions } from './types'

const runTimefillEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.runTimefill.request)),
        switchMap((action) => {
            const { replace } = action.payload
            const data: any = action.payload.selections
                .map((tids) => tids.toArray())
                .toObject()
            data.criteria = action.payload.criteria.toArray()
            return from(
                fetch('/_api/timefill-criteria', {
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
                        return actions.runTimefill.success({json, replace})
                    }
                }),
                catchError((err) => of(
                    actions.runTimefill.failure(err),
                    baseActions.showError(err),
                )),
            )
        }),
    )
)

export default combineEpics(
    runTimefillEpic,
)
