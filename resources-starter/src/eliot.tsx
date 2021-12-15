import * as React from 'react'

import { CountUpFrom, DateBetween } from './timer'
import { List, Map, Record, Set } from 'immutable'
import { Newtype, iso } from 'newtype-ts'
import axios, { AxiosResponse } from 'axios'

import BounceLoader from 'react-spinners/BounceLoader'
import { CustomError } from 'ts-custom-error'
import { DateTime } from 'luxon'
import { useQuery } from 'react-query'

export interface Uuid
    extends Newtype<{ readonly Uuid: unique symbol }, string> {}
export const isoUuid = iso<Uuid>()

type TaskCommon = {
    task_uuid: Uuid
    task_level: number[]
    timestamp: number
}

export type ActionStatus = 'started' | 'succeeded' | 'failed'

type ActionKey = {
    action_status: ActionStatus
    action_type: string
}

type MessageKey = {
    message_type: string
}

export type TaskKey = ActionKey | MessageKey
export type Task = TaskCommon & TaskKey

const knownKeys = Set<string>([
    'task_uuid',
    'task_level',
    'timestamp',
    'action_status',
    'action_type',
    'message_type',
])

export class TaskKeyRecord extends Record({
    action_status: undefined as ActionStatus,
    action_type: undefined as string,
    message_type: undefined as string,
}) {
    name(): string {
        if (this.action_type !== undefined) {
            return `${this.action_type}(${this.action_status})`
        }
        return this.message_type ?? '¿unknown?'
    }

    asKey(): TaskKey {
        return this.toObject()
    }
}

type SpecificTask =
    | {
          action_type: 'plg:search_criteria:iter'
          n: number
          of_n: number
      }
    | { message_type: 'plg:search_criteria:prune:scan'; scores: number[] }
    | {
          message_type: 'plg:search_criteria:readd'
          readds: number
          of_n: number
          mercy: boolean
      }

export class TaskRecord extends Record({
    key: new TaskKeyRecord(),
    uuid: undefined as Uuid,
    level: List<number>(),
    when: undefined as DateTime,
    _raw: undefined as Task,
}) {
    constructor(task: Task) {
        super({
            key: new TaskKeyRecord(task),
            uuid: task.task_uuid,
            level: List(task.task_level),
            when: DateTime.fromSeconds(task.timestamp),
            _raw: task,
        })
    }

    asSpecificTask(): SpecificTask {
        return this._raw as any
    }

    asElement(): JSX.Element {
        const t = this.asSpecificTask()
        if ('action_type' in t) {
            switch (t.action_type) {
                case 'plg:search_criteria:iter': {
                    const n = t.n + 1
                    return (
                        <div
                            className={[
                                'progress',
                                ...(n == t.of_n ? ['full'] : []),
                            ].join(' ')}
                        >
                            <div
                                style={{
                                    width: `${(n * 100) / t.of_n}%`,
                                }}
                            >
                                <span>{n}</span>
                            </div>
                        </div>
                    )
                }
            }
        } else if ('message_type' in t) {
            switch (t.message_type) {
                case 'plg:search_criteria:prune:scan': {
                    const max = t.scores[0]
                    const mean =
                        t.scores.reduce((a, b) => a + b, 0) / t.scores.length
                    const fivePMax = max * 0.25
                    const fivePScores = t.scores.filter((n) => n > fivePMax)
                    const omitted = t.scores.length - fivePScores.length
                    return (
                        <>
                            scores from {max.toFixed(2)} ～{mean.toFixed(2)}{' '}
                            <br />[
                            {fivePScores.map((s) => s.toFixed(2)).join(', ')}
                            {omitted > 0 ? (
                                <>
                                    , .. <em>omitting {omitted}</em>
                                </>
                            ) : undefined}
                            ]
                        </>
                    )
                }
                case 'plg:search_criteria:readd': {
                    return (
                        <div
                            className={[
                                'progress',
                                ...(t.mercy ? ['mercied'] : []),
                            ].join(' ')}
                        >
                            <div
                                style={{
                                    width: `${(t.readds * 100) / t.of_n}%`,
                                }}
                            >
                                <span>{t.readds}</span>
                            </div>
                        </div>
                    )
                }
            }
        }
        const entries = Object.entries(t).filter(
            ([key, _]) => !knownKeys.has(key),
        )
        entries.sort(([a, _], [b, __]) => a.localeCompare(b))
        return <>{JSON.stringify(Object.fromEntries(entries))}</>
    }
}

var UGH_COUNTER = 0

