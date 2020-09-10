import { List, Map, Seq, Set } from 'immutable'
import { Epic, combineEpics } from 'redux-observable'
import { EMPTY, from, of } from 'rxjs'
import {
    catchError,
    debounceTime,
    filter,
    groupBy,
    map,
    mergeMap,
    switchMap,
} from 'rxjs/operators'
import { isActionOf } from 'typesafe-actions'

import * as baseActions from '../actions'
import { postJSON } from '../funcs'
import { RemoteError, TrackId } from '../types'
import * as actions from './actions'
import { AllActions, DiscogsSelector } from './types'

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

const fetchDebounceEpic: Epic<AllActions, AllActions> = (action$) =>
    action$.pipe(
        filter(isActionOf(actions.changeUrl)),
        groupBy((action) => action.payload.id),
        mergeMap((group$) =>
            group$.pipe(
                debounceTime(250),
                switchMap((action) => {
                    const { lens } = action.payload
                    return of(
                        actions.fetchFromDiscogs.request({
                            lens,
                        }),
                    )
                }),
            ),
        ),
    )

const fetchFromDiscogsEpic: Epic<
    AllActions,
    AllActions,
    { base: DiscogsSelector }
> = (action$, state$) =>
    action$.pipe(
        filter(isActionOf(actions.fetchFromDiscogs.request)),
        switchMap((action) => {
            const { lens } = action.payload
            const url = lens
                .get(state$.value.base)
                .url.replace(
                    /^https:\/\/www\.discogs\.com\/[^/]+\/([^/]+)\/(\d+)$/,
                    'https://api.discogs.com/$1s/$2',
                )
            if (url.length === 0) {
                return of(
                    actions.fetchFromDiscogs.success({ lens, json: undefined }),
                )
            }
            return from(
                fetch(url).then((resp) =>
                    resp.json().then((json) => ({ resp, json })),
                ),
            ).pipe(
                map(({ resp, json }) => {
                    if (resp.status !== 200) {
                        throw new RemoteError(resp, json)
                    } else {
                        return actions.fetchFromDiscogs.success({ lens, json })
                    }
                }),
                catchError((err) =>
                    of(
                        actions.fetchFromDiscogs.failure(err),
                        baseActions.showError(err),
                    ),
                ),
            )
        }),
    )

const confirmEpic: Epic<AllActions, AllActions> = (action$) =>
    action$.pipe(
        filter(isActionOf(actions.confirm.request)),
        switchMap((action) => {
            return from(
                fetch(
                    '/_api/confirm',
                    postJSON(action.payload.data),
                ).then((resp) => resp.json().then((json) => ({ resp, json }))),
            ).pipe(
                map(({ resp, json }) => {
                    if (resp.status !== 200) {
                        throw new RemoteError(resp, json)
                    } else {
                        return actions.confirm.success({ json })
                    }
                }),
                catchError((err) =>
                    of(
                        actions.confirm.failure(err),
                        baseActions.showError(err),
                    ),
                ),
            )
        }),
    )

export default combineEpics(
    initialFetchEpic,
    fetchUnconfirmedAlbumsEpic,
    fetchDebounceEpic,
    fetchFromDiscogsEpic,
    confirmEpic,
)
