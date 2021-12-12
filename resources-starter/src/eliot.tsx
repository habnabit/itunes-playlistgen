import * as React from 'react'

import { List, Map, Record, Set } from 'immutable'
import axios, { AxiosResponse } from 'axios'

import { useQuery } from 'react-query'

type TaskCommon = {
    task_uuid: string
    task_level: number[]
    timestamp: number
}

export type ActionStatus = 'started' | 'succeeded' | 'failed'

type Action = TaskCommon & {
    action_status: ActionStatus
    action_type: string
}

type Message = TaskCommon & {
    message_type: string
}

export type Task = Action | Message

export class OpenLog extends Record({
    linesSeen: 0,
    lastOf: Map<string, Task>(),
}) {
    gotNewLines(lines: Task[]): this {
        var { linesSeen } = this
        const lastOf = this.lastOf.withMutations((lastOf) => {
            for (const m of lines) {
                ++linesSeen
                if ('action_type' in m) {
                    lastOf.set(m.action_type, m)
                } else if ('message_type' in m) {
                    lastOf.set(m.message_type, m)
                }
            }
        })
        return this.merge({ linesSeen, lastOf })
    }
}

const knownKeys = Set<string>([
    'task_uuid',
    'task_level',
    'timestamp',
    'action_status',
    'action_type',
    'message_type',
])

const stringifyTask = (t: Task): JSX.Element => {
    if ('action_type' in t) {
        switch (t.action_type) {
            case 'plg:search_criteria:iter': {
                const payload = t as any as { n: number }
                return <>iter {payload.n}</>
            }
        }
    } else if ('message_type' in t) {
        switch (t.message_type) {
            case 'plg:search_criteria:prune:scan': {
                const payload = t as any as { scores: number[] }
                const max = payload.scores[0]
                const mean =
                    payload.scores.reduce((a, b) => a + b, 0) /
                    payload.scores.length
                const fivePMax = max * 0.25
                const fivePScores = payload.scores.filter((n) => n > fivePMax)
                const omitted = payload.scores.length - fivePScores.length
                return (
                    <>
                        scores from {max.toFixed(2)} ～{mean.toFixed(2)} <br />[
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
    const entries = Object.entries(t).filter(([key, _]) => !knownKeys.has(key))
    entries.sort(([a, _], [b, __]) => a.localeCompare(b))
    return <>{JSON.stringify(Object.fromEntries(entries))}</>
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
                .map((name, key) => {
                    const m = logLines.lastOf.get(name)
                    return (
                        <React.Fragment key={key}>
                            <dt>{name}</dt>
                            <dd>{stringifyTask(m)}</dd>
                        </React.Fragment>
                    )
                })}
        </dl>
    )
}
