import {Map} from 'immutable'
import * as promiseFinally from 'promise.prototype.finally';
import * as React from 'react'
import * as ReactDOM from 'react-dom'

import './site.sass'
import {AlbumShuffleSelectorDisplay, Track, TrackId, isoTrackId} from './tracks'


type RootState = {
    status: string,
    tracks: Map<TrackId, Track>,
}

export class Root extends React.Component<{}, RootState> {
    constructor(props: {}) {
        super(props)
        this.state = {
            status: 'Fetching data...',
            tracks: Map(),
        }
    }

    componentWillMount() {
        fetch('/_api/all-tracks')
            .then(resp => resp.json())
            .then(j => {
                let tracks = Map<TrackId, Track>().withMutations(m => {
                    for (var t of j.data) {
                        m.set(isoTrackId.wrap(t.T_pPIS), new Track(t))
                    }
                })
                this.setState({tracks: tracks, status: 'Ready.'})
            })
    }

    render() {
        let selector = null;
        if (this.state.tracks.size > 0) {
            selector = <AlbumShuffleSelectorDisplay tracks={this.state.tracks} />
        }
        return <div>
            <p>{this.state.status}</p>
            {selector}
        </div>
    }
}


promiseFinally.shim()
ReactDOM.render(<Root />, document.getElementById('react-root'))
