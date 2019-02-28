# -*- coding: utf-8 -*-

import applescript
import attr
import bisect
import click
import collections
import datetime
import functools
import heapq
import io
import itertools
import json
import math
import operator
import random
import statistics
import tqdm

from . import _album_shuffle

zeroth = operator.itemgetter(0)


@attr.s
class TrackContext(object):
    source_playlist = attr.ib()
    dest_playlist = attr.ib()
    start_playing = attr.ib()
    score_func = attr.ib()
    rng = attr.ib(default=attr.Factory(random.Random))

    def get_tracks(self, batch_size=125):
        click.echo('Pulling tracks from {!r}.'.format(self.source_playlist))
        track_pids = scripts.call('all_track_pids', self.source_playlist)
        ret = []
        with tqdm.tqdm(total=len(track_pids), unit='track', miniters=1) as bar:
            for e in range(0, len(track_pids), batch_size):
                batch = scripts.call(
                    'get_track_batch',
                    self.source_playlist,
                    e + 1,
                    min(e + batch_size, len(track_pids)))
                bar.update(len(batch))
                ret.extend(batch)
        if {t[typ.pPIS] for t in ret} != set(track_pids):
            raise RuntimeError("track fetching didn't get the right tracks")
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

    def score_tracks(self, tracks):
        return self.score_func(tracks)


@attr.s
class IDGen(object):
    _cls = attr.ib()

    def __getattr__(self, attr):
        r = self._cls(attr.ljust(4, ' ').encode())
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
    tracks.sort(key=zeroth)

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
    results.sort(key=zeroth)
    return results


def rescale_inv(value, scale, offset):
    return scale / (value + offset * math.log(scale, 10))


@attr.s
class TargetTime(object):
    name = 'time'
    time = attr.ib(converter=float)
    scale = attr.ib(default=10, converter=float)
    offset = attr.ib(default=1, converter=float)
    at = attr.ib(default='end')

    def pick_score(self, scores):
        if self.at == 'end':
            return scores[-1]
        elif self.at == 'middle':
            if len(scores) < 2:
                return 0
            return max(scores[:-1])

    def score(self, tracks):
        scores = []
        duration = 0
        for t in tracks:
            duration += t[typ.pDur]
            delta = abs(self.time - duration)
            score = rescale_inv(delta, self.scale, self.offset)
            scores.append(score)
        return self.pick_score(scores)


@attr.s
class TargetTracks(object):
    name = 'ntracks'
    count = attr.ib(converter=int)
    power = attr.ib(default=10, converter=float)

    def score(self, tracks):
        return self.power ** (-abs(self.count - len(tracks)))


@attr.s
class TargetAlbums(object):
    name = 'albums'
    spread = attr.ib()
    power = attr.ib(default=1, converter=float)

    def score(self, tracks):
        albums = {t[typ.pAlb] for t in tracks}
        if self.spread == 'many':
            # many albums
            albums_per_track = float(len(albums)) / len(tracks)
            return albums_per_track ** self.power

        elif self.spread == 'few':
            # few albums
            tracks_per_album = float(len(tracks)) / len(albums)
            return tracks_per_album ** self.power

        elif self.spread == 'distinct':
            return 0 if len(albums) != len(tracks) else 1


@attr.s
class TargetAlbumWeights(object):
    weights = attr.ib()

    @classmethod
    def from_json(cls, data):
        parsed = json.loads(data)
        inputs = {}
        inputs['weights'] = {
            (d['album'], d['artist']): float(w) if w != '' else 1
            for d, w in parsed['weights']}
        return cls(**inputs)

    def score(self, tracks):
        subscores = [self.weights.get(album_key(t), 1) for t in tracks]
        return functools.reduce(operator.mul, subscores, 1)


def timefill_search_targets(rng, tracks, targets, pull_prev=None, keep=None, n_options=None, iterations=None, initial=()):
    pull_prev = pull_prev or 25
    keep = keep or 125
    n_options = n_options or 5
    iterations = iterations or 1000
    all_indexes = frozenset(range(len(tracks)))
    results = []

    def safe_sample(pool, n):
        return rng.sample(pool, min(len(pool), n))

    def score(indexes):
        if indexes:
            candidate = [tracks[i] for i in indexes]
            scores = [target.score(candidate) for target in targets]
            score = functools.reduce(operator.mul, scores, 1)
        else:
            scores = []
            score = 0
        return score, scores, indexes

    def prune():
        results_by_track_sets = {frozenset(i): (sc, scs, i) for sc, scs, i in results}
        results[:] = sorted(results_by_track_sets.values(), reverse=True)
        del results[keep:]

    def an_option(indexes):
        r = rng.random()
        if r < 0.95:
            n = 1 + int(math.log(19 / r / 20, 2))
            indexes = indexes + tuple(safe_sample(
                all_indexes.difference(indexes), n))
            if n > 1 and rng.random() > 0.5:
                indexes = indexes[1:]
        else:
            indexes = tuple(rng.sample(indexes, len(indexes)))
        return score(indexes)

    previous = [score(initial)] * pull_prev

    for _ in range(iterations):
        if not previous:
            prune()
            previous = safe_sample(results, pull_prev)
        prev_score, _, indexes = previous.pop()
        options = [an_option(indexes) for _ in range(n_options)]
        options = [(sc, scs, i) for sc, scs, i in options if sc >= prev_score]
        if options:
            results.append(rng.choice(options))

    prune()
    return results


