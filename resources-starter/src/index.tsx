import 'regenerator-runtime/runtime'
import './site.sass'

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as stores from './redux'

import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { TimefillSelector, selectionPlaylists } from './timefill/types'

import { ConnectedTimefillSelectorComponent } from './timefill/components'
import { ConnectedTopComponent } from './meta'
import { ErrorBoundary } from 'react-error-boundary'
import { Provider } from 'react-redux'
import { TimerProvider } from './timer'

const makeRootElement = () => (
    <BrowserRouter>
        <QueryClientProvider client={queryClient}>
            <TimerProvider>
                <Routes>
                    <Route
                        path=""
                        element={
                            <>
                                <h1>playlistgen</h1>
                                <ul>
                                    <li>
                                        <Link to="app/timefill">timefill</Link>
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
                                        include_previous_selections: true,
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
            </TimerProvider>
        </QueryClientProvider>
    </BrowserRouter>
)

const queryClient = new QueryClient()

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
    document.getElementById('root'),
)
