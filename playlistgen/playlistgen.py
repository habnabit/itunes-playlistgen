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
import pkg_resources
import random
import statistics
import tqdm
from pyramid.decorator import reify
from zope.interface import Interface, implementer

from . import _album_shuffle, _criteria_parser

zeroth = operator.itemgetter(0)


@attr.s
class TrackContext(object):
    source_playlist = attr.ib()
    dest_playlist = attr.ib()
    start_playing = attr.ib()
    raw_criteria = attr.ib(factory=list)
    rng = attr.ib(default=attr.Factory(random.Random))

    def get_tracklist(self, batch_size=125):
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

    @reify
    def tracklist(self):
        return self.get_tracklist()

    @reify
    def criteria(self):
        return [c.make_from_map(CRITERIA) for c in self.raw_criteria]

    def set_default_dest(self, name):
        if self.dest_playlist is None:
            self.dest_playlist = name

    def save_selection(self, selection):
        persistent_tracks = [t[typ.pPIS] for t in selection.track_objs]
        splut = self.dest_playlist.splitlines()
        click.echo('Putting {} tracks into {!r}.'.format(
            len(persistent_tracks), splut[-1]))
        scripts.call(
            'fill_tracks', splut, persistent_tracks, self.start_playing)

    def search_with_criteria(self, **kw):
        return search_criteria(self, **kw)


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


scripts = LazyAppleScript(
    pkg_resources.resource_string(__name__, 'functions.applescript').decode('mac-roman'))


def rescale_inv(value, scale, offset):
    return scale / (value + offset * math.log(scale, 10))


class ICriterion(Interface):
    def prepare(tracks):
        pass


class IScorerCriterion(ICriterion):
    def score(track_ids):
        pass


class ISelectorCriterion(ICriterion):
    def select(rng, track_ids):
        pass


@implementer(IScorerCriterion)
@attr.s
class CriterionTime(object):
    name = 'time'
    time = attr.ib(converter=float)
    scale = attr.ib(default=10, converter=float)
    offset = attr.ib(default=1, converter=float)
    at = attr.ib(default='end')
    _track_lengths = attr.ib(factory=dict)

    def prepare(self, tracks):
        for i, track in tracks.items():
            self._track_lengths[i] = track[typ.pDur]

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
            duration += self._track_lengths[t]
            delta = abs(self.time - duration)
            score = rescale_inv(delta, self.scale, self.offset)
            scores.append(score)
        return self.pick_score(scores)


@implementer(IScorerCriterion)
@attr.s
class CriterionTracks(object):
    name = 'ntracks'
    count = attr.ib(converter=int)
    power = attr.ib(default=10, converter=float)

    def prepare(self, tracks):
        pass

    def score(self, tracks):
        return self.power ** (-abs(self.count - len(tracks)))


@implementer(IScorerCriterion)
@attr.s
class CriterionAlbums(object):
    name = 'albums'
    spread = attr.ib()
    power = attr.ib(default=1, converter=float)
    _track_albums = attr.ib(factory=dict)

    def prepare(self, tracks):
        for i, track in tracks.items():
            self._track_albums[i] = track[typ.pAlb]

    def score(self, tracks):
        albums = {self._track_albums[t] for t in tracks}
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


@implementer(IScorerCriterion)
@attr.s
class CriterionTrackWeights(object):
    name = 'track-weights'
    weights = attr.ib()
    _track_weights = attr.ib(factory=dict)

    def prepare(self, tracks):
        for i, track in tracks.items():
            pid = track[typ.pPIS]
            if pid in self.weights:
                self._track_weights[i] = self.weights[pid]

    def score(self, track_indices):
        subscores = [self._track_weights.get(i, 1) for i in track_indices]
        return functools.reduce(operator.mul, subscores, 1)


@implementer(IScorerCriterion)
@attr.s
class CriterionAlbumWeights(object):
    name = 'album-weights'
    weights = attr.ib()
    _album_weights = attr.ib(factory=dict)

    def prepare(self, tracks):
        inputs = {}
        for d, w in self.weights:
            if w != '':
                inputs[d['album'], d['artist']] = float(w)

        for i, track in tracks.items():
            key = album_key(track)
            if key in inputs:
                self._album_weights[i] = inputs[key]

    def score(self, track_indices):
        subscores = [self._album_weights.get(i, 1) for i in track_indices]
        return functools.reduce(operator.mul, subscores, 1)


