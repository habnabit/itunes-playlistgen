import { fromNullable } from 'fp-ts/lib/Option'
import { List, Record } from 'immutable'
import { Lens, Optional } from 'monocle-ts'

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

interface ImplicitAccessors<K, V> {
    get(key: K): V
    set(key: K, value: V): this
}

export function lensFromImplicitAccessors<K, V, T extends ImplicitAccessors<K, V>>(key: K): Lens<T, V> {
    return new Lens(o => o.get(key), v => o => o.set(key, v))
}

interface NullableImplicitAccessors<K, V> {
    get(key: K): V | undefined
    set(key: K, value: V): this
}

export function lensFromNullableImplicitAccessorsAndConstructor<K, V, T extends NullableImplicitAccessors<K, V>>(key: K, constructor: () => V): Lens<T, V> {
    return new Lens(o => o.get(key) || constructor(), (v: V) => (o: T) => o.set(key, v))
}

export function optionalFromNullableImplicitAccessors<K, V, T extends NullableImplicitAccessors<K, V>>(key: K): Optional<T, V> {
    return new Optional(o => fromNullable(o.get(key)), (v: V) => (o: T) => o.set(key, v))
}

export class ComponentLens<P, S, C extends React.Component<P, S>, A> {
    bound: Readonly<C>
    lens: Lens<S, A>

    constructor(bound: C, lens: Lens<S, A>) {
        this.bound = bound
        this.lens = lens
    }

    get(): A {
        return this.lens.get(this.bound.state)
    }

    set(v: A) {
        this.bound.setState(s => this.lens.set(v)(s))
    }

    modify(f: (x: A) => A) {
        this.bound.setState(s => this.lens.modify(f)(s))
    }

    compose<U>(over: Lens<A, U>): ComponentLens<P, S, C, U> {
        return new ComponentLens(this.bound, this.lens.compose(over))
    }
}
