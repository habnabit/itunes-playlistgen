import './site.sass'

import * as promiseFinally from 'promise.prototype.finally'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { ErrorBoundary } from 'react-error-boundary'
import { QueryClient, QueryClientProvider } from 'react-query'
import { Provider } from 'react-redux'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'

import { ConnectedTopComponent } from './meta'
import * as stores from './redux'
import { ConnectedTimefillSelectorComponent } from './timefill/components'
import { TimefillSelector, selectionPlaylists } from './timefill/types'

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
ReactDOM.render(
    <ErrorBoundary
        fallbackRender={({ error }) => (
            <>
                <h2>welp</h2>
                <pre>{error.name}</pre>
                <pre>{error.message}</pre>
                <pre>{error.stack}</pre>
            </>
        )}
    >
        {makeRootElement()}
    </ErrorBoundary>,
    document.getElementById('react-root'),
)
