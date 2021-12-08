import {
    PreloadedState,
    Reducer,
    Store,
    applyMiddleware,
    createStore,
} from 'redux'
import { Epic, createEpicMiddleware } from 'redux-observable'

import timefillEpics from './timefill/epics'
import timefillReducer from './timefill/reducer'

const makeStore =
    <S>(reducer: Reducer<S>, epics: Epic) =>
    (state: PreloadedState<S>): Store<S> => {
        const epicMiddleware = createEpicMiddleware()
        const store = createStore(
            reducer,
            state,
            applyMiddleware(epicMiddleware),
        )
        epicMiddleware.run(epics)
        return store
    }

export const timefillStore = makeStore(timefillReducer, timefillEpics)
