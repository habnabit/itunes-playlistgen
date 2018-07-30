import { List, Map, OrderedMap, Record, Seq } from 'immutable'
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
        let nameLower = (key.album + ' ' + key.artist).toLowerCase()
        super({ key, nameLower })
    }

    withTrack(track: Track): Album {
        return this.set('tracks', this.tracks.push(track))
    }
}

export function collateAlbums(tracks: IterableIterator<Track>, collated: Map<AlbumKey, Album> = Map()): Map<AlbumKey, Album> {
    return collated.withMutations(collated => {
        for (let t of tracks) {
            let key = t.albumKey()
            collated.update(key, undefined, album => {
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
    selectorses: List<AlbumSelectors>(),
    nAlbums: '4',
    nChoices: '5',
    searchQuery: '',
    searchResults: List<AlbumSelector>(),
    sources: Map<string, string>(),
    sourcingGenius: false,
    pickingAlbums: false,
}) {
    withTracksResponse(j: any): this {
        let orderedTracks = OrderedMap<TrackId, Track>().withMutations(m => {
            for (var t of j.data) {
                m.set(isoTrackId.wrap(t.T_pPIS), new Track(t))
            }
        })
        let tracks = orderedTracks.toMap()
        let albums = collateAlbums(orderedTracks.values())
        return this.merge({tracks, albums})
    }

    updateSearch(query: string): this {
        if (query.length < 2) {
            return this.set('searchResults', List())
        }
        let needle = query.toLowerCase()
        return this.set(
            'searchResults',
            this.albums
                .valueSeq()
                .filter(album => album.nameLower.includes(needle))
                .map((album) => new AlbumSelector({album}))
                .toList()
        )
    }

    allSelected(): Seq.Indexed<[AlbumSelector, Lens<AlbumShuffleSelector, AlbumSelector>]> {
        return this.searchResults.valueSeq()
            .map((sel, e) => {
                let lens1: Lens<AlbumShuffleSelector, List<AlbumSelector>> = new Lens(
                    o => o.get('searchResults', undefined),
                    v => o => o.set('searchResults', v))
                let lens2: Lens<AlbumShuffleSelector, AlbumSelector> = lens1.compose(lensFromImplicitAccessors(e))
                return [sel, lens2] as [AlbumSelector, null]
            })
            .concat(this.selectorses.valueSeq().flatMap((sels, i) => {
                let lens1: Lens<AlbumShuffleSelector, List<AlbumSelectors>> = new Lens(
                    o => o.get('selectorses', undefined),
                    v => o => o.set('selectorses', v))
                let lens2: Lens<AlbumShuffleSelector, AlbumSelectors> = lens1.compose(lensFromImplicitAccessors(i))
                return sels.selectors.map((sel, j) => {
                    let lens3: Lens<AlbumShuffleSelector, List<AlbumSelector>> = lens2.compose(new Lens(
                        o => o.get('selectors', undefined),
                        v => o => o.set('selectors', v)))
                    let lens4: Lens<AlbumShuffleSelector, AlbumSelector> = lens3.compose(lensFromImplicitAccessors(j))
                    return [sel, lens4] as [AlbumSelector, null]
                })
            }))
            .filter(([sel, _lens]) => sel.selected)
    }

    hasSelection(): boolean {
        return this.allSelected().some(_t => true)
    }

    addSelection(selectors: Lens<AlbumShuffleSelector, AlbumSelectors>): AlbumShuffleSelector {
        let newSelectors = this.allSelected()
            .map(([sel, _lens]) => new AlbumSelector({album: sel.album}))
            .toList()
        return selectors.modify(sels =>
            sels.update('selectors', selsList =>
                selsList.concat(newSelectors))
        )(this).clearSelected()
    }

    clearSelected(): AlbumShuffleSelector {
        return this.allSelected().reduce((ret, [_sel, lens]) => {
            return lens.modify(sel => sel.set('selected', false))(ret)
        }, this)
    }
}

export type PlaylistTrackSelection = 'include' | 'exclude' | undefined

export class Playlist extends Record({
    tracks: List<Track>(),
    selected: Map<TrackId, PlaylistTrackSelection>(),
    score: 0,
    scores: [] as number[],
}) {
}

export class TimefillSelector extends Record({
    tracks: Map<TrackId, Track>(),
    targets: List<string>(),
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

    withTracksResponse(j: any): this {
        let tracks = Map<TrackId, Track>().withMutations(m => {
            for (let t of j.data) {
                m.set(isoTrackId.wrap(t.T_pPIS), new Track(t))
            }
        })
        return this.set('tracks', tracks)
    }

    withTimefillResponse(j: any): this {
        let playlists = List(j.data.playlists as {tracks: TrackId[], score: number, scores: number[]}[])
            .map(p => {
                let initial = Object.assign(p, {tracks: List(p.tracks).map(tid => this.tracks.get(tid))})
                return new Playlist(initial)
            })
        return this.set('playlists', playlists)
    }
}
