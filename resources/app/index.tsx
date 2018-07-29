import * as promiseFinally from 'promise.prototype.finally'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Provider } from 'react-redux'

import { ConnectedAlbumShuffleSelectorComponent } from './components'
import { store } from './redux'
import './site.sass'


promiseFinally.shim()
ReactDOM.render(
    <Provider store={store}>
        <ConnectedAlbumShuffleSelectorComponent />
    </Provider>, document.getElementById('react-root'))
