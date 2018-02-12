import promiseFinally from 'promise.prototype.finally'
import React from 'react'
import ReactDOM from 'react-dom'

import './site.sass'
import './alerts.jsx'
import {AlbumShuffleSelector} from './tracks.jsx'


export class Root extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            status: 'Fetching data...',
            tracks: [],
        }
    }

    componentWillMount() {
        fetch('/_api/all-tracks')
            .then(resp => resp.json())
            .then(j => {
                let tracks = new Map()
                for (var t of j.data) {
                    tracks.set(t.T_pPIS, t)
                }
                this.setState({tracks: tracks, status: 'Ready.'})
            })
    }

    render() {
        let selector = '';
        if (this.state.tracks.size > 0) {
            selector = <AlbumShuffleSelector tracks={this.state.tracks} />
        }
        return <div>
            <p>{this.state.status}</p>
            {selector}
        </div>
    }
}


promiseFinally.shim()
ReactDOM.render(<Root />, document.getElementById('react-root'))
