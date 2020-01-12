import { List, Map, OrderedMap, Record, Set, } from 'immutable'
import { Lens } from 'monocle-ts'
import { ActionType } from 'typesafe-actions'

import * as baseActions from '../actions'
import { Album, AlbumKey, collateAlbums, isoTrackId, Track, TrackId } from '../types'
import * as actions from './actions'

export type AllActions = ActionType<typeof baseActions | typeof actions>

export type ChoiceTrackSelection = 'include' | 'exclude'

export class Choice extends Record({
    tracks: List<Track>(),
    selected: Map<TrackId, ChoiceTrackSelection>(),
    score: 0,
    scores: [] as number[],
}) {
    reversedSelection(): Map<ChoiceTrackSelection, Set<TrackId>> {
        return this.selected.entrySeq()
            .groupBy(([_, sel]) => sel)
            .map((seq) => seq.valueSeq().map(([tid, _]) => tid).toSet())
            .toMap()
    }

    withClearedSelection(tid: TrackId): this {
        return this.update('selected', (m) => m.delete(tid))
    }
}

export class TimefillSelector extends Record({
    tracks: Map<TrackId, Track>(),
    name: '',
    criteria: List<string>(),
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

    condensedSelection(): Map<TrackId, ChoiceTrackSelection> {
        const pairs = this.choices.toSeq()
            .flatMap((choice) => choice.selected.entrySeq())
        return Map(pairs)
    }

    reversedSelection(): Map<ChoiceTrackSelection, Set<TrackId>> {
        return this.choices.toSeq()
            .flatMap((choice) => choice.selected.entrySeq())
            .groupBy(([_, sel]) => sel)
            .map((seq) => seq.valueSeq().map(([tid, _]) => tid).toSet())
            .toMap()
    }

    withArgv(j: {
        dest_playlist?: string
        web_argv: string[]
    }): this {
        return this.merge({
            name: j.dest_playlist || '',
            criteria: List(j.web_argv),
        })
    }

    withTracksResponse(j: any[][]): this {
        const orderedTracks = OrderedMap<TrackId, Track>().withMutations((m) => {
            for (const ts of j) {
                for (const t of ts) {
                    m.set(isoTrackId.wrap(t.T_pPIS), new Track(t))
                }
            }
        })
        const tracks = orderedTracks.toMap()
        const albums = collateAlbums(orderedTracks.values())
            .sortBy((album) => album.nameLower)
        return this.merge({tracks, albums})
    }

    withTimefillResponse(j: any, replace?: Lens<TimefillSelector, Choice>): TimefillSelector {
        const selected = this.condensedSelection()
        const choices = List(j.playlists as {tracks: TrackId[], score: number, scores: number[]}[])
            .map((p) => {
                const tracks = List(p.tracks).map((tid) => this.tracks.get(tid))
                return new Choice({...p, tracks, selected})
            })
        if (replace) {
            return replace.set(choices.first())(this)
        } else {
            return this.set('choices', choices)
        }
    }

    allCriteria(): List<string> {
        let criteria = this.criteria
        if (!this.weights.isEmpty()) {
            criteria = criteria.push('album-weight=' + JSON.stringify({
                weights: this.weights.toJSON(),
            }))
        }
        return criteria
    }

    withClearedSelection(tid: TrackId): this {
        return this.update('choices', (choices) =>
            choices.map((choice) => choice.withClearedSelection(tid)))
    }
}
