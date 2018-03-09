import React from 'react'
import qs from 'qs'

const colorOrder = ["#fbb4ae","#b3cde3","#ccebc5","#decbe4","#fed9a6","#ffffcc","#e5d8bd","#fddaec","#f2f2f2"]

const trackAsAlbumKey = track => [track.T_pAlb, track.T_pAlA || track.T_pArt]

class Track extends React.Component {
    t = (typ) => this.props.selector.getTrack(this.props.track.id)['T_' + typ]

    render() {
        let style = {}
        if (this.props.track.color) {
            style.background = this.props.track.color
        }
        return <li style={style}>
            {this.t('pnam')}
        </li>
    }
}

class Tracks extends React.Component {
    render() {
        return <ul className="tracklist">
            {this.props.tracks.map((track, e) => <Track selector={this.props.selector} track={track} key={e} />)}
        </ul>
    }
}

class Album extends React.Component {
    isSelected() {
        return this.props.selector.isAlbumSelected(this.props.album)
    }

    changed = () => {
        if (this.isSelected()) {
            this.props.selector.deselectAlbum(this.props.album)
        } else {
            this.props.selector.selectAlbum(this.props.album)
        }
    }

    render() {
        let classes = ['album']
        let controls = ''
        if (this.props.album.fading) {
            classes.push('fading')
        } else {
            let replace = ''
            if (this.props.replace) {
                replace = <button onClick={() => this.props.adjust({replace: this.props.albumIdx})}>Replace</button>
            }
            controls = <React.Fragment>
                {replace}
                <button onClick={() => this.props.adjust({remove: this.props.albumIdx})}>Remove</button>
                <label><input type="checkbox" name="replacement-source" onChange={this.changed} checked={this.isSelected()} /> Replacement source</label>
            </React.Fragment>;
        }
        return <div className={classes.join(' ')}>
            <header>
            <h3 style={{background: colorOrder[this.props.albumIdx]}}>{this.props.album.name.join('; ')}</h3>
            {controls}
            </header>
            <Tracks selector={this.props.selector} tracks={this.props.album.tracks.map(id => ({id}))} />
        </div>
    }
}

class ShuffleInfoDisplay extends React.Component {
    matGroup () {
        let lineStyle = {
            stroke: 'rgba(0, 0, 0, 0.75)',
            strokeWidth: '0.05',
        }

        let circleStyle = {
            stroke: 'rgba(0, 0, 0, 0.5)',
            strokeWidth: lineStyle.strokeWidth,
        }

        let coords = this.props.info.coords || []
        let postPicks = this.props.info.post_picks || []
        let elementIdx = 0
        let circles = []
        let lines = []
        let flatCircles = []
        let xMax = 0
        coords.forEach((xs, y) => {
            for (let x of xs) {
                let style = {}
                flatCircles.push(({x: Math.floor(x), y, style}))
                style = Object.assign({fill: colorOrder[y], opacity: 0.5}, circleStyle)
                circles.push(<circle cx={x} cy={y} r="0.25" key={++elementIdx} style={style} />)
                xMax = Math.max(xMax, x)
            }
        })
        flatCircles.sort((a, b) => a.x - b.x)
        postPicks.forEach((pick, e) => {
            flatCircles[e].style.fill = colorOrder[pick]
        })
        let lastCircle
        for (let c of flatCircles) {
            let {x, y, style: localCircleStyle} = c
            localCircleStyle = Object.assign({}, circleStyle, localCircleStyle)
            circles.push(<circle cx={x} cy={y} r="0.125" key={++elementIdx} style={localCircleStyle} />)
            if (lastCircle !== undefined) {
                let {x: x1, y: y1} = lastCircle
                lines.push(<line x1={x1} y1={y1} x2={x} y2={y} key={++elementIdx} style={lineStyle} />)
            }
            lastCircle = c
        }
        return {
            xMax, yMax: coords.length,
            element: <React.Fragment>{lines}{circles}</React.Fragment>,
        }
    }

