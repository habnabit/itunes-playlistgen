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
    constructor(props) {
        super(props)
        this.state = {
            selected: false,
        }
    }

    changed = () => {
        this.setState({selected: !this.state.selected}, this.selectedUpdated)
    }

    deselect = () => {
        this.setState({selected: false}, this.selectedUpdated)
    }

    selectedUpdated = () => {
        if (this.state.selected) {
            this.props.selector.selectAlbum(this.props.album, this.deselect)
        } else {
            this.props.selector.deselectAlbum(this.props.album)
        }
    }

    render() {
        let classes = ['album']
        if (this.props.album.fading) {
            classes.push('fading')
        }
        let replace = ''
        if (this.props.replace) {
            replace = <button onClick={() => this.props.remove(this.props.albumIdx, {replace: true})}>Replace</button>
        }
        return <div className={classes.join(' ')}>
            <header>
            <h3 style={{background: colorOrder[this.props.albumIdx]}}>{this.props.album.name.join('; ')}</h3>
            {replace}
            <button onClick={() => this.props.remove(this.props.albumIdx)}>Remove</button>
            <label><input type="checkbox" name="replacement-source" onChange={this.changed} checked={this.state.selected} /> Replacement source</label>
            </header>
            <Tracks selector={this.props.selector} tracks={this.props.album.tracks.map(id => ({id}))} />
        </div>
    }
}

class AlbumsSelector extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            shuffled: [],
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
                let shuffled = j.data.map(
                    id => ({id, color: colorsByAlbum.get(this.props.selector.trackIdAsAlbumKeyString(id))}))
                this.setState({shuffled})
            })
    }

    save() {
        let body = new FormData();
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
            shuffled = [
                <Tracks key="tracks" selector={this.props.selector} tracks={this.state.shuffled} />,
                <button key="save" onClick={() => this.save()}>Save and exit</button>,
            ]
        }
        return <div className="albums-selector">
            {this.props.albums.albums.map((a, e) => <Album selector={this.props.selector} album={a} remove={this.props.removeAlbum} replace={true} albumIdx={e} key={e} />)}
            <button onClick={() => this.shuffle()}>Shuffle tracks</button>
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
        }
    }

    getTrack = tid => this.props.tracks.get(tid)
    trackIdAsAlbumKey = tid => trackAsAlbumKey(this.getTrack(tid))
    trackIdAsAlbumKeyString = tid => this.trackIdAsAlbumKey(tid).join('\0')

    sourceGenius() {
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
    }

    handleChange(stateKey, event) {
        let newState = {};
        newState[stateKey] = event.target.value;
        this.setState(newState)
    }

    pickAlbums(n_albums=this.state.nAlbums, n_choices=this.state.nChoices) {
        let params = qs.stringify({n_albums, n_choices})
        return fetch('/_api/pick-albums?' + params)
            .then(resp => resp.json())
    }

    repickAlbums(...args) {
        this.pickAlbums(...args)
            .then(j => {
                this.setState({choices: j.data})
            })
    }

    removeAlbum(choiceIdx, albumIdx, args={}) {
        var newAlbumsPromise
        if (args.replace) {
            if (this.state.selected.size > 0) {
                let wasSelected = this.state.selected
                this.setState({selected: new Map()})
                let newAlbums = Array.from(wasSelected.values(), sel => {
                    sel.toDeselect()
                    return sel.album
                })
                newAlbumsPromise = new Promise(resolve => resolve(newAlbums))
            } else {
                let choices = this.state.choices.slice()
                newAlbumsPromise = this.pickAlbums(1, 1)
                    .then(j => j.data[0].albums)
                let albums = choices[choiceIdx].albums
                albums.splice(albumIdx, 1, Object.assign(albums[albumIdx], {fading: true}))
                this.setState({choices})
            }
        } else {
            newAlbumsPromise = new Promise(resolve => resolve([]))
        }
        newAlbumsPromise.then(newAlbums => {
            let choices = this.state.choices.slice();
            choices[choiceIdx].albums.splice(albumIdx, 1, ...newAlbums)
            this.setState({choices})
        })
    }

    selectAlbum(album, toDeselect) {
        let selected = new Map(this.state.selected)
        selected.set(album.name.join('\0'), {album, toDeselect})
        this.setState({selected})
    }

    deselectAlbum(album) {
        let selected = new Map(this.state.selected)
        selected.delete(album.name.join('\0'))
        this.setState({selected})
    }

    render() {
        return <div>
            <button onClick={() => this.sourceGenius()}>Source albums from Genius</button>
            <AlbumSource selector={this} albums={this.state.sources} />
            <label># albums <input type="text" placeholder="# albums" value={this.state.nAlbums} onChange={ev => this.handleChange('nAlbums', ev)} /></label>
            <label># choices <input type="text" placeholder="# choices" value={this.state.nChoices} onChange={ev => this.handleChange('nChoices', ev)} /></label>
            <button onClick={() => this.repickAlbums()}>Pick albums</button>
            {this.state.choices.map((albums, e) => <AlbumsSelector albums={albums} selector={this} removeAlbum={(...args) => this.removeAlbum(e, ...args)} key={e} />)}
        </div>
    }
}
