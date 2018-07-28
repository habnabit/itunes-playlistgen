import { OrderedMap, Map } from 'immutable'
import * as promiseFinally from 'promise.prototype.finally';
import * as React from 'react'
import * as ReactDOM from 'react-dom'

import './site.sass'
import { Album, AlbumKey, Track, TrackId, collateAlbums, isoTrackId } from './types'
import { ConnectedAlbumShuffleSelectorComponent } from './components'
import { store } from './redux'
import { Provider } from 'react-redux';


promiseFinally.shim()
ReactDOM.render(
    <Provider store={store}>
        <ConnectedAlbumShuffleSelectorComponent />
    </Provider>, document.getElementById('react-root'))
