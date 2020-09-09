import { List, Map, Seq } from 'immutable'
import { Lens } from 'monocle-ts'
import * as React from 'react'
import { connect } from 'react-redux'
import PulseLoader from 'react-spinners/PulseLoader'
import { onlyUpdateForKeys, pure } from 'recompose'
import { Dispatch, bindActionCreators } from 'redux'

import * as baseActions from '../actions'
import {
    lensFromImplicitAccessors,
    lensFromRecordProp,
    lensFromNullableImplicitAccessorsAndConstructor,
} from '../extlens'
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
import {
    DiscogsSelector,
    UnconfirmedAlbum,
    DiscogsMaster,
    AlbumReselector,
    DiscogsTrack,
    filterTracks,
} from './types'

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
                {filterTracks(m.tracklist).map((t, e) => (
                    <li key={e}>{t.title}</li>
                ))}
            </ol>
        </>
    )
})

const DiscogsReselector = pure(
    ({
        id,
        url,
        lens,
        onChangeUrl,
    }: {
        id: number
        url: string
        lens: Lens<DiscogsSelector, AlbumReselector>
        onChangeUrl: typeof actions.changeUrl
    }) => {
        return (
            <input
                type="text"
                placeholder="Discogs URL…"
                value={url}
                onChange={(ev) => {
                    onChangeUrl({
                        id,
                        lens,
                        value: ev.target.value,
                    })
                }}
            />
        )
    },
)

const ConnectedDiscogsReselector = connect(
    (
        { base: top }: { base: DiscogsSelector },
        { lens }: { lens: Lens<DiscogsSelector, AlbumReselector> },
    ) => {
        return {
            url: lens.get(top).url,
            lens,
        }
    },
    (d: Dispatch) =>
        bindActionCreators(
            {
                onChangeUrl: actions.changeUrl,
            },
            d,
        ),
)(DiscogsReselector)

const UnconfirmedAlbumComponent = pure(
    (props: {
        album: UnconfirmedAlbum
        reselector: AlbumReselector
        count: number
        lens: Lens<DiscogsSelector, AlbumReselector>
        onConfirm: typeof actions.confirm.request
    }) => {
        const alb = props.album
        const discogsData: DiscogsMaster =
            props.reselector.json || alb.discogsData
        const rbuttons: JSX.Element[] = []
        function addRButton(value: string, label: string | JSX.Element) {
            rbuttons.push(
                <div key={rbuttons.length}>
                    <label>
                        <input
                            type="radio"
                            name={isoAlbumId.unwrap(alb.albumId)}
                            value={value}
                        />
                        {label}
                    </label>
                </div>,
            )
        }
        var comparison: JSX.Element
        if (discogsData) {
            const bTracks = filterTracks(discogsData.tracklist).toList()
            const nATracks = alb.tracks.size
            const nBTracks = bTracks.size
            var zipped = alb.tracks
                .zip(bTracks)
                .flatMap(([a, b], e): [number, Track, DiscogsTrack][] =>
                    a.title !== b.title ? [[e, a, b]] : [],
                )
                .map(([e, a, b]) => (
                    <li value={e + 1} key={e}>
                        <label>
                            <input
                                type="checkbox"
                                name={`rename/${a.id}`}
                                value={b.title}
                            />
                            <span>{a.title}</span> vs. <span>{b.title}</span>
                        </label>
                    </li>
                ))
            if (nATracks !== nBTracks) {
                zipped = zipped.unshift(
                    <li value="0" key="length">
                        {nATracks} tracks vs. {nBTracks} tracks
                    </li>,
                )
            }
            comparison = zipped.isEmpty() ? (
                <>Same tracks</>
            ) : (
                <>
                    Some differences:
                    <ol>{zipped}</ol>
                </>
            )
            addRButton('found', 'Mark this discogs result as found')
        }
        addRButton('missing', 'Mark this album as missing')
        addRButton('later', 'Try this album again later')
        addRButton(
            'replace',
            <>
                Instead, use…
                <ConnectedDiscogsReselector
                    id={alb.albumDiscogsId}
                    lens={props.lens}
                />
            </>,
        )
        var discard: JSX.Element
        if (props.count > 1) {
            discard = (
                <div>
                    <label>
                        <input
                            type="checkbox"
                            name="delete_others"
                            value="yes"
                        />
                        ... and discard the other {props.count - 1}
                    </label>
                </div>
            )
        }

        function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
            ev.preventDefault()
            const data: any = { rename: [] }
            for (const [k, v] of new FormData(
                ev.target as HTMLFormElement,
            ).entries()) {
                const splut = k.split('/')
                switch (splut[0]) {
                    case 'rename':
                        data.rename.push([splut[1], v])
                        break
                    case isoAlbumId.unwrap(alb.albumId):
                        data['op'] = v
                        if (v === 'replace') {
                            data['replace_with'] = discogsData
                        }
                        break
                    default:
                        data[k] = v
                        break
                }
            }
            props.onConfirm({ album: alb.albumId, data })
        }

        return (
            <form onSubmit={onSubmit}>
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
                        <DiscogsMaster master={discogsData} />
                    </div>
                    <div className="discogs-controls">{comparison}</div>
                    <div className="discogs-controls">
                        <input
                            type="hidden"
                            name="db_id"
                            value={alb.albumDiscogsId}
                        />
                        <input
                            type="hidden"
                            name="album_pid"
                            value={isoAlbumId.unwrap(alb.albumId)}
                        />
                        {rbuttons} {discard}
                        <div>
                            <button>Modify</button>
                        </div>
                    </div>
                </div>
            </form>
        )
    },
)

const ConnectedUnconfirmedAlbumComponent = connect(
    (
        { base: top }: { base: DiscogsSelector },
        { album }: { album: UnconfirmedAlbum },
    ) => {
        const lens1: Lens<
            DiscogsSelector,
            Map<number, AlbumReselector>
        > = lensFromImplicitAccessors('albumReselection')
        const lens2: Lens<DiscogsSelector, AlbumReselector> = lens1.compose(
            lensFromNullableImplicitAccessorsAndConstructor(
                album.albumDiscogsId,
                () => new AlbumReselector(),
            ),
        )
        return {
            lens: lens2,
            reselector: lens2.get(top),
        }
    },
    (d: Dispatch) =>
        bindActionCreators(
            {
                onConfirm: actions.confirm.request,
            },
            d,
        ),
)(UnconfirmedAlbumComponent)

const DiscogsMatcherComponent = onlyUpdateForKeys(['unconfirmedAlbums'])(
    (props: {
        unconfirmedAlbums: List<UnconfirmedAlbum>
        albumCounts: Map<AlbumId, number>
    }) => {
        return (
            <div>
                {props.unconfirmedAlbums.map((album) => (
                    <ConnectedUnconfirmedAlbumComponent
                        album={album}
                        count={props.albumCounts.get(album.albumId, 0)}
                        key={album.albumDiscogsId}
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
