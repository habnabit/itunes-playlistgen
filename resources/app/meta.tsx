import axios from 'axios'
import { AnimatePresence, motion } from 'framer-motion'
import { List } from 'immutable'
import * as React from 'react'
import { useInfiniteQuery, useQuery } from 'react-query'
import PulseLoader from 'react-spinners/PulseLoader'

import { RawTrack, Track, TrackId } from './types'

export type InitialFetch = {
    argv?: {}
    tracks?: {}
    playlists?: {
        names?: string[]
    }
}

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

export const ConnectedTrackArtworkComponent: React.FC<{
    track: Track
    errored: boolean
}> = (props) => {
    const { trackArtworkMissing } = React.useContext(TopPlatformContext)
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
            onError={() => trackArtworkMissing(id)}
        />
    )
}

export const InitialFetchedContext = React.createContext(
    {} as {
        tracks?: List<RawTrack>
        argv?: { dest_playlist?: string; web_argv?: string[] }
        playlists?: [string, TrackId[]][]
    },
)
InitialFetchedContext.displayName = 'InitialFetchedContext'

export const defaultPlatform: {
    trackArtworkMissing: (id: TrackId) => void
    showError: (e: Error) => void
} = {
    trackArtworkMissing: (t) => {
        console.log('track artwork missing', t)
    },
    showError: (e) => {
        console.error(e)
    },
}

export const TopPlatformContext = React.createContext(defaultPlatform)
TopPlatformContext.displayName = 'TopPlatformContext'

type TopProps = {
    initialFetch: InitialFetch
}

const TopComponent: React.FC<TopProps> = (props) => {
    const { children, initialFetch } = props

    const tracksQuery = useInfiniteQuery(
        ['tracks@'],
        ({ pageParam = 0 }) =>
            axios.get<{ tracks: RawTrack[] }>('/_api/tracks', {
                params: {
                    offset: pageParam,
                },
            }),
        {
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            enabled: initialFetch.tracks !== undefined,
            getNextPageParam: (lastPage, pages) =>
                lastPage.data.tracks.length > 0
                    ? List(pages).reduce(
                          (sum, { data }) => sum + data.tracks.length,
                          0,
                      )
                    : undefined,
            onSuccess: ({ pages }) => {
                if (tracksQuery.hasNextPage || pages.length < 2) {
                    tracksQuery.fetchNextPage()
                }
            },
        },
    )

    const argv = useQuery('argv', () => axios.get('/_api/argv'), {
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        enabled: initialFetch.argv !== undefined,
    })

    const playlists = useQuery(
        'playlists',
        () => axios.post('/_api/playlists', initialFetch.playlists),
        {
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            enabled: initialFetch.playlists !== undefined,
        },
    )

    function* loadingDescription(): Generator<{
        description: string
        pending: boolean
    }> {
        if (initialFetch.tracks !== undefined) {
            const pending =
                tracksQuery.status === 'loading' || tracksQuery.hasNextPage
            yield {
                description: pending
                    ? `${(tracksQuery.data?.pages ?? []).length} pages`
                    : 'all tracks',
                pending,
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

    const [errors, setErrors] = React.useState(List<Error>())

    var body
    if (!tracksQuery.hasNextPage && argv.isSuccess && playlists.isSuccess) {
        body = (
            <motion.div {...fadeInOut}>
                <TopPlatformContext.Provider
                    value={{
                        ...defaultPlatform,
                        showError: (e) => setErrors(errors.push(e)),
                    }}
                >
                    <InitialFetchedContext.Provider
                        value={{
                            tracks: List(tracksQuery.data?.pages).flatMap(
                                ({ data }) => data.tracks,
                            ),
                            argv: argv.data?.data,
                            playlists: playlists.data?.data,
                        }}
                    >
                        {children}
                    </InitialFetchedContext.Provider>
                </TopPlatformContext.Provider>
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

    const [screenHashed, setScreenHashed] = React.useState(undefined)
    const consoleQuery = useQuery(
        'console',
        () =>
            axios.get<{ screen: string[]; hashed: string }>('/_api/screen', {
                params: { poll_interval: 0.1, hashed: screenHashed },
            }),
        {
            refetchInterval: 250,
            onSuccess: ({ data }) => {
                setScreenHashed(data.hashed)
            },
        },
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
