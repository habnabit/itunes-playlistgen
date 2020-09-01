import { StandardProperties, SvgProperties } from 'csstype'
import { List, Map, Seq, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import * as React from 'react'
import { connect } from 'react-redux'
import { onlyUpdateForKeys, pure, shallowEqual } from 'recompose'
import { Dispatch, bindActionCreators } from 'redux'

import * as baseActions from '../actions'
import { lensFromImplicitAccessors } from '../extlens'
import { ConnectedTrackArtworkComponent } from '../meta/components'
import { Album, AlbumId, Track, TrackId } from '../types'
import * as actions from './actions'
import { AlbumSelector, AlbumSelectors, AlbumShuffleSelector } from './types'

const colorOrder = [
    '#fbb4ae',
    '#b3cde3',
    '#ccebc5',
    '#decbe4',
    '#fed9a6',
    '#ffffcc',
    '#e5d8bd',
    '#fddaec',
    '#f2f2f2',
]

class ShuffleInfoComponent extends React.PureComponent<{
    info: any
    colorByAlbum: Map<AlbumId, string>
    highlightIndex?: number
}> {
    colorByAlbumIndex(): Map<number, string> {
        const seq = Seq.Indexed.of(...this.props.info.albums).map(
            (id: AlbumId, e) => {
                return [e, this.props.colorByAlbum.get(id)] as [number, string]
            },
        )
        return Map(seq)
    }

    matGroup(): { xMax: number; yMax: number; element: JSX.Element } {
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
        const flatCircles: { x: number; y: number; style: SvgProperties }[] = []
        let xMax = 0
        coords.forEach((xs, y) => {
            const fill = colors.get(y)
            for (const x of xs) {
                let style: SvgProperties = {}
                flatCircles.push({ x: Math.floor(x), y, style })
                style = { fill, opacity: 0.5, ...circleStyle }
                circles.push(
                    <circle
                        cx={x}
                        cy={y}
                        r="0.25"
                        key={elementIdx++}
                        style={style}
                    />,
                )
                xMax = Math.max(xMax, x)
            }
        })
        flatCircles.sort((a, b) => a.x - b.x)
        postPicks.forEach((pick, e) => {
            flatCircles[e].style.fill = colors.get(pick)
        })
        let lastCircle: typeof flatCircles[number]
        flatCircles.forEach((c, idx) => {
            const { x, y } = c
            if (idx === this.props.highlightIndex) {
                circles.push(
                    <circle
                        cx={x}
                        cy={y}
                        r="0.375"
                        key="highlight"
                        style={{
                            fill: 'rgba(0, 0, 0, 0)',
                            stroke: 'rgba(0, 187, 255, 0.5)',
                            strokeWidth: '0.1',
                        }}
                    />,
                )
            }
            const localCircleStyle = { ...c.style, ...circleStyle }
            circles.push(
                <circle
                    cx={x}
                    cy={y}
                    r="0.125"
                    key={elementIdx++}
                    style={localCircleStyle}
                />,
            )
            if (lastCircle !== undefined) {
                const { x: x1, y: y1 } = lastCircle
                lines.push(
                    <line
                        x1={x1}
                        y1={y1}
                        x2={x}
                        y2={y}
                        key={elementIdx++}
                        style={lineStyle}
                    />,
                )
            }
            lastCircle = c
        })
        return {
            xMax,
            yMax: coords.length,
            element: (
                <>
                    {lines}
                    {circles}
                </>
            ),
        }
    }

    render() {
        if (!this.props.info) {
            return <></>
        }

        const { xMax, yMax, element } = this.matGroup()
        const viewBox = '0 0 ' + (xMax + 2) + ' ' + (yMax + 2)
        let style: StandardProperties = {}
        if (xMax == 0 || yMax == 0) {
            style = { display: 'none' }
        } else {
            style = { width: '100%', height: '125px' }
        }
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                version="1.1"
                viewBox={viewBox}
                preserveAspectRatio="xMinYMin meet"
                style={style}
            >
                <g transform="translate(1 1)">{element}</g>
            </svg>
        )
    }
}

const TrackComponent = onlyUpdateForKeys(['track', 'color'])(
    (props: {
        track: Track
        color?: string
        onMouseEnter?: () => void
        onMouseLeave?: () => void
    }) => {
        const style: StandardProperties = {}
        if (props.color) {
            style.background = props.color
            style.cursor = 'pointer'
        }
        return (
            <li
                style={style}
                onMouseEnter={props.onMouseEnter}
                onMouseLeave={props.onMouseLeave}
            >
                {props.track.title}
            </li>
        )
    },
)

