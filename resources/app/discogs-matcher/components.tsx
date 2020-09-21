import { List, Map, Seq, Record, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import * as React from 'react'
import { connect } from 'react-redux'
import PulseLoader from 'react-spinners/PulseLoader'
import { onlyUpdateForKeys, pure } from 'recompose'
import { Dispatch, bindActionCreators } from 'redux'
import * as diff from 'fast-diff'
import { findBestMatch } from 'string-similarity'

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
    DiscogsUnconfirmedSelector,
    UnconfirmedAlbum,
    DiscogsMaster,
    AlbumReselector,
    DiscogsTrack,
    filterTracks,
    DiscogsMatchedSelector,
    MatchedMap,
    YearMap,
    MatchedAlbum,
    Artist,
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

const StringDiff = pure((props: { a: string; b: string; rating: number }) => {
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
            {(props.rating * 100).toFixed(1)}%
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
        lens: Lens<DiscogsUnconfirmedSelector, AlbumReselector>
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
        { base: top }: { base: DiscogsUnconfirmedSelector },
        { lens }: { lens: Lens<DiscogsUnconfirmedSelector, AlbumReselector> },
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
        lens: Lens<DiscogsUnconfirmedSelector, AlbumReselector>
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
            const bStrings = bTracks
                .toSeq()
                .map((b) => b.title)
                .toArray()
            var zipped = alb.tracks
                .toSeq()
                .map((a) => {
                    const matches = findBestMatch(a.title, bStrings)
                    const b = bTracks.get(matches.bestMatchIndex)
                    const { rating } = matches.bestMatch
                    return { a, b, rating }
                })
                .flatMap((r) => {
                    const aTitle = `[${r.a.trackNumber}] ${r.a.title}`
                    const bTitle = `[${r.b.position}] ${r.b.title}`
                    return aTitle !== bTitle ? [{ aTitle, bTitle, ...r }] : []
                })
                .map(({ a, b, aTitle, bTitle, rating }, e) => (
                    <li key={e}>
                        <label>
                            <input
                                type="checkbox"
                                name={`rename/${a.id}`}
                                value={b.title}
                            />
                            <StringDiff a={aTitle} b={bTitle} rating={rating} />
                        </label>
                    </li>
                ))
                .toList()
            if (nATracks !== nBTracks) {
                zipped = zipped.unshift(
                    <li key="length">
                        {nATracks} tracks vs. {nBTracks} tracks
                    </li>,
                )
            }
            comparison = zipped.isEmpty() ? (
                <>Same tracks</>
            ) : (
                <>
                    Some differences:
                    <ul>{zipped}</ul>
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
        { base: top }: { base: DiscogsUnconfirmedSelector },
        { album }: { album: UnconfirmedAlbum },
    ) => {
        const lens1: Lens<
            DiscogsUnconfirmedSelector,
            Map<number, AlbumReselector>
        > = lensFromImplicitAccessors('albumReselection')
        const lens2: Lens<
            DiscogsUnconfirmedSelector,
            AlbumReselector
        > = lens1.compose(
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
    ({ base: top }: { base: DiscogsUnconfirmedSelector }) => {
        const { unconfirmedAlbums, albumCounts } = top
        return { unconfirmedAlbums, albumCounts }
    },
    (d: Dispatch) => bindActionCreators({}, d),
    (props, dispatch, ownProps) => {
        return { ...props, ...dispatch, ...ownProps }
    },
)(DiscogsMatcherComponent)

const YearArtistAlbumDisplay = pure((props: { album: MatchedAlbum }) => (
    <div className={`artist-album ${props.album.matched ? 'matched' : ''}`}>
        <h4>{props.album.title}</h4>
        <img src={props.album.thumb} />
    </div>
))

const YearArtistDisplay = pure(
    (props: { artist: Artist; albums: List<MatchedAlbum> }) => (
        <div className="artist">
            <h3>{props.artist.name}</h3>
            {props.albums
                .toSeq()
                .sortBy((album) => album.title)
                .map((album, e) => (
                    <YearArtistAlbumDisplay key={e} album={album} />
                ))}
        </div>
    ),
)

const YearDisplay = pure((props: { year: number; yearMap: YearMap }) => (
    <div className="year">
        <h2>{props.year}</h2>
        {props.yearMap
            .entrySeq()
            .sortBy(([artist]) => artist.name)
            .map(([artist, albums]) => (
                <YearArtistDisplay key={artist.id} {...{ artist, albums }} />
            ))}
    </div>
))

const YearsSelect = onlyUpdateForKeys(['years', 'showYears'])(
    (props: {
        years: number[]
        showYears: Set<number>
        onChangeYears: typeof actions.changeYears
    }) => (
        <select
            multiple={true}
            value={props.showYears.map((y) => y.toString()).toArray()}
            onChange={(ev) => {
                const years = Seq(ev.target.selectedOptions)
                    .map((o) => parseInt(o.value))
                    .toSet()
                props.onChangeYears({ years })
            }}
        >
            {Seq(props.years)
                .sort((a, b) => b - a)
                .map((y, e) => (
                    <option key={y} value={y}>
                        {y}
                    </option>
                ))}
        </select>
    ),
)

const ConnectedYearsSelect = connect(
    ({ base: top }: { base: DiscogsMatchedSelector }) => {
        const { showYears } = top
        return { showYears }
    },
    (d: Dispatch) =>
        bindActionCreators(
            {
                onChangeYears: actions.changeYears,
            },
            d,
        ),
)(YearsSelect)

const DiscogsMatchedComponent = pure(
    (props: { matched: MatchedMap; showYears: Set<number> }) => (
        <div className="all-matched">
            <ConnectedYearsSelect years={props.matched.keySeq().toArray()} />
            {props.showYears.toSeq().map((y) => (
                <YearDisplay
                    key={y}
                    year={y}
                    yearMap={props.matched.get(y, Map())}
                />
            ))}
        </div>
    ),
)

export const ConnectedDiscogsMatchedSelectorComponent = connect(
    ({ base: top }: { base: DiscogsMatchedSelector }) => {
        const { matched, showYears } = top
        return { matched, showYears }
    },
    (d: Dispatch) => bindActionCreators({}, d),
    (props, dispatch, ownProps) => {
        return { ...props, ...dispatch, ...ownProps }
    },
)(DiscogsMatchedComponent)
