import { List } from 'immutable';
import * as promiseFinally from 'promise.prototype.finally'
import * as qs from 'qs'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Provider } from 'react-redux'

import { ConnectedAlbumShuffleSelectorComponent, ConnectedTimefillSelectorComponent } from './components'
import * as stores from './redux'
import './site.sass'
import { TimefillSelector } from './types';


function makeRootElement(): JSX.Element {
    if (location.pathname == '/timefill') {
        let parsed: { targets?: string[] } = qs.parse(location.search.slice(1))
        let initial = {
            targets: parsed.targets? List(parsed.targets) : undefined,
        }
        let state = new TimefillSelector(initial)
        return <Provider store={stores.timefillStore(state)}>
            <ConnectedTimefillSelectorComponent />
        </Provider>
    } else {
        return <Provider store={stores.albumShuffleStore()}>
            <ConnectedAlbumShuffleSelectorComponent />
        </Provider>
    }
}

promiseFinally.shim()
ReactDOM.render(makeRootElement(), document.getElementById('react-root'))
