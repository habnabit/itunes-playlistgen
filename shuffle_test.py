import random
import pprint

import attr


def build_sets(albums):
    albums = list(albums)
    n_albums = len(albums)
    ret = []

    def pick():
        return albums.pop(random.randrange(len(albums)))

    cur = {pick(), pick()}
    while cur:
        ret.append(frozenset(cur))
        add_item = (
            albums and
            (len(cur) == 1 or random.randrange(n_albums) > len(cur)))
        if add_item:
            cur.add(pick())
        else:
            cur.remove(random.sample(cur, 1)[0])

    return ret


@attr.s
class Step(object):
    added = attr.ib()
    removed = attr.ib()
    current = attr.ib()


def stepped_difference(sets):
    return [
        Step(added=b - a, removed=a - b, current=b)
        for a, b in zip([frozenset()] + sets, sets + [frozenset()])
    ]


_albums = range(1, 6)
_sets = build_sets(_albums)
pprint.pprint(_sets)
pprint.pprint(stepped_difference(_sets))
