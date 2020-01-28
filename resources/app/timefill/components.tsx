import { List } from 'immutable'
import { Lens } from 'monocle-ts'
import * as React from 'react'
import { connect } from 'react-redux'
import PulseLoader from 'react-spinners/PulseLoader'
import { onlyUpdateForKeys, pure } from 'recompose'
import { bindActionCreators, Dispatch } from 'redux'

import * as baseActions from '../actions'
import { lensFromImplicitAccessors } from '../extlens'
import { keyboardEvents, KeyboardEvents, Track, TrackId } from '../types'
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
    onShuffle: () => void
    onSave: () => void
}) => {
    const { choice } = props
    if (choice.loading) {
        return <div className="choice loading">
            <PulseLoader color="darkslateblue" size="0.5em" />
        </div>
    }

    const totalDuration = choice.tracks.reduce((totalDuration, track) => totalDuration + track.t('pDur') as number, 0)
    return <div className="choice">
        <div className="actions">
            <button onClick={() => props.onReroll()}>Reroll</button>
            <button onClick={() => props.onShuffle()}>Shuffle</button>
            <button onClick={() => props.onSave()}>Save</button>
        </div>
        <ol className="fuller tracklist selectable fade">
            {props.choice.tracks.map((track, e) => {
                const onToggle = props.onToggle(track.id)
                return <ChoiceTrackComponent key={e} selected={choice.selected.get(track.id)} {...{track, onToggle}} />
            })}
        </ol>
        <ul className="fuller tracklist total">
            <li><DurationComponent duration={totalDuration} /> total</li>
            <li className="score">{choice.score}</li>
        </ul>
    </div>
})

export const ConnectedChoiceComponent = connect(
    ({base: top}: {base: TimefillSelector}, ownProps: {idxTop: number}) => {
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
        onLoading: actions.setLoading,
        onShuffle: actions.shuffleChoice,
        onSave: baseActions.savePlaylist.request,
    }, d),
    (stateProps, dispatchProps, ownProps) => {
        const { choice, lens, top } = stateProps
        return {
            onToggle: (track: TrackId) => () => dispatchProps.onToggle({lens, track}),
            onReroll: () => {
                const selections = top.reversedSelection()
                dispatchProps.onLoading({lens, loading: true})
                dispatchProps.onReroll({
                    criteria: top.allCriteria(), selections, narrow: true,
                    replace: lens})
            },
            onShuffle: () => {
                dispatchProps.onShuffle({lens})
            },
            onSave: () => {
                dispatchProps.onSave({name: top.name, tracks: choice.tracks})
            },
            ...stateProps, ...ownProps,
        }
    },
    {
        areStatesEqual: (x, y) => x.base.choices === y.base.choices,
        areStatePropsEqual: (x, y) => x.choice === y.choice,
    },
)(ChoiceComponent)

const CriteriaComponent = onlyUpdateForKeys(
    ['criteria']
)((props: {
    criteria: List<string>
    criteriaLens: Lens<TimefillSelector, List<string>>
    onAddCriterion: typeof actions.addCriterion
    onRemoveCriterion: typeof actions.removeCriterion
    onChangeControl: typeof actions.changeControl
    keyb: KeyboardEvents
}) => {
    return <section className="criteria">
        <button className="add-criterion" onClick={() => props.onAddCriterion({})}>Add criterion</button>
        {props.criteria.map((criterion, e) => {
            const lens: Lens<TimefillSelector, string> = props.criteriaLens.compose(lensFromImplicitAccessors(e))
            return <React.Fragment key={e}>
                <input type="text" placeholder="Criterion…" value={criterion} onChange={(ev) => {
                    props.onChangeControl({lens, value: ev.target.value})
                }} {...props.keyb} />
                <button className="remove-criterion" onClick={() => props.onRemoveCriterion({index: e})}>❌</button>
            </React.Fragment>
        })}
    </section>
})

