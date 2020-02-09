# -*- coding: utf-8 -*-

import applescript
import attr
import bisect
import click
import collections
import datetime
import Foundation
import functools
import heapq
import iTunesLibrary
import io
import itertools
import json
import math
import numpy
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
    source_playlists = attr.ib()
    dest_playlist = attr.ib()
    start_playing = attr.ib()
    raw_criteria = attr.ib(factory=list)
    rng = attr.ib(default=attr.Factory(random.Random))

    @reify
    def library(self):
        itl, error = iTunesLibrary.ITLibrary.libraryWithAPIVersion_error_('1.0', None)
        if error is not None:
            raise RuntimeError('not sure what to do with', error)
        return itl

    @reify
    def playlists_by_id(self):
        ret = {}
        for pl in self.library.allPlaylists():
            ret[pl.persistentID()] = pl
        return ret

    @reify
    def playlists_by_name(self):
        ret = {}
        for pl in self.library.allPlaylists():
            ret[pl.name()] = pl
        return ret

    def nested_name_for(self, playlist):
        ret = []
        cur = playlist
        while cur is not None:
            ret.append(cur.name())
            cur = self.playlists_by_id.get(cur.parentID())
        return tuple(reversed(ret))

    @reify
    def playlists_by_nested_name(self):
        ret = {}
        for pl in self.library.allPlaylists():
            ret[self.nested_name_for(pl)] = pl
        return ret

    @reify
    def _playlist_hierarchy(self):
        ret = {}
        for pl in self.library.allPlaylists():
            ret.setdefault(pl.parentID(), {})[pl.name()] = pl
        return ret

    def playlist_children(self, names):
        node = None
        for name in names:
            children = self._playlist_hierarchy[node]
            node = children[name].persistentID()
        return self._playlist_hierarchy[node]

    def nested_playlist(self, names):
        *container, name = names
        return self.playlist_children(container)[name]

    def get_tracklist(self, batch_size=125):
        click.echo('Pulling tracks from {!r}.'.format(self.source_playlists))
        ret = set()
        for name in self.source_playlists:
            ret.update(self.playlists_by_name[name].items())
        return list(ret)

    @reify
    def tracklist(self):
        return self.get_tracklist()

    @reify
    def criteria(self):
        ret = [c.make_from_map(CRITERIA) for c in self.raw_criteria]
        if not any(IReducerCriterion.providedBy(c) for c in ret):
            ret.append(CriterionProduct())
        return ret

    def set_default_dest(self, name):
        if self.dest_playlist is None:
            self.dest_playlist = name

    def save_selection(self, selection):
        persistent_tracks = list(selection.track_persistent_ids)
        splut = self.dest_playlist.splitlines()
        click.echo('Putting {} tracks into {!r}.'.format(
            len(persistent_tracks), splut[-1]))
        scripts.call(
            'fill_tracks', splut, persistent_tracks, self.start_playing)

    def search_with_criteria(self, **kw):
        return search_criteria(self, **kw)


def ppis(t):
    return format(t.persistentID(), 'x')


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


class IReducerCriterion(ICriterion):
    def reduce(context):
        pass

    def format(reduced):
        pass


score_selection_ufunc = numpy.frompyfunc(
    lambda a, b: a.score(b.track_indices), 2, 1)
score_format_ufunc = numpy.frompyfunc(
    functools.partial(numpy.format_float_positional, precision=3, unique=False, fractional=False), 1, 1)
stack_format_ufunc = numpy.frompyfunc(
    '{} ({})'.format, 2, 1)


@attr.s
class ReducerContext:
    score_matrix = attr.ib()
    name_map = attr.ib()

    def named_scores(self, name):
        return self.score_matrix[:,self.name_map[name]]

    @classmethod
    def from_parts(cls, tracklist, scorers, selections):
        name_map = {}
        for e, scorer in enumerate(scorers):
            if scorer.name in name_map:
                raise ValueError('unique names only right now', scorer.name)
            name_map[scorer.name] = e

        score_matrix = score_selection_ufunc(
            numpy.array(scorers)[numpy.newaxis,:],
            numpy.array(selections)[:,numpy.newaxis],
        ).astype('float64')
        return cls(score_matrix=score_matrix, name_map=name_map)


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
            self._track_lengths[i] = track.totalTime() / 1000

    def pick_score(self, scores):
        if self.at == 'end':
            return scores[-1]
        elif self.at == 'middle':
            if len(scores) < 2:
                return 0
            return max(scores[:-1])

    def score(self, tracks):
        if len(tracks) == 0:
            return 0
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
            self._track_albums[i] = track.album().persistentID()

    def score(self, tracks):
        if len(tracks) == 0:
            return 0

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
            pid = ppis(track)
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
            album = self._albums.setdefault(track.album().persistentID(), {})
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
        self._include_set = {i for i, t in tracks.items() if ppis(t) in include_set}

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
            artist = artists.setdefault(track.album().artist().name(), {})
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


