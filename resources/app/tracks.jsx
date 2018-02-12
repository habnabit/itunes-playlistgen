import React from 'react'
import qs from 'qs'

const colorOrder = ["#fbb4ae","#b3cde3","#ccebc5","#decbe4","#fed9a6","#ffffcc","#e5d8bd","#fddaec","#f2f2f2"]

class Track extends React.Component {
    t(typ) {
        return this.props.all.get(this.props.track.id)['T_' + typ]
    }

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
            {this.props.tracks.map((id, e) => <Track all={this.props.all} track={id} key={e} />)}
        </ul>
    }
}

class Album extends React.Component {
    render() {
        let classes = ['album']
        if (this.props.album.fading) {
            classes.push('fading')
        }
        return <div className={classes.join(' ')}>
            <h3>
            <span style={{background: colorOrder[this.props.albumIdx]}}>{this.props.album.name.join('; ')}</span>
            <button onClick={() => this.props.remove(this.props.albumIdx, {replace: true})}>Replace</button>
            <button onClick={() => this.props.remove(this.props.albumIdx)}>Remove</button>
            </h3>
            <Tracks all={this.props.all} tracks={this.props.album.tracks.map(id => ({id}))} />
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

    trackIdAsAlbumKey(tid) {
        let track = this.props.tracks.get(tid)
        return [track.T_pAlb, track.T_pAlA || track.T_pArt].join('\0')
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
                let shuffled = j.data.map(id => ({id, color: colorsByAlbum.get(this.trackIdAsAlbumKey(id))}))
                this.setState({shuffled})
            })
    }

    render () {
        let shuffled = ''
        if (this.state.shuffled.length > 0) {
            shuffled = <Tracks all={this.props.tracks} tracks={this.state.shuffled} />
        }
        return <div className="albums-selector">
            {this.props.albums.albums.map((a, e) => <Album all={this.props.tracks} album={a} remove={this.props.removeAlbum} albumIdx={e} key={e} />)}
            <button onClick={() => this.shuffle()}>Shuffle tracks</button>
            {shuffled}
        </div>
    }
}

export class AlbumShuffleSelector extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            nAlbums: '4',
            nChoices: '5',
            choices: [],
        }
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
        let choices = this.state.choices.slice()
        var newAlbumsPromise
        if (args.replace) {
            newAlbumsPromise = this.pickAlbums(1, 1)
                .then(j => j.data[0].albums)
            let albums = choices[choiceIdx].albums
            albums.splice(albumIdx, 1, Object.assign(albums[albumIdx], {fading: true}))
            this.setState({choices})
        } else {
            newAlbumsPromise = new Promise(resolve => resolve([]))
        }
        newAlbumsPromise.then(newAlbums => {
            let choices = this.state.choices.slice();
            choices[choiceIdx].albums.splice(albumIdx, 1, ...newAlbums)
            this.setState({choices})
        })
    }

    render() {
        return <div>
            <label># albums <input type="text" placeholder="# albums" value={this.state.nAlbums} onChange={ev => this.handleChange('nAlbums', ev)} /></label>
            <label># choices <input type="text" placeholder="# choices" value={this.state.nChoices} onChange={ev => this.handleChange('nChoices', ev)} /></label>
            <button onClick={() => this.repickAlbums()}>Pick albums</button>
            {this.state.choices.map((albums, e) => <AlbumsSelector albums={albums} tracks={this.props.tracks} removeAlbum={(...args) => this.removeAlbum(e, ...args)} key={e} />)}
        </div>
    }
}
