import {Map, List, Record, Seq} from 'immutable'
import {Newtype, iso} from 'newtype-ts'
import * as React from 'react'
import * as qs from 'qs'

import {lensFromImplicitAccessors, lensFromListIndex, lensFromNullableImplicitAccessorsAndConstructor, ComponentLens, lensFromRecordProp} from './extlens'
import {Lens, Iso, Optional, lensFromPath} from 'monocle-ts';
import {StandardShorthandProperties} from 'csstype';
import { TrackId, AlbumKey, Album, Track } from './types'
import {} from './redux'

import { Dispatch, bindActionCreators, createStore } from 'redux';
import { connect } from 'react-redux'
import { ActionType, getType } from 'typesafe-actions'

import * as actions from './actions'
import { AlbumShuffleSelector, AlbumSelector } from './types'
import { access } from 'fs';


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
    selectorLens: Lens<AlbumShuffleSelector, AlbumSelector>
    selectorsLens?: Lens<AlbumShuffleSelector, List<AlbumSelector>>
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
    (top: AlbumShuffleSelector, ownProps: {selectorLens: Lens<AlbumShuffleSelector, AlbumSelector>}) => {
        return {selector: ownProps.selectorLens.get(top)}
    },
    (d: Dispatch) => bindActionCreators({
        onToggleSelected: actions.toggleAlbumSelected,
        onRemove: actions.removeAlbum,
    }, d),
)(AlbumSelectorComponent)

class AlbumSelectorsComponent extends React.Component<{
    tracks: Map<TrackId, Track>
    selectors: List<AlbumSelector>
    lens: Lens<AlbumShuffleSelector, List<AlbumSelector>>
    allowAdd: boolean
    onAddSelection: typeof actions.addSelectionTo
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
            <button onClick={() => { this.props.onAddSelection({lens: this.props.lens}) }} disabled={!this.props.allowAdd}>Add albums</button>
            {this.props.selectors.map((selector, e) => {
                let color = colors.get(selector.album.key)
                let selectorLens: Lens<AlbumShuffleSelector, AlbumSelector> = this.props.lens.compose(
                    lensFromImplicitAccessors(e))
                return <ConnectedAlbumSelectorComponent key={e} selectorLens={this.props.lens} {...{color, selectorLens}} />
            })}
            {shuffledDisplay}
        </div>
    }
}

export const ConnectedAlbumSelectorsComponent = connect(
    (top: AlbumShuffleSelector, ownProps: {idxTop: number}) => {
        let lens1: Lens<AlbumShuffleSelector, List<List<AlbumSelector>>> = new Lens(
            o => o.get('selectorses', undefined),
            v => o => o.set('selectorses', v))
        let lens2: Lens<AlbumShuffleSelector, List<AlbumSelector>> = lens1.compose(
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