    render () {
        let {xMax, yMax, element} = this.matGroup()
        let viewBox = "0 0 " + (xMax + 2) + " " + (yMax + 2)
        let style = {}
        if (xMax == 0 || yMax == 0) {
            style = {display: 'none'}
        } else {
            style = {width: '100%', height: '100px'}
        }
        return <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox={viewBox} preserveAspectRatio="xMinYMin meet" style={style}>
            <g transform="translate(1 1)">{element}</g>
        </svg>
    }
}

class AlbumsSelector extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            shuffled: [],
            shuffleInfo: {},
        }
    }

    shuffle() {
        let params = qs.stringify({
            tracks: this.props.albums.albums.reduce(
                (accum, album) => accum.concat(album.tracks), []),
        }, {arrayFormat: 'repeat'})
        return fetch('/_api/shuffle-together-albums?' + params)
            .then(resp => resp.json())
            .then(j => {
                let colorsByAlbum = new Map(this.props.albums.albums.map((a, e) => [a.name.join('\0'), colorOrder[e]]))
                let shuffled = j.data.tracks.map(
                    id => ({id, color: colorsByAlbum.get(this.props.selector.trackIdAsAlbumKeyString(id))}))
                this.setState({shuffleInfo: j.data.info, shuffled})
            })
    }

    save() {
        let body = new FormData()
        body.append(
            'name', '\u203b Album Shuffle\n' + Array.from(this.props.albums.albums, a => a.name[0]).join(' \u2715 '))
        for (let t of this.state.shuffled) {
            body.append('tracks', t.id)
        }
        fetch('/_api/save-and-exit', {
            method: 'POST',
            body,
        })
            .then(resp => resp.json())
            .then(j => {
                if (j.data) {
                    window.close()
                }
            })
    }

    render () {
        let shuffled = ''
        if (this.state.shuffled.length > 0) {
            shuffled = <React.Fragment>
                <Tracks key="tracks" selector={this.props.selector} tracks={this.state.shuffled} />
                <button key="save" onClick={() => this.save()}>Save and exit</button>
            </React.Fragment>
        }
        return <div className="albums-selector">
            <button onClick={() => this.props.adjustAlbums({add: true})} disabled={!this.props.selector.hasSelection()}>Add albums</button>
            {this.props.albums.albums.map((a, e) => <Album selector={this.props.selector} album={a} adjust={this.props.adjustAlbums} replace={true} albumIdx={e} key={e} />)}
            <button onClick={() => this.shuffle()}>Shuffle tracks</button>
            <ShuffleInfoDisplay info={this.state.shuffleInfo} />
            {shuffled}
        </div>
    }
}

class AlbumSource extends React.Component {
    render () {
        return <div className="album-source">
            {Array.from(this.props.albums.values(), (a, e) => <Album selector={this.props.selector} album={a} key={e} />)}
        </div>
    }
}

