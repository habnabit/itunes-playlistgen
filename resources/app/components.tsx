import { StandardShorthandProperties } from 'csstype'
import { List, Map, Seq } from 'immutable'
import { Lens } from 'monocle-ts'
import * as React from 'react'
import { connect } from 'react-redux'
import { bindActionCreators, Dispatch } from 'redux'

import * as actions from './actions'
import { lensFromImplicitAccessors } from './extlens'
import { Album, AlbumKey, AlbumSelector, AlbumShuffleSelector, Track, TrackId, AlbumSelectors, isoTrackId } from './types'


const colorOrder = [
    '#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6',
    '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2',
]


class ShuffleInfoComponent extends React.Component<{
    response: any
    colorByAlbum: Map<AlbumKey, string>
}> {
    colorByAlbumIndex(): Map<number, string> {
        let seq = Seq.Indexed.of(...this.props.response.data.info.albums as string[][])
            .map(([album, artist], e) => {
                let key = new AlbumKey({album, artist})
                return [e, this.props.colorByAlbum.get(key)] as [number, string]
            })
        return Map(seq)
    }

    matGroup(): {xMax: number, yMax: number, element: JSX.Element} {
        let lineStyle = {
            stroke: 'rgba(0, 0, 0, 0.75)',
            strokeWidth: '0.05',
        }

        let circleStyle = {
            stroke: 'rgba(0, 0, 0, 0.5)',
            strokeWidth: lineStyle.strokeWidth,
        }

        let info = this.props.response.data.info
        let colors = this.colorByAlbumIndex()
        let coords: number[][] = info.coords || []
        let postPicks: number[] = info.post_picks || []
        let elementIdx = 0
        let circles: JSX.Element[] = []
        let lines: JSX.Element[] = []
        let flatCircles: {x: number, y: number, style: any}[] = []
        let xMax = 0
        coords.forEach((xs, y) => {
            let fill = colors.get(y)
            for (let x of xs) {
                let style = {}
                flatCircles.push(({x: Math.floor(x), y, style}))
                style = Object.assign({fill, opacity: 0.5}, circleStyle)
                circles.push(<circle cx={x} cy={y} r="0.25" key={elementIdx++} style={style} />)
                xMax = Math.max(xMax, x)
            }
        })
        flatCircles.sort((a, b) => a.x - b.x)
        postPicks.forEach((pick, e) => {
            flatCircles[e].style.fill = colors.get(pick)
        })
        let lastCircle: typeof flatCircles[number]
        for (let c of flatCircles) {
            let {x, y, style: localCircleStyle} = c
            localCircleStyle = Object.assign({}, circleStyle, localCircleStyle)
            circles.push(<circle cx={x} cy={y} r="0.125" key={elementIdx++} style={localCircleStyle} />)
            if (lastCircle !== undefined) {
                let {x: x1, y: y1} = lastCircle
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

        let {xMax, yMax, element} = this.matGroup()
        let viewBox = "0 0 " + (xMax + 2) + " " + (yMax + 2)
        let style = {}
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

const TrackComponent: React.SFC<{
    track: Track
    color?: string
}> = (props) => {
    let style: StandardShorthandProperties = {}
    if (props.color) {
        style.background = props.color
    }
    return <li style={style}>
        {props.track.t('pnam')}
    </li>
}

const TracksComponent: React.SFC<{
    tracks: List<Track>
    colorByAlbum?: Map<AlbumKey, string>
}> = (props) => {
    let colorByAlbum = props.colorByAlbum || Map()
    return <ul className="tracklist">
        {props.tracks.map((track, e) => <TrackComponent track={track} color={colorByAlbum.get(track.albumKey())} key={e} />)}
    </ul>
}

const AlbumSelectorComponent: React.SFC<{
    selector: AlbumSelector
    color?: string
    selectorLens: Lens<AlbumShuffleSelector, AlbumSelector>
    selectorsLens?: Lens<AlbumShuffleSelector, AlbumSelectors>
    onToggleSelected: typeof actions.toggleAlbumSelected
    onRemove: typeof actions.removeAlbum
}> = (props) => {
    let album = props.selector.album
    let classes = ['album']
    if (props.selector.fading) {
        classes.push('fading')
    }

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
            <h3 style={{background: props.color}}>{album.key.album}; {album.key.artist}</h3>
            {controls}
        </header>
        <TracksComponent tracks={album.tracks} />
    </div>
}

export const ConnectedAlbumSelectorComponent = connect(
    (top: AlbumShuffleSelector, ownProps: {
        selectorLens: Lens<AlbumShuffleSelector, AlbumSelector>
        selectorsLens?: Lens<AlbumShuffleSelector, AlbumSelectors>
    }) => {
        return {selector: ownProps.selectorLens.get(top), selectorsLens: ownProps.selectorsLens}
    },
    (d: Dispatch) => bindActionCreators({
        onToggleSelected: actions.toggleAlbumSelected,
        onRemove: actions.removeAlbum,
    }, d),
)(AlbumSelectorComponent)

class AlbumSelectorsComponent extends React.Component<{
    tracks: Map<TrackId, Track>
    selectors: AlbumSelectors
    lens: Lens<AlbumShuffleSelector, AlbumSelectors>
    allowAdd: boolean
    onAddSelection: typeof actions.addSelectionTo
    onShuffle: typeof actions.shuffleTracks.request
}> {
    colorByAlbum(): Map<AlbumKey, string> {
        return Map(this.props.selectors.selectors.toSeq().map((a, e) => [a.album.key, colorOrder[e]] as [AlbumKey, string]))
    }

    shuffled(): List<Track> {
        return this.props.selectors.shuffled
    }

    shuffle() {
        let tracks = this.props.selectors.selectors
            .flatMap(sel => sel.album.tracks)
            .toList()
        this.props.onShuffle({tracks, lens: this.props.lens})
    }

    render () {
        let colors = this.colorByAlbum()
        let shuffledDisplay = <></>
        let shuffled = this.shuffled()
        if (!shuffled.isEmpty()) {
            shuffledDisplay = <>
                <TracksComponent tracks={shuffled} colorByAlbum={colors} />
            </>
        }

        return <div className="albums-selector">
            <button onClick={() => { this.props.onAddSelection({lens: this.props.lens}) }} disabled={!this.props.allowAdd}>Add albums</button>
            {this.props.selectors.selectors.map((selector, e) => {
                let color = colors.get(selector.album.key)
                let lens1: Lens<AlbumShuffleSelector, List<AlbumSelector>> = this.props.lens.compose(new Lens(
                    o => o.get('selectors', undefined),
                    v => o => o.set('selectors', v)))
                let selectorLens: Lens<AlbumShuffleSelector, AlbumSelector> = lens1.compose(lensFromImplicitAccessors(e))
                return <ConnectedAlbumSelectorComponent key={e} selectorsLens={this.props.lens} {...{color, selectorLens}} />
            })}
            <button onClick={() => this.shuffle()}>Shuffle tracks</button>
            <ShuffleInfoComponent response={this.props.selectors.shuffleInfo} colorByAlbum={colors} />
            {shuffledDisplay}
        </div>
    }
}

export const ConnectedAlbumSelectorsComponent = connect(
    (top: AlbumShuffleSelector, ownProps: {idxTop: number}) => {
        let lens1: Lens<AlbumShuffleSelector, List<AlbumSelectors>> = new Lens(
            o => o.get('selectorses', undefined),
            v => o => o.set('selectorses', v))
        let lens2: Lens<AlbumShuffleSelector, AlbumSelectors> = lens1.compose(
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
    }, d),
)(AlbumSelectorsComponent)

const AlbumSearchComponent: React.SFC<{
    albums: Map<AlbumKey, Album>
    searchQuery: string
    searchResults: List<AlbumSelector>
    onChange: typeof actions.controlChange
    onSearch: typeof actions.updateSearch
}> = (props) => {
    return <div>
        <input type="search" placeholder="Album search..." value={props.searchQuery} onChange={ev => {
            props.onSearch({query: ev.target.value})
            props.onChange({prop: 'searchQuery', value: ev.target.value})
        }} />
        <div className="album-source">
            {props.searchResults.map((sel, e) => {
                let lens1: Lens<AlbumShuffleSelector, List<AlbumSelector>> = new Lens(
                    o => o.get('searchResults', undefined),
                    v => o => o.set('searchResults', v))
                let lens2: Lens<AlbumShuffleSelector, AlbumSelector> = lens1.compose(lensFromImplicitAccessors(e))
                return <ConnectedAlbumSelectorComponent key={e} selectorLens={lens2} />
            })}
        </div>
    </div>
}

export const ConnectedAlbumSearchComponent = connect(
    (top: AlbumShuffleSelector) => (top || new AlbumShuffleSelector()).toObject(),
    (d: Dispatch) => bindActionCreators({
        onChange: actions.controlChange,
        onSearch: actions.updateSearch,
    }, d),
)(AlbumSearchComponent)

class AlbumShuffleSelectorComponent extends React.Component<{
    selectorses: List<AlbumSelectors>
    nAlbums: string
    nChoices: string
    onChange: typeof actions.controlChange
    onNewAlbumSelector: typeof actions.newAlbumSelector
    onLoad: typeof actions.fetchTracks.request
}> {
    componentDidMount() {
        this.props.onLoad()
    }

    render() {
        return <div>
            <ConnectedAlbumSearchComponent />
            <label># albums <input type="number" placeholder="# albums" value={this.props.nAlbums} onChange={ev => { this.props.onChange({prop: 'nAlbums', value: ev.target.value}) }} /></label>
            <label># choices <input type="number" placeholder="# choices" value={this.props.nChoices} onChange={ev => { this.props.onChange({prop: 'nChoices', value: ev.target.value}) }} /></label>
            <button onClick={() => this.props.onNewAlbumSelector({})}>New selector</button>
            {this.props.selectorses.map((_sels, e) => <ConnectedAlbumSelectorsComponent key={e} idxTop={e} />)}
        </div>
    }
}

export const ConnectedAlbumShuffleSelectorComponent = connect(
    (top: AlbumShuffleSelector) => (top || new AlbumShuffleSelector()).toObject(),
    (d: Dispatch) => bindActionCreators({
        onChange: actions.controlChange,
        onNewAlbumSelector: actions.newAlbumSelector,
        onLoad: actions.fetchTracks.request,
    }, d),
)(AlbumShuffleSelectorComponent)
