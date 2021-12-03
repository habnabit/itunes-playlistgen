import './site.sass'

import * as promiseFinally from 'promise.prototype.finally'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { Provider } from 'react-redux'

import { ConnectedTopComponent } from './meta/components'
import * as stores from './redux'
import { ConnectedTimefillSelectorComponent } from './timefill/components'
import { TimefillSelector, selectionPlaylists } from './timefill/types'

function makeRootElement(): JSX.Element {
    var store,
        component,
        initialFetch = {}
    if (location.search == '?timefill') {
        store = stores.timefillStore(new TimefillSelector())
        initialFetch = {
            argv: true,
            tracks: true,
            playlists: {
                names: selectionPlaylists.valueSeq().toArray(),
            },
        }
        component = <ConnectedTimefillSelectorComponent />
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
