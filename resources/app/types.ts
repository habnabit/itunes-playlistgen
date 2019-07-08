import { List, Map, Record } from 'immutable'
import { iso, Newtype } from 'newtype-ts'
import { CustomError } from 'ts-custom-error'

import * as actions from './actions'


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
