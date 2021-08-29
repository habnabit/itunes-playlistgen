import arrow
import attr
import click
import dataset
import discogs_client
import os
import time
from contextlib import contextmanager
from tqdm import tqdm

from .playlistgen import ppis


def log(s, **fmt):
    if fmt:
        s = s.format_map(fmt)
    tqdm.write(f'[{arrow.now().isoformat()}] {s}')


@attr.s
class Grouping:
    pid = attr.ib()
    group = attr.ib()
    tracks = attr.ib(factory=list)

    def find_likely_artist(self):
        options = {t.artist().name() for t in self.tracks}
        if len(options) == 1:
            return options.pop()


@attr.s
class RateLimiter:
    fetcher = attr.ib()
    bar = attr.ib(default=None)

    @property
    def rate_limit(self):
        return int(self.fetcher.rate_limit)

    @property
    def rate_limit_used(self):
        return int(getattr(self.fetcher, 'rate_limit_used', 0))

    @property
    def rate_limit_remaining(self):
        return int(getattr(self.fetcher, 'rate_limit_remaining', -1))

    def seconds_per(self, n_requests):
        return (n_requests * 60) / self.rate_limit

    def fetch(self, client, method, url, data=None, headers=None, json=True):
        while True:
            before = self.rate_limit_used
            content, status_code = self.fetcher.fetch(
                client, method, url, data, headers, json)
            if self.bar is not None:
                self.bar.set_description(f'rate limit at {self.rate_limit_remaining}')

            if status_code == 429:
                log('hit a 429; sleeping')
                time.sleep(25)
                continue

            after = self.rate_limit_used
            total_used = after - before
            if self.seconds_per(self.rate_limit_remaining) < 25:
                log('rate limit too low; sleeping')
                time.sleep(5)
            elif total_used > 0:
                seconds_to_wait = self.seconds_per(total_used)
                time.sleep(seconds_to_wait)
            return content, status_code


class Ambiguous(Exception):
    pass


