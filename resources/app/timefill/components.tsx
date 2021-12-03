import { List, Map } from 'immutable'
import { Lens } from 'monocle-ts'
import * as React from 'react'
import { connect, useDispatch, useSelector } from 'react-redux'
import PulseLoader from 'react-spinners/PulseLoader'
import { Dispatch, bindActionCreators } from 'redux'

import * as baseActions from '../actions'
import { lensFromImplicitAccessors } from '../extlens'
import { InitialFetchedContext } from '../meta/components'
import { KeyboardEvents, Track, TrackId, keyboardEvents } from '../types'
import * as actions from './actions'
import {
    AllActions,
    Choice,
    ChoiceTrackSelection,
    TimefillSelector,
} from './types'

const DurationComponent: React.FC<{ duration: number }> = (props) => {
    const minutes = Math.floor(props.duration / 60)
    const seconds = Math.floor(props.duration % 60).toLocaleString('en', {
        minimumIntegerDigits: 2,
    })
    return (
        <>
            ⟨{minutes}:{seconds}⟩
        </>
    )
}

const ChoiceTrackComponent: React.FC<{
    track: Track
    selected: ChoiceTrackSelection
    ambient?: boolean
    onToggle: () => void
}> = (props) =>
    React.useMemo(() => {
        const classes = []
        if (props.selected !== undefined && props.selected !== '_cleared') {
            classes.push(props.selected)
        }
        if (props.ambient) {
            classes.push('ambient')
        }
        return (
            <li className={classes.join(' ')} onClick={props.onToggle}>
                <DurationComponent duration={props.track.totalTime} />
                &nbsp;
                {props.track.title} ({props.track.album}; {props.track.artist})
            </li>
        )
    }, [props.track, props.selected, props.ambient])

const ChoiceComponent: React.FC<{
    choice: Choice
    ambientSelected: Map<TrackId, ChoiceTrackSelection>
    onToggle: (tid: TrackId) => () => void
    onReroll: () => void
    onShuffle: () => void
    onSave: () => void
}> = (props) =>
    React.useMemo(() => {
        const { choice } = props
        if (choice.loading) {
            return (
                <div className="choice loading">
                    <PulseLoader color="darkslateblue" size="0.5em" />
                </div>
            )
        }

        const totalDuration = choice.tracks.reduce(
            (totalDuration, track) => totalDuration + track.totalTime,
            0,
        )
        return (
            <div className="choice">
                <div className="actions">
                    <button onClick={() => props.onReroll()}>Reroll</button>
                    <button onClick={() => props.onShuffle()}>Shuffle</button>
                    <button onClick={() => props.onSave()}>Save</button>
                </div>
                <ol className="fuller tracklist selectable fade">
                    {props.choice.tracks.map((track, e) => {
                        const onToggle = props.onToggle(track.id)
                        var selected = choice.selected.get(track.id)
                        var ambient = false
                        if (
                            selected === undefined &&
                            (selected = props.ambientSelected.get(track.id)) !==
                                undefined
                        ) {
                            ambient = true
                        }
                        return (
                            <ChoiceTrackComponent
                                key={e}
                                {...{ track, selected, ambient, onToggle }}
                            />
                        )
                    })}
                </ol>
                <ul className="fuller tracklist total">
                    <li>
                        <DurationComponent duration={totalDuration} /> total
                    </li>
                    <li className="score">{choice.score}</li>
                </ul>
            </div>
        )
    }, [props.choice, props.ambientSelected])

export const ConnectedChoiceComponent = connect(
    (
        { base: top }: { base: TimefillSelector },
        ownProps: { idxTop: number },
    ) => {
        const { ambientSelected } = top
        const lens1: Lens<
            TimefillSelector,
            List<Choice>
        > = lensFromImplicitAccessors('choices')
        const lens2: Lens<TimefillSelector, Choice> = lens1.compose(
            lensFromImplicitAccessors(ownProps.idxTop),
        )
        return {
            choice: top.choices.get(ownProps.idxTop),
            lens: lens2,
            top,
            ambientSelected,
        }
    },
    (d: Dispatch) =>
        bindActionCreators(
            {
                onToggle: actions.toggleChoiceTrack,
                onReroll: actions.runTimefill.request,
                onLoading: actions.setLoading,
                onShuffle: actions.shuffleChoice,
                onSave: baseActions.savePlaylist.request,
            },
            d,
        ),
    (stateProps, dispatchProps, ownProps) => {
        const { choice, lens, top } = stateProps
        return {
            onToggle: (track: TrackId) => () =>
                dispatchProps.onToggle({ lens, track }),
            onReroll: () => {
                const selections = top.reversedTotalSelection()
                dispatchProps.onLoading({ lens, loading: true })
                dispatchProps.onReroll({
                    criteria: top.allCriteria(),
                    selections,
                    narrow: true,
                    replace: lens,
                })
            },
            onShuffle: () => {
                dispatchProps.onShuffle({ lens })
            },
            onSave: () => {
                dispatchProps.onSave({ name: top.name, tracks: choice.tracks })
            },
            ...stateProps,
            ...ownProps,
        }
    },
    {
        areStatesEqual: (x, y) =>
            x.base.choices === y.base.choices &&
            x.base.ambientSelected == y.base.ambientSelected,
        areStatePropsEqual: (x, y) =>
            x.choice === y.choice && x.ambientSelected == y.ambientSelected,
    },
)(ChoiceComponent)

