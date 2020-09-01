import { List, Map } from 'immutable'
import { Lens } from 'monocle-ts'
import * as React from 'react'
import { connect } from 'react-redux'
import PulseLoader from 'react-spinners/PulseLoader'
import { onlyUpdateForKeys, pure } from 'recompose'
import { Dispatch, bindActionCreators } from 'redux'

import * as baseActions from '../actions'
import { lensFromImplicitAccessors } from '../extlens'
import { ConnectedTrackArtworkComponent } from '../meta/components'
import { KeyboardEvents, Track, TrackId, keyboardEvents } from '../types'
import * as actions from './actions'
import { DiscogsSelector, UnconfirmedAlbum } from './types'

const UnconfirmedAlbumComponent = pure((props: { album: UnconfirmedAlbum }) => {
    const alb = props.album
    const track = new Track(alb.tracks[0])
    const discogsThumb = alb.discogs_data ? (
        <img src={alb.discogs_data.thumb} />
    ) : (
        <></>
    )
    return (
        <div>
            <ConnectedTrackArtworkComponent track={track} />
            {discogsThumb}
            {alb.title}
        </div>
    )
})

const DiscogsMatcherComponent = onlyUpdateForKeys(['unconfirmedAlbums'])(
    (props: { unconfirmedAlbums: List<UnconfirmedAlbum> }) => {
        return (
            <div>
                {props.unconfirmedAlbums.map((album, e) => (
                    <UnconfirmedAlbumComponent album={album} key={e} />
                ))}
            </div>
        )
    },
)

export const ConnectedDiscogsMatcherSelectorComponent = connect(
    ({ base: top }: { base: DiscogsSelector }) => {
        const { unconfirmedAlbums } = top
        return { unconfirmedAlbums }
    },
    (d: Dispatch) => bindActionCreators({}, d),
    (props, dispatch, ownProps) => {
        return { ...props, ...dispatch, ...ownProps }
    },
)(DiscogsMatcherComponent)
