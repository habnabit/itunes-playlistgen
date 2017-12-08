# -*- coding: utf-8 -*-

import bisect
import datetime
import functools
import io
import itertools
import heapq
import random

from backports import statistics
import applescript
import attr
import click
import tqdm


@attr.s
class TrackContext(object):
    source_playlist = attr.ib()
    dest_playlist = attr.ib()
    start_playing = attr.ib()

    def get_tracks(self):
        click.echo('Pulling tracks from {!r}.'.format(self.source_playlist))
        track_pids = scripts.call('all_track_pids', self.source_playlist)
        track_iter = iter(track_pids)
        ret = []
        with tqdm.tqdm(total=len(track_pids), unit='track', miniters=1) as bar:
            while True:
                batch = list(itertools.islice(track_iter, 25))
                if not batch:
                    break
                bar.update(len(batch))
                ret.extend(scripts.call('get_track_batch', batch))
        return ret

    def set_default_dest(self, name):
        if self.dest_playlist is None:
            self.dest_playlist = name

    def set_tracks(self, tracks):
        persistent_tracks = [t[typ.pPIS] for t in tracks]
        splut = self.dest_playlist.splitlines()
        click.echo('Putting {} tracks into {!r}.'.format(
            len(persistent_tracks), splut[-1]))
        scripts.call(
            'fill_tracks', splut, persistent_tracks, self.start_playing)


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

    def call(self, name, *args):
        if self._compiled is None:
            self._compiled = applescript.AppleScript(self.script)
        return self._compiled.call(name, *args)


with io.open('functions.applescript', encoding='mac-roman') as infile:
    scripts = LazyAppleScript(infile.read())


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


def unrecent_score_albums(tracks, bias_recent_adds):
    tracks = [t for t in tracks if not t.get(typ.pAnt)]
    tracks = unrecent_score_tracks(tracks, bias_recent_adds, unrecentness_days=0)
    albums = {}
    for score, track in tracks:
        key = track.get(typ.pAlb), track.get(typ.pAlA) or track.get(typ.pArt)
        if not all(key):
            continue
        albums.setdefault(key, []).append((score, track))

    ret = []
    for album_name, album_scores_tracks in albums.iteritems():
        album_scores, album_tracks = zip(*album_scores_tracks)
        album_score = statistics.mean(album_scores)
        ret.append((album_score, album_name, album_tracks))

    ret.sort()
    return ret


def pick_unrecent_albums(rng, albums, n_albums):
    bottom_score, top_score = albums[0][0], albums[-1][0]
    ret = []
    seen = set()

    for ign in range(n_albums):
        while True:
            score = rng.uniform(bottom_score, top_score)
            index = bisect.bisect_left(albums, (score,))
            if index not in seen:
                seen.add(index)
                break

        ret.append(albums[index])

    return ret


def album_track_position(track):
    return track.get(typ.pTrN), track.get(typ.pDsN)


def shuffle_together_album_tracks(rng, albums_tracks):
    albums_tracks = [
        sorted(ts, key=album_track_position, reverse=True)
        for ts in albums_tracks]

    ret = []
    while True:
        weights = [len(ts) for ts in albums_tracks]
        weight_sum = sum(weights)
        if weight_sum == 0:
            break
        value = rng.randrange(weight_sum)
        for e, weight in enumerate(weights):
            value -= weight
            if value < 0:
                break
        ret.append(albums_tracks[e].pop())

    return ret


def album_search(rng, tracks, bias_recent_adds):
    all_albums = unrecent_score_albums(tracks, bias_recent_adds)
    ret = []
    for ign in range(5):
        albums = pick_unrecent_albums(rng, all_albums, 3)
        albums_tracks = [ts for _, _, ts in albums]
        playlist = shuffle_together_album_tracks(rng, albums_tracks)
        ret.append((0, [(0, t) for t in playlist]))

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
        length = sum(t[typ.pDur] for _, t in pl)
        click.secho(u'{:2}. {} ({:0.2f})'.format(e, seconds(length), score),
                    fg='green')
        show_playlist(pl)
        click.echo('')


def search_and_choose(f):
    while True:
        results = f()
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


def delete_older(pattern, max_age):
    nesting = pattern.splitlines()
    container, pattern = nesting[:-1], nesting[-1]
    playlists = scripts.call('contained_playlists', container)
    min_date = datetime.datetime.now() - max_age
    to_delete = []
    for (name, pid) in playlists:
        playlist_date = datetime.datetime.strptime(name, pattern)
        if playlist_date < min_date:
            to_delete.append(pid)
    scripts.call('delete_playlists', to_delete)


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

    tracks.set_default_dest('timefill')
    rng = random.Random()
    search = functools.partial(
        timefill_search, rng, tracks.get_tracks(), duration, fuzz,
        ideal_length, n_results=6)
    _, playlist = search_and_choose(search)
    tracks.set_tracks(b for a, b in playlist)


@main.command('album-shuffle')
@click.pass_obj
@click.option('--bias-recent-adds/--no-bias-recent-adds', default=False,
              help='Whether to bias toward recently added songs.')
def album_shuffle(tracks, bias_recent_adds):
    """
    """

    tracks.set_default_dest('album shuffle')
    rng = random.Random()
    search = functools.partial(
        album_search, rng, tracks.get_tracks(), bias_recent_adds)
    _, playlist = search_and_choose(search)
    tracks.set_tracks(b for a, b in playlist)


@main.command('daily-unrecent')
@click.pass_obj
@click.option('--bias-recent-adds/--no-bias-recent-adds', default=False,
              help='Whether to bias toward recently added songs.')
@click.option('--unrecentness', default=35, metavar='DAYS',
              help='How long since the last play.')
@click.option('--duration', default=43200, metavar='SECONDS',
              help='Total duration.')
@click.option('--playlist-pattern', default=u'• daily\n%Y-%m-%d',
              metavar='PATTERN', help='strftime-style pattern for playlists.')
@click.option('--delete-older-than', default=None, type=int, metavar='DAYS',
              help='How old of playlists to delete.')
def daily_unrecent(tracks, bias_recent_adds, unrecentness, duration,
                   playlist_pattern, delete_older_than):
    """
    Build a playlist of non-recently played things.
    """

    date_bytes = datetime.datetime.now().strftime(
        playlist_pattern.encode('utf-8'))
    tracks.set_default_dest(date_bytes.decode('utf-8'))
    rng = random.Random()
    playlist = unrecent_search(
        rng, tracks.get_tracks(), bias_recent_adds, unrecentness, duration)
    show_playlist(playlist)
    tracks.set_tracks(b for a, b in playlist)
    if delete_older_than is not None:
        delete_older(
            playlist_pattern, datetime.timedelta(days=delete_older_than))


if __name__ == '__main__':
    main()
