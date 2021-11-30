import axios from 'axios'
import { boolean } from 'fp-ts'
import { AnimatePresence, motion } from 'framer-motion'
import { List } from 'immutable'
import * as qs from 'qs'
import * as React from 'react'
import { useQuery } from 'react-query'
import { connect as reduxConnect } from 'react-redux'
import PulseLoader from 'react-spinners/PulseLoader'
import { onlyUpdateForKeys } from 'recompose'
import { Dispatch, bindActionCreators } from 'redux'

import * as baseActions from '../actions'
import { axiosPostJson, postJSON } from '../funcs'
import { RawTrack, Track, TrackId } from '../types'
import * as actions from './actions'
import {
    Done,
    InitialFetch,
    Loaded,
    Loading,
    MetaState,
    OverallState,
} from './types'

const fadeInOut = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
}

const scrollFromTop = {
    initial: false,
    exit: { height: 0, marginBottom: 0, y: -100 },
    layoutTransition: true,
}

const TrackArtworkComponent = onlyUpdateForKeys(['track', 'errored'])(
    (props: {
        track: Track
        errored: boolean
        onError: typeof actions.trackArtworkMissing
    }) => {
        if (props.errored) {
            // lovingly taken from http://probablyprogramming.com/2009/03/15/the-tiniest-gif-ever
            return (
                <img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs" />
            )
        }
        const id = props.track.id
        return (
            <img
                src={`/_api/track/${id}/artwork`}
                onError={() => props.onError({ id })}
            />
        )
    },
)

export const ConnectedTrackArtworkComponent = reduxConnect(
    (top: { meta: MetaState }, { track }: { track: Track | undefined }) => ({
        errored:
            track !== undefined
                ? top.meta.artworkErroredFor.has(track.id)
                : true,
    }),
    (d: Dispatch) =>
        bindActionCreators(
            {
                onError: actions.trackArtworkMissing,
            },
            d,
        ),
    (props, dispatch, ownProps) => ({ ...props, ...dispatch, ...ownProps }),
)(TrackArtworkComponent)

export const InitialFetchedContext = React.createContext(
    {} as {
        tracks?: List<RawTrack>
        argv?: { dest_playlist?: string; web_argv?: string[] }
        playlists?: [string, TrackId[]][]
    },
)

type TopProps = {
    initialFetch: InitialFetch
}

const TopComponent: React.FC<TopProps> = (props) => {
    const { children, initialFetch } = props

    const [tracks, setTracks] = React.useState(List<RawTrack>())
    const [tracksPending, setTracksPending] = React.useState(true)

    const tracksQuery = useQuery(
        ['tracks@', tracks.size],
        () =>
            axios.get<{ tracks: RawTrack[] }>('/_api/tracks', {
                params: {
                    offset: tracks.size,
                    count: 250,
                },
            }),
        {
            enabled: initialFetch.tracks !== undefined,
            onSuccess: ({ data }) => {
                if (data.tracks.length > 0) {
                    setTracks(tracks.push(...data.tracks))
                } else {
                    setTracksPending(false)
                }
            },
        },
    )

    const argv = useQuery('argv', () => axios.get('/_api/argv'), {
        enabled: initialFetch.argv !== undefined,
    })

    const playlists = useQuery(
        'playlists',
        () =>
            axios.get('/_api/playlists', axiosPostJson(initialFetch.playlists)),
        {
            enabled: initialFetch.playlists !== undefined,
        },
    )

    function* loadingDescription(): Generator<{
        description: string
        pending: boolean
    }> {
        if (initialFetch.tracks !== undefined) {
            yield {
                description: tracksPending
                    ? `${tracks.size} tracks`
                    : 'all tracks',
                pending: tracksQuery.status === 'loading' || tracksPending,
            }
        }
        if (initialFetch.argv !== undefined) {
            yield {
                description: 'argv',
                pending: argv.status === 'loading',
            }
        }
        if (initialFetch.playlists !== undefined) {
            yield {
                description: 'playlists',
                pending: playlists.status === 'loading',
            }
        }
    }

    var body
    if (!tracksPending && argv.isSuccess && playlists.isSuccess) {
        body = (
            <motion.div {...fadeInOut}>
                <InitialFetchedContext.Provider
                    value={{
                        tracks,
                        argv: argv.data?.data,
                        playlists: playlists.data?.data,
                    }}
                >
                    {children}
                </InitialFetchedContext.Provider>
            </motion.div>
        )
    } else {
        body = (
            <motion.div key="loading" className="loading" {...scrollFromTop}>
                Loaded:{' '}
                {List(loadingDescription())
                    .toSeq()
                    .flatMap(({ description, pending }, e) => {
                        const ret: (JSX.Element | string)[] = []
                        if (e !== 0) {
                            ret.push('; ')
                        }
                        ret.push(description)
                        if (pending) {
                            ret.push(
                                <PulseLoader
                                    color="darkslateblue"
                                    size="0.3em"
                                />,
                            )
                        }
                        return ret
                    })
                    .map((el, e) => (
                        <React.Fragment key={e}>{el}</React.Fragment>
                    ))}
            </motion.div>
        )
    }

    const [errors, setErrors] = React.useState([])
    const consoleQuery = useQuery('console', () =>
        axios.get<{ screen: string[] }>('/_api/screen'),
    )

    return (
        <AnimatePresence>
            {errors.map((err, e) => {
                return (
                    <motion.div key={e} className="error" {...fadeInOut}>
                        <button onClick={() => console.log('dismiss', { e })}>
                            X
                        </button>
                        {err}
                    </motion.div>
                )
            })}
            <div id="console" key="console">
                {(consoleQuery.data?.data?.screen ?? []).join('\n')}
            </div>
            {body}
        </AnimatePresence>
    )
}

export const ConnectedTopComponent = TopComponent
