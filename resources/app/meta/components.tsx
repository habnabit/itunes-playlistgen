import { AnimatePresence, motion } from 'framer-motion'
import { List } from 'immutable'
import * as React from 'react'
import { connect } from 'react-redux'
import PulseLoader from 'react-spinners/PulseLoader'
import { onlyUpdateForKeys } from 'recompose'
import { Dispatch, bindActionCreators } from 'redux'

import * as baseActions from '../actions'
import { Track } from '../types'
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

export const ConnectedTrackArtworkComponent = connect(
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

class TopComponent extends React.PureComponent<{
    state: OverallState
    errors: List<string>
    initialFetch: InitialFetch
    console: string[]
    fetchArgv: typeof baseActions.fetchArgv.request
    fetchTracks: typeof baseActions.fetchTracks.request
    fetchPlaylists: typeof baseActions.fetchPlaylists.request
    fetchConsole: typeof baseActions.fetchConsole.request
    onDismissError: typeof actions.dismissError
}> {
    componentDidMount() {
        if (this.props.initialFetch.argv !== undefined) {
            this.props.fetchArgv()
        }
        if (this.props.initialFetch.tracks !== undefined) {
            this.props.fetchTracks()
        }
        if (this.props.initialFetch.playlists !== undefined) {
            this.props.fetchPlaylists(this.props.initialFetch.playlists)
        }
        this.props.fetchConsole({})
    }

    render() {
        const state = this.props.state
        var body
        if (state instanceof Loading) {
            body = (
                <motion.div
                    key="loading"
                    className="loading"
                    {...scrollFromTop}
                >
                    Loaded:{' '}
                    {state
                        .description()
                        .toSeq()
                        .flatMap(([desc, loaded], e) => {
                            const ret: (JSX.Element | string)[] = []
                            if (e !== 0) {
                                ret.push('; ')
                            }
                            ret.push(desc)
                            if (!loaded) {
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
        } else if (state instanceof Loaded) {
            body = <motion.div {...fadeInOut}>{this.props.children}</motion.div>
        } else if (state instanceof Done) {
            body = <div>Done.</div>
        }
        return (
            <AnimatePresence>
                {this.props.errors.map((err, e) => {
                    return (
                        <motion.div key={e} className="error" {...fadeInOut}>
                            <button
                                onClick={() =>
                                    this.props.onDismissError({ index: e })
                                }
                            >
                                X
                            </button>
                            {err}
                        </motion.div>
                    )
                })}
                <div id="console" key="console">{this.props.console.join('\n')}</div>
                {body}
            </AnimatePresence>
        )
    }
}

export const ConnectedTopComponent = connect(
    (top: { meta: MetaState }) => {
        const { state, errors, console } = top.meta
        var initialFetch = {}
        if (top.meta.state instanceof Loading) {
            initialFetch = top.meta.state.fetch
        }
        return { state, errors, initialFetch, console }
    },
    (d: Dispatch) =>
        bindActionCreators(
            {
                fetchArgv: baseActions.fetchArgv.request,
                fetchTracks: baseActions.fetchTracks.request,
                fetchPlaylists: baseActions.fetchPlaylists.request,
                fetchConsole: baseActions.fetchConsole.request,
                onDismissError: actions.dismissError,
            },
            d,
        ),
)(TopComponent)
