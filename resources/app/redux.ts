import * as qs from 'qs'
import {
    PreloadedState,
    Reducer,
    Store,
    applyMiddleware,
    combineReducers,
    createStore,
} from 'redux'
import { Epic, combineEpics, createEpicMiddleware } from 'redux-observable'
import { EMPTY, from, of } from 'rxjs'
import {
    bufferCount,
    catchError,
    expand,
    filter,
    flatMap,
    map,
    switchMap,
} from 'rxjs/operators'
import { ActionType, isActionOf } from 'typesafe-actions'

import * as actions from './actions'
import albumShuffleEpics from './album-shuffle/epics'
import albumShuffleReducer from './album-shuffle/reducer'
import { AlbumShuffleSelector } from './album-shuffle/types'
import discogsEpics from './discogs-matcher/epics'
import {
    discogsMatchedReducer,
    discogsUnconfirmedReducer,
} from './discogs-matcher/reducer'
import { DiscogsUnconfirmedSelector } from './discogs-matcher/types'
import { postJSON } from './funcs'
import metaReducer from './meta/reducer'
import { InitialFetch, Loaded, Loading, MetaState } from './meta/types'
import timefillEpics from './timefill/epics'
import timefillReducer from './timefill/reducer'
import { TimefillSelector } from './timefill/types'
import { RemoteError } from './types'

type AllActions = ActionType<typeof actions>

const fetchArgvEpic: Epic<AllActions, AllActions> = (action$) =>
    action$.pipe(
        filter(isActionOf(actions.fetchArgv.request)),
        switchMap((action) =>
            from(
                fetch('/_api/argv')
                    .then((resp) => resp.json())
                    .then(
                        (json) => actions.fetchArgv.success({ json }),
                        actions.fetchArgv.failure,
                    ),
            ),
        ),
    )

const fetchTracksEpic: Epic<AllActions, AllActions> = (action$) =>
    action$.pipe(
        filter(isActionOf(actions.fetchTracks.request)),
        switchMap((action) => {
            return of({ offset: 0, tracks: [], json: undefined }).pipe(
                expand(({ offset, tracks, json }) => {
                    if (json) {
                        if (json.tracks.length === 0) {
                            return EMPTY
                        } else {
                            offset += json.tracks.length
                            tracks.push(json.tracks)
                        }
                    }
                    const params = qs.stringify({ offset })
                    return from(
                        fetch('/_api/tracks?' + params)
                            .then((resp) => resp.json())
                            .then((json) => ({ offset, tracks, json })),
                    )
                }),
            )
        }),
        map(({ offset, tracks, json }) => {
            if (json && json.tracks.length === 0) {
                return actions.fetchTracks.success({ tracks })
            } else {
                return actions.fetchTracksProgress({ offset })
            }
        }),
    )

const fetchPlaylistsEpic: Epic<AllActions, AllActions> = (action$) =>
    action$.pipe(
        filter(isActionOf(actions.fetchPlaylists.request)),
        switchMap((action) => {
            return from(
                fetch('/_api/playlists', postJSON(action.payload))
                    .then((resp) => resp.json())
                    .then(
                        (json) => actions.fetchPlaylists.success({ json }),
                        actions.fetchPlaylists.failure,
                    ),
            )
        }),
    )

const fetchConsoleEpic: Epic<AllActions, AllActions> = (action$) =>
    action$.pipe(
        filter(isActionOf(actions.fetchConsole.request)),
        switchMap((action) => {
            const params = qs.stringify(action.payload)
            return from(
                fetch('/_api/screen?' + params).then((resp) =>
                    resp.json().then((json) => ({ resp, json })),
                ),
            ).pipe(
                flatMap(({ resp, json }) => {
                    if (resp.status !== 200) {
                        throw new RemoteError(resp, json)
                    } else {
                        return of(
                            actions.fetchConsole.success({ json }),
                            actions.fetchConsole.request({
                                poll_interval: 0.1,
                                hashed: json.hashed,
                            }),
                        )
                    }
                }),
                catchError((err) => of(actions.fetchConsole.failure(err))),
            )
        }),
    )

const savePlaylistEpic: Epic<AllActions, AllActions> = (action$) =>
    action$.pipe(
        filter(isActionOf(actions.savePlaylist.request)),
        switchMap((action) => {
            const { name, tracks } = action.payload
            const data = {
                name,
                tracks: tracks
                    .toSeq()
                    .map((t) => t.id)
                    .toArray(),
            }
            return from(
                fetch('/_api/save', postJSON(data)).then((resp) =>
                    resp.json().then((json) => ({ resp, json })),
                ),
            ).pipe(
                map(({ resp, json }) => {
                    if (resp.status !== 200) {
                        throw new RemoteError(resp, json)
                    } else {
                        return actions.savePlaylist.success({ json })
                    }
                }),
                catchError((err) => of(actions.savePlaylist.failure(err))),
            )
        }),
    )

const whenLoadedEpic: Epic<AllActions, AllActions, { meta: MetaState }> = (
    action$,
    state$,
) =>
    state$.pipe(
        bufferCount(2, 1),
        switchMap(([prevState, curState]) => {
            const ret = []
            if (
                prevState.meta.state instanceof Loading &&
                curState.meta.state instanceof Loaded
            ) {
                ret.push(actions.finishedLoading())
            }
            return of(...ret)
        }),
    )

const combinedEpics = combineEpics(savePlaylistEpic)

const makeStore =
    <S>(reducer: Reducer<S, AllActions>, epics: Epic) =>
    (state: S, fetch: InitialFetch): Store<{ base: S; meta: MetaState }> => {
        const epicMiddleware = createEpicMiddleware()
        const reducers = combineReducers({
            base: reducer,
            meta: metaReducer,
        })
        const store = createStore(
            reducers,
            {
                base: state as S extends string | number | boolean | symbol
                    ? S
                    : PreloadedState<S>,
                meta: new MetaState(fetch),
            },
            applyMiddleware(epicMiddleware),
        )

        epicMiddleware.run(combinedEpics)
        epicMiddleware.run(epics)

        addEventListener('keydown', (ev) =>
            store.dispatch(
                actions.changeKey({ key: ev.key.toLowerCase(), down: true }),
            ),
        )
        addEventListener('keyup', (ev) =>
            store.dispatch(
                actions.changeKey({ key: ev.key.toLowerCase(), down: false }),
            ),
        )

        return store
    }

export const albumShuffleStore = makeStore(
    albumShuffleReducer,
    albumShuffleEpics,
)
export const timefillStore = makeStore(timefillReducer, timefillEpics)
export const discogsUnconfirmedStore = makeStore(
    discogsUnconfirmedReducer,
    discogsEpics,
)
export const discogsMatchedStore = makeStore(
    discogsMatchedReducer,
    discogsEpics,
)
