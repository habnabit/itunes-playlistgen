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
export const AlbumKey: Record.Factory<AlbumKeyProps> = Record({ album: undefined, artist: undefined })
export type AlbumKey = Record<AlbumKeyProps> & Readonly<AlbumKeyProps>

export interface TrackId extends Newtype<{ readonly TrackId: unique symbol }, string> {}
export const isoTrackId = iso<TrackId>()

export class Track {
    id: TrackId
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

class TrackDisplay extends React.Component<{track: Track, color?: string}> {
    t = (typ: string) => this.props.track._raw['T_' + typ]

    render() {
        let style: StandardShorthandProperties = {}
        if (this.props.color) {
            style.background = this.props.color
        }
        return <li style={style}>
            {this.t('pnam')}
        </li>
    }
}

class TracksDisplay extends React.Component<{tracks: List<Track>, colorByAlbum?: Map<AlbumKey, string>}> {
    render() {
        let colorByAlbum = this.props.colorByAlbum || Map()
        return <ul className="tracklist">
            {this.props.tracks.map((track, e) => <TrackDisplay track={track} color={colorByAlbum.get(track.albumKey())} key={e} />)}
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

export class Album extends (Record({
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

export function collateAlbums(tracks: IterableIterator<Track>, collated: Map<AlbumKey, Album> = Map()): Map<AlbumKey, Album> {
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

type AlbumDisplayProps = {
    lens: SelectorLens<Album>
    remove?: () => void
    color?: string
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
            <h3 style={{background: this.props.color}}>{album.key.album}; {album.key.artist}</h3>
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

type AlbumsSelectorDisplayProps = {
    lens: SelectorLens<List<AlbumKey>>
}

type AlbumsSelectorDisplayState = {
    shuffled: List<TrackId>
    shuffleInfo: any
}

class AlbumsSelectorDisplay extends React.Component<AlbumsSelectorDisplayProps, AlbumsSelectorDisplayState> {
    constructor(props: AlbumsSelectorDisplayProps) {
        super(props)
        this.state = {
            shuffled: List(),
            shuffleInfo: {},
        }
    }

    keys(): List<AlbumKey> {
        return this.props.lens.get()
    }

    albums(): List<Album> {
        return this.keys().map(k => this.props.lens.selector.getAlbum(k))
    }

    shuffled(): List<Track> {
        return this.state.shuffled.map(tid => this.props.lens.selector.getTrack(tid))
    }

    colorsByAlbum(): Map<AlbumKey, string> {
        return Map(this.keys().toSeq().map((a, e) => [a, colorOrder[e]] as [AlbumKey, string]))
    }

    shuffle() {
        let tracks = this.albums()
            .flatMap(album => album.tracks)
            .map(tid => isoTrackId.unwrap(tid))
            .toArray()
        let params = qs.stringify({tracks}, {arrayFormat: 'repeat'})
        return fetch('/_api/shuffle-together-albums?' + params)
            .then(resp => resp.json())
            .then(j => {
                let shuffled = List(j.data.tracks as TrackId[])
                this.setState({shuffled, shuffleInfo: j.data.info})
            })
    }

    save() {
        let body = new FormData()
        body.append(
            'name', '\u203b Album Shuffle\n' + Array.from(this.albums(), a => a.key.album).join(' \u2715 '))
        for (let t of this.state.shuffled) {
            body.append('tracks', isoTrackId.unwrap(t))
        }
        fetch('/_api/save-and-exit', {
            method: 'POST',
            body,
        })
            .then(resp => resp.json())
            .then(j => {
                if (j.data) {
                    window.close()
                }
            })
    }

    render () {
        let selector = this.props.lens.selector
        let shuffledDisplay = <></>
        let shuffled = this.shuffled()
        if (!this.state.shuffled.isEmpty()) {
            shuffledDisplay = <>
                <TracksDisplay tracks={shuffled} colorByAlbum={this.colorsByAlbum()} />
            </>
        }

        return <div className="albums-selector">
            <button onClick={() => selector.addSelection(this.props.lens)} disabled={!selector.hasSelection()}>Add albums</button>
            {this.keys().map((k, e) => selector.albumDisplay(k, e, {withColors: true}))}
            <button onClick={() => this.shuffle()}>Shuffle tracks</button>
            {shuffledDisplay}
        </div>
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
    albums: Map<AlbumKey, Album>
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
            albums: props.albums,
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

    getTrack(key: TrackId): Track {
        return this.state.tracks.get(key)
    }

    getAlbum(key: AlbumKey): Album {
        return this.state.albums.get(key)
    }

    albumDisplay(key: AlbumKey, idx: number, opts: {remove?: () => void, withColors?: boolean} = {}): JSX.Element {
        let lens: SelectorLens<Album> = this.propLens('albums').compose(lensFromImplicitAccessors(key))
        let props: AlbumDisplayProps = {lens, remove: opts.remove}
        if (opts.withColors) {
            props.color = colorOrder[idx]
        }
        return <AlbumDisplay key={idx} {...props} />
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

    hasSelection(): boolean {
        return this.state.albums.valueSeq().some(a => a.selected)
    }

    addSelection(lens: SelectorLens<List<AlbumKey>>) {
        let newAlbums = List().withMutations(newAlbums => {
            let albums = this.state.albums.withMutations(albums => albums.forEach((album, key) => {
                if (!album.selected) {
                    return
                }
                newAlbums.push(key)
                albums.set(key, album.set('selected', false))
            }))
            this.setState({albums})
        })
        lens.modify(albums => albums.concat(newAlbums))
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
            {this.mapChoices((e, lens) => (
                <AlbumsSelectorDisplay lens={lens} key={e} />
            ))}
        </div>
    }
}
