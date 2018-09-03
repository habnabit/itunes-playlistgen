import { SvgProperties, StandardProperties } from 'csstype'
import { List, Map, Seq, Set, OrderedSet, OrderedMap } from 'immutable'
import { Lens } from 'monocle-ts'
import * as React from 'react'
import { connect } from 'react-redux'
import { onlyUpdateForKeys, pure, shouldUpdate, shallowEqual } from 'recompose'
import { bindActionCreators, Dispatch } from 'redux'

import * as actions from './actions'
import { lensFromImplicitAccessors } from './extlens'
import { Album, AlbumKey, AlbumSelector, AlbumShuffleSelector, Track, TrackId, AlbumSelectors, isoTrackId, TimefillSelector, Playlist, PlaylistTrackSelection } from './types'


const colorOrder = [
    '#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6',
    '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2',
]


class ShuffleInfoComponent extends React.PureComponent<{
    response: any
    colorByAlbum: Map<AlbumKey, string>
}> {
    colorByAlbumIndex(): Map<number, string> {
        const seq = Seq.Indexed.of(...this.props.response.data.info.albums as string[][])
            .map(([album, artist], e) => {
                const key = new AlbumKey({album, artist})
                return [e, this.props.colorByAlbum.get(key)] as [number, string]
            })
        return Map(seq)
    }

    matGroup(): {xMax: number, yMax: number, element: JSX.Element} {
        const lineStyle: SvgProperties = {
            stroke: 'rgba(0, 0, 0, 0.75)',
            strokeWidth: '0.05',
        }

        const circleStyle: SvgProperties = {
            stroke: 'rgba(0, 0, 0, 0.5)',
            strokeWidth: lineStyle.strokeWidth,
        }

        const info = this.props.response.data.info
        const colors = this.colorByAlbumIndex()
        const coords: number[][] = info.coords || []
        const postPicks: number[] = info.post_picks || []
        let elementIdx = 0
        const circles: JSX.Element[] = []
        const lines: JSX.Element[] = []
        const flatCircles: {x: number, y: number, style: SvgProperties}[] = []
        let xMax = 0
        coords.forEach((xs, y) => {
            const fill = colors.get(y)
            for (const x of xs) {
                let style: SvgProperties = {}
                flatCircles.push(({x: Math.floor(x), y, style}))
                style = {fill, opacity: 0.5, ...circleStyle}
                circles.push(<circle cx={x} cy={y} r="0.25" key={elementIdx++} style={style} />)
                xMax = Math.max(xMax, x)
            }
        })
        flatCircles.sort((a, b) => a.x - b.x)
        postPicks.forEach((pick, e) => {
            flatCircles[e].style.fill = colors.get(pick)
        })
        let lastCircle: typeof flatCircles[number]
        for (const c of flatCircles) {
            const {x, y} = c
            const localCircleStyle = {...c.style, ...circleStyle}
            circles.push(<circle cx={x} cy={y} r="0.125" key={elementIdx++} style={localCircleStyle} />)
            if (lastCircle !== undefined) {
                const {x: x1, y: y1} = lastCircle
                lines.push(<line x1={x1} y1={y1} x2={x} y2={y} key={elementIdx++} style={lineStyle} />)
            }
            lastCircle = c
        }
        return {
            xMax, yMax: coords.length,
            element: <>{lines}{circles}</>,
        }
    }

    render() {
        if (!this.props.response) {
            return <></>
        }

        const {xMax, yMax, element} = this.matGroup()
        const viewBox = "0 0 " + (xMax + 2) + " " + (yMax + 2)
        let style: StandardProperties = {}
        if (xMax == 0 || yMax == 0) {
            style = {display: 'none'}
        } else {
            style = {width: '100%', height: '125px'}
        }
        return <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox={viewBox} preserveAspectRatio="xMinYMin meet" style={style}>
            <g transform="translate(1 1)">{element}</g>
        </svg>
    }
}

const TrackComponent = onlyUpdateForKeys(
    ['track', 'color']
)((props: {
    track: Track
    color?: string
}) => {
    const style: StandardProperties = {}
    if (props.color) {
        style.background = props.color
    }
    return <li style={style}>
        {props.track.t('pnam')}
    </li>
})

