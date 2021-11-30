import './site.sass'

import * as promiseFinally from 'promise.prototype.finally'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { Provider } from 'react-redux'

import { ConnectedAlbumShuffleSelectorComponent } from './album-shuffle/components'
import { AlbumShuffleSelector } from './album-shuffle/types'
import {
    ConnectedDiscogsMatchedSelectorComponent,
    ConnectedDiscogsMatcherSelectorComponent,
} from './discogs-matcher/components'
import {
    DiscogsMatchedSelector,
    DiscogsUnconfirmedSelector,
} from './discogs-matcher/types'
import { ConnectedTopComponent } from './meta/components'
import * as stores from './redux'
import { ConnectedTimefillSelectorComponent } from './timefill/components'
import { TimefillSelector, selectionPlaylists } from './timefill/types'

function makeRootElement(): JSX.Element {
    var store,
        component,
        initialFetch = {}
    if (location.search == '?timefill') {
        store = stores.timefillStore(
            new TimefillSelector(),
            (initialFetch = {
                argv: true,
                tracks: true,
                playlists: {
                    names: selectionPlaylists.valueSeq().toArray(),
                },
            }),
        )
        component = <ConnectedTimefillSelectorComponent />
    } else if (location.search == '?discogs=unconfirmed') {
        store = stores.discogsUnconfirmedStore(
            new DiscogsUnconfirmedSelector(),
            (initialFetch = {
                argv: true,
            }),
        )
        component = <ConnectedDiscogsMatcherSelectorComponent />
    } else if (location.search == '?discogs=matched') {
        store = stores.discogsMatchedStore(new DiscogsMatchedSelector(), {
            argv: true,
        })
        component = <ConnectedDiscogsMatchedSelectorComponent />
    } else {
        store = stores.albumShuffleStore(
            new AlbumShuffleSelector(),
            (initialFetch = {
                argv: true,
                tracks: true,
                playlists: {
                    names: ['<sleepytunes'],
                },
            }),
        )
        component = <ConnectedAlbumShuffleSelectorComponent />
    }
    return (
        <QueryClientProvider client={queryClient}>
            <Provider store={store}>
                <ConnectedTopComponent initialFetch={initialFetch}>
                    {component}
                </ConnectedTopComponent>
            </Provider>
        </QueryClientProvider>
    )
}

const queryClient = new QueryClient()

promiseFinally.shim()
ReactDOM.render(makeRootElement(), document.getElementById('react-root'))
