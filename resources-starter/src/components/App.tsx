import './../assets/scss/App.scss'

import * as React from 'react'

import PulseLoader from 'react-spinners/PulseLoader'
import { hot } from 'react-hot-loader'

const reactLogo = require('./../assets/img/react_logo.svg')

class App extends React.Component<Record<string, unknown>, undefined> {
    public render() {
        return (
            <div className="app">
                <h1>Hello World!</h1>
                <PulseLoader color="darkslateblue" size="0.3em" />
                <p>Foo to the barz</p>
                <img src={reactLogo.default} height="480" />
            </div>
        )
    }
}

declare let module: Record<string, unknown>

export default hot(module)(App)
