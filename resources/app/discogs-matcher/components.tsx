import { List, Map, Seq, Record } from 'immutable'
import { Lens } from 'monocle-ts'
import * as React from 'react'
import { connect } from 'react-redux'
import PulseLoader from 'react-spinners/PulseLoader'
import { onlyUpdateForKeys, pure } from 'recompose'
import { Dispatch, bindActionCreators } from 'redux'
import * as diff from 'fast-diff'

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
import * as Option from 'fp-ts/lib/Option'

const diffedClasses: Map<-1 | 0 | 1, string> = Map([
    [-1, 'type-a struck'],
    [0, ''],
    [1, 'type-b'],
])

type condensedDiff = {
    className: string
    d: diff.Diff
}

const StringDiff = pure((props: { a: string; b: string }) => {
    const diffed = diff(props.a, props.b)
    const diffedCondensed = List(diffed).reduce((ret, d2) => {
        const d1: condensedDiff = ret.last()
        if (
            d1 !== undefined &&
            d1.d[0] === -d2[0] &&
            d1.d[1].toLowerCase() === d2[1].toLowerCase()
        ) {
            return ret.pop().push({
                className: 'casefolded',
                d: d2,
            })
        }
        return ret.push({
            className: diffedClasses.get(d2[0]),
            d: d2,
        })
    }, List<condensedDiff>())
    return (
        <>
            <span className="type-a">{props.a}</span> vs.{' '}
            <span className="type-b">{props.b}</span>
            <br />
            {diffedCondensed.map(({ className, d }, e) => (
                <span className={className} key={e}>
                    {d[1]}
                </span>
            ))}
        </>
    )
})

const DiscogsMaster = pure(
    (props: { master: DiscogsMaster; count: AlbumCount }) => {
        const m = props.master
        if (!m) {
            return <></>
        }
        var img
        if (m.images && m.images.length > 0) {
            img = <img src={m.images[0].uri150} />
        }
        var count
        if (props.count.total > 1) {
            count = (
                <>
                    &nbsp;({props.count.n}/{props.count.total})
                </>
            )
        }
        return (
            <>
                {img}
                <h3>
                    <a href={m.uri}>
                        {m.artists.map((a) => a.name).join(' & ')} – {m.title}
                    </a>
                    {count}
                </h3>
                <ol>
                    {filterTracks(m.tracklist).map((t, e) => (
                        <li key={e}>{t.title}</li>
                    ))}
                </ol>
            </>
        )
    },
)

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
        count: AlbumCount
        lens: Lens<DiscogsSelector, AlbumReselector>
        onConfirm: typeof actions.confirm.request
    }) => {
        const alb = props.album
        const discogsData: DiscogsMaster =
            props.reselector.json || alb.discogsData
        const shouldReplace = props.reselector.json !== undefined
        const rbuttons: JSX.Element[] = []
        function addRButton(
            value: string,
            label: string | JSX.Element,
            opts: { replace?: boolean } = {},
        ) {
            const attrs: React.InputHTMLAttributes<HTMLInputElement> = { value }
            if (opts.replace) {
                attrs.disabled = !shouldReplace
                attrs.checked = shouldReplace
            } else {
                attrs.disabled = shouldReplace
            }
            rbuttons.push(
                <div key={rbuttons.length}>
                    <label>
                        <input
                            type="radio"
                            name={isoAlbumId.unwrap(alb.albumId)}
                            {...attrs}
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
                            <StringDiff a={a.title} b={b.title} />
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
            { replace: true },
        )

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
            props.onConfirm({ data })
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
                        <DiscogsMaster
                            master={discogsData}
                            count={props.count}
                        />
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
                        {rbuttons}
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

class AlbumCount extends Record({ id: undefined as AlbumId, n: 0, total: 0 }) {}

const DiscogsMatcherComponent = onlyUpdateForKeys(['unconfirmedAlbums'])(
    (props: {
        unconfirmedAlbums: List<UnconfirmedAlbum>
        albumCounts: Map<AlbumId, number>
    }) => {
        var ctx = new AlbumCount()
        return (
            <div>
                {props.unconfirmedAlbums.map((album) => {
                    if (ctx.id === album.albumId) {
                        ctx = ctx.update('n', (n) => n + 1)
                    } else {
                        ctx = new AlbumCount({
                            id: album.albumId,
                            n: 1,
                            total: props.albumCounts.get(album.albumId, 0),
                        })
                    }
                    return (
                        <ConnectedUnconfirmedAlbumComponent
                            album={album}
                            count={ctx}
                            key={album.albumDiscogsId}
                        />
                    )
                })}
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
