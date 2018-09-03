import { List, Seq, Map } from 'immutable'
import * as qs from 'qs'
import { applyMiddleware, createStore, combineReducers, Reducer, Store, DeepPartial } from 'redux'
import { createEpicMiddleware, Epic } from 'redux-observable'
import { from } from 'rxjs'
import { filter, switchMap } from 'rxjs/operators'
import { ActionType, getType, isActionOf } from 'typesafe-actions'

import * as actions from './actions'
import { AlbumSelector, AlbumShuffleSelector, AlbumSelectors, isoTrackId, TrackId, TimefillSelector } from './types'


type AllActions = ActionType<typeof actions>

const fetchTracksEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.fetchTracks.request)),
        switchMap((action) => from(
            fetch('/_api/all-tracks')
                .then((resp) => resp.json())
                .then(
                    (json) => actions.fetchTracks.success({json}),
                    actions.fetchTracks.failure)
        ))
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

const runTimefillEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.runTimefill.request)),
        switchMap((action) => {
            const { replace } = action.payload
            const targets = action.payload.targets.toArray()
            const params = qs.stringify({targets, ...action.payload.selections}, {arrayFormat: 'repeat'})
            return from(
                fetch('/_api/timefill-targets?' + params)
                    .then((resp) => resp.json())
                    .then(
                        (json) => actions.runTimefill.success({json, replace}),
                        actions.runTimefill.failure)
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

    case getType(actions.updateSearch):
        return state.set('searchQuery', action.payload.query)

    case getType(actions.performSearch):
        return state.performSearch()

    case getType(actions.fetchTracks.success):
        return state.withTracksResponse(action.payload.json)

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

function timefillReducer(state = new TimefillSelector(), action: AllActions): TimefillSelector {
    switch (action.type) {
    case getType(actions.changeControlTimefill): {
        const { lens, value } = action.payload
        return lens.set(value)(state)
    }

    case getType(actions.addTarget):
        return state.update('targets', (l) => l.push(''))

    case getType(actions.addWeight):
        const first = state.albums.keySeq().first()
        return state.update('weights', (l) => l.push([first, '']))

    case getType(actions.changeWeight): {
        const { index, event } = action.payload
        return state.update('weights', (l) => l.update(index, ([key, weight]) => {
            if (event.target instanceof HTMLInputElement) {
                weight = event.target.value
            } else if (event.target instanceof HTMLSelectElement) {
                key = state.albums.toIndexedSeq().get(event.target.selectedIndex).key
            }
            return [key, weight]
        }))
    }

    case getType(actions.togglePlaylistTrack):
        const { lens, track } = action.payload
        const selection = state.currentSelection()
        return lens.modify((pl) =>
            pl.update('selected', (m) =>
                m.update(track, undefined, (cur) => cur === selection? undefined : selection))
        )(state)

    case getType(actions.setKeyboardAvailability):
        return state.merge({keyboardAvailable: action.payload.available, keysDown: Map()})

    case getType(actions.changeKey):
        if (state.keyboardAvailable) {
            return state.update('keysDown', (m) =>
                m.set(action.payload.key, action.payload.down))
        } else {
            return state
        }

    case getType(actions.setHash):
        location.hash = "#" + JSON.stringify({
            name: state.name,
            targets: state.targets.toArray(),
            weights: state.weights.map(([k, w]) => [k.toJSON(), w]).toArray(),
        })
        return state

    case getType(actions.fetchTracks.success):
        return state.withTracksResponse(action.payload.json)

    case getType(actions.runTimefill.success):
        return state.withTimefillResponse(action.payload.json, action.payload.replace)

    default:
        return state
    }
}

function makeStore<S>(reducer: Reducer<S>, state: DeepPartial<S>): Store<S> {
    const epicMiddleware = createEpicMiddleware()
    const store = createStore(reducer, state, applyMiddleware(epicMiddleware))

    epicMiddleware.run(fetchTracksEpic)
    epicMiddleware.run(fetchPlaylistsEpic)
    epicMiddleware.run(shuffleTracksEpic)
    epicMiddleware.run(runTimefillEpic)
    epicMiddleware.run(savePlaylistEpic)

    addEventListener('keydown', (ev) => store.dispatch(actions.changeKey({key: ev.key.toLowerCase(), down: true})))
    addEventListener('keyup', (ev) => store.dispatch(actions.changeKey({key: ev.key.toLowerCase(), down: false})))

    return store
}

export const albumShuffleStore = (state = new AlbumShuffleSelector()) => makeStore(albumShuffleReducer, state)
export const timefillStore = (state = new TimefillSelector()) => makeStore(timefillReducer, state)
