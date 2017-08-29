# -*- coding: utf-8 -*-

import bisect
import datetime
import itertools
import heapq
import random

from backports import statistics
import applescript
import attr
import click


@attr.s
class TrackContext(object):
    source_playlist = attr.ib()
    dest_playlist = attr.ib()
    start_playing = attr.ib()

    def get_tracks(self):
        click.echo('Pulling tracks.')
        tracks = all_tracks(self.source_playlist)
        click.echo('Got tracks.')
        return tracks

    def set_default_dest(self, name):
        if self.dest_playlist is None:
            self.dest_playlist = name

    def set_tracks(self, tracks):
        fill_tracks(
            self.dest_playlist.splitlines(),
            [t[typ.pPIS] for t in tracks],
            self.start_playing)


@attr.s
class IDGen(object):
    _cls = attr.ib()

    def __getattr__(self, attr):
        r = self._cls(attr.ljust(4, ' '))
        setattr(self, attr, r)
        return r


@attr.s
class IDWrap(object):
    _idgen = attr.ib()
    _obj = attr.ib()

    def __getattr__(self, attr):
        return self._obj[getattr(self._idgen, attr)]


typ = IDGen(applescript.AEType)


@attr.s
class LazyAppleScript(object):
    script = attr.ib()
    _compiled = attr.ib(default=None)

    def __call__(self, *args):
        if self._compiled is None:
            self._compiled = applescript.AppleScript(self.script)
        return self._compiled.run(*args)


all_tracks = LazyAppleScript("""

on run {pl}
    tell application "iTunes" to return (properties of tracks of (the first playlist whose name is pl))
end run

""")

all_tracks_under_duration = LazyAppleScript(u"""

on run {pl, l}
    tell application "iTunes" to ¬
        return (properties of tracks of (the first playlist whose name is pl) whose duration < l)
end run

""")

fill_tracks = LazyAppleScript("""

on get_playlist(pln, isf, plp)
    tell application "iTunes"
        if isf then
            try
                return the first folder playlist whose name is pln
            on error number -1728
                return make new folder playlist at plp with properties {name:pln}
            end try
        else
            try
                return the first playlist whose name is pln
            on error number -1728
                return make new playlist at plp with properties {name:pln, parent:plp}
            end try
        end if
    end tell
end get_playlist

on nested_playlist(plns)
    tell application "iTunes"
        set prev to null
        repeat with n from 1 to count of plns
            set pln to item n of plns
            set pl to my get_playlist(pln, n < (count of plns), prev)
            set prev to pl
        end repeat
    end tell
end nested_playlist

on run {plns, tl, ctrl}
    tell application "iTunes"
        if ctrl then stop
        set pl to my nested_playlist(plns)
        delete tracks of pl
        repeat with t in tl
            duplicate (the first track whose persistent ID is t) to pl
        end repeat
        if ctrl then play pl
    end tell
end run

""")


def timefill_search(rng, tracks, duration, fuzz, ideal_length,
                    tolerance=2, n_results=10, iterations=5000):
    results = []
    iteration = [0]
    tracks = [
        (t[typ.pDur], t) for t in tracks if t[typ.pDur] < duration + fuzz]
    tracks.sort()

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


def unrecent_score_tracks(tracks, bias_recent_adds, unrecentness_days):
    def date_for(t):
        return max(d for d in [t.get(typ.pPlD), t.get(typ.pSkD), t[typ.pAdd]]
                   if d is not None)

    now = datetime.datetime.now()
    unrecentness = datetime.timedelta(days=unrecentness_days)
    tracks = [(date_for(t), t) for t in tracks]
    tracks.sort()
    bounding_index = bisect.bisect_left(tracks, (now - unrecentness,))
    del tracks[bounding_index:]

    def score(last_played, track):
        score = (now - last_played).total_seconds() ** 0.5
        if bias_recent_adds:
            score /= (now - track[typ.pAdd]).total_seconds() ** 0.5
        return score

    tracks = [(score(played, track), track) for played, track in tracks]
    tracks.sort()
    scale = 1 / tracks[0][0]
    return [(scale * a, b) for a, b in tracks]


