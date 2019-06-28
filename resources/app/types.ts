import { List, Map, OrderedMap, Record, Seq, Set } from 'immutable'
import { iso, Newtype } from 'newtype-ts'
import { Lens } from '../node_modules/monocle-ts'

import { lensFromImplicitAccessors } from './extlens'


export type SubsetKeys<T, S> = {
    [P in keyof T]: T[P] extends S ? P : never
}[keyof T]

export interface TrackId extends Newtype<{ readonly TrackId: unique symbol }, string> {}
export const isoTrackId = iso<TrackId>()

export class AlbumKey extends Record({
    album: undefined as string,
    artist: undefined as string,
}) {
    prettyName(): string {
        return this.album + "; " + this.artist
    }
}

export class Track {
    id: TrackId
    readonly _raw: any

    constructor(raw: any) {
        this.id = isoTrackId.wrap(raw.T_pPIS)
        this._raw = raw
    }

    albumKey(): AlbumKey {
        return new AlbumKey({
            album: this.t('pAlb'),
            artist: this.t('pAlA') || this.t('pArt'),
        })
    }

    t = (typ: string) => this._raw['T_' + typ]
}

export class Album extends Record({
    key: undefined as AlbumKey,
    nameLower: undefined as string,
    tracks: List<Track>(),
}) {
    constructor(key: AlbumKey) {
        const nameLower = (key.album + ' ' + key.artist).toLowerCase()
        super({ key, nameLower })
    }

    withTrack(track: Track): Album {
        return this.set('tracks', this.tracks.push(track))
    }
}

export function collateAlbums(tracks: IterableIterator<Track>, collated: Map<AlbumKey, Album> = Map()): Map<AlbumKey, Album> {
    return collated.withMutations((collated) => {
        for (const t of tracks) {
            const key = t.albumKey()
            collated.update(key, undefined, (album) => {
                if (!album) {
                    album = new Album(key)
                }
                return album.withTrack(t)
            })
        }
    })
}

export class AlbumSelector extends Record({
    selected: false,
    fading: false,
    album: undefined as Album,
}) {

}

export class AlbumSelectors extends Record({
    selectors: List<AlbumSelector>(),
    shuffled: List<Track>(),
    shuffleInfo: undefined as any,
}) {
    withShuffleResponse(shuffled: List<Track>, shuffleInfo: any): this {
        return this.merge({shuffled, shuffleInfo})
    }
}

