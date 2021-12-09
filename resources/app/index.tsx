import './site.sass'

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as promiseFinally from 'promise.prototype.finally'
import * as stores from './redux'

import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { TimefillSelector, selectionPlaylists } from './timefill/types'

import { ConnectedTimefillSelectorComponent } from './timefill/components'
import { ConnectedTopComponent } from './meta'
import { Provider } from 'react-redux'

const makeRootElement = () => (
    <BrowserRouter>
        <QueryClientProvider client={queryClient}>
            <Routes>
                <Route
                    path="app"
                    element={
                        <>
                            <h1>playlistgen</h1>
                            <ul>
                                <li>
                                    <Link to="timefill">timefill</Link>
                                </li>
                            </ul>
                        </>
                    }
                />
                <Route
                    path="app/timefill/*"
                    element={
                        <ConnectedTopComponent
                            initialFetch={{
                                argv: true,
                                tracks: true,
                                playlists: {
                                    names: ['Tagged'],
                                },
                            }}
                        >
                            <Provider
                                store={stores.timefillStore(
                                    new TimefillSelector(),
                                )}
                            >
                                <ConnectedTimefillSelectorComponent />
                            </Provider>
                        </ConnectedTopComponent>
                    }
                />
            </Routes>
        </QueryClientProvider>
    </BrowserRouter>
)

const queryClient = new QueryClient()

promiseFinally.shim()
ReactDOM.render(makeRootElement(), document.getElementById('react-root'))
