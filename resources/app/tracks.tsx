import {Map, List, Record, Seq} from 'immutable'
import {Newtype, iso} from 'newtype-ts'
import * as React from 'react'
import * as qs from 'qs'

import {lensFromImplicitAccessors, lensFromIndex, lensFromListIndex, lensFromRecordProp} from './extlens'
import {Lens, Iso} from 'monocle-ts';
import {StandardShorthandProperties} from 'csstype';

const colorOrder = ["#fbb4ae","#b3cde3","#ccebc5","#decbe4","#fed9a6","#ffffcc","#e5d8bd","#fddaec","#f2f2f2"]

type SubsetKeys<T, S> = {
    [P in keyof T]: T[P] extends S ? P : never
}[keyof T]

type AlbumKeyProps = {
    album: string
    artist: string
}
const AlbumKey: Record.Factory<AlbumKeyProps> = Record({ album: undefined, artist: undefined })
type AlbumKey = Record<AlbumKeyProps> & Readonly<AlbumKeyProps>

export interface TrackId extends Newtype<{ readonly TrackId: unique symbol }, string> {}
export const isoTrackId = iso<TrackId>()

export class Track {
    id: TrackId
    color: string
    _raw: any

    constructor(raw: any) {
        this.id = isoTrackId.wrap(raw.T_pPIS)
        this._raw = raw
    }

    albumKey(): AlbumKey {
        return AlbumKey({
            album: this._raw.T_pAlb,
            artist: this._raw.T_pAlA || this._raw.T_pArt,
        })
    }
}

class TrackDisplay extends React.Component<{track: Track}> {
    t = (typ: string) => this.props.track._raw['T_' + typ]

    render() {
        let style: StandardShorthandProperties = {}
        if (this.props.track.color) {
            style.background = this.props.track.color
        }
        return <li style={style}>
            {this.t('pnam')}
        </li>
    }
}

class TracksDisplay extends React.Component<{tracks: List<Track>}> {
    render() {
        return <ul className="tracklist">
            {this.props.tracks.map((track, e) => <TrackDisplay track={track} key={e} />)}
        </ul>
    }
}

type AlbumProps = {
    key: AlbumKey,
    nameLower: string,
    tracks: List<TrackId>,
    selected: boolean,
    fading: boolean,
}

class Album extends (Record({
    key: undefined,
    nameLower: undefined,
    tracks: List(),
    selected: false,
    fading: false,
}) as Record.Factory<AlbumProps>) {
    constructor(key: AlbumKey) {
        let nameLower = (key.album + ' ' + key.artist).toLowerCase()
        super({ key, nameLower })
    }

    withTrack(track: TrackId): Album {
        return this.set('tracks', this.tracks.push(track))
    }
}

type AlbumDisplayProps = {
    lens: SelectorLens<Album>
    remove: () => void
}

class AlbumDisplay extends React.Component<AlbumDisplayProps> {
    album(): Album {
        return this.props.lens.get()
    }

    isSelected() {
        return this.album().selected
    }

    changed = () => {
        this.props.lens.modify(a => a.update('selected', b => !b))
    }

    render() {
        let classes = ['album']
        let controls = <></>
        let album = this.album()
        if (album.fading) {
            classes.push('fading')
        } else {
            controls = <>
                <button onClick={this.props.remove}>Remove</button>
                <label><input type="checkbox" name="replacement-source" onChange={this.changed} checked={this.isSelected()} /> Replacement source</label>
            </>;
        }
        return <div className={classes.join(' ')}>
            <header>
            <h3 style={{background: 'gray'}}>{album.key.album}; {album.key.artist}</h3>
            {controls}
            </header>
            <TracksDisplay tracks={album.tracks.map(t => this.props.lens.selector.getTrack(t))} />
        </div>
    }
}

class AlbumSearchDisplay extends React.Component<{lens: SelectorLens<string>}> {
    render () {
        let needle = this.props.lens.get().toLowerCase();
        let albums = Seq();
        if (needle.length >= 2) {
            albums = this.props.lens.selector.state.albums
                .toSeq()
                .filter((album, key) => album.nameLower.includes(needle))
                .keySeq()
                .map((k, e) => this.props.lens.selector.albumDisplay(k, e))
        }
        return <div className="album-source">{albums}</div>
    }
}

class SelectorLens<T> {
    selector: AlbumShuffleSelectorDisplay
    lens: Lens<AlbumShuffleSelectorState, T>

    constructor(selector: AlbumShuffleSelectorDisplay, lens: Lens<AlbumShuffleSelectorState, T>) {
        this.selector = selector
        this.lens = lens
    }

    get(): T {
        return this.selector.getState(this.lens.get)
    }

    set(v: T) {
        this.selector.updateState(this.lens.set(v))
    }

    modify(f: (x: T) => T) {
        this.selector.updateState(this.lens.modify(f))
    }

    compose<U>(over: Lens<T, U>): SelectorLens<U> {
        return new SelectorLens(this.selector, this.lens.compose(over))
    }
}

