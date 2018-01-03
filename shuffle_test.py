import collections
import random
import pprint

import attr


def build_sets(albums):
    albums = list(albums)
    n_albums = len(albums)
    ret = []

    def pick():
        return albums.pop(random.randrange(len(albums)))

    cur = set()
    while albums or cur:
        add_item = (
            albums and
            (len(cur) <= 1 or random.randrange(n_albums) > len(cur)))
        if add_item:
            cur.add(pick())
        else:
            cur.remove(random.sample(cur, 1)[0])
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


def shuffle(album_dict):
    diffs = stepped_difference(build_sets(album_dict))
    pprint.pprint(diffs)
    ret = []
    pool = collections.Counter()

    def pick():
        album = random.choice(list(pool.elements()))
        ret.append(album_dict[album].pop(0))
        pool[album] -= 1

    for diff in diffs:
        for album in diff.added:
            pool[album] = len(album_dict[album])
        for album in diff.removed:
            print album
            while pool[album] > 0:
                pick()
            print pool

    assert sum(pool.values()) == 0
    return ret


_albums = {
    n: [(n, m) for m in xrange(random.randint(5, 15))]
    for n in range(1, 6)
}
pprint.pprint(shuffle(_albums))