export class PendingAction extends Record({
    currentLevel: 0,
    source: undefined as TaskRecord,
    doneAsOf: undefined as TaskRecord | undefined,
    lastOf: Map<TaskKeyRecord, TaskRecord>(),
    innerActions: List<PendingAction>(),
    nActionsToPreserve: 5,
}) {
    constructor(task: TaskRecord, currentLevel?: number) {
        super({ source: task, currentLevel: currentLevel ?? task.level.size })
    }

    gotNewTask(task: TaskRecord): this {
        const lastOf = this.lastOf.set(task.key, task)
        var { innerActions, doneAsOf, nActionsToPreserve } = this
        innerActions = innerActions.flatMap((i) => {
            if (i.doneAsOf === undefined) {
                i = i.gotNewTask(task)
            }
            return i.doneAsOf === undefined || --nActionsToPreserve >= 0
                ? [i]
                : []
        })
        switch (task.key.action_status) {
            case 'started': {
                if (
                    (!this.source || this.source.uuid === task.uuid) &&
                    task.level.size === this.currentLevel + 1
                ) {
                    innerActions = innerActions.unshift(new PendingAction(task))
                }
                break
            }
            case 'failed':
            case 'succeeded': {
                if (
                    this.source &&
                    this.source.uuid === task.uuid &&
                    task.level.size <= this.currentLevel
                ) {
                    if (this.source.key.action_type !== task.key.action_type) {
                        // this means that we lost some events; i.e. this event is resolving one whose started event was lost. but.. do nothing at the moment
                    }
                    // this action has ended
                    doneAsOf = task
                }
                break
            }
            default: {
            }
        }
        return this.merge({ lastOf, innerActions, doneAsOf })
    }

    asElement({ showLastOfDepth } = { showLastOfDepth: 1 }): JSX.Element {
        return (
            <div className="pending">
                me is {this.currentLevel} {(this.source?.level ?? List()).size}{' '}
                {this.source?.uuid}
                {showLastOfDepth > 0 && (
                    <dl>
                        {this.lastOf
                            .keySeq()
                            .sort()
                            .map((taskKey, key) => {
                                const m = this.lastOf.get(taskKey)
                                return (
                                    <React.Fragment key={key}>
                                        <dt>{taskKey.name()}</dt>
                                        <dd>{m.asElement()}</dd>
                                    </React.Fragment>
                                )
                            })}
                    </dl>
                )}
                <ul>
                    {this.innerActions.map((pending, key) => (
                        <li key={key}>
                            {pending.asIcon()}&nbsp;
                            {pending.source.key.name()}:&nbsp;
                            {pending.source.asElement()}
                            {pending.asElement({
                                showLastOfDepth: showLastOfDepth - 1,
                            })}
                        </li>
                    ))}
                </ul>
            </div>
        )
    }

    asIcon(): JSX.Element {
        const loaderProps =
            this.doneAsOf === undefined
                ? {
                      color: 'orange',
                  }
                : this.doneAsOf.key.action_status === 'succeeded'
                ? {
                      color: 'olivedrab',
                      speedMultiplier: 0,
                  }
                : this.doneAsOf.key.action_status === 'failed'
                ? {
                      color: 'orangered',
                      speedMultiplier: 0,
                  }
                : {
                      color: 'gray',
                      speedMultiplier: 1.5,
                  }
        return (
            <>
                <div className="loading-circle">
                    <BounceLoader size="100%" {...loaderProps} />
                </div>
                {this.doneAsOf === undefined ? (
                    <CountUpFrom when={this.source.when} />
                ) : (
                    <DateBetween
                        from={this.source.when}
                        to={this.doneAsOf.when}
                    />
                )}
            </>
        )
    }
}

export class OpenLog extends Record({
    linesSeen: 0,
    pending: Map<Uuid, PendingAction>(),
}) {
    gotNewTasks(lines: Task[]): this {
        var { linesSeen, pending } = this
        for (const m of lines) {
            ++linesSeen
            const rec = new TaskRecord(m)
            pending = pending.update(
                rec.uuid,
                undefined,
                // pin the root depth to 1, because this might be the first event _seen_ with this uuid, but not actually the root event. by setting the depth, this controls which nested tasks are picked up and which resolve it.
                (i = new PendingAction(rec, 1)) => i.gotNewTask(rec),
            )
        }
        return this.merge({ linesSeen, pending })
    }
}

export const LogComponent: React.FC<{}> = () => {
    const [logLines, dispatch] = React.useReducer(
        (openLog: OpenLog, tasks: Task[]) => openLog.gotNewTasks(tasks),
        new OpenLog(),
    )

    const lastLog = useQuery(
        'lastLog',
        () => axios.post<{ eliot: Task[] }>('/_api/messages/with-reset'),
        {
            refetchInterval: 50,
            onSuccess: ({ data }) => dispatch(data.eliot),
        },
    )

    return (
        <>
            <ul>
                <li>lines seen: {logLines.linesSeen}</li>
                {logLines.pending
                    .entrySeq()
                    .sortBy(([_, i]) => i.source.when)
                    .map(([uuid, i], key) => (
                        <li key={key}>
                            {i.asIcon()} {uuid}: {i.asElement()}
                        </li>
                    ))}
            </ul>
        </>
    )
}
