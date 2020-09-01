import { Seq } from 'immutable'
import { ActionType, getType } from 'typesafe-actions'

import * as baseActions from '../actions'
import { TrackId } from '../types'
import * as actions from './actions'
import { AlbumSelector, AlbumSelectors, AlbumShuffleSelector } from './types'

type AllActions = ActionType<typeof baseActions | typeof actions>

export default function albumShuffleReducer(
    state = new AlbumShuffleSelector(),
    action: AllActions,
): AlbumShuffleSelector {
    switch (action.type) {
        case getType(actions.toggleAlbumSelected):
            return action.payload.lens.modify((sel: AlbumSelector) =>
                sel.set('selected', !sel.selected),
            )(state)

        case getType(actions.removeAlbum): {
            const { album } = action.payload
            return state.update('selectors', (sel) => sel.withoutAlbum(album))
        }

        case getType(actions.addSelection):
            return state.addSelection()

        case getType(actions.changeControl):
            const { prop, value } = action.payload
            return state.set(prop, value)

        case getType(actions.performSearch):
            return state.performSearch()

        case getType(actions.hoverTrack):
            return state.update('selectors', (sel) =>
                sel.set('hovered', action.payload.idx),
            )

        case getType(actions.trackArtworkMissing):
            return state.update('artworkErroredFor', (s) =>
                s.add(action.payload.id),
            )

        case getType(baseActions.fetchTracks.success):
            return state.withTracksResponse(action.payload.tracks)

        case getType(baseActions.fetchPlaylists.success):
            return state.withPlaylistsResponse(action.payload.json)

        case getType(actions.shuffleTracks.success):
            const { json } = action.payload
            const shuffled = Seq.Indexed.of(...(json.tracks as TrackId[]))
                .map((tid) => state.tracks.get(tid))
                .toList()
            return state.update('selectors', (sel) =>
                sel.withShuffleResponse(shuffled, json.info),
            )

        default:
            return state
    }
}
