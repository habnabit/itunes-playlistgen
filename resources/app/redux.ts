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
        switchMap(action => from(
            fetch('/_api/all-tracks')
                .then(resp => resp.json())
                .then(
                    json => actions.fetchTracks.success({json}),
                    actions.fetchTracks.failure)
        ))
    )
)

const shuffleTracksEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.shuffleTracks.request)),
        switchMap(action => {
            let { lens } = action.payload
            let tracks = action.payload.tracks.map(t => isoTrackId.unwrap(t.id)).toArray()
            let params = qs.stringify({tracks}, {arrayFormat: 'repeat'})
            return from(
                fetch('/_api/shuffle-together-albums?' + params)
                    .then(resp => resp.json())
                    .then(
                        json => actions.shuffleTracks.success({json, lens}),
                        actions.shuffleTracks.failure)
            )
        })
    )
)

const runTimefillEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.runTimefill.request)),
        switchMap(action => {
            let { replace } = action.payload
            let targets = action.payload.targets.toArray()
            let params = qs.stringify(Object.assign({targets}, action.payload.selections), {arrayFormat: 'repeat'})
            return from(
                fetch('/_api/timefill-targets?' + params)
                    .then(resp => resp.json())
                    .then(
                        json => actions.runTimefill.success({json, replace}),
                        actions.runTimefill.failure)
            )
        })
    )
)

const savePlaylistEpic: Epic<AllActions, AllActions> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.savePlaylist.request)),
        switchMap(action => {
            let { name, tracks } = action.payload
            let body = new FormData()
            body.append('name', name)
            for (let t of tracks) {
                body.append('tracks', isoTrackId.unwrap(t.id))
            }
            return from(
                fetch('/_api/save-and-exit', {method: 'POST', body})
                    .then(resp => resp.json())
                    .then(json => {
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
            sels.update('selectors', selsList =>
                selsList.filter(sel => sel.album.key != action.payload.album))
        )(state)

    case getType(actions.newAlbumSelector):
        return state.update('selectorses', l => l.push(action.payload.initial || new AlbumSelectors()))

    case getType(actions.addSelectionTo):
        return state.addSelection(action.payload.lens)

    case getType(actions.changeControl):
        let { prop, value } = action.payload
        return state.set(prop, value)

    case getType(actions.updateSearch):
        return state.updateSearch(action.payload.query)

    case getType(actions.fetchTracks.success):
        return state.withTracksResponse(action.payload.json)

    case getType(actions.shuffleTracks.success):
        let { lens, json } = action.payload
        let shuffled = Seq.Indexed.of(...json.data.tracks as TrackId[])
            .map(tid => state.tracks.get(tid))
            .toList()
        return lens.modify(sel => sel.withShuffleResponse(shuffled, json))(state)

    default:
        return state
    }
}

function timefillReducer(state = new TimefillSelector(), action: AllActions): TimefillSelector {
    switch (action.type) {
    case getType(actions.changeName):
        let { name } = action.payload
        return state.set('name', name)

    case getType(actions.addTarget):
        return state.update('targets', l => l.push(''))

    case getType(actions.changeTarget):
        let { index, value } = action.payload
        return state.update('targets', l => l.set(index, value))

    case getType(actions.fetchTracks.success):
        return state.withTracksResponse(action.payload.json)

    case getType(actions.togglePlaylistTrack):
        let { lens, track } = action.payload
        let selection = state.currentSelection()
        return lens.modify(pl =>
            pl.update('selected', m =>
                m.update(track, undefined, cur => cur === selection? undefined : selection))
        )(state)

    case getType(actions.setKeyboardAvailability):
        return state.merge({keyboardAvailable: action.payload.available, keysDown: Map()})

    case getType(actions.changeKey):
        if (state.keyboardAvailable) {
            return state.update('keysDown', m =>
                m.set(action.payload.key, action.payload.down))
        } else {
            return state
        }

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
    epicMiddleware.run(shuffleTracksEpic)
    epicMiddleware.run(runTimefillEpic)
    epicMiddleware.run(savePlaylistEpic)

    addEventListener('keydown', (ev) => store.dispatch(actions.changeKey({key: ev.key.toLowerCase(), down: true})))
    addEventListener('keyup', (ev) => store.dispatch(actions.changeKey({key: ev.key.toLowerCase(), down: false})))

    return store
}

export const albumShuffleStore = (state = new AlbumShuffleSelector()) => makeStore(albumShuffleReducer, state)
export const timefillStore = (state = new TimefillSelector()) => makeStore(timefillReducer, state)
