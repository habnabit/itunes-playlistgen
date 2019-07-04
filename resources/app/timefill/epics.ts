import { combineEpics, Epic } from 'redux-observable'
import { from } from 'rxjs'
import { filter, switchMap } from 'rxjs/operators'
import { isActionOf } from 'typesafe-actions'

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
            data.targets = action.payload.targets.toArray()
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