const TracksComponent = onlyUpdateForKeys(
    ['tracks', 'colorByAlbum']
)((props: {
    tracks: List<Track>
    colorByAlbum?: Map<AlbumKey, string>
}) => {
    const colorByAlbum = props.colorByAlbum || Map()
    return <ol className="tracklist">
        {props.tracks.map((track, e) => <TrackComponent track={track} color={colorByAlbum.get(track.albumKey())} key={e} />)}
    </ol>
})

const AlbumSelectorComponent = onlyUpdateForKeys(
    ['selector', 'playlists', 'color']
)((props: {
    selector: AlbumSelector
    playlists: Map<TrackId, Set<string>>
    color?: string
    selectorLens: Lens<AlbumShuffleSelector, AlbumSelector>
    selectorsLens?: Lens<AlbumShuffleSelector, AlbumSelectors>
    onToggleSelected: typeof actions.toggleAlbumSelected
    onRemove: typeof actions.removeAlbum
}) => {
    const album = props.selector.album
    const classes = ['album']
    if (props.selector.fading) {
        classes.push('fading')
    }

    const allPlaylists = props.selector.album.tracks
        .flatMap((t) => props.playlists.get(t.id, []))
        .toSet()
        .sort()

    let controls = <>
        <label><input type="checkbox" name="replacement-source" onChange={() => props.onToggleSelected({lens: props.selectorLens})} checked={props.selector.selected} /> Replacement source</label>
    </>
    if (props.selectorsLens) {
        controls = <>
            {controls}
            <button onClick={() => props.onRemove({lens: props.selectorsLens, album: album.key})}>Remove</button>
        </>
    }

    return <div className={classes.join(' ')}>
        <header>
            <h3 style={{background: props.color}}>{album.key.prettyName()}</h3>
            <h5 className="playlists">{allPlaylists.join('; ')}</h5>
            {controls}
        </header>
        <TracksComponent tracks={album.tracks} />
    </div>
})

export const ConnectedAlbumSelectorComponent = connect(
    (top: AlbumShuffleSelector, ownProps: {
        selector: AlbumSelector
        selectorLens: Lens<AlbumShuffleSelector, AlbumSelector>
        selectorsLens?: Lens<AlbumShuffleSelector, AlbumSelectors>
    }) => {
        return {
            playlists: top.existingPlaylists,
            selectorsLens: ownProps.selectorsLens,
        }
    },
    (d: Dispatch) => bindActionCreators({
        onToggleSelected: actions.toggleAlbumSelected,
        onRemove: actions.removeAlbum,
    }, d),
    (props, dispatch, ownProps) => ({...props, ...dispatch, ...ownProps}),
    {
        areStatesEqual: (x, y) => x.searchResults === y.searchResults && x.selectorses === y.selectorses && x.existingPlaylists === y.existingPlaylists,
        areOwnPropsEqual: (x, y) => x.selector.album === y.selector.album && x.selector.fading === y.selector.fading && x.selector.selected == y.selector.selected,
        areStatePropsEqual: (x, y) => x.playlists === y.playlists,
    },
)(AlbumSelectorComponent)

