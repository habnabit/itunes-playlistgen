import { Map, Seq } from 'immutable'
import * as qs from 'qs'
import { applyMiddleware, createStore, DeepPartial, Reducer, Store } from 'redux'
import { createEpicMiddleware, Epic } from 'redux-observable'
import { EMPTY, from, generate, interval, never, of } from 'rxjs'
import { concatMap, debounceTime, expand, filter, map, mergeMap, mergeScan, switchMap } from 'rxjs/operators'
import { ActionType, getType, isActionOf } from 'typesafe-actions'

import * as actions from './actions'
import timefillEpics from './timefill/epics'
import timefillReducer from './timefill/reducer'
import { TimefillSelector } from './timefill/types'
import { AlbumKey, AlbumSelector, AlbumSelectors, AlbumShuffleSelector, isoTrackId, TrackId } from './types'


type AllActions = ActionType<typeof actions>

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

const shuffleTracksEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.shuffleTracks.request)),
        switchMap((action) => {
            const { lens } = action.payload
            const tracks = action.payload.tracks.map((t) => isoTrackId.unwrap(t.id)).toArray()
            const params = qs.stringify({tracks}, {arrayFormat: 'repeat'})
            return from(
                fetch('/_api/shuffle-together-albums?' + params)
                    .then((resp) => resp.json())
                    .then(
                        (json) => actions.shuffleTracks.success({json, lens}),
                        actions.shuffleTracks.failure)
            )
        })
    )
)

const savePlaylistEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.savePlaylist.request)),
        switchMap((action) => {
            const { name, tracks } = action.payload
            const body = new FormData()
            body.append('name', name)
            for (const t of tracks) {
                body.append('tracks', isoTrackId.unwrap(t.id))
            }
            return from(
                fetch('/_api/save-and-exit', {method: 'POST', body})
                    .then((resp) => resp.json())
                    .then((json) => {
                        if (json.data) {
                            window.close()
                        }
                        return actions.shuffleTracks.failure(new Error("request failed to complete"))
                    }, actions.shuffleTracks.failure)
            )
        })
    )
)

const searchDebounceEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        mergeMap((action) => {
            if (isActionOf(actions.changeControl, action) && action.payload.prop == 'searchQuery') {
                return [true]
            } else {
                return []
            }
        }),
        debounceTime(250),
        map((_true) => actions.performSearch()),
    )
)

function albumShuffleReducer(state = new AlbumShuffleSelector(), action: AllActions): AlbumShuffleSelector {
    switch (action.type) {
    case getType(actions.toggleAlbumSelected):
        return action.payload.lens.modify(
            (sel: AlbumSelector) => sel.set('selected', !sel.selected)
        )(state)

    case getType(actions.removeAlbum):
        return action.payload.lens.modify((sels: AlbumSelectors) =>
            sels.update('selectors', (selsList) =>
                selsList.filter((sel) => sel.album.key != action.payload.album))
        )(state)

    case getType(actions.newAlbumSelector):
        return state.update('selectorses', (l) => l.push(action.payload.initial || new AlbumSelectors()))

    case getType(actions.addSelectionTo):
        return state.addSelection(action.payload.lens)

    case getType(actions.changeControl):
        const { prop, value } = action.payload
        return state.set(prop, value)

    case getType(actions.performSearch):
        return state.performSearch()

    case getType(actions.fetchTracks.success):
        return state.withTracksResponse(action.payload.tracks)

    case getType(actions.fetchPlaylists.success):
        return state.withPlaylistsResponse(action.payload.json)

    case getType(actions.shuffleTracks.success):
        const { lens, json } = action.payload
        const shuffled = Seq.Indexed.of(...json.data.tracks as TrackId[])
            .map((tid) => state.tracks.get(tid))
            .toList()
        return lens.modify((sel) => sel.withShuffleResponse(shuffled, json))(state)

    default:
        return state
    }
}

function makeStore<S>(reducer: Reducer<S>, state: DeepPartial<S>, epics: Epic): Store<S> {
    const epicMiddleware = createEpicMiddleware()
    const store = createStore(reducer, state, applyMiddleware(epicMiddleware))

    epicMiddleware.run(fetchTracksEpic)
    epicMiddleware.run(fetchPlaylistsEpic)
    epicMiddleware.run(shuffleTracksEpic)
    epicMiddleware.run(savePlaylistEpic)
    epicMiddleware.run(searchDebounceEpic)
    epicMiddleware.run(epics)

    addEventListener('keydown', (ev) => store.dispatch(actions.changeKey({key: ev.key.toLowerCase(), down: true})))
    addEventListener('keyup', (ev) => store.dispatch(actions.changeKey({key: ev.key.toLowerCase(), down: false})))

    return store
}

//export const albumShuffleStore = (state = new AlbumShuffleSelector()) => makeStore(albumShuffleReducer, state)
export const timefillStore = (state = new TimefillSelector()) => makeStore(timefillReducer, state, timefillEpics)
