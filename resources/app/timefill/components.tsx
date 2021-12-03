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

const ChoiceComponent: React.FC<{ idxTop: number }> = (props) => {
    const top = useSelector(({ base }: { base: TimefillSelector }) => base)
    const { ambientSelected } = top
    const choice = top.choices.get(props.idxTop)
    const dispatch = bindActionCreators(
        {
            onToggle: actions.toggleChoiceTrack,
            onReroll: actions.runTimefill.request,
            onLoading: actions.setLoading,
            onShuffle: actions.shuffleChoice,
            onSave: baseActions.savePlaylist.request,
        },
        useDispatch(),
    )

    const lens1_: Lens<
        TimefillSelector,
        List<Choice>
    > = lensFromImplicitAccessors('choices')
    const lens: Lens<TimefillSelector, Choice> = lens1_.compose(
        lensFromImplicitAccessors(props.idxTop),
    )

    const bound = {
        onToggle: (track: TrackId) => () => dispatch.onToggle({ lens, track }),
        onReroll: () => {
            const selections = top.reversedTotalSelection()
            dispatch.onLoading({ lens, loading: true })
            dispatch.onReroll({
                criteria: top.allCriteria(),
                selections,
                narrow: true,
                replace: lens,
            })
        },
        onShuffle: () => {
            dispatch.onShuffle({ lens })
        },
        onSave: () => {
            dispatch.onSave({ name: top.name, tracks: choice.tracks })
        },
    }
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
                <button onClick={() => bound.onReroll()}>Reroll</button>
                <button onClick={() => bound.onShuffle()}>Shuffle</button>
                <button onClick={() => bound.onSave()}>Save</button>
            </div>
            <ol className="fuller tracklist selectable fade">
                {choice.tracks.map((track, e) => {
                    const onToggle = bound.onToggle(track.id)
                    var selected = choice.selected.get(track.id)
                    var ambient = false
                    if (
                        selected === undefined &&
                        (selected = ambientSelected.get(track.id)) !== undefined
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
}

const CriteriaComponent: React.FC<{}> = () => {
    const top = useSelector(({ base }: { base: TimefillSelector }) => base)
    const criteria = top.allCriteria()
    const criteriaLens: Lens<TimefillSelector, List<string>> = new Lens(
        (o) => o.get('criteria', undefined),
        (v) => (o) => o.set('criteria', v),
    )
    const dispatch = bindActionCreators(
        {
            onAddCriterion: actions.addCriterion,
            onRemoveCriterion: actions.removeCriterion,
            onChangeControl: actions.changeControl,
            onKeyboardAvailable: baseActions.setKeyboardAvailability,
        },
        useDispatch(),
    )
    return (
        <section className="criteria">
            <button
                className="add-criterion"
                onClick={() => dispatch.onAddCriterion({})}
            >
                Add criterion
            </button>
            {criteria.map((criterion, e) => {
                const lens: Lens<TimefillSelector, string> =
                    criteriaLens.compose(lensFromImplicitAccessors(e))
                return (
                    <React.Fragment key={e}>
                        <input
                            type="text"
                            placeholder="Criterion…"
                            value={criterion}
                            onChange={(ev) => {
                                dispatch.onChangeControl({
                                    lens,
                                    value: ev.target.value,
                                })
                            }}
                            {...keyboardEvents(dispatch)}
                        />
                        <button
                            className="remove-criterion"
                            onClick={() =>
                                dispatch.onRemoveCriterion({ index: e })
                            }
                        >
                            ❌
                        </button>
                    </React.Fragment>
                )
            })}
        </section>
    )
}

const selectionDescriptions: { [K in ChoiceTrackSelection]: string } = {
    include: 'Included',
    exclude: 'Excluded',
    bless: 'To bless',
    curse: 'To curse',
    _cleared: 'To clear',
}

const SelectionsComponent: React.FC<{
    selected: ChoiceTrackSelection
    selectionMap: { [K in ChoiceTrackSelection]: List<Track> }
}> = (props) => {
    var ownTracks = props.selectionMap[props.selected]
    var dispatch = bindActionCreators(
        {
            onToggle: actions.clearChoiceTrack,
        },
        useDispatch(),
    )
    var tracks = null
    if (ownTracks) {
        tracks = (
            <>
                <h3>{selectionDescriptions[props.selected]}:</h3>
                <ul className="fuller tracklist selectable">
                    {ownTracks.map((track, e) => {
                        const onToggle = (
                            (track: TrackId) => () =>
                                dispatch.onToggle({ track })
                        )(track.id)
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
}

export const ConnectedSelectionsComponent = SelectionsComponent

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
                <CriteriaComponent />
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
                        <ChoiceComponent key={e} idxTop={e} />
                    ))}
                </section>
            </div>
        )
    }, [props.name, props.choices, props.selectState, props.selectionMap])

const _ConnectedTimefillSelectorComponent: React.FC<{}> = () => {
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

export const ConnectedTimefillSelectorComponent =
    _ConnectedTimefillSelectorComponent
