import attr
import click
import collections
import json
import os
import pathlib
import subprocess
import sys
import tqdm
from pyramid.decorator import reify

from .playlistgen import seconds


class NoLocation(Exception):
    pass


@attr.s
class ExportedTrack:
    e = attr.ib()
    track = attr.ib()
    forced_location = attr.ib(default=None)

    @reify
    def location(self):
        if self.forced_location is not None:
            return self.forced_location
        p = self.track.location()
        if p is None:
            raise NoLocation('no location on', self.track.title())
        return pathlib.Path(os.fsdecode(p.fileSystemRepresentation()))

    def has_location(self):
        try:
            self.location
        except NoLocation:
            return False
        else:
            return True

    def ffprobe(self):
        proc = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', self.location],
            check=True, capture_output=True)
        return json.loads(proc.stdout)


def run(tracks):
    [playlist] = tracks.source_playlists
    songs_in_order = []
    songs_by_extension = collections.defaultdict(list)
    for e, t in enumerate(tracks.playlists_by_name[playlist].items(), start=1):
        et = ExportedTrack(e, t)
        try:
            loc = et.location
        except NoLocation:
            loc = '<<MISSING>>'
            songs_by_extension[None].append(et)
        else:
            songs_by_extension[loc.suffix].append(et)
        click.echo('  {:2}. [{}] {}\n    {}'.format(
            e, seconds([t]),
            t.title(), loc,
        ))
        songs_in_order.append(et)

    for ext, songs in songs_by_extension.items():
        click.echo('\n{} files:'.format(ext or 'Absent'))
        for et in songs:
            click.echo('  {:2}. {}'.format(et.e, et.track.title()))

    click.echo('\nBitrate:')
    for et in songs_in_order:
        try:
            probed = et.ffprobe()
        except NoLocation:
            continue
        click.echo('  {:2}. {: 7.1f} kbps'.format(et.e, float(probed['format']['bit_rate']) / 1000))

    if None in songs_by_extension:
        click.echo("\nCan't continue with absent media files.")
        sys.exit(1)
    if '.m4p' in songs_by_extension:
        click.echo("\nCan't continue with m4p media files.")
        sys.exit(1)
