import {Map, List, Record, Seq} from 'immutable'
import {Newtype, iso} from 'newtype-ts'
import * as React from 'react'
import * as qs from 'qs'

import {lensFromImplicitAccessors, lensFromListIndex, lensFromNullableImplicitAccessorsAndConstructor, ComponentLens} from './extlens'
import {Lens, Iso, Optional} from 'monocle-ts';
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
            album: this.t('pAlb'),
            artist: this.t('pAlA') || this.t('pArt'),
        })
    }

    t = (typ: string) => this._raw['T_' + typ]
}

function TrackDisplay(props: {track: Track, color?: string}): JSX.Element {
    let style: StandardShorthandProperties = {}
    if (props.color) {
        style.background = props.color
    }
    return <li style={style}>
        {props.track.t('pnam')}
    </li>
}

function TracksDisplay(props: {tracks: List<Track>, colorByAlbum?: Map<AlbumKey, string>}): JSX.Element {
    let colorByAlbum = props.colorByAlbum || Map()
    return <ul className="tracklist">
        {props.tracks.map((track, e) => <TrackDisplay track={track} color={colorByAlbum.get(track.albumKey())} key={e} />)}
    </ul>
}

type AlbumProps = {
    key: AlbumKey,
    nameLower: string,
    tracks: List<TrackId>,
}

export class Album extends (Record({
    key: undefined,
    nameLower: undefined,
    tracks: List(),
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
    top: AlbumShuffleSelectorDisplay
    album: Album
    remove?: () => void
    color?: string
    albumSelector?: ComponentLens<AlbumsSelectorDisplayProps, AlbumsSelectorDisplayState, AlbumsSelectorDisplay, AlbumSelector>
}

function AlbumDisplay(props: AlbumDisplayProps): JSX.Element {
    let album = props.album
    let classes = ['album']
    let controls = <></>
    if (props.albumSelector) {
        let selector = props.albumSelector.get()
        if (selector.fading) {
            classes.push('fading')
        } else {
            let onChange = () => props.albumSelector.modify(s => s.set('selected', !s.selected))
            controls = <>
                <button onClick={props.remove}>Remove</button>
                <label><input type="checkbox" name="replacement-source" onChange={onChange} checked={selector.selected} /> Replacement source</label>
            </>;
        }
    }
    return <div className={classes.join(' ')}>
        <header>
        <h3 style={{background: props.color}}>{album.key.album}; {album.key.artist}</h3>
        {controls}
        </header>
        <TracksDisplay tracks={album.tracks.map(t => props.top.getTrack(t))} />
    </div>
}

function AlbumSearchDisplay(props: {top: AlbumShuffleSelectorDisplay, albums: Seq.Indexed<Album>, query: string}): JSX.Element {
    let needle = props.query.toLowerCase();
    let albums = Seq();
    if (needle.length >= 2) {
        albums = props.albums
            .filter(album => album.nameLower.includes(needle))
            .map((album, e) => <AlbumDisplay key={e} top={props.top} album={album} />)
    }
    return <div className="album-source">{albums}</div>
}


export class AlbumSelector extends (Record({
    selected: false,
    fading: false,
}) as Record.Factory<{
    selected: boolean
    fading: boolean
}>) {

}

type AlbumsSelectorDisplayProps = {
    lens: SelectorLens<List<AlbumKey>>
}

type AlbumsSelectorDisplayState = {
    albums: Map<AlbumKey, AlbumSelector>
    shuffled: List<TrackId>
    shuffleInfo: any
}

class AlbumsSelectorDisplay extends React.Component<AlbumsSelectorDisplayProps, AlbumsSelectorDisplayState> {
    constructor(props: AlbumsSelectorDisplayProps) {
        super(props)
        this.state = {
            albums: Map(),
            shuffled: List(),
            shuffleInfo: {},
        }
    }

    keys(): List<AlbumKey> {
        return this.props.lens.get()
    }

    albums(): List<Album> {
        return this.keys().map(k => this.props.lens.bound.getAlbum(k))
    }

    shuffled(): List<Track> {
        return this.state.shuffled.map(tid => this.props.lens.bound.getTrack(tid))
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
        let colors = this.colorsByAlbum()
        let shuffledDisplay = <></>
        let shuffled = this.shuffled()
        if (!this.state.shuffled.isEmpty()) {
            shuffledDisplay = <>
                <TracksDisplay tracks={shuffled} colorByAlbum={colors} />
            </>
        }

        return <div className="albums-selector">
            <button onClick={() => {}} disabled={true}>Add albums</button>
            {this.albums().map((album, e) => {
                let top = this.props.lens.bound
                let color = colors.get(album.key)
                let keyLens: Lens<Map<AlbumKey, AlbumSelector>, AlbumSelector> = lensFromNullableImplicitAccessorsAndConstructor(album.key, () => new AlbumSelector())
                let albumSelector: ComponentLens<AlbumsSelectorDisplayProps, AlbumsSelectorDisplayState, AlbumsSelectorDisplay, AlbumSelector> = new ComponentLens(this, Lens.fromProp<AlbumsSelectorDisplayState, 'albums'>('albums')).compose(keyLens)
                return <AlbumDisplay key={e} {...{top, album, color, keyLens, albumSelector}} />
            })}
            <button onClick={() => this.shuffle()}>Shuffle tracks</button>
            {shuffledDisplay}
        </div>
    }
}

type SelectorLens<T> = ComponentLens<AlbumShuffleSelectorProps, AlbumShuffleSelectorState, AlbumShuffleSelectorDisplay, T>

function lensOverTrack(sl: SelectorLens<TrackId>): SelectorLens<Track> {
    return new ComponentLens(sl.bound, sl.lens.composeIso(new Iso(
        (s: TrackId) => sl.bound.getTrack(s),
        (a: Track) => a.id,
    )))
}

function lensOverAlbum(sl: SelectorLens<AlbumKey>): SelectorLens<Album> {
    return new ComponentLens(sl.bound, sl.lens.composeIso(new Iso(
        (s: AlbumKey) => sl.bound.getAlbum(s),
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

    albumLens(key: AlbumKey): SelectorLens<Album> {
        return this.propLens('albums').compose(lensFromImplicitAccessors(key))
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

    // hasSelection(): boolean {
    //     return this.state.albums.valueSeq().some(a => a.selected)
    // }

    // addSelection(lens: SelectorLens<List<AlbumKey>>) {
    //     let newAlbums = List().withMutations(newAlbums => {
    //         let albums = this.state.albums.withMutations(albums => albums.forEach((album, key) => {
    //             if (!album.selected) {
    //                 return
    //             }
    //             newAlbums.push(key)
    //             albums.set(key, album.set('selected', false))
    //         }))
    //         this.setState({albums})
    //     })
    //     lens.modify(albums => albums.concat(newAlbums))
    // }

    propLens<P extends keyof AlbumShuffleSelectorState>(prop: P): SelectorLens<AlbumShuffleSelectorState[P]>
    {
        return new ComponentLens(this, Lens.fromProp(prop))
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
            <AlbumSearchDisplay top={this} albums={this.props.albums.valueSeq()} query={this.state.albumSearch} />
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
