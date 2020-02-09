import { List, Map, OrderedMap, Record, Seq, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import { ActionType } from 'typesafe-actions'

import * as baseActions from '../actions'
import { Album, AlbumId, collateAlbums, isoTrackId, Track, TrackId } from '../types'
import * as actions from './actions'

export type AllActions = ActionType<typeof baseActions | typeof actions>

export type ChoiceTrackSelection = 'bless' | 'include' | 'curse' | 'exclude' | '_cleared'

export type PlaylistModification = {
    name: string,
    add: TrackId[],
    remove: TrackId[],
}

export class Choice extends Record({
    tracks: List<Track>(),
    selected: Map<TrackId, ChoiceTrackSelection>(),
    score: '',
    loading: false,
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

function objectToMap<K extends string, V>(obj: {[key in K]: V}): Map<K, V> {
    return Map(Object.entries(obj) as [K, V][])
}

export const selectionPlaylists: Map<ChoiceTrackSelection, string> = objectToMap({
    bless: '❧blessed',
    curse: '❧cursed',
})

const reverseSelectionPlaylists: Map<string, ChoiceTrackSelection> = selectionPlaylists
    .mapEntries(([k, v]) => [v, k])

function reverseSelection(seq: Seq.Indexed<Map<TrackId, ChoiceTrackSelection>>): Map<ChoiceTrackSelection, Set<TrackId>> {
    return seq.flatMap((m) => m.entrySeq())
        .groupBy(([_, sel]) => sel)
        .map((seq) => seq.valueSeq().map(([tid, _]) => tid).toSet())
        .toMap()
}

const playlistModificationRemovalSources: Map<ChoiceTrackSelection, ChoiceTrackSelection[]> = objectToMap({
    bless: ['curse', '_cleared'],
    curse: ['bless', '_cleared'],
})

const playlistSelectionsToClear: Set<ChoiceTrackSelection> = playlistModificationRemovalSources.valueSeq()
    .flatMap((x) => x)
    .toSet()

export class TimefillSelector extends Record({
    tracks: Map<TrackId, Track>(),
    name: '',
    criteria: List<string>(),
    albums: OrderedMap<AlbumId, Album>(),
    weights: List<[AlbumId, string]>(),
    choices: List<Choice>(),
    ambientSelected: Map<TrackId, ChoiceTrackSelection>(),
    savingPlaylists: false,
    keyboardAvailable: true,
    keysDown: Map<string, boolean>(),
}) {
    currentSelection(): ChoiceTrackSelection {
        if (this.keysDown.get('a')) {
            return 'bless'
        } else if (this.keysDown.get('s')) {
            return 'curse'
        } else if (this.keysDown.get('z')) {
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
        return reverseSelection(this.choices.toSeq().map((choice) => choice.selected))
    }

    reversedAmbientSelection(): Map<ChoiceTrackSelection, Set<TrackId>> {
        return reverseSelection(Seq.Indexed([this.ambientSelected]))
    }

    reversedTotalSelection(): Map<ChoiceTrackSelection, Set<TrackId>> {
        return reverseSelection(
            Seq.Indexed([this.ambientSelected])
                .concat(this.choices.toSeq().map((choice) => choice.selected))
        )
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
                    const track = new Track(t)
                    m.set(track.id, track)
                }
            }
        })
        const tracks = orderedTracks.toMap()
        const albums = collateAlbums(orderedTracks.values())
            .sortBy((album) => album.nameLower)
        return this.merge({tracks, albums})
    }

    withPlaylistsResponse(j: any): this {
        const selected = Map<TrackId, ChoiceTrackSelection>().withMutations((m) => {
            for (const [playlist, tracks] of j.playlists) {
                const selection = reverseSelectionPlaylists.get(playlist)
                if (selection === undefined) {
                    continue
                }
                for (const track of tracks) {
                    m.set(track, selection)
                }
            }
        })
        return this.set('ambientSelected', selected)
    }

    withReconciledAmbientSelections(): this {
        return this.update('ambientSelected', (selected) =>
            selected.filter((_, tid) => this.tracks.has(tid)))
    }

    withTimefillResponse(j: any, replace?: Lens<TimefillSelector, Choice>): TimefillSelector {
        const selected = this.condensedSelection()
        const choices = List(j.playlists as {tracks: TrackId[], score: string}[])
            .take(15)
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

    afterPlaylistsUpdated(): this {
        return this.update('choices', (choices) =>
            choices.map((choice) =>
                choice.update('selected', (selected) =>
                    selected.filter((sel) => !playlistSelectionsToClear.has(sel)))))
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

    playlistModifications(): Seq.Indexed<PlaylistModification> {
        const reversed = this.reversedSelection()
        return playlistModificationRemovalSources.entrySeq()
            .map(([sel, toRemove]) => {
                const remove = Seq.Indexed(toRemove)
                    .flatMap((v) => reversed.get(v, Set()))
                    .toSet()
                    .toArray()
                return {
                    name: selectionPlaylists.get(sel),
                    add: reversed.get(sel, Set()).toArray(),
                    remove,
                }
            })
    }
}