const TracksComponent = onlyUpdateForKeys(['tracks', 'colorByAlbum'])(
    (props: {
        tracks: List<Track>
        colorByAlbum?: Map<AlbumId, string>
        onHoverTrack?: typeof actions.hoverTrack
    }) => {
        const colorByAlbum = props.colorByAlbum || Map()
        return (
            <ol className="tracklist horizontal">
                {props.tracks.map((track, e) => {
                    var onMouseEnter, onMouseLeave
                    if (props.onHoverTrack) {
                        onMouseEnter = () => props.onHoverTrack({ idx: e })
                        onMouseLeave = () =>
                            props.onHoverTrack({ idx: undefined })
                    }
                    return (
                        <TrackComponent
                            color={colorByAlbum.get(track.albumId)}
                            key={e}
                            {...{ track, onMouseEnter, onMouseLeave }}
                        />
                    )
                })}
            </ol>
        )
    },
)

const AlbumSelectorComponent = onlyUpdateForKeys([
    'selector',
    'playlists',
    'color',
])(
    (props: {
        selector: AlbumSelector
        playlists: Map<TrackId, Set<string>>
        color?: string
        selectorLens?: Lens<AlbumShuffleSelector, AlbumSelector>
        onToggleSelected: typeof actions.toggleAlbumSelected
        onRemove: typeof actions.removeAlbum
    }) => {
        const album = props.selector.album
        const classes = ['album']
        if (props.selector.fading) {
            classes.push('fading')
        }

        var artwork
        album.tracks.take(1).forEach((track) => {
            artwork = <ConnectedTrackArtworkComponent track={track} />
        })

        const allPlaylists = props.selector.album.tracks
            .flatMap((t) => props.playlists.get(t.id, []))
            .toSet()
            .sort()

        var controls
        if (props.selectorLens) {
            controls = (
                <label>
                    <input
                        type="checkbox"
                        onChange={() =>
                            props.onToggleSelected({ lens: props.selectorLens })
                        }
                        checked={props.selector.selected}
                    />
                    Add album
                </label>
            )
        } else {
            controls = (
                <button onClick={() => props.onRemove({ album: album.id })}>
                    Remove
                </button>
            )
        }

        return (
            <div className={classes.join(' ')}>
                {artwork}
                <header>
                    <h3 style={{ background: props.color }}>
                        {album.prettyName()}
                    </h3>
                    <h5 className="playlists">{allPlaylists.join('; ')}</h5>
                    {controls}
                </header>
                <TracksComponent tracks={album.tracks} />
            </div>
        )
    },
)

export const ConnectedAlbumSelectorComponent = connect(
    (
        { base: top }: { base: AlbumShuffleSelector },
        ownProps: {
            selector: AlbumSelector
            selectorLens?: Lens<AlbumShuffleSelector, AlbumSelector>
        },
    ) => {
        return {
            playlists: top.existingPlaylists,
        }
    },
    (d: Dispatch) =>
        bindActionCreators(
            {
                onToggleSelected: actions.toggleAlbumSelected,
                onRemove: actions.removeAlbum,
            },
            d,
        ),
    (props, dispatch, ownProps) => ({ ...props, ...dispatch, ...ownProps }),
    {
        areStatesEqual: (x, y) =>
            x.base.searchResults === y.base.searchResults &&
            x.base.selectors === y.base.selectors &&
            x.base.existingPlaylists === y.base.existingPlaylists,
        areOwnPropsEqual: (x, y) =>
            x.selector.album === y.selector.album &&
            x.selector.fading === y.selector.fading &&
            x.selector.selected == y.selector.selected,
        areStatePropsEqual: (x, y) => x.playlists === y.playlists,
    },
)(AlbumSelectorComponent)

class AlbumSelectorsComponent extends React.PureComponent<{
    tracks: Map<TrackId, Track>
    selectors: AlbumSelectors
    allowAdd: boolean
    onAddSelection: typeof actions.addSelection
    onShuffle: typeof actions.shuffleTracks.request
    onHoverTrack: typeof actions.hoverTrack
    onSave: typeof baseActions.savePlaylist.request
}> {
    colorByAlbum(): Map<AlbumId, string> {
        return Map(
            this.props.selectors.selectors
                .toSeq()
                .map(
                    (a, e) => [a.album.id, colorOrder[e]] as [AlbumId, string],
                ),
        )
    }

    shuffled(): List<Track> {
        return this.props.selectors.shuffled
    }

    shuffle() {
        const tracks = this.props.selectors.selectors
            .flatMap((sel) => sel.album.tracks)
            .toList()
        this.props.onShuffle({ tracks })
    }

    save() {
        const albumNames = this.props.selectors.selectors
            .map((sel) => sel.album.id)
            .sort()
        const name = '\u203b Album Shuffle\n' + albumNames.join(' \u2715 ')
        this.props.onSave({ name, tracks: this.props.selectors.shuffled })
    }

    render() {
        const colors = this.colorByAlbum()
        let shuffledDisplay = <></>
        const shuffled = this.shuffled()
        if (!shuffled.isEmpty()) {
            shuffledDisplay = (
                <>
                    <TracksComponent
                        tracks={shuffled}
                        colorByAlbum={colors}
                        onHoverTrack={this.props.onHoverTrack}
                    />
                    <button key="save" onClick={() => this.save()}>
                        Save
                    </button>
                </>
            )
        }

        return (
            <div className="albums-selector">
                <button
                    onClick={() => {
                        this.props.onAddSelection()
                    }}
                    disabled={!this.props.allowAdd}
                >
                    Add albums
                </button>
                {this.props.selectors.selectors.map((selector, e) => {
                    const color = colors.get(selector.album.id)
                    return (
                        <ConnectedAlbumSelectorComponent
                            key={e}
                            {...{ selector, color }}
                        />
                    )
                })}
                <button onClick={() => this.shuffle()}>Shuffle tracks</button>
                <ShuffleInfoComponent
                    info={this.props.selectors.shuffleInfo}
                    colorByAlbum={colors}
                    highlightIndex={this.props.selectors.hovered}
                />
                {shuffledDisplay}
            </div>
        )
    }
}

