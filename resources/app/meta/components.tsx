import { AnimatePresence, motion } from 'framer-motion'
import { List } from 'immutable'
import * as React from 'react'
import { connect } from 'react-redux'
import PulseLoader from 'react-spinners/PulseLoader'
import { bindActionCreators, Dispatch } from 'redux'

import * as baseActions from '../actions'
import * as actions from './actions'
import { Done, Loaded, Loading, MetaState, OverallState } from './types'

const fadeInOut = {
    initial: {opacity: 0},
    animate: {opacity: 1},
    exit: {opacity: 0},
}

const scrollFromTop = {
    initial: false,
    exit: {height: 0, 'margin-bottom': 0, y: -100},
    layoutTransition: true,
}

class TopComponent extends React.PureComponent<{
    state: OverallState
    errors: List<string>
    initialPlaylists?: string[][]
    fetchArgv: typeof baseActions.fetchArgv.request
    fetchTracks: typeof baseActions.fetchTracks.request
    fetchPlaylists: typeof baseActions.fetchPlaylists.request
    onDismissError: typeof actions.dismissError
}> {
    componentDidMount() {
        this.props.fetchArgv()
        this.props.fetchTracks()
        this.props.fetchPlaylists({
            names: this.props.initialPlaylists,
        })
    }

    render() {
        const state = this.props.state
        var body
        if (state instanceof Loading) {
            body = <motion.div key="loading" className="loading" {...scrollFromTop}>
                Loaded: {state.description().toSeq().flatMap(([desc, loaded], e) => {
                    const ret: (JSX.Element | string)[] = []
                    if (e !== 0) {
                        ret.push('; ')
                    }
                    ret.push(desc)
                    if (!loaded) {
                        ret.push(<PulseLoader color="darkslateblue" size="0.3em" />)
                    }
                    return ret
                }).map((el, e) => <React.Fragment key={e}>{el}</React.Fragment>)}
            </motion.div>
        } else if (state instanceof Loaded) {
            body = <motion.div {...fadeInOut}>
                {this.props.children}
            </motion.div>
        } else if (state instanceof Done) {
            body = <div>Done.</div>
        }
        return <AnimatePresence>
            {this.props.errors.map((err, e) => {
                return <motion.div key={e} className="error" {...fadeInOut}>
                    <button onClick={() => this.props.onDismissError({index: e})}>X</button>
                    {err}
                </motion.div>
            })}
            {body}
        </AnimatePresence>
    }
}

export const ConnectedTopComponent = connect(
    (top: {meta: MetaState}) => {
        const { state, errors } = top.meta
        return {state, errors}
    },
    (d: Dispatch) => bindActionCreators({
        fetchArgv: baseActions.fetchArgv.request,
        fetchTracks: baseActions.fetchTracks.request,
        fetchPlaylists: baseActions.fetchPlaylists.request,
        onDismissError: actions.dismissError,
    }, d),
)(TopComponent)
