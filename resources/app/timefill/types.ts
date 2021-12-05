import { List, Map, OrderedMap, Record, Seq, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import { Newtype, iso } from 'newtype-ts'
import { ActionType } from 'typesafe-actions'

import * as baseActions from '../actions'
import {
    Album,
    AlbumId,
    RawTrack,
    Track,
    TrackId,
    collateAlbums,
    isoTrackId,
} from '../types'
import * as actions from './actions'

export type AllActions = ActionType<typeof baseActions | typeof actions>

export type ChoiceTrackSelection =
    | 'bless'
    | 'include'
    | 'curse'
    | 'exclude'
    | '_cleared'

export type PlaylistModification = {
    name: string
    add: TrackId[]
    remove: TrackId[]
}
export interface Tag extends Newtype<{ readonly Tag: unique symbol }, string> {}
const _isoTag = iso<Tag>()
export const isoTag = {
    ..._isoTag,
    wrap: (s: string): Tag => _isoTag.wrap(s.replace(TAG_PATTERN, '')),
    prefixed: (t: Tag): string => `${TAG_PREFIX}${_isoTag.unwrap(t)}`,
    cssClass: (t: Tag): string =>
        `tag--${_isoTag.unwrap(t).replace(/\s+/g, '-')}`,
}
const TAG_PREFIX = '❧'
const TAG_PATTERN = new RegExp(`${TAG_PREFIX}`, 'g')

export class Choice extends Record({
    tracks: List<Track>(),
    selected: Map<TrackId, ChoiceTrackSelection>(),
    score: '',
    loading: false,
}) {
    reversedSelection(): Map<ChoiceTrackSelection, Set<TrackId>> {
        return this.selected
            .entrySeq()
            .groupBy(([_, sel]) => sel)
            .map((seq) =>
                seq
                    .valueSeq()
                    .map(([tid, _]) => tid)
                    .toSet(),
            )
            .toMap()
    }

    withClearedSelection(tid: TrackId): this {
        return this.update('selected', (m) => m.delete(tid))
    }
}

function objectToMap<K extends string, V>(obj: { [key in K]: V }): Map<K, V> {
    return Map(Object.entries(obj) as [K, V][])
}

export const selectionPlaylists: Map<ChoiceTrackSelection, string> =
    objectToMap({
        bless: '❧blessed',
        curse: '❧cursed',
    })

const reverseSelectionPlaylists: Map<string, ChoiceTrackSelection> =
    selectionPlaylists.mapEntries(([k, v]) => [v, k])

function reverseSelection(
    seq: Seq.Indexed<Map<TrackId, ChoiceTrackSelection>>,
): Map<ChoiceTrackSelection, Set<TrackId>> {
    return seq
        .flatMap((m) => m.entrySeq())
        .groupBy(([_, sel]) => sel)
        .map((seq) =>
            seq
                .valueSeq()
                .map(([tid, _]) => tid)
                .toSet(),
        )
        .toMap()
}

const playlistModificationRemovalSources: Map<
    ChoiceTrackSelection,
    ChoiceTrackSelection[]
> = objectToMap({
    bless: ['curse', '_cleared'],
    curse: ['bless', '_cleared'],
})

const playlistSelectionsToClear: Set<ChoiceTrackSelection> =
    playlistModificationRemovalSources
        .valueSeq()
        .flatMap((x) => x)
        .toSet()

export class TimefillSelector extends Record({
    tracks: Map<TrackId, Track>(),
    tags: Map<TrackId, Set<Tag>>(),
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
        const pairs = this.choices
            .toSeq()
            .flatMap((choice) => choice.selected.entrySeq())
        return Map(pairs)
    }

    reversedSelection(): Map<ChoiceTrackSelection, Set<TrackId>> {
        return reverseSelection(
            this.choices.toSeq().map((choice) => choice.selected),
        )
    }

    reversedAmbientSelection(): Map<ChoiceTrackSelection, Set<TrackId>> {
        return reverseSelection(Seq.Indexed([this.ambientSelected]))
    }

    reversedTotalSelection(): Map<ChoiceTrackSelection, Set<TrackId>> {
        return reverseSelection(
            Seq.Indexed([this.ambientSelected]).concat(
                this.choices.toSeq().map((choice) => choice.selected),
            ),
        )
    }

    withArgv(j: { dest_playlist?: string; web_argv: string[] }): this {
        return this.merge({
            name: j.dest_playlist || '',
            criteria: List(j.web_argv),
        })
    }

    withTracksResponse(j: RawTrack[][]): this {
        const orderedTracks = OrderedMap<TrackId, Track>().withMutations(
            (m) => {
                for (const ts of j) {
                    for (const t of ts) {
                        const track = new Track(t)
                        m.set(track.id, track)
                    }
                }
            },
        )
        const tracks = orderedTracks.toMap()
        const albums = collateAlbums(orderedTracks.values()).sortBy(
            (album) => album.nameLower,
        )
        return this.merge({ tracks, albums })
    }

    withPlaylistsResponse(j: { playlists: [string[], TrackId[]][] }): this {
        var tags = this.tags
        const ambientSelected = Map<
            TrackId,
            ChoiceTrackSelection
        >().withMutations((ambientSelected) => {
            for (const [segments, tracks] of j.playlists) {
                if (
                    segments.length < 2 ||
                    segments[segments.length - 2] !== 'Tagged'
                )
                    continue
                const tag = segments[segments.length - 1]
                const selection = reverseSelectionPlaylists.get(tag)
                for (const track of tracks) {
                    tags = tags.update(track, Set(), (s) =>
                        s.add(isoTag.wrap(tag)),
                    )
                    if (selection !== undefined) {
                        ambientSelected.set(track, selection)
                    }
                }
            }
        })
        return this.merge({ ambientSelected, tags })
    }

    withReconciledAmbientSelections(): this {
        return this.update('ambientSelected', (selected) =>
            selected.filter((_, tid) => this.tracks.has(tid)),
        )
    }

    withTimefillResponse(
        j: any,
        replace?: Lens<TimefillSelector, Choice>,
    ): TimefillSelector {
        const selected = this.condensedSelection()
        const choices = List(
            j.playlists as { tracks: TrackId[]; score: string }[],
        )
            .take(15)
            .map((p) => {
                const tracks = List(p.tracks).map((tid) => this.tracks.get(tid))
                return new Choice({ ...p, tracks, selected })
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
                    selected.filter(
                        (sel) => !playlistSelectionsToClear.has(sel),
                    ),
                ),
            ),
        )
    }

    allCriteria(): List<string> {
        let criteria = this.criteria
        if (!this.weights.isEmpty()) {
            criteria = criteria.push(
                'album-weight=' +
                    JSON.stringify({
                        weights: this.weights.toJSON(),
                    }),
            )
        }
        return criteria
    }

    withClearedSelection(tid: TrackId): this {
        return this.update('choices', (choices) =>
            choices.map((choice) => choice.withClearedSelection(tid)),
        )
    }

    playlistModifications(): Seq.Indexed<PlaylistModification> {
        const reversed = this.reversedSelection()
        return playlistModificationRemovalSources
            .entrySeq()
            .map(([sel, toRemove]) => {
                const add: TrackId[] = reversed
                    .get(sel, Set<TrackId>())
                    .toArray()
                const remove: TrackId[] = Seq.Indexed(toRemove)
                    .flatMap((v) => reversed.get(v, Set<TrackId>()))
                    .toSet()
                    .toArray()
                return {
                    name: selectionPlaylists.get(sel),
                    add,
                    remove,
                }
            })
    }
}
