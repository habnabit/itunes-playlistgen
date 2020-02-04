import * as promiseFinally from 'promise.prototype.finally'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Provider } from 'react-redux'

import { ConnectedAlbumShuffleSelectorComponent } from './album-shuffle/components'
import { ConnectedTopComponent } from './meta/components'
import * as stores from './redux'
import './site.sass'
import { ConnectedTimefillSelectorComponent } from './timefill/components'
import { selectionPlaylists } from './timefill/types'

function makeRootElement(): JSX.Element {
    var store, component, initialPlaylists
    if (location.search == '?timefill') {
        store = stores.timefillStore()
        component = <ConnectedTimefillSelectorComponent />
        initialPlaylists = selectionPlaylists.valueSeq()
            .map((pl) => [pl])
            .toArray()
    } else {
        store = stores.albumShuffleStore()
        component = <ConnectedAlbumShuffleSelectorComponent />
    }
    return <Provider store={store}>
        <ConnectedTopComponent initialPlaylists={initialPlaylists}>
            {component}
        </ConnectedTopComponent>
    </Provider>
}

promiseFinally.shim()
ReactDOM.render(makeRootElement(), document.getElementById('react-root'))
