import {
    PreloadedState,
    Reducer,
    Store,
    applyMiddleware,
    createStore,
} from 'redux'
import { Epic, combineEpics, createEpicMiddleware } from 'redux-observable'
import { from, of } from 'rxjs'
import { catchError, filter, map, switchMap } from 'rxjs/operators'
import { ActionType, isActionOf } from 'typesafe-actions'

import * as actions from './actions'
import { postJSON } from './funcs'
import timefillEpics from './timefill/epics'
import timefillReducer from './timefill/reducer'
import { RemoteError } from './types'

type AllActions = ActionType<typeof actions>

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

const combinedEpics = combineEpics(savePlaylistEpic)

const makeStore =
    <S>(reducer: Reducer<S>, epics: Epic) =>
    (state: PreloadedState<S>): Store<S> => {
        const epicMiddleware = createEpicMiddleware()
        const store = createStore(
            reducer,
            state,
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

export const timefillStore = makeStore(timefillReducer, timefillEpics)
