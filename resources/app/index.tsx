import * as promiseFinally from 'promise.prototype.finally'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Provider } from 'react-redux'

import { ConnectedAlbumShuffleSelectorComponent } from './album-shuffle/components'
import { ConnectedTopComponent } from './meta/components'
import * as stores from './redux'
import './site.sass'
import { ConnectedTimefillSelectorComponent } from './timefill/components'

function makeRootElement(): JSX.Element {
    var store, component
    if (location.search == '?timefill') {
        store = stores.timefillStore()
        component = <ConnectedTimefillSelectorComponent />
    } else {
        store = stores.albumShuffleStore()
        component = <ConnectedAlbumShuffleSelectorComponent />
    }
    return <Provider store={store}>
        <ConnectedTopComponent>
            {component}
        </ConnectedTopComponent>
    </Provider>
}

promiseFinally.shim()
ReactDOM.render(makeRootElement(), document.getElementById('react-root'))
