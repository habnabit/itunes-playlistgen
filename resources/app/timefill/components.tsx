import { List, Map, Set } from 'immutable'
import { Lens } from 'monocle-ts'
import * as React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { NavLink, Route, Routes } from 'react-router-dom'
import PulseLoader from 'react-spinners/PulseLoader'
import { Dispatch, bindActionCreators } from 'redux'

import { lensFromImplicitAccessors } from '../extlens'
import {
    InitialFetchedContext,
    TopPlatformContext,
    useKeyboardEvents,
} from '../meta'
import { Track, TrackId } from '../types'
import * as actions from './actions'
import {
    AllActions,
    Choice,
    ChoiceTrackSelection,
    NO_TAGS_SET,
    OldChoice,
    SelectionMap,
    Tag,
    TimefillSelector,
    isoTag,
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

const TagsComponent: React.FC<{ tags: Set<Tag> }> = ({ tags }) => (
    <ul className="tags">
        {tags.map((t) => (
            <li key={isoTag.unwrap(t)} className={isoTag.cssClass(t)}>
                {t}
            </li>
        ))}
    </ul>
)

const ChoiceTrackComponent: React.FC<{
    track: Track
    tags?: Set<Tag>
    selected: ChoiceTrackSelection
    ambient?: boolean
    onToggle?: () => void
}> = (props) =>
    React.useMemo(
        () => (
            <li
                className={[
                    ...(props.selected !== undefined &&
                    props.selected !== '_cleared'
                        ? [`sel--${props.selected}`]
                        : []),
                    ...(props.ambient ? ['ambient'] : []),
                ].join(' ')}
                onClick={() => (props.onToggle ? props.onToggle() : undefined)}
            >
                <DurationComponent duration={props.track.totalTime} />
                &nbsp;
                {props.track.title} ({props.track.album}; {props.track.artist})
                {props.tags && <TagsComponent tags={props.tags} />}
            </li>
        ),
        [props.track, props.selected, props.ambient],
    )

const useBoundDispatchForChoice = () => {
    const { savePlaylist } = React.useContext(TopPlatformContext)
    const top = useSelector((top: TimefillSelector) => top)
    const dispatch = bindActionCreators(
        {
            onToggle: actions.toggleChoiceTrack,
            onReroll: actions.runTimefill.request,
            onLoading: actions.setLoading,
            onShuffle: actions.shuffleChoice,
        },
        useDispatch(),
    )

    const lens1_: Lens<
        TimefillSelector,
        List<Choice>
    > = lensFromImplicitAccessors('choices')

    return (choice: Choice, idxTop: number) => {
        const lens: Lens<TimefillSelector, Choice> = lens1_.compose(
            lensFromImplicitAccessors(idxTop),
        )

        return {
            onToggle: (track: TrackId) => () =>
                dispatch.onToggle({ lens, track, selection: '_current' }),
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
                savePlaylist(choice.tracks.map((t) => t.id).toArray(), top.name)
            },
        }
    }
}