class AlbumSelectorsComponent extends React.PureComponent<{
    tracks: Map<TrackId, Track>
    selectors: AlbumSelectors
    lens: Lens<AlbumShuffleSelector, AlbumSelectors>
    allowAdd: boolean
    onAddSelection: typeof actions.addSelectionTo
    onShuffle: typeof actions.shuffleTracks.request
    onSave: typeof actions.savePlaylist.request
}> {
    colorByAlbum(): Map<AlbumKey, string> {
        return Map(this.props.selectors.selectors.toSeq().map((a, e) => [a.album.key, colorOrder[e]] as [AlbumKey, string]))
    }

    shuffled(): List<Track> {
        return this.props.selectors.shuffled
    }

    shuffle() {
        const tracks = this.props.selectors.selectors
            .flatMap((sel) => sel.album.tracks)
            .toList()
        this.props.onShuffle({tracks, lens: this.props.lens})
    }

    save() {
        const albumNames = this.props.selectors.selectors
            .map((sel) => sel.album.key.album)
            .sort()
        const name = '\u203b Album Shuffle\n' + albumNames.join(' \u2715 ')
        this.props.onSave({name, tracks: this.props.selectors.shuffled})
    }

    render () {
        const colors = this.colorByAlbum()
        let shuffledDisplay = <></>
        const shuffled = this.shuffled()
        if (!shuffled.isEmpty()) {
            shuffledDisplay = <>
                <TracksComponent tracks={shuffled} colorByAlbum={colors} />
                <button key="save" onClick={() => this.save()}>Save and exit</button>
            </>
        }

        return <div className="albums-selector">
            <button onClick={() => { this.props.onAddSelection({lens: this.props.lens}) }} disabled={!this.props.allowAdd}>Add albums</button>
            {this.props.selectors.selectors.map((selector, e) => {
                const color = colors.get(selector.album.key)
                const lens1: Lens<AlbumShuffleSelector, List<AlbumSelector>> = this.props.lens.compose(new Lens(
                    (o) => o.get('selectors', undefined),
                    (v) => (o) => o.set('selectors', v)))
                const selectorLens: Lens<AlbumShuffleSelector, AlbumSelector> = lens1.compose(lensFromImplicitAccessors(e))
                return <ConnectedAlbumSelectorComponent key={e} selectorsLens={this.props.lens} {...{selector, color, selectorLens}} />
            })}
            <button onClick={() => this.shuffle()}>Shuffle tracks</button>
            <ShuffleInfoComponent response={this.props.selectors.shuffleInfo} colorByAlbum={colors} />
            {shuffledDisplay}
        </div>
    }
}

export const ConnectedAlbumSelectorsComponent = connect(
    (top: AlbumShuffleSelector, ownProps: {idxTop: number}) => {
        const lens1: Lens<AlbumShuffleSelector, List<AlbumSelectors>> = new Lens(
            (o) => o.get('selectorses', undefined),
            (v) => (o) => o.set('selectorses', v))
        const lens2: Lens<AlbumShuffleSelector, AlbumSelectors> = lens1.compose(
            lensFromImplicitAccessors(ownProps.idxTop))
        return {
            tracks: top.tracks,
            selectors: top.selectorses.get(ownProps.idxTop),
            lens: lens2,
            allowAdd: top.hasSelection(),
        }
    },
    (d: Dispatch) => bindActionCreators({
        onAddSelection: actions.addSelectionTo,
        onShuffle: actions.shuffleTracks.request,
        onSave: actions.savePlaylist.request,
    }, d),
    (props, dispatch, ownProps) => ({...props, ...dispatch, ...ownProps}),
    {
        areOwnPropsEqual: (x, y) => {
            return shallowEqual(x, y)
        },
        areStatesEqual: (x, y) => {
            return x === y
        },
        areStatePropsEqual: (x, y) => {
            return x.tracks === y.tracks && x.selectors === y.selectors && x.allowAdd === y.allowAdd
        },
        areMergedPropsEqual: (x, y) => {
            return x.tracks === y.tracks && x.selectors === y.selectors && x.allowAdd === y.allowAdd
        },
    },
)(AlbumSelectorsComponent)

const AlbumSearchComponent = onlyUpdateForKeys(
    ['albums', 'searchQuery', 'searchResults']
)((props: {
    albums: Map<AlbumKey, Album>
    searchQuery: string
    searchResults: List<AlbumSelector>
    onChange: typeof actions.changeControl
    onSearch: typeof actions.updateSearch
}) => {
    return <div>
        <input type="search" placeholder="Album search..." value={props.searchQuery} onChange={(ev) => {
            props.onSearch({query: ev.target.value})
            props.onChange({prop: 'searchQuery', value: ev.target.value})
        }} />
        <div className="album-source">
            {props.searchResults.map((sel, e) => {
                const lens1: Lens<AlbumShuffleSelector, List<AlbumSelector>> = new Lens(
                    (o) => o.get('searchResults', undefined),
                    (v) => (o) => o.set('searchResults', v))
                const lens2: Lens<AlbumShuffleSelector, AlbumSelector> = lens1.compose(lensFromImplicitAccessors(e))
                return <ConnectedAlbumSelectorComponent key={e} selector={sel} selectorLens={lens2} />
            })}
        </div>
    </div>
})

