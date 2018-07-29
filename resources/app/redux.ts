import { List, Seq } from 'immutable'
import * as qs from 'qs'
import { applyMiddleware, createStore } from 'redux'
import { createEpicMiddleware, Epic } from 'redux-observable'
import { from } from 'rxjs'
import { filter, switchMap } from 'rxjs/operators'
import { ActionType, getType, isActionOf } from 'typesafe-actions'

import * as actions from './actions'
import { AlbumSelector, AlbumShuffleSelector, AlbumSelectors, isoTrackId, TrackId } from './types'


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

export const shuffleTracksEpic: Epic<AlbumShuffleSelectorAction, AlbumShuffleSelectorAction> = (action$) => (
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

export function reducer(state = new AlbumShuffleSelector(), action: AlbumShuffleSelectorAction): AlbumShuffleSelector {
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

    case getType(actions.controlChange):
        let { prop, value } = action.payload
        return state.set(prop, value)

    case getType(actions.updateSearch):
        return state.updateSearch(action.payload.query)

    case getType(actions.fetchTracks.success):
        return state.withTracksResponse(action.payload)

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

const epicMiddleware = createEpicMiddleware()
export const store = createStore(reducer, applyMiddleware(epicMiddleware))
export default store

epicMiddleware.run(fetchTracksEpic)
epicMiddleware.run(shuffleTracksEpic)