const ChoiceComponent: React.FC<{
    choice: Choice
    topBar: JSX.Element
    onToggle?: (t: TrackId) => () => void
}> = ({ choice, topBar, onToggle }) => {
    const top = useSelector((top: TimefillSelector) => top)
    const { ambientSelected } = top
    if (choice.loading) {
        return (
            <div className="choice loading">
                <PulseLoader color="darkslateblue" size="0.5em" />
            </div>
        )
    }

    const totalDuration = choice.tracks.reduce(
        (totalDuration, track) =>
            track ? totalDuration + track.totalTime : totalDuration,
        0,
    )
    return (
        <div className="choice">
            {topBar}
            <ol
                className={[
                    'fuller',
                    'tracklist',
                    'fade',
                    ...(onToggle ? ['selectable'] : []),
                ].join(' ')}
            >
                {choice.tracks.map((track, e) => {
                    if (!track) return
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
                            tags={top.tags.get(track.id, NO_TAGS_SET)}
                            onToggle={onToggle ? onToggle(track.id) : undefined}
                            {...{ track, selected, ambient }}
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
    const top = useSelector((top: TimefillSelector) => top)
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
        },
        useDispatch(),
    )
    const keyboardEvents = useKeyboardEvents()
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
                            {...keyboardEvents}
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
    selectionMap: { [K in ChoiceTrackSelection]: List<Track> }
}> = (props) => {
    const top = useSelector((top: TimefillSelector) => top)
    const dispatch = bindActionCreators(
        {
            onSave: actions.modifyPlaylists.request,
        },
        useDispatch(),
    )
    const isPopulated = (key: ChoiceTrackSelection) => {
        const m = props.selectionMap[key]
        return m !== undefined && !m.isEmpty()
    }
    const saveAllowed =
        isPopulated('bless') || isPopulated('curse') || isPopulated('_cleared')
    var button = null
    if (top.savingPlaylists) {
        button = <PulseLoader color="darkslateblue" size="0.5em" />
    } else if (saveAllowed) {
        button = (
            <button
                onClick={() => {
                    const modifications = top.playlistModifications().toArray()
                    dispatch.onSave({ modifications })
                }}
            >
                Save selections
            </button>
        )
    }
    return <div className="selection save-button">{button}</div>
}

export const ConnectedPersistSelectionsComponent = PersistSelectionsComponent

const TimefillSelectorComponent: React.FC<{
    top: TimefillSelector
    selectionElement: JSX.Element
}> = ({ top, selectionElement }) => {
    const { makeKeyboardEvents } = React.useContext(TopPlatformContext)
    const { name, choices } = top

    const lens: Lens<TimefillSelector, string> = new Lens(
        (o) => o.get('name', undefined),
        (v) => (o) => o.set('name', v),
    )
    const dispatch = bindActionCreators(
        {
            onInitialFetched: actions.initialFetched,
            onChangeControl: actions.changeControl,
            onLoading: actions.clearAllForLoading,
            onSelect: actions.runTimefill.request,
        },
        useDispatch<Dispatch<AllActions>>(),
    )
    const keyboardEvents = makeKeyboardEvents()
    const boundDispatchForChoice = useBoundDispatchForChoice()
    return (
        <>
            <CriteriaComponent />
            <section className="controls">
                <textarea
                    placeholder="Playlist name…"
                    onChange={(ev) =>
                        dispatch.onChangeControl({
                            lens,
                            value: ev.target.value,
                        })
                    }
                    value={name}
                    {...keyboardEvents}
                />
                <button
                    onClick={() => {
                        dispatch.onLoading()
                        dispatch.onSelect({
                            criteria: top.allCriteria(),
                            selections: top.reversedTotalSelection(),
                            narrow: false,
                        })
                    }}
                >
                    Select new
                </button>
            </section>
            <section className="choices">
                {selectionElement}
                {choices.map((pl, e) => {
                    const bound = boundDispatchForChoice(pl, e)
                    return (
                        <React.Fragment key={e}>
                            <ChoiceComponent
                                choice={pl}
                                onToggle={bound.onToggle}
                                topBar={
                                    <div className="actions">
                                        <button
                                            onClick={() => bound.onReroll()}
                                        >
                                            Reroll
                                        </button>
                                        <button
                                            onClick={() => bound.onShuffle()}
                                        >
                                            Shuffle
                                        </button>
                                        <button onClick={() => bound.onSave()}>
                                            Save
                                        </button>
                                    </div>
                                }
                            />
                        </React.Fragment>
                    )
                })}
            </section>
        </>
    )
}

const TagsStyleComponent: React.FC<{
    tagColors: Map<Tag, string>
}> = ({ tagColors }) => {
    const pieces = []
    for (const [tag, color] of tagColors.toSeq()) {
        pieces.push(`.${isoTag.cssClass(tag)} { background: ${color} }`)
    }
    return <style>{pieces.join('\n')}</style>
}

const TagDescriptionComponent: React.FC<{
    roundHistory: {
        tag: Tag
        color: string
        roundSeq: List<string>
        timesSeen: number
        nRounds: number
    }[]
}> = ({ roundHistory }) => (
    <dl className="tag-exp">
        {roundHistory.map(({ tag, color, roundSeq, timesSeen, nRounds }, e) => (
            <React.Fragment key={e}>
                <dt style={{ background: color }}>
                    {isoTag.prefixed(tag)}{' '}
                    <em>
                        ({timesSeen} tracks {nRounds} rounds)
                    </em>
                </dt>
                <dd>
                    {roundSeq.map((round, ve) => (
                        <span key={ve} style={{ background: round }}>
                            {ve}
                        </span>
                    ))}
                </dd>
            </React.Fragment>
        ))}
    </dl>
)

const OldChoicesComponent: React.FC<{
    top: TimefillSelector
}> = ({ top }) => {
    const { oldChoices, tracks } = top
    return (
        <section className="choices">
            {oldChoices
                .sortBy((c) => c.name)
                .map((c, e) => (
                    <ChoiceComponent
                        key={e}
                        choice={
                            new Choice({
                                tracks: c.tracks.map((tid) => tracks.get(tid)),
                            })
                        }
                        topBar={<h3 className="previous">{c.name}</h3>}
                    />
                ))}
        </section>
    )
}

const TimefillRouter: React.FC<{}> = () => {
    const { tracks, argv, playlists } = React.useContext(InitialFetchedContext)
    const { keyboard } = React.useContext(TopPlatformContext)
    const dispatch = bindActionCreators(
        {
            onInitialFetched: actions.initialFetched,
            onUpdatedKeys: actions.updateKeys,
        },
        useDispatch<Dispatch<AllActions>>(),
    )
    React.useEffect(() => {
        dispatch.onInitialFetched({ argv, tracks, playlists })
    }, [argv !== undefined && tracks !== undefined && playlists !== undefined])
    React.useEffect(() => {
        dispatch.onUpdatedKeys({ keysDown: keyboard.keysDown })
    }, [keyboard.keysDown])
    const top = useSelector((top: TimefillSelector) => top)
    const { tagColors, roundHistory } = React.useMemo(
        () => top.matchTagsToColors(),
        [top.tags, top.tracks],
    )

    const reversedSelection = top.reversedSelection()
    const selectionElement = React.useMemo(() => {
        const _selectionMap = reversedSelection
            .map((tracks) => tracks.toList().map((t) => top.tracks.get(t)))
            .toObject()
        const selectionMap = _selectionMap as SelectionMap
        return (
            <>
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
                <ConnectedPersistSelectionsComponent {...{ selectionMap }} />
            </>
        )
    }, [reversedSelection])

    const selectState = top.currentSelection
    return (
        <div
            className={[...(selectState ? [`set--${selectState}`] : [])].join(
                ' ',
            )}
        >
            <TagsStyleComponent tagColors={tagColors} />
            <ul className="navbar">
                <li>
                    <NavLink to="">select</NavLink>
                </li>
                <li>
                    <NavLink to="tags">tags</NavLink>
                </li>
                <li>
                    <NavLink to="previous">previous selections</NavLink>
                </li>
            </ul>
            <Routes>
                <Route
                    path=""
                    element={
                        <TimefillSelectorComponent
                            top={top}
                            selectionElement={selectionElement}
                        />
                    }
                />
                <Route
                    path="tags"
                    element={
                        <TagDescriptionComponent roundHistory={roundHistory} />
                    }
                />
                <Route
                    path="previous"
                    element={React.useMemo(
                        () => (
                            <OldChoicesComponent top={top} />
                        ),
                        [top.oldChoices, top.tracks],
                    )}
                />
            </Routes>
        </div>
    )
}

export const ConnectedTimefillSelectorComponent = TimefillRouter
