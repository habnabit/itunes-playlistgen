import * as qs from 'qs'
import { applyMiddleware, combineReducers, createStore, DeepPartial, Reducer,Store } from 'redux'
import { createEpicMiddleware, Epic } from 'redux-observable'
import { EMPTY, from, of } from 'rxjs'
import { expand, filter, map, switchMap } from 'rxjs/operators'
import { ActionType, isActionOf } from 'typesafe-actions'

import * as actions from './actions'
import albumShuffleEpics from './album-shuffle/epics'
import albumShuffleReducer from './album-shuffle/reducer'
import { AlbumShuffleSelector } from './album-shuffle/types'
import metaReducer from './meta/reducer'
import { MetaState } from './meta/types'
import timefillEpics from './timefill/epics'
import timefillReducer from './timefill/reducer'
import { TimefillSelector } from './timefill/types'

type AllActions = ActionType<typeof actions>

const fetchArgvEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.fetchArgv.request)),
        switchMap((action) => from(
            fetch('/_api/argv')
                .then((resp) => resp.json())
                .then(
                    (json) => actions.fetchArgv.success({json}),
                    actions.fetchArgv.failure)
        ))
    )
)

const fetchTracksEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.fetchTracks.request)),
        switchMap((action) => {
            return of({offset: 0, tracks: [], json: undefined}).pipe(
                expand(({offset, tracks, json}) => {
                    if (json) {
                        if (json.tracks.length === 0) {
                            return EMPTY
                        } else {
                            offset += json.tracks.length
                            tracks.push(json.tracks)
                        }
                    }
                    const params = qs.stringify({offset})
                    return from(
                        fetch('/_api/tracks?' + params)
                            .then((resp) => resp.json())
                            .then((json) => ({offset, tracks, json}))
                    )
                }),
            )
        }),
        map(({offset, tracks, json}) => {
            if (json && json.tracks.length === 0) {
                return actions.fetchTracks.success({tracks})
            } else {
                return actions.fetchTracksProgress({offset})
            }
        })
    )
)

const fetchPlaylistsEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.fetchPlaylists.request)),
        switchMap((action) => from(
            fetch('/_api/playlists')
                .then((resp) => resp.json())
                .then(
                    (json) => actions.fetchPlaylists.success({json}),
                    actions.fetchPlaylists.failure)
        ))
    )
)

const savePlaylistEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.savePlaylist.request)),
        switchMap((action) => {
            const { name, tracks } = action.payload
            const data = {name, tracks: tracks.toSeq().map((t) => t.id).toArray()}
            return from(
                fetch('/_api/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data),
                })
                    .then((resp) => resp.json())
                    .then(
                        (json) => actions.savePlaylist.success(),
                        actions.savePlaylist.failure)
            )
        })
    )
)

function makeStore<S>(reducer: Reducer<S>, state: DeepPartial<S>, epics: Epic): Store<{base: S, meta: MetaState}> {
    const epicMiddleware = createEpicMiddleware()
    const store = createStore(combineReducers({
        base: reducer,
        meta: metaReducer,
    }), {
        base: state,
        meta: new MetaState(),
    }, applyMiddleware(epicMiddleware))

    epicMiddleware.run(fetchArgvEpic)
    epicMiddleware.run(fetchTracksEpic)
    epicMiddleware.run(fetchPlaylistsEpic)
    epicMiddleware.run(savePlaylistEpic)
    epicMiddleware.run(epics)

    addEventListener('keydown', (ev) => store.dispatch(actions.changeKey({key: ev.key.toLowerCase(), down: true})))
    addEventListener('keyup', (ev) => store.dispatch(actions.changeKey({key: ev.key.toLowerCase(), down: false})))

    return store
}

export const albumShuffleStore = (state = new AlbumShuffleSelector()) => makeStore(albumShuffleReducer, state, albumShuffleEpics)
export const timefillStore = (state = new TimefillSelector()) => makeStore(timefillReducer, state, timefillEpics)
