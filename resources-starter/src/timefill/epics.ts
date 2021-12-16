import * as actions from './actions'

import { AllActions, ChoiceTrackSelection } from './types'
import { Epic, combineEpics } from 'redux-observable'
import { List, Map, Seq, Set } from 'immutable'
import { RemoteError, TrackId } from '../types'
import { catchError, filter, map, switchMap } from 'rxjs/operators'
import { from, of } from 'rxjs'

import { isActionOf } from 'typesafe-actions'
import { postJSON } from '../funcs'

function buildData(
    criteriaList: List<string>,
    selections: Map<ChoiceTrackSelection, Set<TrackId>>,
    type: 'wide' | 'narrow' | 'daily',
): any {
    const exclude = [
        ...selections.get('curse', Set()).toArray(),
        ...selections.get('exclude', Set()).toArray(),
    ]
    const weights = selections
        .get('bless', Set())
        .toKeyedSeq()
        .map(() => 1.5)
        .toObject()
    const include = selections.get('include', Set()).toArray()
    const criteria = [
        `track-weights=${JSON.stringify({ weights })}`,
        `pick-from=${JSON.stringify({ include })}`,
        ...criteriaList.toArray(),
    ]
    const ret: any = { criteria, exclude }
    switch (type) {
        case 'narrow': {
            ret['n_options'] = 17
            ret['keep'] = 50
            break
        }
        case 'daily': {
            ret['n_options'] = 1
            ret['keep'] = 1
            ret['pull_prev'] = 1
            break
        }
    }
    return ret
}

const runTimefillEpic: Epic<AllActions, AllActions> = (action$) =>
    action$.pipe(
        filter(isActionOf(actions.runTimefill.request)),
        switchMap((action) => {
            const { criteria, selections, type, replace } = action.payload
            const data = buildData(criteria, selections, type)
            return from(
                fetch('/_api/timefill-criteria', postJSON(data)).then((resp) =>
                    resp.json().then((json) => ({ resp, json })),
                ),
            ).pipe(
                map(({ resp, json }) => {
                    if (resp.status !== 200) {
                        throw new RemoteError(resp, json)
                    } else {
                        return actions.runTimefill.success({ json, replace })
                    }
                }),
                catchError((err) => of(actions.runTimefill.failure(err))),
            )
        }),
    )

const modifyPlaylistsEpic: Epic<AllActions, AllActions> = (action$) =>
    action$.pipe(
        filter(isActionOf(actions.modifyPlaylists.request)),
        switchMap((action) => {
            const { modifications } = action.payload
            return from(
                fetch(
                    '/_api/modify-playlists',
                    postJSON({ modifications }),
                ).then((resp) => resp.json().then((json) => ({ resp, json }))),
            ).pipe(
                map(({ resp, json }) => {
                    if (resp.status !== 200) {
                        throw new RemoteError(resp, json)
                    } else {
                        return actions.modifyPlaylists.success({ json })
                    }
                }),
                catchError((err) => of(actions.modifyPlaylists.failure(err))),
            )
        }),
    )

export default combineEpics(runTimefillEpic, modifyPlaylistsEpic)
