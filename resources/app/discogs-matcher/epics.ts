import { List, Map, Seq, Set } from 'immutable'
import { Epic, combineEpics } from 'redux-observable'
import { from, of } from 'rxjs'
import { catchError, filter, map, switchMap } from 'rxjs/operators'
import { isActionOf } from 'typesafe-actions'

import * as baseActions from '../actions'
import { postJSON } from '../funcs'
import { RemoteError, TrackId } from '../types'
import * as actions from './actions'
import { AllActions } from './types'

const initialFetchEpic: Epic<AllActions, AllActions> = (action$) =>
    action$.pipe(
        filter(isActionOf(baseActions.fetchArgv.request)),
        switchMap((action) => of(actions.fetchUnconfirmedAlbums.request())),
    )

const fetchUnconfirmedAlbumsEpic: Epic<AllActions, AllActions> = (action$) =>
    action$.pipe(
        filter(isActionOf(actions.fetchUnconfirmedAlbums.request)),
        switchMap((action) =>
            from(
                fetch('/_api/unconfirmed/albums')
                    .then((resp) => resp.json())
                    .then(
                        (json) =>
                            actions.fetchUnconfirmedAlbums.success({ json }),
                        actions.fetchUnconfirmedAlbums.failure,
                    ),
            ),
        ),
    )

export default combineEpics(initialFetchEpic, fetchUnconfirmedAlbumsEpic)