const CriteriaComponent: React.FC<{
    criteria: List<string>
    criteriaLens: Lens<TimefillSelector, List<string>>
    onAddCriterion: typeof actions.addCriterion
    onRemoveCriterion: typeof actions.removeCriterion
    onChangeControl: typeof actions.changeControl
    keyb: KeyboardEvents
}> = (props) =>
    React.useMemo(
        () => (
            <section className="criteria">
                <button
                    className="add-criterion"
                    onClick={() => props.onAddCriterion({})}
                >
                    Add criterion
                </button>
                {props.criteria.map((criterion, e) => {
                    const lens: Lens<TimefillSelector, string> =
                        props.criteriaLens.compose(lensFromImplicitAccessors(e))
                    return (
                        <React.Fragment key={e}>
                            <input
                                type="text"
                                placeholder="Criterion…"
                                value={criterion}
                                onChange={(ev) => {
                                    props.onChangeControl({
                                        lens,
                                        value: ev.target.value,
                                    })
                                }}
                                {...props.keyb}
                            />
                            <button
                                className="remove-criterion"
                                onClick={() =>
                                    props.onRemoveCriterion({ index: e })
                                }
                            >
                                ❌
                            </button>
                        </React.Fragment>
                    )
                })}
            </section>
        ),
        [props.criteria],
    )

