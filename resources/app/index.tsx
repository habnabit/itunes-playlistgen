import * as promiseFinally from 'promise.prototype.finally'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Provider } from 'react-redux'

import { ConnectedTopComponent } from './meta/components'
import * as stores from './redux'
import './site.sass'
import { ConnectedTimefillSelectorComponent } from './timefill/components'


function makeRootElement(): JSX.Element {
    if (location.search == '?timefill') {
        return <Provider store={stores.timefillStore()}>
            <ConnectedTopComponent>
                <ConnectedTimefillSelectorComponent />
            </ConnectedTopComponent>
        </Provider>
    } else {

    }
}

promiseFinally.shim()
ReactDOM.render(makeRootElement(), document.getElementById('react-root'))
