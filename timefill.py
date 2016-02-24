import bisect
import datetime
import itertools
import heapq
import math
import random

from backports import statistics
import applescript
import click


class IDGen(object):
    def __init__(self, cls):
        self._cls = cls

    def __getattr__(self, attr):
        r = self._cls(attr.ljust(4, ' '))
        setattr(self, attr, r)
        return r


class IDWrap(object):
    def __init__(self, idgen, obj):
        self._idgen = idgen
        self._obj = obj

    def __getattr__(self, attr):
        return self._obj[getattr(self._idgen, attr)]


typ = IDGen(applescript.AEType)


all_tracks = applescript.AppleScript("""

on run {pl, l}
    tell application "iTunes" to return (properties of tracks of (the first playlist whose name is pl) whose duration < l)
end run

""").run

fill_tracks = applescript.AppleScript("""

on run {pln, tl}
    tell application "iTunes"
        stop
        set pl to the first playlist whose name is pln
        delete tracks of pl
        repeat with t in tl
            duplicate (the first track whose persistent ID is t) to pl
        end repeat
        play pl
    end tell
end run

""").run


def search(rng, tracks, duration, fuzz, ideal_length,
           tolerance=2, n_results=10, iterations=5000):
    results = []
    iteration = [0]

    def add(tt):
        score = -statistics.pvariance(itertools.chain(
            (t[0] for t in tt),
            itertools.repeat(ideal_length, tolerance)))
        t = score, tt
        if len(results) < n_results:
            heapq.heappush(results, t)
        else:
            heapq.heappushpop(results, t)
        iteration[0] += 1
        return iteration[0] >= iterations

    def aux(tt, upper_bound, current_duration):
        track = tracks[int(rng.betavariate(1.4, 1.1) * upper_bound)]
        tt += track,
        current_duration -= track[0]
        if abs(current_duration) < fuzz:
            return add(tt)
        upper_bound = bisect.bisect_left(
            tracks, (current_duration + fuzz,), 0, upper_bound)
        return aux(tt, upper_bound, current_duration)

    while not aux((), len(tracks), duration):
        pass
    results.sort()
    return results


def seconds(s):
    return datetime.timedelta(seconds=int(s))


def show_playlists(playlists):
    for e, (score, pl) in enumerate(playlists, start=1):
        length = sum(l for l, _ in pl)
        click.secho(u'{:2}. {} ({:0.2f})'.format(e, seconds(length), score),
                    fg='green')
        for f, (_, t) in enumerate(pl, start=1):
            click.echo(
                u'    {2:2}. [{1}] {0.pArt} - {0.pnam} ({0.pAlb})'.format(
                    IDWrap(typ, t), seconds(t[typ.pDur]), f))
        click.echo('')


def choose_playlist(playlists):
    pass


def search_and_choose(*a, **kw):
    while True:
        results = search(*a, **kw)
        while True:
            show_playlists(results)
            e = click.prompt('Pick one (0 for reroll)', type=int)
            if e < 0 or e > len(results):
                click.prompt('Bad value. [press return]', prompt_suffix='')
                continue
            elif e == 0:
                break
            else:
                return results[e - 1]


@click.command(context_settings=dict(help_option_names=('-h', '--help')))
@click.option('--playlist', default='>8wk played', metavar='NAME',
              help='Playlist name.')
@click.option('--ideal-length', default=300., metavar='SECONDS',
              help='Ideal length of each track.')
@click.option('--duration', default=600, metavar='SECONDS',
              help='Total duration.')
@click.option('--fuzz', default=10, metavar='SECONDS',
              help='How much fuzz is allowed on the duration.')
def main(playlist, duration, fuzz, ideal_length):
    tracks = [(t[typ.pDur], t) for t in all_tracks(playlist, duration + fuzz)]
    click.echo('Got tracks.')
    tracks.sort()
    rng = random.Random()
    click.echo('Searching tracks.')
    _, playlist = search_and_choose(
        rng, tracks, duration, fuzz, ideal_length, n_results=6)
    fill_tracks('timefill', [t[typ.pPIS] for _, t in playlist])


main()