@implementer(ISelectorCriterion)
@attr.s
class CriterionUniform(object):
    name = 'uniform'

    def prepare(self, tracks):
        pass

    def select(self, rng, track_ids):
        yield rng.choice(tuple(track_ids))


@implementer(ISelectorCriterion)
@attr.s
class CriterionAlbumSelector(object):
    name = 'album-selection'
    spread = attr.ib()
    below = attr.ib()
    collapse = attr.ib(default=None)
    _albums = attr.ib(factory=dict)
    _albums_as_criteria = attr.ib(factory=list)

    def prepare(self, tracks):
        if self.spread != 'uniform':
            raise ValueError('uniform only for now')

        for i, track in tracks.items():
            album = self._albums.setdefault(track[typ.pAlb], {})
            album[i] = track

        if self.collapse == 'singletons':
            self._collapse_singletons()

        for album_tracks in self._albums.values():
            subcriterion = self.below.make_from_map(CRITERIA)
            subcriterion.prepare(album_tracks)
            self._albums_as_criteria.append(subcriterion)

    def _collapse_singletons(self):
        singleton_albums = [album for album, tracks in self._albums.items() if len(tracks) == 1]
        singleton_tracks = self._albums.setdefault('', {})
        for album in singleton_albums:
            singleton_tracks.update(self._albums.pop(album))

    def select(self, rng, track_ids):
        album = rng.choice(self._albums_as_criteria)
        yield from album.select(rng, track_ids)


@implementer(ISelectorCriterion)
@attr.s
class CriterionPickFrom(object):
    name = 'pick-from'
    include = attr.ib()
    _include_set = attr.ib(factory=set)

    def prepare(self, tracks):
        include_set = set(self.include)
        self._include_set = {i for i, t in tracks.items() if t[typ.pPIS] in include_set}

    def select(self, rng, track_ids):
        pick_from = list(self._include_set & track_ids)
        if pick_from:
            yield rng.choice(pick_from)


@implementer(ISelectorCriterion)
@attr.s
class CriterionArtistSelector(object):
    name = 'artist-selection'
    spread = attr.ib()
    below = attr.ib()
    _artists_as_criteria = attr.ib(factory=list)

    def prepare(self, tracks):
        if self.spread != 'uniform':
            raise ValueError('uniform only for now')

        artists = {}
        for i, track in tracks.items():
            artist = artists.setdefault(track[typ.pAlA], {})
            artist[i] = track

        for artist_tracks in artists.values():
            subcriterion = self.below.make_from_map(CRITERIA)
            subcriterion.prepare(artist_tracks)
            self._artists_as_criteria.append(subcriterion)

    def select(self, rng, track_ids):
        artist = rng.choice(self._artists_as_criteria)
        yield from artist.select(rng, track_ids)


@implementer(ISelectorCriterion)
@attr.s
class CriterionScoreUnrecent:
    name = 'score-unrecent'
    unrecentness_days = attr.ib(converter=int)
    bias_recent_adds = attr.ib(default='', converter=lambda s: s.startswith('y'))
    _scores = attr.ib(factory=list)

    def prepare(self, track_map):
        self._scores = list(
            unrecent_score_tracks(track_map, self.bias_recent_adds, self.unrecentness_days))

    def select(self, rng, track_ids):
        if not self._scores:
            return

        top_score = self._scores[-1][0]
        score = rng.uniform(0, top_score)
        score_index = bisect.bisect_left(self._scores, (score,))
        picked, i = self._scores[score_index]
        if i not in track_ids:
            return

        yield i
        width = picked if score_index == 0 else picked - self._scores[score_index - 1][0]
        chance = width / top_score
        uniform_chance = 1 / len(self._scores)
        yield Explanation(
            'score-unrecent: raw score {width:.1g}, {chance:.2%} chance; {chance_diff:+.2%} off uniform',
            dict(width=width, chance=chance, chance_diff=chance - uniform_chance))


@attr.s(frozen=True)
class Explanation:
    description = attr.ib()
    extra = attr.ib(factory=dict)

    def format(self):
        return self.description.format_map(self.extra)


