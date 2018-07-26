import {OrderedMap, Map} from 'immutable'
import * as promiseFinally from 'promise.prototype.finally';
import * as React from 'react'
import * as ReactDOM from 'react-dom'

import './site.sass'
import {Album, AlbumKey, AlbumShuffleSelectorDisplay, Track, TrackId, collateAlbums, isoTrackId} from './tracks'


type RootState = {
    status: string
    tracks: Map<TrackId, Track>
    albums: Map<AlbumKey, Album>
}

export class Root extends React.Component<{}, RootState> {
    constructor(props: {}) {
        super(props)
        this.state = {
            status: 'Fetching data...',
            tracks: Map(),
            albums: Map(),
        }
    }

    componentWillMount() {
        fetch('/_api/all-tracks')
            .then(resp => resp.json())
            .then(j => {
                let orderedTracks = OrderedMap<TrackId, Track>().withMutations(m => {
                    for (var t of j.data) {
                        m.set(isoTrackId.wrap(t.T_pPIS), new Track(t))
                    }
                })
                let tracks = orderedTracks.toMap()
                let albums = collateAlbums(orderedTracks.values())
                this.setState({status: 'Ready.', tracks, albums})
            })
    }

    render() {
        let selector = null;
        if (this.state.tracks.size > 0) {
            selector = <AlbumShuffleSelectorDisplay tracks={this.state.tracks} albums={this.state.albums} />
        }
        return <div>
            <p>{this.state.status}</p>
            {selector}
        </div>
    }
}


promiseFinally.shim()
ReactDOM.render(<Root />, document.getElementById('react-root'))