def unrecent_search(rng, tracks, bias_recent_adds, unrecentness_days,
                    duration_secs):
    tracks = unrecent_score_tracks(tracks, bias_recent_adds, unrecentness_days)
    bottom_score, top_score = tracks[0][0], tracks[-1][0]
    ret = []
    current_duration = 0
    seen = set()

    while current_duration < duration_secs:
        while True:
            score = rng.uniform(bottom_score, top_score)
            index = bisect.bisect_left(tracks, (score,))
            if index not in seen:
                seen.add(index)
                break

        track = tracks[index]
        ret.append(track)
        current_duration += track[1][typ.pDur]

    return ret


def seconds(s):
    return datetime.timedelta(seconds=int(s))


def show_stats(ts):
    scores = [a for a, b in ts]
    scores.sort()
    click.echo(
        'len {:5d} min {:8.3f} max {:8.3f} mean {:8.3f} median {:8.3f} stdev {:8.3f} pvar {:8.3f}'.format(
            len(scores), scores[0], scores[-1], statistics.mean(scores),
            statistics.median(scores), statistics.stdev(scores),
            statistics.pvariance(scores)))


def show_playlist(playlist):
    for f, (_, t) in enumerate(playlist, start=1):
        click.echo(
            u'    {2:2}. [{1}] {0.pArt} - {0.pnam} ({0.pAlb})'.format(
                IDWrap(typ, t), seconds(t[typ.pDur]), f))


def show_playlists(playlists):
    for e, (score, pl) in enumerate(playlists, start=1):
        length = sum(l for l, _ in pl)
        click.secho(u'{:2}. {} ({:0.2f})'.format(e, seconds(length), score),
                    fg='green')
        show_playlist(pl)
        click.echo('')


def timefill_search_and_choose(*a, **kw):
    while True:
        results = timefill_search(*a, **kw)
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


@click.group(context_settings=dict(help_option_names=('-h', '--help')))
@click.pass_context
@click.option('-i', '--source-playlist', default='Songs Worth Playing',
              metavar='NAME', help='Playlist from which to pull tracks.')
@click.option('-o', '--dest-playlist', metavar='NAME',
              help='Playlist into which to push tracks.')
@click.option('--start-playing/--no-start-playing', default=False,
              help='Start playing the playlist after being filled.')
def main(ctx, source_playlist, dest_playlist, start_playing):
    """
    Generate iTunes playlists in smarter ways than iTunes can.
    """

    ctx.obj = TrackContext(
        source_playlist=source_playlist, dest_playlist=dest_playlist,
        start_playing=start_playing)


@main.command()
@click.pass_obj
@click.option('--ideal-length', default=300., metavar='SECONDS',
              help='Ideal length of each track.')
@click.option('--duration', default=600, metavar='SECONDS',
              help='Total duration.')
@click.option('--fuzz', default=10, metavar='SECONDS',
              help='How much fuzz is allowed on the duration.')
def timefill(tracks, duration, fuzz, ideal_length):
    """
    Make a playlist close to some length.
    """

    rng = random.Random()
    _, playlist = timefill_search_and_choose(
        rng, tracks.get_tracks(), duration, fuzz, ideal_length, n_results=6)
    tracks.set_default_dest('timefill')
    tracks.set_tracks(b for a, b in playlist)


@main.command('daily-unrecent')
@click.pass_obj
@click.option('--bias-recent-adds/--no-bias-recent-adds', default=False,
              help='Whether to bias toward recently added songs.')
@click.option('--unrecentness', default=35, metavar='DAYS',
              help='How long since the last play.')
@click.option('--duration', default=43200, metavar='SECONDS',
              help='Total duration.')
def daily_unrecent(tracks, bias_recent_adds, unrecentness, duration):
    """
    Build a playlist of non-recently played things.
    """

    rng = random.Random()
    playlist = unrecent_search(
        rng, tracks.get_tracks(), bias_recent_adds, unrecentness, duration)
    show_playlist(playlist)
    tracks.set_default_dest(
        u'• daily\n{:%Y-%m-%d}'.format(datetime.datetime.now()))
    tracks.set_tracks(b for a, b in playlist)


if __name__ == '__main__':
    main()
