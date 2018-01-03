from __future__ import print_function

import attr
import collections


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
            (len(cur) <= 2 or random.randrange(n_albums) > len(cur)))
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


if __name__ == '__main__':
    import pprint
    import random
    _symbols = list('*-=@#~')
    random.shuffle(_symbols)
    _albums = {
        n: [(n, m) for m in xrange(1, random.randint(5, 15))]
        for n in range(1, 6)
    }
    _counts = {a: len(b) for a, b in _albums.items()}
    _diffs, _shuffled = shuffle(random, _albums)
    pprint.pprint(_diffs)
    for a, b in _shuffled:
        _symbol = _symbols[a]
        print('{0:5} |{1:>{2}}'.format(a * _symbol, b * _symbol, _counts[a]))
