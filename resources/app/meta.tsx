import axios from 'axios'
import { AnimatePresence, motion } from 'framer-motion'
import { List, Map, Record, Set } from 'immutable'
import * as React from 'react'
import { useInfiniteQuery, useMutation, useQuery } from 'react-query'
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
    track: Track | undefined
}> = (props) => {
    const { isTrackArtworkMissing, trackArtworkMissing } =
        React.useContext(TopPlatformContext)
    if (!props.track || isTrackArtworkMissing(props.track.id)) {
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

export type Tracks = RawTrack[]
export type Argv = { dest_playlist?: string; web_argv: string[] }
export type Playlists = [string[], TrackId[]][]
export const InitialFetchedContext = React.createContext(
    {} as {
        tracks?: Tracks
        argv?: Argv
        playlists?: Playlists
    },
)
InitialFetchedContext.displayName = 'InitialFetchedContext'

type KeyboardAction =
    | { type: 'changeKey'; key: string; down: boolean }
    | { type: 'changeAvailable'; available: boolean }

export class KeyboardState extends Record({
    available: true,
    keysDown: Map<string, boolean>(),
}) {
    reduce(action: KeyboardAction): this {
        switch (action.type) {
            case 'changeAvailable':
                return this.set('available', action.available)
            case 'changeKey':
                return this.available
                    ? this.update('keysDown', (m) =>
                          m.set(action.key, action.down),
                      )
                    : this
            default:
                return this
        }
    }
}

export type KeyboardEvents = { onFocus: () => void; onBlur: () => void }
const makeKeyboardEvents = (
    dispatch: (a: KeyboardAction) => void,
): KeyboardEvents => {
    return {
        onFocus: () => dispatch({ type: 'changeAvailable', available: false }),
        onBlur: () => dispatch({ type: 'changeAvailable', available: true }),
    }
}

export const useKeyboardEvents = (): KeyboardEvents =>
    React.useContext(TopPlatformContext).makeKeyboardEvents()

export const defaultPlatform: {
    keyboard: KeyboardState
    makeKeyboardEvents: () => KeyboardEvents
    savePlaylist: (tracks: TrackId[], name?: string) => void
    isTrackArtworkMissing: (id: TrackId) => boolean
    trackArtworkMissing: (id: TrackId) => void
    showError: (e: Error) => void
} = {
    keyboard: new KeyboardState(),
    makeKeyboardEvents: () => ({
        onFocus: () => {},
        onBlur: () => {},
    }),
    savePlaylist: () => {},
    isTrackArtworkMissing: () => true,
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
                    count: 25,
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

    const argv = useQuery('argv', () => axios.get<Argv>('/_api/argv'), {
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        enabled: initialFetch.argv !== undefined,
    })

    const playlists = useQuery(
        'playlists',
        () =>
            axios.post<{ playlists: Playlists }>(
                '/_api/playlists',
                initialFetch.playlists,
            ),
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

    const savePlaylist = useMutation(
        (data: { tracks: TrackId[]; name?: string }) =>
            axios.post<{}>('/_api/save', data),
    )
    var savePlaylistInfo
    switch (savePlaylist.status) {
        case 'loading':
            savePlaylistInfo = (
                <PulseLoader color="darkslateblue" size="0.3em" />
            )
            break
        case 'success':
            savePlaylistInfo = '✅'
    }

    const [keyboard, dispatchKeyboard] = React.useReducer(
        (state, action) => state.reduce(action),
        new KeyboardState(),
    )

    React.useEffect(() => {
        const onKeydown = (ev: KeyboardEvent) =>
            dispatchKeyboard({
                type: 'changeKey',
                key: ev.key.toLowerCase(),
                down: true,
            })

        const onKeyup = (ev: KeyboardEvent) =>
            dispatchKeyboard({
                type: 'changeKey',
                key: ev.key.toLowerCase(),
                down: false,
            })

        addEventListener('keydown', onKeydown)
        addEventListener('keyup', onKeyup)
        return () => {
            removeEventListener('keydown', onKeydown)
            removeEventListener('keyup', onKeyup)
        }
    })

    const [errors, setErrors] = React.useState(List<Error>())
    const [missingArtwork, setMissingArtwork] = React.useState(Set<TrackId>())

    var body
    if (!tracksQuery.hasNextPage && argv.isSuccess && playlists.isSuccess) {
        body = (
            <motion.div {...fadeInOut}>
                <TopPlatformContext.Provider
                    value={{
                        keyboard: keyboard,
                        makeKeyboardEvents: () =>
                            makeKeyboardEvents(dispatchKeyboard),
                        savePlaylist: (tracks: TrackId[], name?: string) =>
                            savePlaylist.mutate({ tracks, name }),
                        isTrackArtworkMissing: (t) => missingArtwork.has(t),
                        trackArtworkMissing: (t) => {
                            setMissingArtwork(missingArtwork.add(t))
                        },
                        showError: (e) => setErrors(errors.push(e)),
                    }}
                >
                    <InitialFetchedContext.Provider
                        value={{
                            tracks: List(tracksQuery.data?.pages)
                                .flatMap(({ data }) => data.tracks)
                                .toArray(),
                            argv: argv.data?.data,
                            playlists: playlists.data?.data.playlists,
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
            {errors.map((err, e) => (
                <motion.div key={e} className="error" {...fadeInOut}>
                    <button onClick={() => console.log('dismiss', { e })}>
                        X
                    </button>
                    {err}
                </motion.div>
            ))}
            <div id="console" key="console">
                {(consoleQuery.data?.data?.screen ?? []).join('\n')}
            </div>
            {savePlaylistInfo && (
                <div id="playlist-saving" key="playlist-saving">
                    playlist: {savePlaylistInfo}
                </div>
            )}
            {body}
        </AnimatePresence>
    )
}

export const ConnectedTopComponent = TopComponent
