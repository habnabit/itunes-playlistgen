import { List } from 'immutable'
import * as React from 'react'
import { connect } from 'react-redux'
import { bindActionCreators, Dispatch } from 'redux'

import * as baseActions from '../actions'
import { Done, Loaded, Loading, MetaState, OverallState } from './types'

class TopComponent extends React.PureComponent<{
    state: OverallState
    gotArgv: boolean
    errors: List<string>
    fetchArgv: typeof baseActions.fetchArgv.request
    fetchTracks: typeof baseActions.fetchTracks.request
}> {
    componentDidMount() {
        this.props.fetchArgv()
        this.props.fetchTracks()
    }

    render() {
        const state = this.props.state
        var body
        if (state instanceof Loading) {
            body = <div>
                Loaded: {state.tracks}
            </div>
        } else if (state instanceof Loaded && this.props.gotArgv) {
            body = this.props.children
        } else if (state instanceof Done) {
            body = <div>Done.</div>
        }
        return <>
            {this.props.errors.map((err, e) => {
                return <div key={e} className="error">
                    {err}
                </div>
            })}
            {body}
        </>
    }
}

export const ConnectedTopComponent = connect(
    (top: {meta: MetaState}) => {
        const { state, gotArgv, errors } = top.meta
        return {state, gotArgv, errors}
    },
    (d: Dispatch) => bindActionCreators({
        fetchArgv: baseActions.fetchArgv.request,
        fetchTracks: baseActions.fetchTracks.request,
    }, d),
)(TopComponent)
