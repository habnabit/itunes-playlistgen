import * as d3 from 'd3-scale-chromatic'
import { List, Map, OrderedMap, Record, Seq, Set } from 'immutable'
import { enumerate, izipMany } from 'itertools'
import { Lens } from 'monocle-ts'
import { Newtype, iso } from 'newtype-ts'
import * as SkeletonRendezvousHasher from 'skeleton-rendezvous'
import { ActionType } from 'typesafe-actions'

import { Argv, Playlists, Tracks } from '../meta'
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

export type AllActions = ActionType<typeof actions>

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

const TAG_PREFIX = '❧'
const TAG_PATTERN = new RegExp(`${TAG_PREFIX}`, 'g')

export interface Tag extends Newtype<{ readonly Tag: unique symbol }, string> {}
const _isoTag = iso<Tag>()
export const isoTag = {
    ..._isoTag,
    wrap: (s: string): Tag => _isoTag.wrap(s.replace(TAG_PATTERN, '')),
    prefixed: (t: Tag): string => `${TAG_PREFIX}${_isoTag.unwrap(t)}`,
    cssClass: (t: Tag): string =>
        `tag--${_isoTag.unwrap(t).replace(/\s+/g, '-')}`,
}
export const NO_TAGS = isoTag.wrap('no tags')
export const NO_TAGS_SET = Set([NO_TAGS])

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
}) {
    currentSelection(keysDown: Map<string, boolean>): ChoiceTrackSelection {
        if (keysDown.get('a')) {
            return 'bless'
        } else if (keysDown.get('s')) {
            return 'curse'
        } else if (keysDown.get('z')) {
            return 'include'
        } else if (keysDown.get('x')) {
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

    seenTags(): Set<Tag> {
        return Set.union(this.tags.valueSeq())
    }

    tagHistogram(): Map<Tag, number> {
        return Map<Tag, number>().withMutations((ret) => {
            for (const tid of this.tracks.keySeq()) {
                for (const tag of this.tags.get(tid, NO_TAGS_SET)) {
                    ret.set(tag, ret.get(tag, 0) + 1)
                }
            }
        })
    }

    matchTagsToColors(colors = d3.schemeSet3): {
        tagColors: Map<Tag, string>
        roundHistory: {
            tag: Tag
            color: string
            roundSeq: List<string>
            timesSeen: number
            nRounds: number
        }[]
    } {
        const histogram = this.tagHistogram()
        const allTags = histogram.keySeq().toSet().add(NO_TAGS)
        const hasher = new SkeletonRendezvousHasher({
            hashAlgorithm: 'sha512',
            sites: [...colors],
        })
        const colorStreams = allTags
            .toList()
            .map((tag) => {
                function* stream() {
                    var roundSeq = List<string>()
                    for (var seq = 0; ; ++seq) {
                        const color: string = hasher.findSite(
                            `tag--${isoTag.unwrap(tag)}--${seq}`,
                        )
                        roundSeq = roundSeq.push(color)
                        yield { color, roundSeq }
                    }
                }
                return {
                    tag,
                    stream: stream(),
                    timesSeen: histogram.get(tag),
                }
            })
            .sortBy(({ timesSeen }) => -timesSeen)
        const roundHistory: {
            tag: Tag
            color: string
            roundSeq: List<string>
            timesSeen: number
            nRounds: number
        }[] = []
        const seenColors = Set<string>().asMutable()
        const tagColors = Map<Tag, string>().withMutations((tagColors) => {
            for (const { tag, stream, timesSeen } of colorStreams) {
                var nRounds = 0
                for (const { color, roundSeq } of stream) {
                    console.assert(seenColors.size < colors.length)
                    if (++nRounds > 25) {
                        console.log('long time going', tag)
                    }
                    if (seenColors.has(color)) continue
                    seenColors.add(color)
                    tagColors.set(tag, color)
                    roundHistory.push({
                        tag,
                        color,
                        roundSeq,
                        timesSeen,
                        nRounds,
                    })
                    break
                }
            }
        })
        return { roundHistory, tagColors }
    }

    withArgv(j: Argv): this {
        return this.merge({
            name: j.dest_playlist || '',
            criteria: List(j.web_argv),
        })
    }

    withTracksResponse(j: Tracks): this {
        const orderedTracks = OrderedMap<TrackId, Track>().withMutations(
            (m) => {
                for (const t of j) {
                    const track = new Track(t)
                    m.set(track.id, track)
                }
            },
        )
        const tracks = orderedTracks.toMap()
        const albums = collateAlbums(orderedTracks.values()).sortBy(
            (album) => album.nameLower,
        )
        return this.merge({ tracks, albums })
    }

    withPlaylistsResponse(j: Playlists): this {
        var tags = this.tags
        const ambientSelected = Map<
            TrackId,
            ChoiceTrackSelection
        >().withMutations((ambientSelected) => {
            for (const [segments, tracks] of j) {
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
