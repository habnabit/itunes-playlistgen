import { List, Seq } from 'immutable';
import * as promiseFinally from 'promise.prototype.finally'
import * as qs from 'qs'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Provider } from 'react-redux'

import { ConnectedAlbumShuffleSelectorComponent, ConnectedTimefillSelectorComponent } from './components'
import * as stores from './redux'
import './site.sass'
import { TimefillSelector, AlbumKey } from './types';


function makeRootElement(): JSX.Element {
    if (location.pathname == '/timefill') {
        let initial = {
            targets: undefined as List<string>,
            name: undefined as string,
            weights: undefined as List<[AlbumKey, string]>,
        }
        if (location.hash.length > 1) {
            let parsed: {
                targets?: string[]
                name?: string
                weights?: [{album: string, artist: string}, string][]
            } = JSON.parse(decodeURI(location.hash).slice(1))
            initial.name = parsed.name
            if (parsed.targets) {
                initial.targets = List(parsed.targets)
            }
            if (parsed.weights) {
                initial.weights = Seq(parsed.weights)
                    .map(([key, weight]) => [new AlbumKey(key), weight] as [AlbumKey, string])
                    .toList()
            }
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