@attr.s(cmp=False, hash=False)
class Selection:
    _tracklist = attr.ib()
    track_indices = attr.ib()
    scores = attr.ib(default=())
    modified_in = attr.ib(default=())
    explanations = attr.ib(default=())

    @reify
    def score(self):
        if len(self.scores) > 0:
            return functools.reduce(operator.mul, self.scores, 1)
        else:
            return 0

    def with_iteration(self, n):
        return attr.evolve(self, modified_in=self.modified_in + (n,))

    def with_selector(self, selector, rng, track_ids):
        track_indices = self.track_indices
        explanations = self.explanations
        for x in selector.select(rng, track_ids):
            if isinstance(x, Explanation):
                explanations += (x,)
            else:
                track_indices += (x,)
        return attr.evolve(self, track_indices=track_indices, explanations=explanations)

    def with_explanation(self, description, **extra):
        return attr.evolve(self, explanations=self.explanations + (Explanation(description, extra),))

    @property
    def track_objs(self):
        for i in self.track_indices:
            yield self._tracklist[i]

    @classmethod
    def from_criteria(cls, tracklist, criteria, indices, prev=None):
        kw = {
            'tracklist': tracklist,
            'track_indices': indices,
        }
        if len(indices) > 0:
            kw['scores'] = [criterion.score(indices) for criterion in criteria]
        if prev is not None:
            kw['modified_in'] = prev.modified_in
            kw['explanations'] = prev.explanations
        return cls(**kw)


def select_by_iterations(selections):
    selections = list(selections)
    seen = set()
    threshold = 0
    while selections:
        new_selections = []
        for s in selections:
            n_same = len(seen.intersection(s.modified_in))
            if n_same <= threshold:
                seen.update(s.modified_in)
                yield s
            else:
                new_selections.append(s)
        selections = new_selections
        threshold += 1


def search_criteria(tracks, tracklist=None, pull_prev=None, keep=None, n_options=None, iterations=None, mercy=None):
    rng = tracks.rng
    pull_prev = pull_prev or 25
    keep = keep or 125
    n_options = n_options or 5
    iterations = iterations or 10000
    mercy = mercy or 25
    if tracklist is None:
        tracklist = tracks.tracklist
    track_map = dict(enumerate(tracklist))
    all_indices = frozenset(track_map)
    for t in tracks.criteria:
        t.prepare(track_map)
    scorers = [t for t in tracks.criteria if IScorerCriterion.providedBy(t)]
    score_tracks = functools.partial(Selection.from_criteria, tracklist, scorers)
    selectors = [t for t in tracks.criteria if ISelectorCriterion.providedBy(t)]
    results = []

    def safe_sample(pool, n):
        return rng.sample(pool, min(len(pool), n))

    def prune():
        results_by_track_sets = {frozenset(s.track_indices): s for s in results}
        results[:] = sorted(results_by_track_sets.values(), reverse=True, key=lambda s: s.score)
        results[:] = select_by_iterations(results)
        del results[keep:]

    def an_option(prev):
        relevant_indices = all_indices.difference(prev.track_indices)
        if selectors:
            selector = rng.choice(selectors)
            prev = prev.with_selector(selector, rng, relevant_indices)
            indices = prev.track_indices
        else:
            indices = prev.track_indices + (rng.choice(relevant_indices),)
        return score_tracks(indices, prev=prev)

    previous = [score_tracks(())] * pull_prev
    readds = 0

    for n in tqdm.trange(iterations):
        if not previous:
            prune()
            previous = safe_sample(results, pull_prev)
        prev_selection = previous.pop()
        options = [an_option(prev_selection) for _ in range(n_options)]
        options = [s for s in options
                   if s.track_indices != prev_selection.track_indices
                   and s.score >= prev_selection.score]
        if options:
            results.append(rng.choice(options).with_iteration(n))
            readds = 0
        else:
            results.append(prev_selection.with_explanation(
                'readded after beating all {n_options} of its successors',
                n_options=n_options,
            ))
            readds += 1
            if readds >= mercy:
                break

    prune()
    return results


CRITERIA = {cls.name: cls for cls in [
    CriterionAlbumSelector,
    CriterionAlbumWeights,
    CriterionAlbums,
    CriterionArtistSelector,
    CriterionPickFrom,
    CriterionScoreUnrecent,
    CriterionTime,
    CriterionTrackWeights,
    CriterionTracks,
    CriterionUniform,
]}


parse_criterion = functools.partial(
    _criteria_parser.parse, valid_names=CRITERIA.keys())
parse_criterion.__name__ = 'criterion'