export class AlbumShuffleSelector extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            nAlbums: '4',
            nChoices: '5',
            sources: new Map(),
            choices: [],
            selected: new Map(),
            sourcingGenius: false,
            pickingAlbums: false,
        }
    }

    getTrack = tid => this.props.tracks.get(tid)
    trackIdAsAlbumKey = tid => trackAsAlbumKey(this.getTrack(tid))
    trackIdAsAlbumKeyString = tid => this.trackIdAsAlbumKey(tid).join('\0')

    sourceGenius() {
        this.setState({sourcingGenius: true})
        return fetch('/_api/genius-albums')
            .then(resp => resp.json())
            .then(j => {
                let sources = new Map(this.state.sources)
                for (let tid of j.data) {
                    let key = this.trackIdAsAlbumKey(tid)
                    sources.set(key.join('\0'), {name: key, tracks: []})
                }
                for (let tid of j.data) {
                    sources.get(this.trackIdAsAlbumKeyString(tid)).tracks.push(tid)
                }
                this.setState({sources})
            })
            .finally(() => this.setState({sourcingGenius: false}))
    }

    handleChange(stateKey, event) {
        let newState = {};
        newState[stateKey] = event.target.value;
        this.setState(newState)
    }

    pickAlbums(n_albums=this.state.nAlbums, n_choices=this.state.nChoices) {
        this.setState({pickingAlbums: true})
        let params = qs.stringify({n_albums, n_choices})
        return fetch('/_api/pick-albums?' + params)
            .then(resp => resp.json())
            .finally(r => {
                this.setState({pickingAlbums: false})
                return r
            })
    }

    repickAlbums(...args) {
        this.pickAlbums(...args)
            .then(j => {
                this.setState({choices: j.data})
            })
    }

    _adjustChoiceAlbums(choiceIdx, albumsAdjustment) {
        this.setState(({choices: prevChoices}) => {
            let choices = prevChoices.slice()
            let choiceAlbums = choices[choiceIdx].albums.slice()
            let albums = albumsAdjustment(choiceAlbums) || choiceAlbums
            choices[choiceIdx] = Object.assign({}, choices[choiceIdx], {albums})
            return {choices}
        })
    }

    adjustAlbums(choiceIdx, adjustment) {
        var sourcePromise

        if ((adjustment.add || adjustment.replace) !== undefined) {
            if (this.hasSelection()) {
                let wasSelected = this.state.selected
                this.setState({selected: new Map()})
                let newAlbums = Array.from(wasSelected.values(), sel => sel.album)
                sourcePromise = new Promise(resolve => resolve(newAlbums))
            } else {
                sourcePromise = this.pickAlbums(1, 1)
                    .then(j => j.data[0].albums)
            }
        }

        if (adjustment.add !== undefined) {
            sourcePromise.then(newAlbums => this._adjustChoiceAlbums(choiceIdx, albums => newAlbums.concat(albums)))
        } else if (adjustment.replace !== undefined) {
            let albumIdx = adjustment.replace
            this._adjustChoiceAlbums(choiceIdx, albums => {
                albums.splice(albumIdx, 1, Object.assign({}, albums[albumIdx], {fading: true}))
            })
            sourcePromise.then(newAlbums => this._adjustChoiceAlbums(choiceIdx, albums => {
                albums.splice(albumIdx, 1, ...newAlbums)
            }))
        } else if (adjustment.remove !== undefined) {
            let albumIdx = adjustment.remove
            this._adjustChoiceAlbums(choiceIdx, albums => {
                albums.splice(albumIdx, 1)
            })
        }
    }

    isAlbumSelected(album) {
        return this.state.selected.has(album.name.join('\0'))
    }

    hasSelection() {
        return this.state.selected.size > 0
    }

    selectAlbum(album) {
        let selected = new Map(this.state.selected)
        selected.set(album.name.join('\0'), {album})
        this.setState({selected})
    }

    deselectAlbum(album) {
        let selected = new Map(this.state.selected)
        selected.delete(album.name.join('\0'))
        this.setState({selected})
    }

    newSelector() {
        this.setState({choices: [{albums: []}].concat(this.state.choices)})
    }

    render() {
        return <div>
            <button onClick={() => this.sourceGenius()} disabled={this.state.sourcingGenius}>Source albums from Genius</button>
            <AlbumSource selector={this} albums={this.state.sources} />
            <label># albums <input type="text" placeholder="# albums" value={this.state.nAlbums} onChange={ev => this.handleChange('nAlbums', ev)} /></label>
            <label># choices <input type="text" placeholder="# choices" value={this.state.nChoices} onChange={ev => this.handleChange('nChoices', ev)} /></label>
            <button onClick={() => this.repickAlbums()} disabled={this.state.pickingAlbums}>Pick albums</button>
            <button onClick={() => this.newSelector()}>New selector</button>
            {this.state.choices.map((albums, e) => <AlbumsSelector albums={albums} selector={this} adjustAlbums={(...args) => this.adjustAlbums(e, ...args)} key={e} />)}
        </div>
    }
}
