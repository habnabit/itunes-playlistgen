import * as React from 'react'
import { connect } from 'react-redux'
import { bindActionCreators, Dispatch } from 'redux'

import * as baseActions from '../actions'
import { Done, Loaded, Loading, MetaState, OverallState } from './types'


class TopComponent extends React.PureComponent<{
    state: OverallState
    onLoad: typeof baseActions.fetchTracks.request
}> {
    componentDidMount() {
        this.props.onLoad()
    }

    render() {
        const state = this.props.state
        if (state instanceof Loading) {
            return <div>
                Loaded: {state.tracks}
            </div>
        } else if (state instanceof Loaded) {
            return this.props.children
        } else if (state instanceof Done) {
            return <div>Done.</div>
        }
    }
}

export const ConnectedTopComponent = connect(
    (top: {meta: MetaState}) => {
        const { state } = top.meta
        return {state}
    },
    (d: Dispatch) => bindActionCreators({
        onLoad: baseActions.fetchTracks.request,
    }, d),
)(TopComponent)