TARGETS = {cls.name: (cls, True) for cls in [
    TargetTracks,
    TargetTime,
    TargetAlbums,
]}

TARGETS['album-weight'] = (TargetAlbumWeights.from_json, False)


def parse_target(value):
    target_name, _, rest = value.partition('=')
    constructor, parse_equals = TARGETS[target_name]
    if parse_equals:
        values = rest.split(',')
        first_arg = values.pop(0)
        args = [value.partition('=')[::2] for value in values]
        return constructor(first_arg, **dict(args))
    else:
        return constructor(rest)


def unrecent_score_tracks(tracks, bias_recent_adds, unrecentness_days):
    def date_for(t):
        return max(d for d in [t.get(typ.pPlD), t.get(typ.pSkD), t[typ.pAdd]]
                   if d is not None)

    now = datetime.datetime.now()
    unrecentness = datetime.timedelta(days=unrecentness_days)
    tracks = [(date_for(t), t) for t in tracks]
    tracks.sort(key=zeroth)
    bounding_index = bisect.bisect_left(tracks, (now - unrecentness,))
    del tracks[bounding_index:]

    def score(last_played, track):
        score = (now - last_played).total_seconds() ** 0.5
        if bias_recent_adds:
            score /= (now - track[typ.pAdd]).total_seconds() ** 0.5
        return score

    tracks = [(score(played, track), track) for played, track in tracks]
    tracks.sort(key=zeroth)
    scale = 1 / tracks[0][0]
    return [(scale * a, b) for a, b in tracks]


@attr.s
class ScoreUnrecent(object):
    name = 'unrecent'
    unrecentness = attr.ib()

    def score(self, tracks):
        return unrecent_score_tracks(tracks, False, self.unrecentness)


@attr.s
class ScoreUnrecentButRecentlyAdded(object):
    name = 'unrecent-but-recently-added'
    unrecentness = attr.ib()

    def score(self, tracks):
        return unrecent_score_tracks(tracks, True, self.unrecentness)


@attr.s
class ScoreUniform(object):
    name = 'uniform'
    rng = attr.ib()

    def score(self, tracks):
        tracks = list(tracks)
        self.rng.shuffle(tracks)
        return list(enumerate(tracks))


SCORING = {cls.name: cls for cls in [
    ScoreUnrecent,
    ScoreUnrecentButRecentlyAdded,
    ScoreUniform,
]}


def make(cls, **kw):
    cls_attrs = {f.name for f in attr.fields(cls)}
    return cls(**{k: v for k, v in kw.items() if k in cls_attrs})


def unrecent_search(rng, tracks, duration_secs):
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


def album_key(track):
    return track.get(typ.pAlb), track.get(typ.pAlA) or track.get(typ.pArt)


def collate_album_score(rng, tracks):
    albums = {}
    for score, track in tracks:
        key = album_key(track)
        if not all(key):
            continue
        albums.setdefault(key, []).append((score, track))

    ret = []
    for album_name, album_scores_tracks in albums.iteritems():
        album_scores, album_tracks = zip(*album_scores_tracks)
        album_score = rng.choice(album_scores)
        ret.append((album_score, album_name, album_tracks))

    ret.sort(key=lambda t: t[:2])
    return ret


def pick_albums(rng, tracks, n_albums, n_choices, iterations=10000):
    all_albums = collate_album_score(rng, tracks)
    bottom_score, top_score = all_albums[0][0], all_albums[-1][0]
    results = []

    def maybe_add(album_indices):
        if len(album_indices) < n_albums:
            return False
        elif any(not album_indices.isdisjoint(extant)
                 for _, extant, _ in results):
            return True
        albums = [all_albums[i] for i in album_indices]
        score = statistics.pvariance(
            sum(t[typ.pDur] for t in tracks)
            for _, _, tracks in albums)
        score = -math.log(score) if score != 0 else 0
        t = score, album_indices, albums
        if len(results) < n_choices:
            heapq.heappush(results, t)
        else:
            heapq.heappushpop(results, t)
        return True

    pool = [frozenset()]
    for _ in range(iterations):
        root = random.choice(pool)
        score = rng.uniform(bottom_score, top_score)
        index = bisect.bisect_left(all_albums, (score,))
        if index in root:
            continue
        cur = root | {index}
        if not maybe_add(cur):
            pool.append(cur)

    results.sort(key=lambda t: t[:2])
    return results


def album_track_position(track):
    return track.get(typ.pTrN), track.get(typ.pDsN)


def shuffle_together_album_tracks(rng, albums):
    albums_dict = {
        name: sorted(ts, key=album_track_position)
        for _, name, ts in albums}
    return _album_shuffle.stretch_shuffle(rng, albums_dict)