function lensOverTrack(sl: SelectorLens<TrackId>): SelectorLens<Track> {
    return new SelectorLens(sl.selector, sl.lens.composeIso(new Iso(
        (s: TrackId) => sl.selector.getTrack(s),
        (a: Track) => a.id,
    )))
}

function lensOverAlbum(sl: SelectorLens<AlbumKey>): SelectorLens<Album> {
    return new SelectorLens(sl.selector, sl.lens.composeIso(new Iso(
        (s: AlbumKey) => sl.selector.getAlbum(s),
        (a: Album) => a.key,
    )))
}

type AlbumShuffleSelectorProps = {
    tracks: Map<TrackId, Track>
}

type AlbumShuffleSelectorState = {
    tracks: Map<TrackId, Track>
    albums: Map<AlbumKey, Album>
    choices: List<List<AlbumKey>>
    nAlbums: number
    nChoices: number
    albumSearch: string
    sources: Map<string, string>
    sourcingGenius: boolean
    pickingAlbums: boolean
}

export class AlbumShuffleSelectorDisplay extends React.Component<AlbumShuffleSelectorProps, AlbumShuffleSelectorState> {
    constructor(props: AlbumShuffleSelectorProps) {
        super(props)
        this.state = {
            tracks: props.tracks,
            albums: this._collateAlbums(props.tracks.values()),
            choices: List(),
            nAlbums: 4,
            nChoices: 5,
            albumSearch: '',
            sources: Map(),
            sourcingGenius: false,
            pickingAlbums: false,
        }
    }

    trackIdAsAlbumKey(tid: TrackId): AlbumKey {
        return this.getTrack(tid).albumKey()
    }

    _collateAlbums(tracks: IterableIterator<Track>, collated: Map<AlbumKey, Album> = Map()): Map<AlbumKey, Album> {
        return collated.withMutations(collated => {
            for (let t of tracks) {
                let key = t.albumKey()
                collated.update(key, undefined, album => {
                    if (!album) {
                        album = new Album(key)
                    }
                    return album.withTrack(t.id)
                })
            }
        })
    }

    getTrack(key: TrackId): Track {
        return this.state.tracks.get(key)
    }

    getAlbum(key: AlbumKey): Album {
        return this.state.albums.get(key)
    }

    albumDisplay(key: AlbumKey, idx: number): JSX.Element {
        let lens: SelectorLens<Album> = this.propLens('albums').compose(lensFromImplicitAccessors(key))
        return <AlbumDisplay lens={lens} remove={() => {}} key={idx} />
    }

    handleNumberChange(key: SubsetKeys<AlbumShuffleSelectorState, number>, event: React.ChangeEvent<HTMLInputElement>)
    {
        let value = event.target.valueAsNumber
        if (!isNaN(value)) {
            this.setState(s => Object.assign({}, s, {[key]: value}))
        }
    }

    handleStringChange(key: SubsetKeys<AlbumShuffleSelectorState, string>, event: React.ChangeEvent<HTMLInputElement>)
    {
        let value = event.target.value
        this.setState(s => Object.assign({}, s, {[key]: value}))
    }

    sourceGenius() {

    }

    repickAlbums() {

    }

    newSelector() {
        this.setState({choices: this.state.choices.push(List())})
    }

    propLens<P extends keyof AlbumShuffleSelectorState>(prop: P): SelectorLens<AlbumShuffleSelectorState[P]>
    {
        return new SelectorLens(this, Lens.fromProp(prop))
    }

    getState<V>(getter: (prev: Readonly<AlbumShuffleSelectorState>) => V): V {
        return getter(this.state)
    }

    updateState(updater: (prev: Readonly<AlbumShuffleSelectorState>) => AlbumShuffleSelectorState) {
        this.setState(updater)
    }

    mapChoices<V>(f: (e: number, lens: SelectorLens<List<AlbumKey>>) => V): List<V> {
        let allChoicesLens = this.propLens('choices')
        return this.state.choices.map((choices, e) => {
            let choicesLens = allChoicesLens.compose(lensFromListIndex(e))
            return f(e, choicesLens)
        })
    }

    render() {
        return <div>
            <input type="search" placeholder="Album search..." value={this.state.albumSearch} onChange={ev => this.handleStringChange('albumSearch', ev)} />
            <AlbumSearchDisplay lens={this.propLens('albumSearch')} />
            <button onClick={() => this.sourceGenius()} disabled={this.state.sourcingGenius}>Source albums from Genius</button>
            <label># albums <input type="number" placeholder="# albums" value={this.state.nAlbums} onChange={ev => this.handleNumberChange('nAlbums', ev)} /></label>
            <label># choices <input type="number" placeholder="# choices" value={this.state.nChoices} onChange={ev => this.handleNumberChange('nChoices', ev)} /></label>
            <button onClick={() => this.repickAlbums()} disabled={this.state.pickingAlbums}>Pick albums</button>
            <button onClick={() => this.newSelector()}>New selector</button>
        </div>
    }
}