export const ConnectedAlbumSearchComponent = connect(
    (top: AlbumShuffleSelector) => (top || new AlbumShuffleSelector()).toObject(),
    (d: Dispatch) => bindActionCreators({
        onChange: actions.changeControl,
        onSearch: actions.updateSearch,
    }, d),
    undefined,
    {
        areStatesEqual: (x, y) => {
            return x.albums === y.albums && x.searchQuery === y.searchQuery && x.searchResults === y.searchResults
        },
        areStatePropsEqual: (x, y) => {
            return x.albums === y.albums && x.searchQuery === y.searchQuery && x.searchResults === y.searchResults
        },
    },
)(AlbumSearchComponent)

class AlbumShuffleSelectorComponent extends React.PureComponent<{
    selectorses: List<AlbumSelectors>
    nAlbums: string
    nChoices: string
    onChange: typeof actions.changeControl
    onNewAlbumSelector: typeof actions.newAlbumSelector
    onFetchTracks: typeof actions.fetchTracks.request
    onFetchPlaylists: typeof actions.fetchPlaylists.request
}> {
    componentDidMount() {
        this.props.onFetchTracks()
        this.props.onFetchPlaylists()
    }

    render() {
        return <div>
            <ConnectedAlbumSearchComponent />
            <label># albums <input type="number" placeholder="# albums" value={this.props.nAlbums} onChange={(ev) => { this.props.onChange({prop: 'nAlbums', value: ev.target.value}) }} /></label>
            <label># choices <input type="number" placeholder="# choices" value={this.props.nChoices} onChange={(ev) => { this.props.onChange({prop: 'nChoices', value: ev.target.value}) }} /></label>
            <button onClick={() => this.props.onNewAlbumSelector({})}>New selector</button>
            {this.props.selectorses.map((_sels, e) => <ConnectedAlbumSelectorsComponent key={e} idxTop={e} />)}
        </div>
    }
}

export const ConnectedAlbumShuffleSelectorComponent = connect(
    (top: AlbumShuffleSelector) => (top || new AlbumShuffleSelector()).toObject(),
    (d: Dispatch) => bindActionCreators({
        onChange: actions.changeControl,
        onNewAlbumSelector: actions.newAlbumSelector,
        onFetchTracks: actions.fetchTracks.request,
        onFetchPlaylists: actions.fetchPlaylists.request,
    }, d),
)(AlbumShuffleSelectorComponent)

const DurationComponent = pure((props: {
    duration: number
}) => {
    const minutes = Math.floor(props.duration / 60)
    const seconds = Math.floor(props.duration % 60).toLocaleString('en', {minimumIntegerDigits: 2})
    return <>⟨{minutes}:{seconds}⟩</>
})

const PlaylistTrackComponent = onlyUpdateForKeys(
    ['track', 'selected']
)((props: {
    track: Track
    selected: PlaylistTrackSelection
    onToggle: () => void
}) => {
    const key = props.track.albumKey()
    return <li className={props.selected || ''} onClick={props.onToggle}>
        <DurationComponent duration={props.track.t('pDur')} /> {props.track.t('pnam')} ({key.prettyName()})
    </li>
})

const PlaylistComponent = onlyUpdateForKeys(
    ['playlist']
)((props: {
    playlist: Playlist
    onToggle: (tid: TrackId) => () => void
    onReroll: () => void
    onSave: () => void
}) => {
    const { playlist } = props
    const totalDuration = playlist.tracks.reduce((totalDuration, track) => totalDuration + track.t('pDur') as number, 0)
    return <div className="playlist">
        <p>score: {playlist.score.toPrecision(2)}; scores: {playlist.scores.map((s) => s.toPrecision(2)).join(' ')}</p>
        <button onClick={() => props.onReroll()}>Reroll</button>
        <button onClick={() => props.onSave()}>Save</button>
        <ol className="fuller tracklist">
            {props.playlist.tracks.map((track, e) => {
                const onToggle = props.onToggle(track.id)
                return <PlaylistTrackComponent key={e} selected={playlist.selected.get(track.id)} {...{track, onToggle}} />
            })}
            <li className="total"><DurationComponent duration={totalDuration} /> total</li>
        </ol>
    </div>
})

