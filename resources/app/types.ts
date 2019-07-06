import { List, Map, OrderedMap, Record, Seq, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import { iso, Newtype } from 'newtype-ts'
import { CustomError } from 'ts-custom-error'

import * as actions from './actions'
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

export type KeyboardEvents = {onFocus: () => void, onBlur: () => void}
export function keyboardEvents(dispatch: {onKeyboardAvailable: typeof actions.setKeyboardAvailability}): KeyboardEvents {
    return {
        onFocus: () => dispatch.onKeyboardAvailable({available: false}),
        onBlur: () => dispatch.onKeyboardAvailable({available: true}),
    }
}

function messageFrom(response: Response, json: any): string {
    return `${response.status} ${response.statusText}: ${JSON.stringify(json)}`
}

export class RemoteError extends CustomError {
    public constructor(
        public response: Response,
        public json: any,
        message: string = messageFrom(response, json),
    ) {
        super(message)
    }
}