const ConnectedCriteriaComponent = connect(
    ({base: top}: {base: TimefillSelector}) => ({criteria: top.criteria}),
    (d: Dispatch) => bindActionCreators({
        onAddCriterion: actions.addCriterion,
        onRemoveCriterion: actions.removeCriterion,
        onChangeControl: actions.changeControl,
        onKeyboardAvailable: baseActions.setKeyboardAvailability,
    }, d),
    (props, dispatch, ownProps) => {
        const criteriaLens: Lens<TimefillSelector, List<string>> = new Lens(
            (o) => o.get('criteria', undefined),
            (v) => (o) => o.set('criteria', v))
        return {
            keyb: keyboardEvents(dispatch), criteriaLens,
            ...props, ...dispatch, ...ownProps,
        }
    },
    {
        areStatesEqual: (x, y) => x.base.criteria === y.base.criteria,
        areStatePropsEqual: (x, y) => x.criteria === y.criteria,
    },
)(CriteriaComponent)

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
    var tracks = null
    if (props.tracks) {
        tracks = <ul className="fuller tracklist selectable">
            {props.tracks.map((track, e) => {
                const onToggle = props.onToggle(track.id)
                return <ChoiceTrackComponent key={e} selected={props.selected} {...{track, onToggle}} />
            })}
        </ul>
    }
    return <div className="selection">
        {tracks}
    </div>
})

export const ConnectedSelectionsComponent = connect(
    (top: {}, ownProps: {}) => ({}),
    (d: Dispatch) => bindActionCreators({
        onToggle: actions.clearChoiceTrack,
    }, d),
    (stateProps, dispatchProps, ownProps) => {
        return {
            onToggle: (track: TrackId) => () => dispatchProps.onToggle({track}),
            ...stateProps, ...ownProps,
        }
    },
)(SelectionsComponent)

const TimefillSelectorComponent = onlyUpdateForKeys(
    ['name', 'choices', 'selectState', 'selectionMap']
)((props: {
    name: string
    choices: List<Choice>
    selectState: ChoiceTrackSelection
    keyb: KeyboardEvents,
    selectionMap: {[K in ChoiceTrackSelection]: List<Track>},
    onChangeName: (name: string) => void
    onSelect: () => void
}) => {
    const classes: string[] = []
    if (props.selectState !== undefined) {
        classes.push(`set-${props.selectState}`)
    }
    return <div className={classes.join(' ')}>
        <ConnectedCriteriaComponent />
        <section className="controls">
            <textarea placeholder="Playlist name…" onChange={(ev) => props.onChangeName(ev.target.value)} value={props.name} {...props.keyb} />
            <button onClick={props.onSelect}>Select new</button>
        </section>
        <section className="choices">
            <ConnectedSelectionsComponent selected="bless" tracks={props.selectionMap.bless} />
            <ConnectedSelectionsComponent selected="curse" tracks={props.selectionMap.curse} />
            <ConnectedSelectionsComponent selected="include" tracks={props.selectionMap.include} />
            <ConnectedSelectionsComponent selected="exclude" tracks={props.selectionMap.exclude} />
            {props.choices.map((pl, e) => <ConnectedChoiceComponent key={e} idxTop={e} />)}
        </section>
    </div>
})

export const ConnectedTimefillSelectorComponent = connect(
    ({base: top}: {base: TimefillSelector}) => {
        const { name, criteria, choices } = top
        const _selectionMap = top.reversedSelection()
            .map((tracks) => tracks.toList().map((t) => top.tracks.get(t)))
            .toObject()
        const selectionMap = _selectionMap as {[K in ChoiceTrackSelection]: List<Track>}
        return {
            name, criteria, choices, selectionMap,
            selections: top.reversedSelection(),
            allCriteria: top.allCriteria(),
            selectState: top.currentSelection(),
        }
    },
    (d: Dispatch) => bindActionCreators({
        onChangeControl: actions.changeControl,
        onKeyboardAvailable: baseActions.setKeyboardAvailability,
        onSetHash: baseActions.setHash,
        onLoading: actions.clearAllForLoading,
        onSelect: actions.runTimefill.request,
    }, d),
    (props, dispatch, ownProps) => {
        const lens: Lens<TimefillSelector, string> = new Lens(
            (o) => o.get('name', undefined),
            (v) => (o) => o.set('name', v))
        const extraProps = {
            onSelect: () => {
                dispatch.onLoading()
                dispatch.onSelect({
                    criteria: props.allCriteria, selections: props.selections,
                    narrow: false})
                dispatch.onSetHash()
            },
            onChangeName: (value: string) => dispatch.onChangeControl({lens, value}),
            keyb: keyboardEvents(dispatch),
        }
        return {...props, ...dispatch, ...ownProps, ...extraProps}
    },
)(TimefillSelectorComponent)
