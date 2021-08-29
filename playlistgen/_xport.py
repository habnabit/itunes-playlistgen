import attr
import click
import collections
import contextlib
import datetime
import json
import os
import pathlib
import selectors
import subprocess
import sys
import tempfile
import tqdm
from pyramid.decorator import reify

from .playlistgen import seconds


@attr.s
class UghBuffer:
    '''why am i writing this again'''
    name = attr.ib()
    fobj = attr.ib()
    bar = attr.ib()
    closed = attr.ib(default=False)
    buf = attr.ib(default=b'')
    keys = attr.ib(factory=lambda: collections.defaultdict(lambda: ''))

    def read1_then_is_closed_p(self):
        if self.closed:
            return True
        data = self.fobj.read1(65536)
        if len(data) > 0:
            self.buf += data
        else:
            self.closed = True
        return self.closed

    def latest_lines(self):
        ret = self.buf.split(b'\n')
        self.buf = ret.pop()
        return ret

    def update(self):
        for line in self.latest_lines():
            k, sep, v = line.decode().partition('=')
            self.keys[k] = v

        out_time = int(self.keys['out_time_us'] or '0') / 1_000_000
        self.bar.update(out_time - self.bar.n)


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

    @reify
    def length(self):
        return datetime.timedelta(seconds=self.track.totalTime() / 1000)

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


ONE_S = datetime.timedelta(seconds=1)

def youtube_playlist_format(songs):
    at = datetime.timedelta(0)
    ret = []
    for et in songs:
        ret.append('{} {}'.format(at - (at % ONE_S), et.track.title()))
        at += et.length
    return '\n'.join(ret)


def run(tracks, outfile):
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

    click.echo(f'*** DESC ***\n{youtube_playlist_format(songs_in_order)}\n***')

    length_s = sum(et.track.totalTime() for e in songs_in_order) / 1000

    with contextlib.ExitStack() as stack:
        tmpdir = pathlib.Path(stack.enter_context(tempfile.TemporaryDirectory()))
        concat = tmpdir / 'concat.mkv'
        os.mkfifo(concat)
        n_files = len(songs_in_order)
        filter_inputs = ''.join('[{}:a]'.format(n) for n in range(n_files))
        input_files = [x for et in songs_in_order for x in ['-i', et.location]]
        p1 = subprocess.Popen([
            'ffmpeg', '-y', *input_files,
            '-hide_banner', '-loglevel', 'warning', '-progress', 'pipe:1',
            '-filter_complex', f'{filter_inputs}concat=n={n_files}:v=0:a=1[out]',
            '-map', '[out]', '-c:a', 'flac',
            concat,
        ], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE)
        p2 = subprocess.Popen([
            'ffmpeg', '-y', '-i', concat,
            '-hide_banner', '-loglevel', 'warning', '-progress', 'pipe:1',
            '-filter_complex',
            ('[0:a]'
             'showspectrum=mode=combined:color=intensity:scale=cbrt:s=720x480'
             ',drawtext=fontcolor=white:x=10:y=10:text=beep'
             '[out]'),
            *'''

            -map [out] -map 0:a
            -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p
            -c:a libfdk_aac -profile:a aac_low -b:a 384k

            '''.split(),
            outfile,
        ], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE)

        sel = selectors.DefaultSelector()
        wrapped = {}
        for proc, name in (
                (p1, 'concat'),
                (p2, 'render'),
        ):
            bar = stack.enter_context(tqdm.tqdm(desc=name, total=length_s, unit_scale=True, unit='s'))
            ub = wrapped[name] = UghBuffer(name, proc.stdout, bar)
            sel.register(proc.stdout, selectors.EVENT_READ, ub)

        render = wrapped['render']
        render_size = stack.enter_context(tqdm.tqdm(desc='render size', unit='B', unit_scale=True, unit_divisor=1024))

        while p1.returncode is None or p2.returncode is None:
            for key, mask in sel.select():
                if key.data.read1_then_is_closed_p():
                    sel.unregister(key.fileobj)
                    continue
                key.data.update()

            render_size.set_postfix({
                k: v for k, v in render.keys.items()
                if k in {'bitrate', 'stream_0_0_q', 'speed'}
            })
            render_size.update(int(render.keys['total_size'] or '0') - render_size.n)
            p1.poll()
            p2.poll()
