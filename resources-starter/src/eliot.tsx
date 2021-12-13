import * as React from 'react'

import { List, Map, Record, Set } from 'immutable'
import { Newtype, iso } from 'newtype-ts'
import axios, { AxiosResponse } from 'axios'

import { CustomError } from 'ts-custom-error'
import PulseLoader from 'react-spinners/PulseLoader'
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

export class TaskRecord extends Record({
    key: new TaskKeyRecord(),
    uuid: undefined as Uuid,
    level: List<number>(),
    when: undefined as Date,
    _raw: undefined as Task,
}) {
    constructor(task: Task) {
        super({
            key: new TaskKeyRecord(task),
            uuid: task.task_uuid,
            level: List(task.task_level),
            when: new Date(task.timestamp * 1000),
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
                    return (
                        <div className="progress">
                            <div
                                style={{
                                    width: `${(t.n * 100) / t.of_n}%`,
                                }}
                            >
                                <span>{t.n}</span>
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
    source: undefined as TaskRecord | undefined,
    ended: false,
    lastOf: Map<TaskKeyRecord, TaskRecord>(),
    // zero or one
    innerActions: List<PendingAction>(),
}) {
    constructor(task?: TaskRecord) {
        if (task) {
            super({ source: task, currentLevel: task.level.size })
        } else {
            super()
        }
    }

    gotNewTask(task: TaskRecord): this {
        const lastOf = this.lastOf.set(task.key, task)
        var { innerActions } = this
        var ended = false
        innerActions = innerActions.flatMap((i) => {
            const ret = i.gotNewTask(task)
            return !ret.ended ? [ret] : []
        })
        switch (task.key.action_status) {
            case 'started': {
                if (
                    (!this.source || this.source.uuid === task.uuid) &&
                    task.level.size === this.currentLevel + 1
                ) {
                    innerActions = innerActions.push(new PendingAction(task))
                }
                break
            }
            case 'failed':
            case 'succeeded': {
                if (
                    this.source &&
                    this.source.uuid === task.uuid &&
                    task.level.size === this.currentLevel
                ) {
                    // this action has ended
                    ended = true
                }
                break
            }
            default: {
            }
        }
        return this.merge({ lastOf, innerActions, ended })
    }

    asElement({ showLastOfDepth } = { showLastOfDepth: 1 }): JSX.Element {
        return (
            <div className="pending">
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
}

export class OpenLog extends Record({
    linesSeen: 0,
    pending: new PendingAction(),
}) {
    gotNewTasks(lines: Task[]): this {
        var { linesSeen, pending } = this
        for (const m of lines) {
            ++linesSeen
            pending = pending.gotNewTask(new TaskRecord(m))
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
            refetchInterval: 250,
            onSuccess: ({ data }) => dispatch(data.eliot),
        },
    )

    return (
        <>
            <ul>
                <li>lines seen: {logLines.linesSeen}</li>
            </ul>
            {logLines.pending.asElement()}
        </>
    )
}
