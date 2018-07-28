import {Map, List, Record, Seq} from 'immutable'
import {Newtype, iso} from 'newtype-ts'
import * as React from 'react'
import * as qs from 'qs'

import {lensFromImplicitAccessors, lensFromListIndex, lensFromNullableImplicitAccessorsAndConstructor, ComponentLens} from './extlens'
import {Lens, Iso, Optional} from 'monocle-ts';
import {StandardShorthandProperties} from 'csstype';
import { TrackId, AlbumKey, Album, Track } from './types'
import {} from './redux'

import { Dispatch, bindActionCreators, createStore } from 'redux';
import { connect } from 'react-redux'
import { ActionType, getType } from 'typesafe-actions'

import * as actions from './actions'
import { AlbumShuffleSelector, AlbumSelector } from './types'


const colorOrder = ["#fbb4ae","#b3cde3","#ccebc5","#decbe4","#fed9a6","#ffffcc","#e5d8bd","#fddaec","#f2f2f2"]

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
    path?: [number, number]
    onToggle: typeof actions.toggleAlbumSelected
    onRemove: typeof actions.removeAlbum
}> = (props) => {
    let album = props.selector.album
    let classes = ['album']
    if (props.selector.fading) {
        classes.push('fading')
    }
    let controls = <></>

    if (props.path) {
        let path = props.path
        controls = <>
            <button onClick={() => props.onRemove({path})}>Remove</button>
            <label><input type="checkbox" name="replacement-source" onChange={() => props.onToggle({path})} checked={props.selector.selected} /> Replacement source</label>
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
    (top: AlbumShuffleSelector, ownProps: {path?: [number, number], albumKey?: AlbumKey}) => {
        if (ownProps.path) {
            return {
                path: ownProps.path,
                selector: top.selectorses.getIn(ownProps.path),
            }
        } else if (ownProps.albumKey) {
            return {
                selector: new AlbumSelector({album: top.albums.get(ownProps.albumKey)})
            }
        }
    },
    (d: Dispatch) => bindActionCreators({
        onToggle: actions.toggleAlbumSelected,
        onRemove: actions.removeAlbum,
    }, d),
)(AlbumSelectorComponent)

class AlbumSelectorsComponent extends React.Component<{
    idxTop: number
    tracks: Map<TrackId, Track>
    selectors: List<AlbumSelector>
}, {
    shuffled: List<TrackId>
}> {
    constructor(props: any) {
        super(props)
        this.state = {
            shuffled: List(),
        }
    }

    colorsByAlbum(): Map<AlbumKey, string> {
        return Map(this.props.selectors.toSeq().map((a, e) => [a.album.key, colorOrder[e]] as [AlbumKey, string]))
    }

    shuffled(): List<Track> {
        return this.state.shuffled.map(this.props.tracks.get)
    }

    render () {
        let colors = this.colorsByAlbum()
        let shuffledDisplay = <></>
        let shuffled = this.shuffled()
        if (!shuffled.isEmpty()) {
            shuffledDisplay = <>
                <TracksComponent tracks={shuffled} colorByAlbum={colors} />
            </>
        }

        return <div className="albums-selector">
            <button onClick={() => {}} disabled={true}>Add albums</button>
            {this.props.selectors.map((selector, e) => {
                let color = colors.get(selector.album.key)
                let path: [number, number] = [this.props.idxTop, e]
                return <ConnectedAlbumSelectorComponent key={e} {...{color, path}} />
            })}
            {shuffledDisplay}
        </div>
    }
}

export const ConnectedAlbumSelectorsComponent = connect(
    (top: AlbumShuffleSelector, ownProps: {idxTop: number}) => {
        return {
            tracks: top.tracks,
            selectors: top.selectorses.get(ownProps.idxTop),
        }
    },
    (d: Dispatch) => bindActionCreators({
        onChange: actions.controlChange,
    }, d),
)(AlbumSelectorsComponent)

const AlbumSearchComponent: React.SFC<{
    albums: Map<AlbumKey, Album>
    albumSearch: string
    onChange: typeof actions.controlChange
}> = (props) => {
    let needle = props.albumSearch.toLowerCase();
    let albums = Seq();
    if (needle.length >= 2) {
        albums = props.albums
            .valueSeq()
            .filter(album => album.nameLower.includes(needle))
            .map((album, e) => {
                return <ConnectedAlbumSelectorComponent key={e} albumKey={album.key} />
            })
    }
    return <div>
        <input type="search" placeholder="Album search..." value={props.albumSearch} onChange={ev => { props.onChange({prop: 'albumSearch', value: ev.target.value}) }} />
        <div className="album-source">{albums}</div>
    </div>
}

export const ConnectedAlbumSearchComponent = connect(
    (top: AlbumShuffleSelector) => (top || new AlbumShuffleSelector()).toObject(),
    (d: Dispatch) => bindActionCreators({
        onChange: actions.controlChange,
    }, d),
)(AlbumSearchComponent)

class AlbumShuffleSelectorComponent extends React.Component<{
    selectorses: List<List<AlbumSelector>>
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
