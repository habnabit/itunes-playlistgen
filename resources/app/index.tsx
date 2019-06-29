import { List, Seq } from 'immutable';
import * as promiseFinally from 'promise.prototype.finally'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Provider } from 'react-redux'

import { ConnectedAlbumShuffleSelectorComponent } from './components'
import * as stores from './redux'
import './site.sass'
import { ConnectedTimefillSelectorComponent } from './timefill/components'
import { AlbumKey } from './types'


function makeRootElement(): JSX.Element {
    if (location.search == '?timefill') {
        return <Provider store={stores.timefillStore()}>
            <ConnectedTimefillSelectorComponent />
        </Provider>
    } else {

    }
}

promiseFinally.shim()
ReactDOM.render(makeRootElement(), document.getElementById('react-root'))
