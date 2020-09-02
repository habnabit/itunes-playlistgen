import { List, Map, Seq } from 'immutable'
import { Lens } from 'monocle-ts'
import * as React from 'react'
import { connect } from 'react-redux'
import PulseLoader from 'react-spinners/PulseLoader'
import { onlyUpdateForKeys, pure } from 'recompose'
import { Dispatch, bindActionCreators } from 'redux'

import * as baseActions from '../actions'
import { lensFromImplicitAccessors } from '../extlens'
import { ConnectedTrackArtworkComponent } from '../meta/components'
import {
    KeyboardEvents,
    Track,
    TrackId,
    keyboardEvents,
    AlbumId,
    isoAlbumId,
} from '../types'
import * as actions from './actions'
import { DiscogsSelector, UnconfirmedAlbum, DiscogsMaster } from './types'

const DiscogsMaster = pure((props: { master: DiscogsMaster }) => {
    const m = props.master
    if (!m) {
        return <></>
    }
    var img
    if (m.images && m.images.length > 0) {
        img = <img src={m.images[0].uri150} />
    }
    return (
        <>
            {img}
            <h3>
                <a href={m.uri}>
                    {m.artists.map((a) => a.name).join(' & ')} – {m.title}
                </a>
            </h3>
            <ol>
                {Seq(m.tracklist).map((t, e) => (
                    <li key={e}>{t.title}</li>
                ))}
            </ol>
        </>
    )
})

const UnconfirmedAlbumComponent = pure(
    (props: { album: UnconfirmedAlbum; count: number }) => {
        const alb = props.album
        const rbuttons: JSX.Element[] = []
        function addRButton(label: string) {
            rbuttons.push(
                <div>
                    <label>
                        <input
                            type="radio"
                            key={rbuttons.length}
                            name={isoAlbumId.unwrap(alb.albumId)}
                        />
                        {label}
                    </label>
                </div>,
            )
        }
        var comparison: JSX.Element
        if (alb.discogsData) {
            var zipped = alb.tracks
                .zipWith(
                    (a, b) => [a.title, b.title],
                    List(alb.discogsData.tracklist),
                )
                .flatMap(([a, b], e): [number, string, string][] =>
                    a !== b ? [[e, a, b]] : [],
                )
                .map(([e, a, b]) => (
                    <li value={e + 1}>
                        <span>{a}</span> vs. <span>{b}</span>
                    </li>
                ))
            comparison = zipped.isEmpty() ? (
                <>Same tracks</>
            ) : (
                <>
                    Some differences:
                    <ol>{zipped}</ol>
                </>
            )
            addRButton('Mark this discogs result as found')
        }
        addRButton('Mark this album as missing')
        addRButton('Try this album again later')
        var discard: JSX.Element
        if (props.count > 1) {
            discard = (
                <div>
                    <label>
                        <input type="checkbox" />
                        ... and discard the other {props.count - 1}
                    </label>
                </div>
            )
        }
        return (
            <div className="comparison">
                <div className="img-right">
                    <ConnectedTrackArtworkComponent
                        track={alb.tracks.first()}
                    />
                    <h3>
                        {alb.artist} – {alb.title}
                    </h3>
                    <ol>
                        {alb.tracks.map((t, e) => (
                            <li key={e} value={t.trackNumber}>
                                {t.title}
                            </li>
                        ))}
                    </ol>
                </div>
                <div className="img-left">
                    <DiscogsMaster master={alb.discogsData} />
                </div>
                <div>{comparison}</div>
                <div className="discogs-controls">
                    {rbuttons} {discard}
                    <div>
                        <button>Modify</button>
                    </div>
                </div>
            </div>
        )
    },
)

const DiscogsMatcherComponent = onlyUpdateForKeys(['unconfirmedAlbums'])(
    (props: {
        unconfirmedAlbums: List<UnconfirmedAlbum>
        albumCounts: Map<AlbumId, number>
    }) => {
        return (
            <div>
                {props.unconfirmedAlbums.map((album, e) => (
                    <UnconfirmedAlbumComponent
                        album={album}
                        count={props.albumCounts.get(album.albumId, 0)}
                        key={e}
                    />
                ))}
            </div>
        )
    },
)

export const ConnectedDiscogsMatcherSelectorComponent = connect(
    ({ base: top }: { base: DiscogsSelector }) => {
        const { unconfirmedAlbums, albumCounts } = top
        return { unconfirmedAlbums, albumCounts }
    },
    (d: Dispatch) => bindActionCreators({}, d),
    (props, dispatch, ownProps) => {
        return { ...props, ...dispatch, ...ownProps }
    },
)(DiscogsMatcherComponent)