export const ConnectedAlbumSelectorsComponent = connect(
    ({ base: top }: { base: AlbumShuffleSelector }) => {
        const { tracks, selectors } = top
        return {
            tracks,
            selectors,
            allowAdd: top.hasSelection(),
        }
    },
    (d: Dispatch) =>
        bindActionCreators(
            {
                onAddSelection: actions.addSelection,
                onShuffle: actions.shuffleTracks.request,
                onHoverTrack: actions.hoverTrack,
                onSave: baseActions.savePlaylist.request,
            },
            d,
        ),
    (props, dispatch, ownProps) => ({ ...props, ...dispatch, ...ownProps }),
    {
        areOwnPropsEqual: (x, y) => {
            return shallowEqual(x, y)
        },
        areStatesEqual: (x, y) => {
            return x === y
        },
        areStatePropsEqual: (x, y) => {
            return (
                x.tracks === y.tracks &&
                x.selectors === y.selectors &&
                x.allowAdd === y.allowAdd
            )
        },
        areMergedPropsEqual: (x, y) => {
            return (
                x.tracks === y.tracks &&
                x.selectors === y.selectors &&
                x.allowAdd === y.allowAdd
            )
        },
    },
)(AlbumSelectorsComponent)

const AlbumSearchComponent = onlyUpdateForKeys([
    'albums',
    'searchQuery',
    'searchResults',
])(
    (props: {
        albums: Map<AlbumId, Album>
        searchQuery: string
        searchResults: List<AlbumSelector>
        onChange: typeof actions.changeControl
    }) => {
        return (
            <div>
                <input
                    type="search"
                    placeholder="Album search..."
                    value={props.searchQuery}
                    onChange={(ev) => {
                        props.onChange({
                            prop: 'searchQuery',
                            value: ev.target.value,
                        })
                    }}
                />
                <div className="album-source">
                    {props.searchResults.map((sel, e) => {
                        const lens1: Lens<
                            AlbumShuffleSelector,
                            List<AlbumSelector>
                        > = new Lens(
                            (o) => o.get('searchResults', undefined),
                            (v) => (o) => o.set('searchResults', v),
                        )
                        const lens2: Lens<
                            AlbumShuffleSelector,
                            AlbumSelector
                        > = lens1.compose(lensFromImplicitAccessors(e))
                        return (
                            <ConnectedAlbumSelectorComponent
                                key={e}
                                selector={sel}
                                selectorLens={lens2}
                            />
                        )
                    })}
                </div>
            </div>
        )
    },
)

export const ConnectedAlbumSearchComponent = connect(
    ({ base: top }: { base: AlbumShuffleSelector }) => {
        const { albums, searchQuery, searchResults } = top
        return { albums, searchQuery, searchResults }
    },
    (d: Dispatch) =>
        bindActionCreators(
            {
                onChange: actions.changeControl,
            },
            d,
        ),
    undefined,
    {
        areStatesEqual: (x, y) => {
            return (
                x.base.albums === y.base.albums &&
                x.base.searchQuery === y.base.searchQuery &&
                x.base.searchResults === y.base.searchResults
            )
        },
        areStatePropsEqual: (x, y) => {
            return (
                x.albums === y.albums &&
                x.searchQuery === y.searchQuery &&
                x.searchResults === y.searchResults
            )
        },
    },
)(AlbumSearchComponent)

const AlbumShuffleSelectorComponent = onlyUpdateForKeys(['selectors'])(
    (props: { selectors: AlbumSelectors }) => {
        return (
            <div>
                <ConnectedAlbumSearchComponent />
                <ConnectedAlbumSelectorsComponent />
            </div>
        )
    },
)

export const ConnectedAlbumShuffleSelectorComponent = connect(
    ({ base: top }: { base: AlbumShuffleSelector }) => {
        const { selectors } = top
        return { selectors }
    },
    (d: Dispatch) => bindActionCreators({}, d),
)(AlbumShuffleSelectorComponent)
