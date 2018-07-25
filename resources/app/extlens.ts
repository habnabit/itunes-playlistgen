import {List, Record} from 'immutable'
import {Lens, Index, Iso, At} from 'monocle-ts'

export function lensFromRecordProp<TProps, T extends Record<TProps>, P extends keyof TProps>(prop: P): Lens<T, TProps[P]> {
    return new Lens(r => r.get(prop, undefined), v => r => r.set(prop, v))
}

export function lensFromListIndex<T>(index: number): Lens<List<T>, T> {
    return new Lens(
        (a: List<T>) => a.get(index),
        (v: T) => (a: List<T>) => a.set(index, v))
}

export function lensFromIndex<T>(index: number): Lens<T[], T> {
    return new Lens(
        (a: T[]) => a[index],
        (v: T) => (a: T[]) => {
            let a_ = a.slice()
            a_[index] = v
            return a_
        })
}
