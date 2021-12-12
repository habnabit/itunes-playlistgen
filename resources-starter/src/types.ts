import { List, Map, Record } from 'immutable'
import { Newtype, iso } from 'newtype-ts'
import { CustomError } from 'ts-custom-error'

export type SubsetKeys<T, S> = {
    [P in keyof T]: T[P] extends S ? P : never
}[keyof T]

export interface TrackId
    extends Newtype<{ readonly TrackId: unique symbol }, string> {}
export const isoTrackId = iso<TrackId>()
export interface AlbumId
    extends Newtype<{ readonly AlbumId: unique symbol }, string> {}
export const isoAlbumId = iso<AlbumId>()

export type RawTrack = {
    ppis: string
    albumPpis: string

    title: string
    artist: string
    album: string
    trackNumber: number

    totalTime: number
}

export class Track {
    private readonly raw: RawTrack

    constructor(raw: RawTrack) {
        this.raw = raw
    }

    get id() {
        return isoTrackId.wrap(this.raw.ppis)
    }
    get albumId() {
        return isoAlbumId.wrap(this.raw.albumPpis)
    }
    get title() {
        return this.raw.title
    }
    get artist() {
        return this.raw.artist
    }
    get album() {
        return this.raw.album
    }
    get trackNumber() {
        return this.raw.trackNumber
    }
    get totalTime() {
        return this.raw.totalTime
    }

    asAlbum(): Album {
        const nameLower = (this.album + ' ' + this.artist).toLowerCase()
        return new Album({
            id: this.albumId,
            title: this.album,
            artist: this.artist,
            nameLower,
        })
    }
}

export class Album extends Record({
    id: undefined as AlbumId,
    title: undefined as string,
    artist: undefined as string,
    nameLower: undefined as string,
    tracks: List<Track>(),
}) {
    prettyName(): string {
        return `${this.title}; ${this.artist}`
    }

    withTrack(track: Track): Album {
        return this.set('tracks', this.tracks.push(track))
    }
}

export function collateAlbums(
    tracks: IterableIterator<Track>,
    collated: Map<AlbumId, Album> = Map(),
): Map<AlbumId, Album> {
    return collated.withMutations((collated) => {
        for (const t of tracks) {
            collated.update(t.albumId, undefined, (album) =>
                (album || t.asAlbum()).withTrack(t),
            )
        }
    })
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
