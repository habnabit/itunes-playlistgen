import './site.sass'

import * as promiseFinally from 'promise.prototype.finally'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Provider } from 'react-redux'

import { ConnectedAlbumShuffleSelectorComponent } from './album-shuffle/components'
import { AlbumShuffleSelector } from './album-shuffle/types'
import { ConnectedDiscogsMatcherSelectorComponent } from './discogs-matcher/components'
import { DiscogsSelector } from './discogs-matcher/types'
import { ConnectedTopComponent } from './meta/components'
import * as stores from './redux'
import { ConnectedTimefillSelectorComponent } from './timefill/components'
import { TimefillSelector, selectionPlaylists } from './timefill/types'

function makeRootElement(): JSX.Element {
    var store, component
    if (location.search == '?timefill') {
        store = stores.timefillStore(new TimefillSelector(), {
            argv: true,
            tracks: true,
            playlists: {
                names: selectionPlaylists.valueSeq().toArray(),
            },
        })
        component = <ConnectedTimefillSelectorComponent />
    } else if (location.search == '?discogs') {
        store = stores.discogsStore(new DiscogsSelector(), {
            argv: true,
        })
        component = <ConnectedDiscogsMatcherSelectorComponent />
    } else {
        store = stores.albumShuffleStore(new AlbumShuffleSelector(), {
            argv: true,
            tracks: true,
            playlists: {
                names: ['<sleepytunes'],
            },
        })
        component = <ConnectedAlbumShuffleSelectorComponent />
    }
    return (
        <Provider store={store}>
            <ConnectedTopComponent>{component}</ConnectedTopComponent>
        </Provider>
    )
}

promiseFinally.shim()
ReactDOM.render(makeRootElement(), document.getElementById('react-root'))