def filter_tracks_to_genius_albums(tracks):
    genius_track_pids = set(scripts.call('get_genius'))
    genius_albums = {
        album_key(t)
        for _, t in tracks
        if t[typ.pPIS] in genius_track_pids and typ.pAlb in t}
    return [(s, t) for s, t in tracks if album_key(t) in genius_albums]


def album_search(rng, tracks, n_albums=5, n_choices=5, source_genius=False):
    if source_genius:
        tracks = filter_tracks_to_genius_albums(tracks)
    ret = []
    all_choices = pick_albums(rng, tracks, n_albums, n_choices ** 2)
    choices = rng.sample(all_choices, min(n_choices, len(all_choices)))
    for score, _, albums in choices:
        album_names = sorted(
            album for _, (album, _), _ in albums)
        names = u' ✕ '.join(album_names) + u' ({:.2f})'.format(score)
        _, playlist = shuffle_together_album_tracks(rng, albums)
        ret.append((names, [(0, t) for t in playlist]))

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
        click.secho(u'{:2}. {} ({})'.format(e, seconds(length), score),
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
    *container, pattern = pattern.splitlines()
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
@click.option('--scoring', type=click.Choice(SCORING), default='unrecent',
              help='XXX')
@click.option('--unrecentness', default=35, metavar='DAYS',
              help='How long since the last play for unrecentness scoring.')
def main(ctx, source_playlist, dest_playlist, start_playing, scoring,
         unrecentness):
    """
    Generate iTunes playlists in smarter ways than iTunes can.
    """

    rng = random.Random()
    score_obj = make(SCORING[scoring], rng=rng, unrecentness=unrecentness)
    ctx.obj = TrackContext(
        source_playlist=source_playlist, dest_playlist=dest_playlist,
        start_playing=start_playing, score_func=score_obj.score, rng=rng)


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
    search = functools.partial(
        timefill_search, tracks.rng, tracks.get_tracks(), duration, fuzz,
        ideal_length, n_results=6)
    _, playlist = search_and_choose(search)
    tracks.set_tracks(b for a, b in playlist)


@main.command()
@click.pass_obj
@click.argument('targets', type=parse_target, nargs=-1)
def timefill_targets(tracks, targets):
    """
    Make a playlist close to some length.
    """

    tracks.set_default_dest(u'targets')
    track_list = tracks.get_tracks()

    def search():
        playlists = timefill_search_targets(tracks.rng, track_list, targets)
        return [
            ([a] + b, [(None, track_list[t]) for t in c])
            for a, b, c in reversed(playlists[:10])]

    _, playlist = search_and_choose(search)
    tracks.set_tracks(b for a, b in playlist)


@main.command('album-shuffle')
@click.pass_obj
@click.option('--playlist-pattern', default=u'※ Album Shuffle\n{now:%Y-%m-%d}: {names}',
              metavar='PATTERN',
              help='str.format-style pattern for playlists.')
@click.option('--n-albums', default=4, metavar='ALBUMS',
              help='How many albums to shuffle together.')
@click.option('--source-genius/--no-source-genius', default=False,
              help='XXX')
def album_shuffle(tracks, playlist_pattern, n_albums, source_genius):
    """
    XXX
    """

    all_tracks = tracks.score_tracks(
        t for t in tracks.get_tracks() if not t.get(typ.pAnt))
    search = functools.partial(
        album_search, tracks.rng, all_tracks, n_albums=n_albums,
        source_genius=source_genius)
    names, playlist = search_and_choose(search)
    tracks.set_default_dest(playlist_pattern.format(
        names=names, now=datetime.datetime.now()))
    tracks.set_tracks(b for a, b in playlist)


@main.command('daily-unrecent')
@click.pass_obj
@click.option('--duration', default=43200, metavar='SECONDS',
              help='Total duration.')
@click.option('--playlist-pattern', default=u'※ Daily\n%Y-%m-%d',
              metavar='PATTERN', help='strftime-style pattern for playlists.')
@click.option('--delete-older-than', default=None, type=int, metavar='DAYS',
              help='How old of playlists to delete.')
def daily_unrecent(tracks, duration, playlist_pattern, delete_older_than):
    """
    Build a playlist of non-recently played things.
    """

    date = datetime.datetime.now().strftime(playlist_pattern)
    tracks.set_default_dest(date)
    container = playlist_pattern.splitlines()[:-1]
    previous_pids = set(scripts.call('all_track_pids', container))
    tracklist = [t for t in tracks.get_tracks() if t[typ.pPIS] not in previous_pids]
    playlist = unrecent_search(
        tracks.rng, tracks.score_tracks(tracklist), duration)
    show_playlist(playlist)
    tracks.set_tracks(b for a, b in playlist)
    if delete_older_than is not None:
        delete_older(
            playlist_pattern, datetime.timedelta(days=delete_older_than))


@main.command()
@click.pass_obj
def web(tracks):
    """
    Do it in a browser.
    """

    from . import playlistweb
    playlistweb.run(tracks)


if __name__ == '__main__':
    main()
