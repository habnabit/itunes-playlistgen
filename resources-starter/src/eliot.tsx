import * as React from 'react'

import { List, Map, Record, Set } from 'immutable'
import { Newtype, iso } from 'newtype-ts'
import axios, { AxiosResponse } from 'axios'

import { CustomError } from 'ts-custom-error'
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
    _raw: {} as any,
}) {
    constructor(task: Task) {
        super({ key: new TaskKeyRecord(task), _raw: task })
    }

    asSpecificTask(): SpecificTask {
        return this._raw
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

export class OpenLog extends Record({
    linesSeen: 0,
    lastOf: Map<TaskKeyRecord, TaskRecord>(),
}) {
    gotNewLines(lines: Task[]): this {
        var { linesSeen } = this
        const lastOf = this.lastOf.withMutations((lastOf) => {
            for (const m of lines) {
                ++linesSeen
                const rec = new TaskRecord(m)
                lastOf.set(rec.key, rec)
            }
        })
        return this.merge({ linesSeen, lastOf })
    }
}

export const LogComponent: React.FC<{}> = () => {
    const [logLines, dispatch] = React.useReducer(
        (openLog: OpenLog, newLines) => openLog.gotNewLines(newLines),
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
        <dl>
            <dt>lines seen</dt>
            <dd>{logLines.linesSeen} lines</dd>
            {logLines.lastOf
                .keySeq()
                .sort()
                .map((taskKey, key) => {
                    const m = logLines.lastOf.get(taskKey)
                    return (
                        <React.Fragment key={key}>
                            <dt>{taskKey.name()}</dt>
                            <dd>{m.asElement()}</dd>
                        </React.Fragment>
                    )
                })}
        </dl>
    )
}