@implementer(IReducerCriterion)
@attr.s
class CriterionProduct:
    name = 'product'

    def prepare(self, track_map):
        pass

    def reduce(self, context):
        products = numpy.multiply.reduce(context.score_matrix, axis=1, keepdims=True)
        yield Explanation('{scores} = {product}', dict(inputs=context.score_matrix, products=products))
        yield products

    def format(self, reduced):
        e = reduced.explanations.explanations[0]
        scores = score_format_ufunc(e.extra['inputs'][reduced.row])
        product = score_format_ufunc(e.extra['products'][reduced.row,0])
        return e.additionally(scores=' × '.join(scores), product=product).format()


@attr.s
class RpnOp:
    name = attr.ib()
    nin = attr.ib()
    nout = attr.ib()
    func = attr.ib()


RPN_OPS = {
    op.name: op for op in [
        RpnOp('vmaximum', 1, 1, lambda s: s.max()),
        RpnOp('rank_pct', 1, 1, lambda s: s / s.max()),
        RpnOp('swap', 2, 2, lambda s: s[:,::-1]),
        RpnOp('dup', 1, 2, lambda s: s),
    ]
}


@implementer(IReducerCriterion)
@attr.s(init=False)
class CriterionRPN:
    name = 'rpn'
    operations = attr.ib()

    def __init__(self, *operations):
        self.operations = operations

    def prepare(self, track_map):
        pass

    def reduce(self, context):
        base_shape = context.score_matrix.shape[:1]
        stack = numpy.zeros(base_shape + (0,))
        all_stacks = []

        for op in self.operations:
            nout = 1
            try:
                floated = float(op)
            except ValueError:
                if op.startswith('^'):
                    to_push = context.named_scores(op[1:]).reshape(base_shape + (1,))
                else:
                    if op in RPN_OPS:
                        rpn_op = RPN_OPS[op]
                    else:
                        func = getattr(numpy, op)
                        rpn_op = RpnOp(op, func.nin, func.nout, lambda s: func.reduce(s, axis=1, keepdims=True))
                    stack, inputs = numpy.split(stack, [stack.shape[1] - rpn_op.nin], axis=1)
                    to_push = rpn_op.func(inputs)
                    nout = rpn_op.nout
            else:
                to_push = floated

            to_push = numpy.broadcast_to(to_push, base_shape + (nout,))
            all_stacks.append(to_push)
            stack = numpy.hstack((stack, to_push))

        yield Explanation('RPN: {stack}', dict(all_stacks=all_stacks))
        yield stack

    def format(self, reduced):
        e = reduced.explanations.explanations[0]
        interwoven = [
            ' '.join(itertools.chain([op], score_format_ufunc(stack[reduced.row])))
            for op, stack in zip(self.operations, e.extra['all_stacks'])
        ]
        return e.additionally(stack=' ⇢ '.join(interwoven)).format()


@attr.s(frozen=True, hash=True, repr=False)
class Score:
    _raw_scores = attr.ib(converter=tuple, default=())

    def __repr__(self):
        return '{}({!r})'.format(type(self).__name__, self._raw_scores)


@attr.s(frozen=True, eq=False, order=False)
@functools.total_ordering
class ReducedScore:
    explanations = attr.ib()
    row = attr.ib()
    sort_key = attr.ib()
    unreduced = attr.ib()
    reducer = attr.ib()

    def __str__(self):
        return self.reducer.format(self)

    def __eq__(self, other):
        if isinstance(other, ReducedScore):
            return self.sort_key == other.sort_key
        elif isinstance(other, Score):
            return self.unreduced == other
        else:
            return NotImplemented

    def __lt__(self, other):
        if isinstance(other, ReducedScore):
            return self.sort_key < other.sort_key
        elif isinstance(other, Score):
            return self.unreduced < other
        else:
            return NotImplemented


@attr.s(frozen=True)
class Explanation:
    description = attr.ib()
    extra = attr.ib(factory=dict)
    repeat = attr.ib(default=1)

    def format(self):
        ret = self.description.format_map(self.extra)
        if self.repeat > 1:
            ret = '{} (×{})'.format(ret, self.repeat)
        return ret

    def additionally(self, **kw):
        return attr.evolve(self, extra=collections.ChainMap(kw, self.extra))


@attr.s()
class Explanations:
    explanations = attr.ib(factory=list)

    def collapsed(self):
        return (
            Explanation(description, extra, sum(e.repeat for e in es))
            for (description, extra), es
            in itertools.groupby(self.explanations, lambda e: (e.description, e.extra))
        )

    def collect(self, iterable):
        for x in iterable:
            if isinstance(x, Explanation):
                self.explanations.append(x)
            else:
                yield x

    def clone(self):
        return type(self)(list(self.explanations))

    def additionally(self, *a, **kw):
        ret = self.clone()
        ret.explanations.append(Explanation(*a, **kw))
        return ret

    def __iter__(self):
        yield from self.explanations


