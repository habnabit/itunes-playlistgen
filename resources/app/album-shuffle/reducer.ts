import { Seq } from 'immutable'
import * as qs from 'qs'
import { applyMiddleware, combineReducers, createStore, DeepPartial, Reducer,Store } from 'redux'
import { createEpicMiddleware, Epic } from 'redux-observable'
import { EMPTY, from, of } from 'rxjs'
import { debounceTime, expand, filter, map, mergeMap, switchMap } from 'rxjs/operators'
import { ActionType, getType, isActionOf } from 'typesafe-actions'

import * as baseActions from '../actions'
import { isoTrackId, TrackId } from '../types'
import * as actions from './actions'
import { AlbumSelector, AlbumSelectors, AlbumShuffleSelector } from './types'

type AllActions = ActionType<typeof baseActions | typeof actions>

export default function albumShuffleReducer(state = new AlbumShuffleSelector(), action: AllActions): AlbumShuffleSelector {
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

    case getType(baseActions.fetchTracks.success):
        return state.withTracksResponse(action.payload.tracks)

    case getType(baseActions.fetchPlaylists.success):
        return state.withPlaylistsResponse(action.payload.json)

    case getType(actions.shuffleTracks.success):
        const { lens, json } = action.payload
        const shuffled = Seq.Indexed.of(...json.tracks as TrackId[])
            .map((tid) => state.tracks.get(tid))
            .toList()
        return lens.modify((sel) => sel.withShuffleResponse(shuffled, json.info))(state)

    default:
        return state
    }
}
