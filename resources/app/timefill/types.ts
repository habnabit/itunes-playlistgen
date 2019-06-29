import { List, Map, OrderedMap, Record, } from 'immutable'
import { Lens } from 'monocle-ts'
import { ActionType } from 'typesafe-actions'

import * as baseActions from '../actions'
import { Album, AlbumKey, collateAlbums, isoTrackId, Track, TrackId } from '../types'
import * as actions from './actions'


export type AllActions = ActionType<typeof baseActions | typeof actions>

export type ChoiceTrackSelection = 'include' | 'exclude' | undefined

export class Choice extends Record({
    tracks: List<Track>(),
    selected: Map<TrackId, ChoiceTrackSelection>(),
    score: 0,
    scores: [] as number[],
}) {
    selectionMap(): {[K in ChoiceTrackSelection]: TrackId[]} {
        const ret = {include: [] as TrackId[], exclude: [] as TrackId[]}
        this.selected.forEach((sel, tid) => {
            if (sel) {
                ret[sel].push(tid)
            }
        })
        return ret
    }
}

export class TimefillSelector extends Record({
    tracks: Map<TrackId, Track>(),
    name: '',
    targets: List<string>(),
    albums: OrderedMap<AlbumKey, Album>(),
    weights: List<[AlbumKey, string]>(),
    choices: List<Choice>(),
    keyboardAvailable: true,
    keysDown: Map<string, boolean>(),
}) {
    currentSelection(): ChoiceTrackSelection {
        if (this.keysDown.get('z')) {
            return 'include'
        } else if (this.keysDown.get('x')) {
            return 'exclude'
        } else {
            return undefined
        }
    }

    selectionMap(): {[K in ChoiceTrackSelection]: TrackId[]} {
        const ret = {include: [] as TrackId[], exclude: [] as TrackId[]}
        this.choices.forEach((pl) => {
            pl.selected.forEach((sel, tid) => {
                if (sel) {
                    ret[sel].push(tid)
                }
            })
        })
        return ret
    }

    withTracksResponse(j: any): this {
        const orderedTracks = OrderedMap<TrackId, Track>().withMutations((m) => {
            for (const t of j.data) {
                m.set(isoTrackId.wrap(t.T_pPIS), new Track(t))
            }
        })
        const tracks = orderedTracks.toMap()
        const albums = collateAlbums(orderedTracks.values())
            .sortBy((album) => album.nameLower)
        return this.merge({tracks, albums})
    }

    withTimefillResponse(j: any, replace?: Lens<TimefillSelector, Choice>): TimefillSelector {
        const choices = List(j.data.choices as {tracks: TrackId[], score: number, scores: number[]}[])
            .map((p) => {
                const initial = {...p, tracks: List(p.tracks).map((tid) => this.tracks.get(tid))}
                return new Choice(initial)
            })
        if (replace) {
            const toInsert = choices.first<Choice>()
            return replace.modify((pl) => toInsert.set('selected', pl.selected))(this)
        } else {
            return this.set('choices', choices)
        }
    }

    allTargets(): List<string> {
        let targets = this.targets
        if (!this.weights.isEmpty()) {
            targets = targets.push('album-weight=' + JSON.stringify({
                weights: this.weights.toJSON(),
            }))
        }
        return targets
    }
}