@attr.s(cmp=False, hash=False)
class Selection:
    _tracklist = attr.ib()
    track_indices = attr.ib()
    score = attr.ib(default=Score())
    modified_in = attr.ib(default=())
    explanations = attr.ib(factory=Explanations)

    def with_iteration(self, n):
        return attr.evolve(self, modified_in=self.modified_in + (n,))

    def with_selector(self, selector, rng, track_ids):
        track_indices = self.track_indices
        explanations = self.explanations.clone()
        track_indices += tuple(x for x in explanations.collect(selector.select(rng, track_ids)))
        return attr.evolve(self, track_indices=track_indices, explanations=explanations)

    def with_explanation(self, description, **extra):
        return attr.evolve(self, explanations=self.explanations.additionally(description, extra))

    @property
    def track_objs(self):
        for i in self.track_indices:
            yield self._tracklist[i]

    @property
    def track_persistent_ids(self):
        for t in self.track_objs:
            yield ppis(t)

    @classmethod
    def from_criteria(cls, tracklist, criteria, indices, prev=None):
        kw = {
            'tracklist': tracklist,
            'track_indices': indices,
            'score': Score([criterion.score(indices) for criterion in criteria]),
        }
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
    reducers = [t for t in tracks.criteria if IReducerCriterion.providedBy(t)]
    if len(reducers) != 1:
        raise ValueError('need exactly 1 reducer')
    [reducer] = reducers
    results = []

    def safe_sample(pool, n):
        return rng.sample(pool, min(len(pool), n))

    def prune():
        results_by_track_sets = {frozenset(s.track_indices): s for s in results}
        selections = list(results_by_track_sets.values())
        context = ReducerContext.from_parts(tracklist, scorers, selections)
        explanations = Explanations()
        [reduced] = explanations.collect(reducer.reduce(context))
        for e, ([r], sel) in enumerate(zip(reduced, selections)):
            sel.score = ReducedScore(explanations, e, r, sel.score, reducer)
        results[:] = sorted(selections, reverse=True, key=lambda s: s.score)
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
    CriterionRPN,
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
    nsnow = Foundation.NSDate.date()

    def delta_for(t):
        when = max(
            d
            for d in (t.lastPlayedDate(), t.skipDate(), t.addedDate())
            if d is not None)
        return nsnow.timeIntervalSinceDate_(when)

    unrecentness = unrecentness_days * 60 * 60 * 24
    tracklist = [(delta_for(t), e, t) for e, t in track_map.items()]
    tracklist.sort(key=zeroth)
    bounding_index = bisect.bisect_left(tracklist, (unrecentness,))
    del tracklist[:bounding_index]

    def score(delta, track):
        score = delta ** 0.5
        if bias_recent_adds:
            score /= nsnow.timeIntervalSinceDate_(track.addedDate()) ** 0.5
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
    return ppis(track.album())


def album_track_position(track):
    return track.album().discNumber(), track.trackNumber()


def shuffle_together_album_tracks(rng, albums):
    albums_dict = {
        name: sorted(ts, key=album_track_position)
        for _, name, ts in albums}
    return _album_shuffle.stretch_shuffle(rng, albums_dict)


def seconds(tl):
    ms = sum(t.totalTime() for t in tl)
    return datetime.timedelta(seconds=ms / 1000)


def show_selection(selection):
    for f, t in enumerate(selection.track_objs, start=1):
        click.echo('    {:2}. [{}] {} - {} ({})'.format(
            f, seconds([t]),
            t.artist().name(), t.title(), t.album().title(),
        ))

    for e in selection.explanations.collapsed():
        click.secho(u'   ' + e.format())


def show_selections(selections):
    for e, s in enumerate(selections, start=1):
        click.secho(u'{:2}. {} ({})'.format(e, seconds(s.track_objs), s.score),
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
@click.option('-i', '--source-playlist', multiple=True, metavar='NAME',
              help='Playlist from which to pull tracks.')
@click.option('-o', '--dest-playlist', metavar='NAME',
              help='Playlist into which to push tracks.')
@click.option('--start-playing/--no-start-playing', default=False,
              help='Start playing the playlist after being filled.')
@click.option('-c', '--criterion', type=parse_criterion, multiple=True,
              help='XXX')
@click.option('-b', '--debug/--no-debug', help='install a pdb trap')
def main(ctx, source_playlist, dest_playlist, start_playing, criterion, debug):
    """
    Generate iTunes playlists in smarter ways than iTunes can.
    """

    if debug:
        import signal, pdb
        signal.signal(signal.SIGINFO, lambda *a: pdb.set_trace())

    rng = random.Random()
    ctx.obj = TrackContext(
        source_playlists=source_playlist, dest_playlist=dest_playlist,
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
    tracklist = list(set(tracks.tracklist) - set(tracks.nested_playlist(container).items()))
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


@main.command()
@click.pass_obj
@click.argument('argv', nargs=-1, type=click.UNPROCESSED)
def shell(tracks, argv):
    """
    Launch IPython.
    """

    import IPython
    IPython.start_ipython(argv=argv, user_ns={'tracks': tracks})


if __name__ == '__main__':
    main()
