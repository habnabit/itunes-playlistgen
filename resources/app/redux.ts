import { List } from 'immutable'
import { applyMiddleware, createStore } from 'redux'
import { createEpicMiddleware, Epic } from 'redux-observable'
import { from } from 'rxjs'
import { filter, switchMap } from 'rxjs/operators'
import { ActionType, getType, isActionOf } from 'typesafe-actions'

import * as actions from './actions'
import { AlbumSelector, AlbumShuffleSelector } from './types'


export type AlbumShuffleSelectorAction = ActionType<typeof actions>

export const fetchTracksEpic: Epic<AlbumShuffleSelectorAction, AlbumShuffleSelectorAction> = (action$) => (
    action$.pipe(
        filter(isActionOf(actions.fetchTracks.request)),
        switchMap(action => from(
            fetch('/_api/all-tracks')
                .then(resp => resp.json())
                .then(actions.fetchTracks.success, actions.fetchTracks.failure)
        ))
    )
)

export function reducer(state = new AlbumShuffleSelector(), action: AlbumShuffleSelectorAction): AlbumShuffleSelector {
    switch (action.type) {
    case getType(actions.toggleAlbumSelected):
        return action.payload.lens.modify(
            (sel: AlbumSelector) => sel.set('selected', !sel.selected)
        )(state)

    case getType(actions.removeAlbum):
        return action.payload.lens.modify(
            (sels: List<AlbumSelector>) => sels.filter(sel => sel.album.key != action.payload.album)
        )(state)

    case getType(actions.newAlbumSelector):
        return state.update('selectorses', l => l.push(action.payload.initial || List()))

    case getType(actions.addSelectionTo):
        return state.addSelection(action.payload.lens)

    case getType(actions.controlChange):
        let { prop, value } = action.payload
        return state.set(prop, value)

    case getType(actions.updateSearch):
        return state.updateSearch(action.payload.query)

    case getType(actions.fetchTracks.success):
        return state.withTracks(action.payload)

    default:
        return state
    }
}

const epicMiddleware = createEpicMiddleware()
export const store = createStore(reducer, applyMiddleware(epicMiddleware))
export default store

epicMiddleware.run(fetchTracksEpic)