const ConnectedCriteriaComponent = connect(
    ({ base: top }: { base: TimefillSelector }) => ({ criteria: top.criteria }),
    (d: Dispatch) =>
        bindActionCreators(
            {
                onAddCriterion: actions.addCriterion,
                onRemoveCriterion: actions.removeCriterion,
                onChangeControl: actions.changeControl,
                onKeyboardAvailable: baseActions.setKeyboardAvailability,
            },
            d,
        ),
    (props, dispatch, ownProps) => {
        const criteriaLens: Lens<TimefillSelector, List<string>> = new Lens(
            (o) => o.get('criteria', undefined),
            (v) => (o) => o.set('criteria', v),
        )
        return {
            keyb: keyboardEvents(dispatch),
            criteriaLens,
            ...props,
            ...dispatch,
            ...ownProps,
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

const selectionDescriptions: { [K in ChoiceTrackSelection]: string } = {
    include: 'Included',
    exclude: 'Excluded',
    bless: 'To bless',
    curse: 'To curse',
    _cleared: 'To clear',
}

const SelectionsComponent: React.FC<{
    selected: ChoiceTrackSelection
    tracks: List<Track>
    onToggle: (tid: TrackId) => () => void
}> = (props) =>
    React.useMemo(() => {
        var tracks = null
        if (props.tracks) {
            tracks = (
                <>
                    <h3>{selectionDescriptions[props.selected]}:</h3>
                    <ul className="fuller tracklist selectable">
                        {props.tracks.map((track, e) => {
                            const onToggle = props.onToggle(track.id)
                            return (
                                <ChoiceTrackComponent
                                    key={e}
                                    selected={props.selected}
                                    {...{ track, onToggle }}
                                />
                            )
                        })}
                    </ul>
                </>
            )
        }
        return <div className="selection">{tracks}</div>
    }, [props.tracks])

export const ConnectedSelectionsComponent = connect(
    (
        top: {},
        ownProps: {
            selected: ChoiceTrackSelection
            selectionMap: { [K in ChoiceTrackSelection]: List<Track> }
        },
    ) => ({ tracks: ownProps.selectionMap[ownProps.selected] }),
    (d: Dispatch) =>
        bindActionCreators(
            {
                onToggle: actions.clearChoiceTrack,
            },
            d,
        ),
    (stateProps, dispatchProps, ownProps) => {
        return {
            onToggle: (track: TrackId) => () =>
                dispatchProps.onToggle({ track }),
            ...stateProps,
            ...ownProps,
        }
    },
)(SelectionsComponent)

const PersistSelectionsComponent: React.FC<{
    savingPlaylists: boolean
    saveAllowed: boolean
    onSave: () => void
}> = (props) =>
    React.useMemo(() => {
        var button = null
        if (props.savingPlaylists) {
            button = <PulseLoader color="darkslateblue" size="0.5em" />
        } else if (props.saveAllowed) {
            button = <button onClick={props.onSave}>Save selections</button>
        }
        return <div className="selection save-button">{button}</div>
    }, [props.savingPlaylists, props.saveAllowed])

export const ConnectedPersistSelectionsComponent = connect(
    (
        { base }: { base: TimefillSelector },
        {
            selectionMap,
        }: {
            selectionMap: { [K in ChoiceTrackSelection]: List<Track> }
        },
    ) => {
        const isPopulated = (key: ChoiceTrackSelection) => {
            const m = selectionMap[key]
            return m !== undefined && !m.isEmpty()
        }
        const saveAllowed =
            isPopulated('bless') ||
            isPopulated('curse') ||
            isPopulated('_cleared')
        return {
            savingPlaylists: base.savingPlaylists,
            base,
            saveAllowed,
        }
    },
    (d: Dispatch) =>
        bindActionCreators(
            {
                onSave: actions.modifyPlaylists.request,
            },
            d,
        ),
    (props, dispatch, ownProps) => {
        const extraProps = {
            onSave: () => {
                const modifications = props.base
                    .playlistModifications()
                    .toArray()
                dispatch.onSave({ modifications })
            },
        }
        return { ...props, ...extraProps }
    },
)(PersistSelectionsComponent)

const TimefillSelectorComponent: React.FC<{
    name: string
    choices: List<Choice>
    selectState: ChoiceTrackSelection
    keyb: KeyboardEvents
    selectionMap: { [K in ChoiceTrackSelection]: List<Track> }
    onChangeName: (name: string) => void
    onSelect: () => void
}> = (props) =>
    React.useMemo(() => {
        const { selectionMap } = props
        const classes: string[] = []
        if (props.selectState !== undefined) {
            classes.push(`set-${props.selectState}`)
        }
        return (
            <div className={classes.join(' ')}>
                <ConnectedCriteriaComponent />
                <section className="controls">
                    <textarea
                        placeholder="Playlist name…"
                        onChange={(ev) => props.onChangeName(ev.target.value)}
                        value={props.name}
                        {...props.keyb}
                    />
                    <button onClick={props.onSelect}>Select new</button>
                </section>
                <section className="choices">
                    {Object.entries(selectionDescriptions).map(
                        ([_selected, _], key) => {
                            const selected = _selected as ChoiceTrackSelection
                            return (
                                <ConnectedSelectionsComponent
                                    {...{ key, selected, selectionMap }}
                                />
                            )
                        },
                    )}
                    <ConnectedPersistSelectionsComponent
                        {...{ selectionMap }}
                    />
                    {props.choices.map((pl, e) => (
                        <ConnectedChoiceComponent key={e} idxTop={e} />
                    ))}
                </section>
            </div>
        )
    }, [props.name, props.choices, props.selectState, props.selectionMap])

export const ConnectedTimefillSelectorComponent: React.FC<{}> = () => {
    const { tracks, argv, playlists } = React.useContext(InitialFetchedContext)
    const top = useSelector(({ base }: { base: TimefillSelector }) => base)
    const { name, criteria, choices } = top
    const _selectionMap = top
        .reversedSelection()
        .map((tracks) => tracks.toList().map((t) => top.tracks.get(t)))
        .toObject()
    const selectionMap = _selectionMap as {
        [K in ChoiceTrackSelection]: List<Track>
    }
    const lens: Lens<TimefillSelector, string> = new Lens(
        (o) => o.get('name', undefined),
        (v) => (o) => o.set('name', v),
    )
    const dispatch = bindActionCreators(
        {
            onChangeControl: actions.changeControl,
            onKeyboardAvailable: baseActions.setKeyboardAvailability,
            onSetHash: baseActions.setHash,
            onLoading: actions.clearAllForLoading,
            onSelect: actions.runTimefill.request,
            gotArgv: baseActions.fetchArgv.success,
            gotTracks: baseActions.fetchTracks.success,
            gotPlaylists: baseActions.fetchPlaylists.success,
        },
        useDispatch<Dispatch<AllActions>>(),
    )
    React.useEffect(() => {
        if (argv) {
            dispatch.gotArgv({ json: argv })
        }
    }, [argv])
    React.useEffect(() => {
        if (tracks) {
            dispatch.gotTracks({ tracks: [tracks.toArray()] })
        }
    }, [tracks])
    React.useEffect(() => {
        if (playlists) {
            dispatch.gotPlaylists({ json: playlists })
        }
    }, [playlists])
    const props2 = {
        top,
        name,
        criteria,
        choices,
        selectionMap,
        totalSelection: top.reversedTotalSelection(),
        allCriteria: top.allCriteria(),
        selectState: top.currentSelection(),
        onSelect: () => {
            dispatch.onLoading()
            dispatch.onSelect({
                criteria: top.allCriteria(),
                selections: top.reversedTotalSelection(),
                narrow: false,
            })
            dispatch.onSetHash()
        },
        onChangeName: (value: string) =>
            dispatch.onChangeControl({ lens, value }),
        keyb: keyboardEvents(dispatch),
    }
    return <TimefillSelectorComponent {...props2} />
}