def big_prime(n):
    start = int.from_bytes(os.urandom((n // 8) + 1), sys.byteorder)
    start &= (2 ** n) - 1
    start |= 1 << (n - 1)
    return int(gmpy_cffi.next_prime(start))


@attr.s
class Matcher:
    tracks = attr.ib()
    client = attr.ib()
    _rate_limiter = attr.ib()
    db = attr.ib()

    @classmethod
    def from_tracks(cls, tracks):
        d = discogs_client.Client(
            'playlistgen/0.1', user_token=tracks.discogs_token)
        d._fetcher = rate_limiter = RateLimiter(d._fetcher)
        click.echo('whoami: {!r}'.format(d.identity()))
        db = dataset.connect('sqlite:///discogs.db')
        return cls(tracks=tracks, client=d, rate_limiter=rate_limiter, db=db)

    @contextmanager
    def using_bar(self, bar):
        prev, self._rate_limiter.bar = self._rate_limiter.bar, bar
        with bar:
            yield bar
        self._rate_limiter.bar = prev

    def ensure_tables(self):
        self.db.create_table('albums', 'album_pid', self.db.types.text)
        self.db.create_table('album_discogs')
        self.db.create_table('artists', 'artist_pid', self.db.types.text)
        self.db.create_table('artist_discogs')
        self.db.create_table('artist_album_discogs')

    def group_by(self, attr_name):
        ret = {}
        for t in self.tracks.all_songs:
            group = getattr(t, attr_name)()
            pid = ppis(group)
            grouping = ret.get(pid)
            if grouping is None:
                grouping = ret[pid] = Grouping(pid, group)
            grouping.tracks.append(t)
        return ret

    def find_all_albums(self):
        albums = {}
        for t in self.tracks.all_songs:
            album = t.album()
            albums[album.persistentID()] = album
        return albums

    def upsert_album(self, album_group):
        album = album_group.group
        self.db.load_table('albums').upsert({
            'album_pid': album_group.pid,
            'title': album.title(),
            'artist': album.albumArtist() or album_group.find_likely_artist(),
        }, ['album_pid'])

    def refetch_albums(self):
        data_table = self.db.load_table('album_discogs')
        to_load = list(self.db.query("""
            select id, discogs_id, album_pid from album_discogs
            where discogs_id is not null
        """))
        with self.using_bar(tqdm(to_load, unit='album')) as bar:
            for album in bar:
                self._refetch_album(data_table, album)

    def _refetch_album(self, data_table, album):
        master = self.client.master(album['discogs_id'])
        try:
            master.refresh()
        except discogs_client.exceptions.HTTPError as e:
            if e.status_code != 404:
                raise
            return
        data_table.upsert({
            'id': album['id'],
            'album_pid': album['album_pid'],
            'discogs_id': master.id,
            'discogs_data': master.data,
        }, keys=['id'], types={
            'discogs_data': self.db.types.json,
        })

    def refresh_albums(self):
        data_table = self.db.load_table('album_discogs')
        to_load = list(self.db.query("""
            select albums.* from albums
            left join album_discogs using (album_pid)
            where album_discogs.id is null
        """))
        with self.using_bar(tqdm(to_load, unit='album')) as bar:
            for album in bar:
                self._refresh_album(data_table, album)

    def _refresh_album_searches(self, album):
        if not album['title']:
            return

        yield dict(
            type='master',
            release_title=album['title'],
            artist=album['artist'])

        name = '{artist} {title}'.format_map(album)
        yield dict(q=name, type='master')
        yield dict(q=name, type='release')

    def _refresh_album(self, data_table, album):
        results = []
        for kw in self._refresh_album_searches(album):
            results = self.client.search(**kw)
            if len(results) > 0:
                break
        base = {
            'album_pid': album['album_pid'],
        }
        if len(results) == 0:
            data_table.insert(base)
        else:
            for r in results:
                r.refresh()
                data_table.insert({
                    **base,
                    'discogs_id': r.id,
                    'discogs_data': r.data,
                }, types={
                    'discogs_data': self.db.types.json,
                })

    def refresh_artist_albums(self):
        data_table = self.db.load_table('artist_album_discogs')
        to_load = list(self.db.query("""
            select discogs_artist_id, artist_name
            from artists_from_albums
            group by 1, 2
        """))
        with tqdm(to_load, unit='artist') as bar:
            for row in bar:
                bar.set_description(row['artist_name'])
                self._refresh_artist_albums(
                    data_table, row['discogs_artist_id'])

    def _refresh_artist_albums(self, data_table, id):
        try:
            releases = self.client.artist(id).releases
        except discogs_client.exceptions.HTTPError as e:
            if e.status_code != 404:
                raise
            return
        with self.using_bar(tqdm(releases, leave=False, unit='album')) as bar:
            for release in bar:
                if data_table.count(resource_url=release.data['resource_url']) > 0:
                    continue
                release.refresh()
                if not any(a['id'] == id for a in release.data['artists']):
                    return
                data_table.insert({
                    'discogs_data': release.data,
                    'resource_url': release.data['resource_url'],
                }, types={
                    'discogs_data': self.db.types.json,
                })

    def refresh_artists(self):
        data_table = self.db.load_table('artist_discogs')
        to_load = list(self.db.query("""
            select artists.* from artists
            left join artist_discogs using (artist_pid)
            where artist_discogs.id is null
        """))
        bar = tqdm(to_load, unit='artist')
        for artist in bar:
            with self.rate_limited():
                self._refresh_artist(data_table, artist)
            bar.set_description(f'rate limit at {self.rate_limiter.rate_limit_remaining}')

    def _refresh_artist(self, data_table, artist):
        if artist['name']:
            results = self.client.search(artist['name'], type='artist')
        else:
            results = []
        base = {
            'artist_pid': artist['artist_pid'],
        }
        if len(results) == 0:
            data_table.insert(base)
        else:
            for r in results:
                data_table.insert({
                    **base,
                    'discogs_id': r.id,
                    'discogs_data': r.data,
                }, types={
                    'discogs_data': self.db.types.json,
                })

    def match_album(self, album):
        table = self.db.load_table('albums')
        pid = ppis(album)
        if master := table.find_one(pid=pid):
            if master['discogs_id'] and not master.get('discogs_data'):
                results = [self.client.master(master['discogs_id'])]
                results[0].refresh()
            else:
                return
        else:
            results = self.client.search(
                type='master',
                artist=album.albumArtist(),
                release_title=album.title())
        if len(results) == 0:
            table.insert({
                'pid': pid,
            })
        else:
            for master in results:
                table.insert({
                    'pid': pid,
                    'discogs_id': master.id,
                    'discogs_data': master.data,
                }, types={
                    'discogs_data': self.db.types.json,
                })
                yield master

    def find_all_artists(self):
        artists = {}
        for t in self.tracks.all_songs:
            artist = t.artist()
            artists[artist.persistentID()] = artist
        return artists

    def upsert_artist(self, artist_group):
        self.db.load_table('artists').upsert({
            'artist_pid': artist_group.pid,
            'name': artist_group.group.name(),
        }, ['artist_pid'])

    def match_artist(self, artist):
        table = self.db.load_table('artists')
        pid = ppis(artist)
        if table.find_one(pid=pid) is not None:
            return
        results = self.client.search(
            type='artist',
            artist=artist.name())
        base = {
            'pid': pid,
            'name': artist.name(),
        }
        if len(results) == 0:
            table.insert(base)
        else:
            for artist in results:
                table.insert({
                    **base,
                    'discogs_id': artist.id,
                    'discogs_data': artist.data,
                }, types={
                    'discogs_data': self.db.types.json,
                })
                yield artist

    def random_unconfirmed_albums(self):
        prime = big_prime(2)
        return self.db.query("""
            select *,
                (albums.rowid*albums.rowid
                 *albums.rowid*albums.rowid*albums.rowid
                ) % :prime modp
            from album_discogs
            join albums using (album_pid)
            where not album_discogs.confirmed
                and modp < :prime / 10
            order by modp
            limit 25
        """, prime=prime)


def run(tracks):
    m = Matcher.from_tracks(tracks)
    m.ensure_tables()
    #m.refetch_albums()
    #m.refresh_artists()
    m.refresh_artist_albums()
    return
    m.refresh_albums()
    for album in tqdm(m.group_by('album').values()):
        m.upsert_album(album)
    for artist in tqdm(m.group_by('artist').values()):
        m.upsert_artist(artist)
    # for album in tqdm(m.find_all_albums().values()):
    #     with m.rate_limited():
    #         masters = list(m.match_album(album))
    # for artist in tqdm(m.find_all_artists().values()):
    #     with m.rate_limited():
    #         artists = list(m.match_artist(artist))
