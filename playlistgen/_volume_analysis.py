from numpy.lib.stride_tricks import as_strided
import numpy
import subprocess

f32le = numpy.dtype('<f')

def read_raw_track(t):
    path = t.location().path()
    out = subprocess.run(
        ['ffmpeg', '-i', path, '-f', 'f32le', '-ac', '1', '-'],
        stdout=subprocess.PIPE, check=True,
    )
    return numpy.frombuffer(out.stdout, dtype=f32le)

def track_windowed_power(t, block_s=0.4, overlap=0.75):
    raw = read_raw_track(t)
    n_samples = len(raw)
    n_windows = int(numpy.ceil(t.totalTime() / 1000 / block_s / overlap))
    window_samples = int(t.sampleRate() * block_s)
    stride_count = int((n_samples - window_samples) / (n_windows - 1))
    [stride] = raw.strides
    squared = raw ** 2
    squared = as_strided(
        squared,
        shape=(n_windows, window_samples),
        strides=(stride * stride_count, stride))
    return numpy.log10(squared.mean(axis=1))
