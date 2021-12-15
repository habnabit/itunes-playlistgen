import * as React from 'react'

import { DateTime, Interval } from 'luxon'

export const defaultContext: {
    now: DateTime
    ticks: number
} = {
    now: DateTime.fromSeconds(978307200000),
    ticks: 0,
}

export const TimerContext = React.createContext(defaultContext)
TimerContext.displayName = 'TimerContext'

export const TimerProvider: React.FC<{}> = ({ children }) => {
    const now = DateTime.now()
    const [ticks, setTicks] = React.useState(0)
    React.useEffect(() => {
        var timer
        const msUntilMinute = 1000 - (now.toMillis() % 1000)
        setTimeout(() => {
            setTicks(1)
            timer = setInterval(() => {
                setTicks((t) => t + 1)
            }, 200)
        }, msUntilMinute)
        return () => {
            timer && clearInterval(timer)
        }
    }, [])
    return (
        <TimerContext.Provider value={{ now, ticks }}>
            {children}
        </TimerContext.Provider>
    )
}

export const DateBetween: React.FC<{ from: DateTime; to: DateTime }> = ({
    from,
    to,
}) => {
    const span = Interval.fromDateTimes(from, to)
    return <span>{span.toDuration().toISO()}</span>
}

export const CountUpFrom: React.FC<{ when: DateTime }> = ({ when }) => {
    const { now } = React.useContext(TimerContext)
    return <DateBetween from={when} to={now} />
}
