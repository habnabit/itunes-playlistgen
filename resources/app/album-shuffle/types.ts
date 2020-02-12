import { List, Map, OrderedMap, Record, Seq, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import { ActionType } from 'typesafe-actions'

import * as baseActions from '../actions'
import { lensFromImplicitAccessors } from '../extlens'
import { Album, AlbumId, collateAlbums, isoTrackId, Track, TrackId } from '../types'
import * as actions from './actions'

export type AllActions = ActionType<typeof baseActions | typeof actions>

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
    hovered: undefined as number,
}) {
    withShuffleResponse(shuffled: List<Track>, shuffleInfo: any): this {
        return this.merge({shuffled, shuffleInfo})
    }

    withoutAlbum(album: AlbumId): this {
        return this.update('selectors', (selsList) =>
            selsList.filter((sel) => sel.album.id != album))
    }
}

export class AlbumShuffleSelector extends Record({
    tracks: Map<TrackId, Track>(),
    albums: Map<AlbumId, Album>(),
    existingPlaylists: Map<TrackId, Set<string>>(),
    selectors: new AlbumSelectors(),
    searchQuery: '',
    activeSearch: '',
    searchResults: List<AlbumSelector>(),
    sources: Map<string, string>(),
    sourcingGenius: false,
    pickingAlbums: false,
    artworkErroredFor: Set<TrackId>(),
}) {
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
        return this.merge({tracks, albums})
    }

    withPlaylistsResponse(j: any): this {
        const tracksMap = Map<TrackId, Set<string>>().withMutations((m) => {
            for (const [album, tracks] of j.playlists) {
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
            .filter(([sel, _lens]) => sel.selected)
    }

    hasSelection(): boolean {
        return this.allSelected().some((_t) => true)
    }

    addSelection(): this {
        const newSelectors = this.allSelected()
            .map(([sel, _lens]) => new AlbumSelector({album: sel.album}))
            .toList()
        return this.update('selectors', (sels) =>
            sels.update('selectors', (selsList) =>
                selsList.concat(newSelectors))
        ).clearSelected()
    }

    clearSelected(): this {
        return this.allSelected().reduce((ret, [_sel, lens]) => {
            return lens.modify((sel) => sel.set('selected', false))(ret)
        }, this as AlbumShuffleSelector) as this
    }
}
