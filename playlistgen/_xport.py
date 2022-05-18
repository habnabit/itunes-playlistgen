import attr
import click
import collections
import contextlib
import datetime
import decimal
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

ONE_S = datetime.timedelta(seconds=1)
S_QUANT = decimal.Decimal('1')
US_QUANT = S_QUANT / 1_000_000
# sectors are 75⁻¹s but 3 is an annoying factor
SECTORS_MULT = (decimal.Decimal(1) / 25).quantize(US_QUANT)
SECTORS_INV_US = 1_000_000 * SECTORS_MULT


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

        if self.keys['progress'] == 'end':
            self.bar.n = self.bar.total
            self.bar.update(0)
        else:
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

    # unify these lengths but keep the distinction between "calls ffmpeg" and not?
    @reify
    def length_seconds(self):
        return self.track.totalTime() / 1000

    @reify
    def length(self):
        return datetime.timedelta(seconds=self.length_seconds)

    @reify
    def exact_length(self):
        return decimal.Decimal(self.ffprobed['format']['duration'])

    @reify
    def length_sectors(self):
        return (self.exact_length / SECTORS_MULT).quantize(S_QUANT, rounding=decimal.ROUND_UP)

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

    @reify
    def ffprobed(self):
        return self.ffprobe()


@attr.s
class ConcatFilters:
    filters = attr.ib(factory=list)
    outputs = attr.ib(factory=list)

    def filter_arg(self):
        concat_inputs = ''.join('[{}]'.format(out) for out in self.outputs)
        filters = [
            *self.filters,
            f'{concat_inputs}concat=n={len(self.outputs)}:v=0:a=1[out]',
        ]
        return ','.join(filters)


@attr.s
class SpectrogramRenderer:
    outdir = attr.ib()
    songs = attr.ib()

    @reify
    def video_out(self):
        return self.outdir / 'video.mkv'

    @reify
    def playlist_desc_out(self):
        return self.outdir / 'youtube-playlist.txt'

    def playlist_desc_text(self):
        at = datetime.timedelta(0)
        ret = []
        for et in self.songs:
            ret.append('{} {}'.format(at - (at % ONE_S), et.track.title()))
            at += et.length
        return '\n'.join(ret)

    def concat_filters(self):
        return ConcatFilters(
            filters=['anullsrc=d=5000ms[quiet]'],
            outputs=['quiet', *[f'{n}:a' for n, _ in enumerate(self.songs)]])

    def ffmpeg_args(self, concat):
        return [
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
            self.video_out,
        ]


@attr.s
class CdRenderer:
    outdir = attr.ib()
    songs = attr.ib()

    @reify
    def wav_out(self):
        return self.outdir / 'cd.wav'

    @reify
    def cue_out(self):
        return self.outdir / 'cd.cue'

    def cue_text(self):
        lines = [f'FILE "{self.wav_out.name}" WAVE']
        at_sectors = 0
        for e, et in enumerate(self.songs, start=1):
            seconds, sectors = divmod(at_sectors, 25)
            minutes, seconds = divmod(seconds, 60)
            lines.extend([
                f'  TRACK {e:02} AUDIO',
                f'    TITLE "{et.track.title()}"',
                f'    PERFORMER "{et.track.artist().name()}"',
                # that pesky 3 has to return
                f'    INDEX 01 {minutes:.0f}:{seconds:02.0f}:{sectors * 3:02.0f}',
            ])
            at_sectors += et.length_sectors
        lines.append('')
        return '\n'.join(lines)

    def concat_filters(self):
        ret = ConcatFilters()
        for n, et in enumerate(self.songs):
            out = f'p{n}'
            ret.filters.append(
                f'[{n}:a]apad=whole_dur={int(et.length_sectors * SECTORS_INV_US)}us[{out}]')
            ret.outputs.append(out)
        return ret

    def ffmpeg_args(self, concat):
        self.cue_out.write_text(self.cue_text())
        return [
            'ffmpeg', '-y', '-i', concat,
            '-hide_banner', '-loglevel', 'warning', '-progress', 'pipe:1',
            self.wav_out,
        ]


renderers = {
    'spectrogram': SpectrogramRenderer,
    'cd': CdRenderer,
}


def run(tracks, track_iter, format, outdir: pathlib.Path):
    outdir.mkdir(parents=True, exist_ok=True)
    songs_in_order = []
    songs_by_extension = collections.defaultdict(list)
    for e, t in enumerate(track_iter, start=1):
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

    length_s = sum(et.track.totalTime() for et in songs_in_order) / 1000

    with contextlib.ExitStack() as stack:
        tmpdir = pathlib.Path(stack.enter_context(tempfile.TemporaryDirectory()))
        concat = tmpdir / 'concat.mkv'
        os.mkfifo(concat)
        renderer = renderers[format](outdir, songs_in_order)
        input_files = [x for et in songs_in_order for x in ['-i', et.location]]
        p1 = subprocess.Popen([
            'ffmpeg', '-y', *input_files,
            '-hide_banner', '-loglevel', 'warning', '-progress', 'pipe:1',
            '-filter_complex', renderer.concat_filters().filter_arg(),
            '-map', '[out]', '-c:a', 'flac',
            concat,
        ], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE)
        p2 = subprocess.Popen(
            renderer.ffmpeg_args(concat),
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE)

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
