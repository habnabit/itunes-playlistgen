import { List, Map } from 'immutable'
import { Random } from 'random-js'
import { getType } from 'typesafe-actions'

import * as actions from './actions'
import { AllActions, Choice, TimefillSelector } from './types'

export default function timefillReducer(
    state = new TimefillSelector(),
    action: AllActions,
): TimefillSelector {
    switch (action.type) {
        case getType(actions.changeControl): {
            const { lens, value } = action.payload
            return lens.set(value)(state)
        }

        case getType(actions.addCriterion):
            return state.update('criteria', (l) => l.push(''))

        case getType(actions.removeCriterion): {
            const { index } = action.payload
            return state.update('criteria', (criteria) =>
                criteria.remove(index),
            )
        }

        case getType(actions.clearAllForLoading): {
            const loading = new Choice({
                selected: state.condensedSelection(),
                loading: true,
            })
            return state.set('choices', List([loading]))
        }

        case getType(actions.setLoading): {
            const { lens, loading } = action.payload
            return lens.modify((pl) => pl.set('loading', loading))(state)
        }

        case getType(actions.shuffleChoice): {
            const { lens } = action.payload
            return lens.modify((pl) =>
                pl.update('tracks', (tracks) => {
                    const trackArray = tracks.toArray()
                    new Random().shuffle(trackArray)
                    return List(trackArray)
                }),
            )(state)
        }

        case getType(actions.toggleChoiceTrack): {
            const { lens, track, selection } = action.payload
            const isAmbient = state.ambientSelected.has(track)
            return lens.modify((pl) =>
                pl.update('selected', (m) =>
                    m.update(track, (cur) =>
                        cur === selection
                            ? isAmbient
                                ? '_cleared'
                                : undefined
                            : selection,
                    ),
                ),
            )(state)
        }

        case getType(actions.clearChoiceTrack): {
            const { track } = action.payload
            return state.withClearedSelection(track)
        }

        case getType(actions.initialFetched): {
            const { argv, tracks, playlists } = action.payload
            return state
                .withArgv(argv)
                .withTracksResponse(tracks)
                .withPlaylistsResponse(playlists)
                .withReconciledAmbientSelections()
        }

        case getType(actions.runTimefill.success):
            return state.withTimefillResponse(
                action.payload.json,
                action.payload.replace,
            )

        case getType(actions.modifyPlaylists.request):
            return state.set('savingPlaylists', true)

        case getType(actions.modifyPlaylists.success):
            return state
                .withPlaylistsResponse(action.payload.json)
                .afterPlaylistsUpdated()
                .set('savingPlaylists', false)

        default:
            return state
    }
}