export class AlbumShuffleSelector extends Record({
    tracks: Map<TrackId, Track>(),
    albums: Map<AlbumKey, Album>(),
    existingPlaylists: Map<TrackId, Set<string>>(),
    selectorses: List<AlbumSelectors>(),
    nAlbums: '4',
    nChoices: '5',
    searchQuery: '',
    activeSearch: '',
    searchResults: List<AlbumSelector>(),
    sources: Map<string, string>(),
    sourcingGenius: false,
    pickingAlbums: false,
}) {
    withTracksResponse(j: any): this {
        const orderedTracks = OrderedMap<TrackId, Track>().withMutations((m) => {
            for (const t of j.data) {
                m.set(isoTrackId.wrap(t.T_pPIS), new Track(t))
            }
        })
        const tracks = orderedTracks.toMap()
        const albums = collateAlbums(orderedTracks.values())
        return this.merge({tracks, albums})
    }

    withPlaylistsResponse(j: any): this {
        const tracksMap = Map<TrackId, Set<string>>().withMutations((m) => {
            for (const [album, tracks] of j.data) {
                for (const track of tracks) {
                    m.update(track, Set(), (l) => l.add(album))
                }
            }
        })
        return this.set('existingPlaylists', tracksMap)
    }

    performSearch(): this {
        const activeSearch = this.searchQuery
        let searchResults = List()
        if (activeSearch.length >= 2) {
            const needle = activeSearch.toLowerCase()
            searchResults = this.albums
                .valueSeq()
                .filter((album) => album.nameLower.includes(needle))
                .map((album) => new AlbumSelector({album}))
                .toList()
        }
        return this.merge({activeSearch, searchResults})
    }

    allSelected(): Seq.Indexed<[AlbumSelector, Lens<AlbumShuffleSelector, AlbumSelector>]> {
        return this.searchResults.valueSeq()
            .map((sel, e) => {
                const lens1: Lens<AlbumShuffleSelector, List<AlbumSelector>> = new Lens(
                    (o) => o.get('searchResults', undefined),
                    (v) => (o) => o.set('searchResults', v))
                const lens2: Lens<AlbumShuffleSelector, AlbumSelector> = lens1.compose(lensFromImplicitAccessors(e))
                return [sel, lens2] as [AlbumSelector, null]
            })
            .concat(this.selectorses.valueSeq().flatMap((sels, i) => {
                const lens1: Lens<AlbumShuffleSelector, List<AlbumSelectors>> = new Lens(
                    (o) => o.get('selectorses', undefined),
                    (v) => (o) => o.set('selectorses', v))
                const lens2: Lens<AlbumShuffleSelector, AlbumSelectors> = lens1.compose(lensFromImplicitAccessors(i))
                return sels.selectors.map((sel, j) => {
                    const lens3: Lens<AlbumShuffleSelector, List<AlbumSelector>> = lens2.compose(new Lens(
                        (o) => o.get('selectors', undefined),
                        (v) => (o) => o.set('selectors', v)))
                    const lens4: Lens<AlbumShuffleSelector, AlbumSelector> = lens3.compose(lensFromImplicitAccessors(j))
                    return [sel, lens4] as [AlbumSelector, null]
                })
            }))
            .filter(([sel, _lens]) => sel.selected)
    }

    hasSelection(): boolean {
        return this.allSelected().some((_t) => true)
    }

    addSelection(selectors: Lens<AlbumShuffleSelector, AlbumSelectors>): AlbumShuffleSelector {
        const newSelectors = this.allSelected()
            .map(([sel, _lens]) => new AlbumSelector({album: sel.album}))
            .toList()
        return selectors.modify((sels) =>
            sels.update('selectors', (selsList) =>
                selsList.concat(newSelectors))
        )(this).clearSelected()
    }

    clearSelected(): AlbumShuffleSelector {
        return this.allSelected().reduce((ret, [_sel, lens]) => {
            return lens.modify((sel) => sel.set('selected', false))(ret)
        }, this as AlbumShuffleSelector)
    }
}

export type PlaylistTrackSelection = 'include' | 'exclude' | undefined

export class Playlist extends Record({
    tracks: List<Track>(),
    selected: Map<TrackId, PlaylistTrackSelection>(),
    score: 0,
    scores: [] as number[],
}) {
    selectionMap(): {[K in PlaylistTrackSelection]: TrackId[]} {
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
    playlists: List<Playlist>(),
    keyboardAvailable: true,
    keysDown: Map<string, boolean>(),
}) {
    currentSelection(): PlaylistTrackSelection {
        if (this.keysDown.get('z')) {
            return 'include'
        } else if (this.keysDown.get('x')) {
            return 'exclude'
        } else {
            return undefined
        }
    }

    selectionMap(): {[K in PlaylistTrackSelection]: TrackId[]} {
        const ret = {include: [] as TrackId[], exclude: [] as TrackId[]}
        this.playlists.forEach((pl) => {
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

    withTimefillResponse(j: any, replace?: Lens<TimefillSelector, Playlist>): TimefillSelector {
        const playlists = List(j.data.playlists as {tracks: TrackId[], score: number, scores: number[]}[])
            .map((p) => {
                const initial = {...p, tracks: List(p.tracks).map((tid) => this.tracks.get(tid))}
                return new Playlist(initial)
            })
        if (replace) {
            const toInsert = playlists.first<Playlist>()
            return replace.modify((pl) => toInsert.set('selected', pl.selected))(this)
        } else {
            return this.set('playlists', playlists)
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
