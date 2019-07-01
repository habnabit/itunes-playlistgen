import { StandardProperties, SvgProperties } from 'csstype'
import { List, Map, OrderedMap, Seq, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import * as React from 'react'
import { connect } from 'react-redux'
import { onlyUpdateForKeys, pure, shallowEqual } from 'recompose'
import { bindActionCreators, Dispatch } from 'redux'

import * as baseActions from '../actions'
import { lensFromImplicitAccessors } from '../extlens'
import { Album, AlbumKey, AlbumSelector, AlbumSelectors, AlbumShuffleSelector, keyboardEvents, KeyboardEvents, Track, TrackId } from '../types'
import * as actions from './actions'
import { Choice, ChoiceTrackSelection, TimefillSelector } from './types'


const DurationComponent = pure((props: {
    duration: number
}) => {
    const minutes = Math.floor(props.duration / 60)
    const seconds = Math.floor(props.duration % 60).toLocaleString('en', {minimumIntegerDigits: 2})
    return <>⟨{minutes}:{seconds}⟩</>
})

const ChoiceTrackComponent = onlyUpdateForKeys(
    ['track', 'selected']
)((props: {
    track: Track
    selected: ChoiceTrackSelection
    onToggle: () => void
}) => {
    const key = props.track.albumKey()
    return <li className={props.selected || ''} onClick={props.onToggle}>
        <DurationComponent duration={props.track.t('pDur')} /> {props.track.t('pnam')} ({key.prettyName()})
    </li>
})

const ChoiceComponent = onlyUpdateForKeys(
    ['choice']
)((props: {
    choice: Choice
    onToggle: (tid: TrackId) => () => void
    onReroll: () => void
    onSave: () => void
}) => {
    const { choice } = props
    const totalDuration = choice.tracks.reduce((totalDuration, track) => totalDuration + track.t('pDur') as number, 0)
    return <div className="choice">
        <p>score: {choice.score.toPrecision(2)}; scores: {choice.scores.map((s) => s.toPrecision(2)).join(' ')}</p>
        <button onClick={() => props.onReroll()}>Reroll</button>
        <button onClick={() => props.onSave()}>Save</button>
        <ol className="fuller tracklist">
            {props.choice.tracks.map((track, e) => {
                const onToggle = props.onToggle(track.id)
                return <ChoiceTrackComponent key={e} selected={choice.selected.get(track.id)} {...{track, onToggle}} />
            })}
            <li className="total"><DurationComponent duration={totalDuration} /> total</li>
        </ol>
    </div>
})

export const ConnectedChoiceComponent = connect(
    (top: TimefillSelector, ownProps: {idxTop: number}) => {
        const lens1: Lens<TimefillSelector, List<Choice>> = new Lens(
            (o) => o.get('choices', undefined),
            (v) => (o) => o.set('choices', v))
        const lens2: Lens<TimefillSelector, Choice> = lens1.compose(
            lensFromImplicitAccessors(ownProps.idxTop))
        return {
            choice: top.choices.get(ownProps.idxTop),
            lens: lens2,
            top,
        }
    },
    (d: Dispatch) => bindActionCreators({
        onToggle: actions.toggleChoiceTrack,
        onReroll: actions.runTimefill.request,
        onSave: baseActions.savePlaylist.request,
    }, d),
    (stateProps, dispatchProps, ownProps) => {
        const { choice, lens, top } = stateProps
        return {
            onToggle: (track: TrackId) => () => dispatchProps.onToggle({lens, track}),
            onReroll: () => {
                const selections = choice.selectionMap()
                dispatchProps.onReroll({targets: top.allTargets(), selections, replace: lens})
            },
            onSave: () => {
                dispatchProps.onSave({name: top.name, tracks: choice.tracks})
            },
            ...stateProps, ...ownProps,
        }
    },
    {
        areStatesEqual: (x, y) => x.choices === y.choices,
        areStatePropsEqual: (x, y) => x.choice === y.choice,
    },
)(ChoiceComponent)

const TargetsComponent = onlyUpdateForKeys(
    []
)((props: {
    targets: List<string>
    targetsLens: Lens<TimefillSelector, List<string>>
    onAddTarget: typeof actions.addTarget
    onChangeControl: typeof actions.changeControl
    keyb: KeyboardEvents
}) => {
    return <section>
        <button onClick={() => props.onAddTarget({})}>Add target</button>
        {props.targets.map((target, e) => {
            const lens: Lens<TimefillSelector, string> = props.targetsLens.compose(lensFromImplicitAccessors(e))
            return <input key={e} type="text" placeholder="Target…" value={target} onChange={(ev) => {
                props.onChangeControl({lens, value: ev.target.value})
            }} {...props.keyb} />
        })}
    </section>
})

const ConnectedTargetsComponent = connect(
    (top: TimefillSelector) => ({targets: top.targets}),
    (d: Dispatch) => bindActionCreators({
        onAddTarget: actions.addTarget,
        onChangeControl: actions.changeControl,
        onKeyboardAvailable: baseActions.setKeyboardAvailability,
    }, d),
    (props, dispatch, ownProps) => {
        const targetsLens: Lens<TimefillSelector, List<string>> = new Lens(
            (o) => o.get('targets', undefined),
            (v) => (o) => o.set('targets', v))
        return {
            keyb: keyboardEvents(dispatch), targetsLens,
            ...props, ...dispatch, ...ownProps,
        }
    },
    {
        areStatesEqual: (x, y) => x.targets === y.targets,
        areStatePropsEqual: (x, y) => x.targets === y.targets,
    },
)(TargetsComponent)

// const WeightsComponent = ((props: {
//     albums: OrderedMap<AlbumKey, Album>
//     weights: List<[AlbumKey, string]>
//     onAddWeight: typeof actions.addWeight
//     onChangeWeight: typeof actions.changeWeight
//     keyb: KeyboardEvents,
// }) => {
//     return <section>
//         <button onClick={() => props.onAddWeight({})}>Add weight</button>
//         {props.weights.map(([selected, weight], i) => {
//             const events = {
//                 onChange: (event: React.ChangeEvent) => props.onChangeWeight({event, index: i}),
//                 ...props.keyb}
//             var selIndex = 0
//             const albumOptions = props.albums.keySeq().map((album, j) => {
//                 if (album.equals(selected)) {
//                     selIndex = j
//                 }
//                 return <option key={j} value={j.toString()}>{album.prettyName()}</option>
//             }).toList()
//             return <fieldset key={i}>
//                 <select value={selIndex.toString()} {...events}>{albumOptions}</select>
//                 <input type="number" placeholder="Weight…" value={weight} {...events} />
//             </fieldset>
//         })}
//     </section>
// })

// const ConnectedWeightsComponent = connect(
//     (top: TimefillSelector) => {
//         const { albums, weights } = top
//         return { albums, weights }
//     },
//     (d: Dispatch) => bindActionCreators({
//         onAddWeight: actions.addWeight,
//         onChangeWeight: actions.changeWeight,
//         onChangeControl: actions.changeControlTimefill,
//         onKeyboardAvailable: actions.setKeyboardAvailability,
//     }, d),
//     (props, dispatch, ownProps) => {
//         return {...props, ...dispatch, ...ownProps, keyb: keyboardEvents(dispatch)}
//     },
//     {
//         areStatesEqual: (x, y) => x.weights === y.weights && x.albums === y.albums,
//         areStatePropsEqual: (x, y) => x.weights === y.weights && x.albums === y.albums,
//     },
// )(WeightsComponent)

const SelectionsComponent = onlyUpdateForKeys(
    ['tracks']
)((props: {
    selected: ChoiceTrackSelection
    tracks: List<Track>
    onToggle: (tid: TrackId) => () => void
}) => {
    return <div className="choice">
        <ul className="fuller tracklist">
            {props.tracks.map((track, e) => {
                const onToggle = props.onToggle(track.id)
                return <ChoiceTrackComponent key={e} selected={props.selected} {...{track, onToggle}} />
            })}
        </ul>
    </div>
})

export const ConnectedSelectionsComponent = connect(
    (top: TimefillSelector, ownProps: {}) => {
        return {
            top,
        }
    },
    (d: Dispatch) => bindActionCreators({
        onToggle: actions.clearChoiceTrack,
    }, d),
    (stateProps, dispatchProps, ownProps) => {
        return {
            onToggle: (track: TrackId) => () => dispatchProps.onToggle({track}),
            ...stateProps, ...ownProps,
        }
    },
    {
    },
)(SelectionsComponent)

class TimefillSelectorComponent extends React.PureComponent<{
    name: string
    choices: List<Choice>
    selectState: ChoiceTrackSelection
    keyb: KeyboardEvents,
    selectionMap: {[K in ChoiceTrackSelection]: List<Track>},
    onChangeName: (name: string) => void
    onLoad: typeof baseActions.fetchTracks.request
    onSelect: () => void
}> {
    componentDidMount() {
        this.props.onLoad()
    }

    render() {
        const classes: string[] = []
        if (this.props.selectState === 'include') {
            classes.push('set-include')
        } else if (this.props.selectState === 'exclude') {
            classes.push('set-exclude')
        }
        return <div className={classes.join(' ')}>
            <section>
                <textarea onChange={(ev) => this.props.onChangeName(ev.target.value)} value={this.props.name} {...this.props.keyb} />
            </section>
            <ConnectedTargetsComponent />
            <section>
                <button onClick={this.props.onSelect}>Select new</button>
            </section>
            <section>
                <ConnectedSelectionsComponent selected="include" tracks={this.props.selectionMap.include} />
                <ConnectedSelectionsComponent selected="exclude" tracks={this.props.selectionMap.exclude} />
            </section>
            <section className="choices">
                {this.props.choices.map((pl, e) => <ConnectedChoiceComponent key={e} idxTop={e} />)}
            </section>
        </div>
    }
}

export const ConnectedTimefillSelectorComponent = connect(
    (top: TimefillSelector = new TimefillSelector()) => {
        const { name, targets, choices } = top
        const _selectionMap = Map(top.selectionMap())
            .map((tracks) => List(tracks).map((t) => top.tracks.get(t)))
            .toObject()
        const selectionMap = _selectionMap as {[K in ChoiceTrackSelection]: List<Track>}
        return {
            name, targets, choices, selectionMap,
            allTargets: top.allTargets(),
            selectState: top.currentSelection(),
        }
    },
    (d: Dispatch) => bindActionCreators({
        onChangeControl: actions.changeControl,
        onKeyboardAvailable: baseActions.setKeyboardAvailability,
        onSetHash: baseActions.setHash,
        onLoad: baseActions.fetchTracks.request,
        onSelect: actions.runTimefill.request,
    }, d),
    (props, dispatch, ownProps) => {
        const lens: Lens<TimefillSelector, string> = new Lens(
            (o) => o.get('name', undefined),
            (v) => (o) => o.set('name', v))
        const extraProps = {
            onSelect: () => {
                dispatch.onSelect({targets: props.allTargets})
                dispatch.onSetHash()
            },
            onChangeName: (value: string) => dispatch.onChangeControl({lens, value}),
            keyb: keyboardEvents(dispatch),
        }
        return {...props, ...dispatch, ...ownProps, ...extraProps}
    },
)(TimefillSelectorComponent)