def unrecent_score_tracks(track_map, bias_recent_adds, unrecentness_days):
    def date_for(t):
        return max(d for d in [t.get(typ.pPlD), t.get(typ.pSkD), t[typ.pAdd]]
                   if d is not None)

    now = datetime.datetime.now()
    unrecentness = datetime.timedelta(days=unrecentness_days)
    tracklist = [(date_for(t), e, t) for e, t in track_map.items()]
    tracklist.sort(key=zeroth)
    bounding_index = bisect.bisect_left(tracklist, (now - unrecentness,))
    del tracklist[bounding_index:]

    def score(last_played, track):
        score = (now - last_played).total_seconds() ** 0.5
        if bias_recent_adds:
            score /= (now - track[typ.pAdd]).total_seconds() ** 0.5
        return score

    tracklist = [(score(played, track), e, track) for played, e, track in tracklist]
    tracklist.sort(key=zeroth)
    cumsum = 0
    for score, e, _ in tracklist:
        cumsum += score
        yield cumsum, e


def make(cls, **kw):
    cls_attrs = {f.name for f in attr.fields(cls)}
    return cls(**{k: v for k, v in kw.items() if k in cls_attrs})


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
    for album_name, album_scores_tracks in albums.items():
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


def show_selection(selection):
    for f, t in enumerate(selection.track_objs, start=1):
        click.echo(
            u'    {2:2}. [{1}] {0.pArt} - {0.pnam} ({0.pAlb})'.format(
                IDWrap(typ, t), seconds(t[typ.pDur]), f))

    for e in selection.explanations:
        click.secho(u'   ' + e.format())


def show_selections(selections):
    for e, s in enumerate(selections, start=1):
        length = sum(t[typ.pDur] for t in s.track_objs)
        click.secho(u'{:2}. {} ({})'.format(e, seconds(length), s.score),
                    fg='green')
        show_selection(s)
        click.echo('')


def search_and_choose(f):
    while True:
        results = f()
        while True:
            show_selections(results)
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
@click.option('-c', '--criterion', type=parse_criterion, multiple=True,
              help='XXX')
def main(ctx, source_playlist, dest_playlist, start_playing, criterion):
    """
    Generate iTunes playlists in smarter ways than iTunes can.
    """

    rng = random.Random()
    ctx.obj = TrackContext(
        source_playlist=source_playlist, dest_playlist=dest_playlist,
        start_playing=start_playing, raw_criteria=criterion, rng=rng)


@main.command()
@click.pass_obj
@click.option('-s', '--show', default=5, help='selections to show')
@click.option('-i', '--iterations', default=None, type=int,
              help='iterations of search')
def search(tracks, show, iterations):
    """
    Search for a playlist matching some criteria.
    """

    def search_one():
        selections = tracks.search_with_criteria(iterations=iterations)
        return selections[:show]

    selection = search_and_choose(search_one)
    tracks.save_selection(selection)


@main.command('daily-unrecent')
@click.pass_obj
@click.option('--playlist-pattern', default=u'※ Daily\n%Y-%m-%d',
              metavar='PATTERN', help='strftime-style pattern for playlists.')
@click.option('--delete-older-than', default=None, type=int, metavar='DAYS',
              help='How old of playlists to delete.')
def daily_unrecent(tracks, playlist_pattern, delete_older_than):
    """
    Build a playlist of non-recently played things.
    """

    date = datetime.datetime.now().strftime(playlist_pattern)
    tracks.set_default_dest(date)
    container = playlist_pattern.splitlines()[:-1]
    previous_pids = set(scripts.call('all_track_pids', container))
    tracklist = [t for t in tracks.tracklist if t[typ.pPIS] not in previous_pids]
    selection = tracks.search_with_criteria(
        tracklist=tracklist, pull_prev=1, keep=1, n_options=1)[0]
    show_selection(selection)
    tracks.save_selection(selection)
    if delete_older_than is not None:
        delete_older(
            playlist_pattern, datetime.timedelta(days=delete_older_than))


@main.command()
@click.pass_obj
@click.option('--listen', default='[::1]:0', metavar='HOST')
@click.argument('argv', nargs=-1)
def web(tracks, listen, argv):
    """
    Do it in a browser.
    """

    from . import playlistweb
    playlistweb.run(tracks, listen, argv)


if __name__ == '__main__':
    main()