export const ConnectedPlaylistComponent = connect(
    (top: TimefillSelector, ownProps: {idxTop: number}) => {
        const lens1: Lens<TimefillSelector, List<Playlist>> = new Lens(
            (o) => o.get('playlists', undefined),
            (v) => (o) => o.set('playlists', v))
        const lens2: Lens<TimefillSelector, Playlist> = lens1.compose(
            lensFromImplicitAccessors(ownProps.idxTop))
        return {
            playlist: top.playlists.get(ownProps.idxTop),
            lens: lens2,
            top,
        }
    },
    (d: Dispatch) => bindActionCreators({
        onToggle: actions.togglePlaylistTrack,
        onReroll: actions.runTimefill.request,
        onSave: actions.savePlaylist.request,
    }, d),
    (stateProps, dispatchProps, ownProps) => {
        const { playlist, lens, top } = stateProps
        return {
            onToggle: (track: TrackId) => () => dispatchProps.onToggle({lens, track}),
            onReroll: () => {
                const selections = playlist.selectionMap()
                dispatchProps.onReroll({targets: top.allTargets(), selections, replace: lens})
            },
            onSave: () => {
                dispatchProps.onSave({name: top.name, tracks: playlist.tracks})
            },
            ...stateProps, ...ownProps,
        }
    },
    {
        areStatesEqual: (x, y) => x.playlists === y.playlists,
        areStatePropsEqual: (x, y) => x.playlist === y.playlist,
    },
)(PlaylistComponent)

const TargetsComponent = onlyUpdateForKeys(
    []
)((props: {
    targets: List<string>
    targetsLens: Lens<TimefillSelector, List<string>>
    onAddTarget: typeof actions.addTarget
    onChangeControl: typeof actions.changeControlTimefill
    keyb: KeyboardEvents
}) => {
    return <section>
        <button onClick={() => props.onAddTarget({})}>Add target</button>
        {props.targets.map((target, e) => {
            const lens: Lens<TimefillSelector, string> = props.targetsLens.compose(lensFromImplicitAccessors(e))
            return <input key={e} type="text" placeholder="Target…" value={target} onChange={(ev) => {
                props.onChangeControl({lens, value: ev.target.value})
            }} {...props.keyb} />
        })}
    </section>
})

const ConnectedTargetsComponent = connect(
    (top: TimefillSelector) => ({targets: top.targets}),
    (d: Dispatch) => bindActionCreators({
        onAddTarget: actions.addTarget,
        onChangeControl: actions.changeControlTimefill,
        onKeyboardAvailable: actions.setKeyboardAvailability,
    }, d),
    (props, dispatch, ownProps) => {
        const targetsLens: Lens<TimefillSelector, List<string>> = new Lens(
            (o) => o.get('targets', undefined),
            (v) => (o) => o.set('targets', v))
        return {
            keyb: keyboardEvents(dispatch), targetsLens,
            ...props, ...dispatch, ...ownProps,
        }
    },
    {
        areStatesEqual: (x, y) => x.targets === y.targets,
        areStatePropsEqual: (x, y) => x.targets === y.targets,
    },
)(TargetsComponent)

