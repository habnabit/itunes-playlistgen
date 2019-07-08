import { StandardProperties, SvgProperties } from 'csstype'
import { List, Map, OrderedMap, Seq, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import * as React from 'react'
import { connect } from 'react-redux'
import { onlyUpdateForKeys, pure, shallowEqual } from 'recompose'
import { bindActionCreators, Dispatch } from 'redux'

import * as baseActions from '../actions'
import { lensFromImplicitAccessors } from '../extlens'
import { Album, AlbumKey, Track, TrackId } from '../types'
import * as actions from './actions'
import { AlbumSelector, AlbumSelectors, AlbumShuffleSelector } from './types'


const colorOrder = [
    '#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6',
    '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2',
]


class ShuffleInfoComponent extends React.PureComponent<{
    info: any
    colorByAlbum: Map<AlbumKey, string>
}> {
    colorByAlbumIndex(): Map<number, string> {
        const seq = Seq.Indexed.of(...this.props.info.albums as string[][])
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

        const info = this.props.info
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
        if (!this.props.info) {
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
    ({base: top}: {base: AlbumShuffleSelector}, ownProps: {
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
        areStatesEqual: (x, y) => x.base.searchResults === y.base.searchResults && x.base.selectorses === y.base.selectorses && x.base.existingPlaylists === y.base.existingPlaylists,
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
    onSave: typeof baseActions.savePlaylist.request
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
            <ShuffleInfoComponent info={this.props.selectors.shuffleInfo} colorByAlbum={colors} />
            {shuffledDisplay}
        </div>
    }
}

export const ConnectedAlbumSelectorsComponent = connect(
    ({base: top}: {base: AlbumShuffleSelector}, ownProps: {idxTop: number}) => {
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
        onSave: baseActions.savePlaylist.request,
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
}) => {
    return <div>
        <input type="search" placeholder="Album search..." value={props.searchQuery} onChange={(ev) => {
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
    ({base: top}: {base: AlbumShuffleSelector}) => {
        const { albums, searchQuery, searchResults } = top
        return { albums, searchQuery, searchResults }
    },
    (d: Dispatch) => bindActionCreators({
        onChange: actions.changeControl,
    }, d),
    undefined,
    {
        areStatesEqual: (x, y) => {
            return x.base.albums === y.base.albums && x.base.searchQuery === y.base.searchQuery && x.base.searchResults === y.base.searchResults
        },
        areStatePropsEqual: (x, y) => {
            return x.albums === y.albums && x.searchQuery === y.searchQuery && x.searchResults === y.searchResults
        },
    },
)(AlbumSearchComponent)

const AlbumShuffleSelectorComponent = onlyUpdateForKeys(
    ['selectorses', 'nAlbums', 'nChoices']
)((props: {
    selectorses: List<AlbumSelectors>
    nAlbums: string
    nChoices: string
    onChange: typeof actions.changeControl
    onNewAlbumSelector: typeof actions.newAlbumSelector
}) => {
    return <div>
        <ConnectedAlbumSearchComponent />
        <label># albums <input type="number" placeholder="# albums" value={props.nAlbums} onChange={(ev) => { props.onChange({prop: 'nAlbums', value: ev.target.value}) }} /></label>
        <label># choices <input type="number" placeholder="# choices" value={props.nChoices} onChange={(ev) => { props.onChange({prop: 'nChoices', value: ev.target.value}) }} /></label>
        <button onClick={() => props.onNewAlbumSelector({})}>New selector</button>
        {props.selectorses.map((_sels, e) => <ConnectedAlbumSelectorsComponent key={e} idxTop={e} />)}
    </div>
})

export const ConnectedAlbumShuffleSelectorComponent = connect(
    ({base: top}: {base: AlbumShuffleSelector}) => {
        const { selectorses, nAlbums, nChoices } = top
        return { selectorses, nAlbums, nChoices }
    },
    (d: Dispatch) => bindActionCreators({
        onChange: actions.changeControl,
        onNewAlbumSelector: actions.newAlbumSelector,
    }, d),
)(AlbumShuffleSelectorComponent)
