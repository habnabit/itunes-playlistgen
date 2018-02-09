from __future__ import print_function

import attr
import collections
import numpy as np


def build_sets(rng, albums):
    albums = list(albums)
    n_albums = len(albums)
    ret = []

    def pick():
        return albums.pop(rng.randrange(len(albums)))

    cur = set()
    while albums or cur:
        add_item = (
            albums and
            (len(cur) <= 2 or rng.randrange(n_albums) > len(cur)))
        if add_item:
            cur.add(pick())
        else:
            cur.remove(rng.sample(cur, 1)[0])
        ret.append(frozenset(cur))

    return ret


@attr.s
class Step(object):
    added = attr.ib()
    removed = attr.ib()
    current = attr.ib()


def stepped_difference(sets):
    return [
        Step(added=b - a, removed=a - b, current=b)
        for a, b in zip([frozenset()] + sets, sets)
    ]


def shuffle(rng, albums_dict):
    diffs = stepped_difference(build_sets(rng, albums_dict))
    ret = []
    pool = collections.Counter()

    def pick():
        album = rng.choice(list(pool.elements()))
        ret.append(albums_dict[album].pop(0))
        pool[album] -= 1

    for diff in diffs:
        for album in diff.added:
            pool[album] = len(albums_dict[album])
        for album in diff.removed:
            while pool[album] > 0:
                pick()

    assert sum(pool.values()) == 0
    return diffs, ret


def stretch_shuffle_picks(rng, album_lengths):
    space = max(album_lengths) * 2
    mat = np.zeros((space, len(album_lengths)), dtype=int)
    for e, album_length in enumerate(album_lengths, start=1):
        start = rng.randrange(space - album_length)
        stop = rng.randrange(start + album_length, space)
        step = float(stop - start) / album_length
        indices = np.arange(start, stop, step).astype(int)
        assert len(indices) == len(set(indices)) == album_length
        mat[indices, e - 1] = e
    flat = mat.reshape(-1)
    return mat, flat[flat > 0] - 1


def swap_a_few(rng, seq):
    n_swaps = len(seq) // 2
    indices = range(len(seq))
    for _ in range(n_swaps):
        i, j = rng.sample(indices, 2)
        seq[i], seq[j] = seq[j], seq[i]


def stretch_shuffle(rng, albums_dict):
    all_tracks = albums_dict.values()
    while True:
        try:
            _, picks = stretch_shuffle_picks(rng, [len(ts) for ts in all_tracks])
        except AssertionError:
            pass
        else:
            break
    swap_a_few(rng, picks)
    ret = [all_tracks[i].pop(0) for i in picks]
    return list(picks), ret


if __name__ == '__main__':
    import random
    _symbols = list('*-=@#~')
    random.shuffle(_symbols)
    _albums = {
        n: [(n, m) for m in range(1, random.randint(5, 15))]
        for n in range(1, 6)
    }
    _counts = {a: len(b) for a, b in _albums.items()}
    _diffs, _shuffled = stretch_shuffle(random, _albums)
    print(_diffs)
    for a, b in _shuffled:
        _symbol = _symbols[a]
        print('{0:5} |{1:>{2}}'.format(a * _symbol, b * _symbol, _counts[a]))