const WeightsComponent = ((props: {
    albums: OrderedMap<AlbumKey, Album>
    weights: List<[AlbumKey, string]>
    onAddWeight: typeof actions.addWeight
    onChangeWeight: typeof actions.changeWeight
    keyb: KeyboardEvents,
}) => {
    return <section>
        <button onClick={() => props.onAddWeight({})}>Add weight</button>
        {props.weights.map(([selected, weight], i) => {
            const events = {
                onChange: (event: React.ChangeEvent) => props.onChangeWeight({event, index: i}),
                ...props.keyb}
            var selIndex = 0
            const albumOptions = props.albums.keySeq().map((album, j) => {
                if (album.equals(selected)) {
                    selIndex = j
                }
                return <option key={j} value={j.toString()}>{album.prettyName()}</option>
            }).toList()
            return <fieldset key={i}>
                <select value={selIndex.toString()} {...events}>{albumOptions}</select>
                <input type="number" placeholder="Weight…" value={weight} {...events} />
            </fieldset>
        })}
    </section>
})

const ConnectedWeightsComponent = connect(
    (top: TimefillSelector) => {
        const { albums, weights } = top
        return { albums, weights }
    },
    (d: Dispatch) => bindActionCreators({
        onAddWeight: actions.addWeight,
        onChangeWeight: actions.changeWeight,
        onChangeControl: actions.changeControlTimefill,
        onKeyboardAvailable: actions.setKeyboardAvailability,
    }, d),
    (props, dispatch, ownProps) => {
        return {...props, ...dispatch, ...ownProps, keyb: keyboardEvents(dispatch)}
    },
    {
        areStatesEqual: (x, y) => x.weights === y.weights && x.albums === y.albums,
        areStatePropsEqual: (x, y) => x.weights === y.weights && x.albums === y.albums,
    },
)(WeightsComponent)

class TimefillSelectorComponent extends React.PureComponent<{
    name: string
    playlists: List<Playlist>
    selectState: PlaylistTrackSelection
    keyb: KeyboardEvents,
    onChangeName: (name: string) => void
    onLoad: typeof actions.fetchTracks.request
    onSelect: () => void
}> {
    componentDidMount() {
        this.props.onLoad()
    }

    render() {
        const classes: string[] = []
        if (this.props.selectState === 'include') {
            classes.push('set-include')
        } else if (this.props.selectState === 'exclude') {
            classes.push('set-exclude')
        }
        return <div className={classes.join(' ')}>
            <section>
                <textarea onChange={(ev) => this.props.onChangeName(ev.target.value)} value={this.props.name} {...this.props.keyb} />
            </section>
            <ConnectedTargetsComponent />
            <ConnectedWeightsComponent />
            <section>
                <button onClick={this.props.onSelect}>Select new</button>
            </section>
            <section className="playlists">
                {this.props.playlists.map((pl, e) => <ConnectedPlaylistComponent key={e} idxTop={e} />)}
            </section>
        </div>
    }
}

export const ConnectedTimefillSelectorComponent = connect(
    (top: TimefillSelector = new TimefillSelector()) => {
        const { name, targets, playlists } = top
        return {
            name, targets, playlists,
            allTargets: top.allTargets(),
            selectState: top.currentSelection(),
        }
    },
    (d: Dispatch) => bindActionCreators({
        onChangeControl: actions.changeControlTimefill,
        onKeyboardAvailable: actions.setKeyboardAvailability,
        onSetHash: actions.setHash,
        onLoad: actions.fetchTracks.request,
        onSelect: actions.runTimefill.request,
    }, d),
    (props, dispatch, ownProps) => {
        const lens: Lens<TimefillSelector, string> = new Lens(
            (o) => o.get('name', undefined),
            (v) => (o) => o.set('name', v))
        const extraProps = {
            onSelect: () => {
                dispatch.onSelect({targets: props.allTargets})
                dispatch.onSetHash()
            },
            onChangeName: (value: string) => dispatch.onChangeControl({lens, value}),
            keyb: keyboardEvents(dispatch),
        }
        return {...props, ...dispatch, ...ownProps, ...extraProps}
    },
)(TimefillSelectorComponent)

type KeyboardEvents = {onFocus: () => void, onBlur: () => void}
function keyboardEvents(dispatch: {onKeyboardAvailable: typeof actions.setKeyboardAvailability}): KeyboardEvents {
    return {
        onFocus: () => dispatch.onKeyboardAvailable({available: false}),
        onBlur: () => dispatch.onKeyboardAvailable({available: true}),
    }
}
