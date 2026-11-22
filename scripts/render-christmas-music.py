#!/usr/bin/env python3
"""Render the extra Christmas instrumentals shipped in assets/fair/.

Six short pieces are layered from synthesized bells, a plucked bass and a soft
organ pad, then encoded to MP3. Nothing is sampled, so the game owns the audio
and there is no licence to renew. Run with numpy and lameenc available:

    pip install --target=/tmp/xlib numpy lameenc
    PYTHONPATH=/tmp/xlib python3 scripts/render-christmas-music.py
"""
import math
import os

import lameenc
import numpy as np

RATE = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'fair')


def hz(note):
    return 440.0 * 2 ** ((note - 69) / 12.0)


def bell(freq, seconds, level=0.5, decay=3.2):
    n = int(RATE * seconds)
    t = np.arange(n) / RATE
    env = np.exp(-decay * t)
    tone = (np.sin(2 * math.pi * freq * t) + 0.45 * np.sin(2 * math.pi * freq * 2.01 * t)
            + 0.22 * np.sin(2 * math.pi * freq * 3.02 * t) + 0.1 * np.sin(2 * math.pi * freq * 4.98 * t))
    return env * tone * level


def pad(freqs, seconds, level=0.16):
    n = int(RATE * seconds)
    t = np.arange(n) / RATE
    env = np.minimum(1.0, t / 0.5) * np.minimum(1.0, (seconds - t) / 0.8)
    out = np.zeros(n)
    for freq in freqs:
        for h in range(1, 6):
            out += np.sin(2 * math.pi * freq * h * t) / (h * 1.6)
    return out * env * level / max(1, len(freqs))


def pluck(freq, seconds, level=0.35):
    n = int(RATE * seconds)
    period = max(2, int(RATE / freq))
    rng = np.random.RandomState(int(freq) % 9973)
    out = np.zeros(n)
    out[:period] = rng.uniform(-1, 1, period)
    for i in range(period, n):
        out[i] = 0.996 * 0.5 * (out[i - period] + out[i - period - 1])
    out *= np.exp(-2.0 * np.arange(n) / RATE)
    return out * level


def add_at(track, segment, gain=1.0):
    end = track_start + len(segment)
    if end > len(track):
        segment = segment[:len(track) - track_start]
        end = len(track)
    track[track_start:end] += segment * gain


def render(name, bpm, chords, melody, timbre='bell', seconds=34.0, swing=0.0):
    global track_start
    track = np.zeros(int(RATE * seconds))
    beat = 60.0 / bpm
    bar = beat * 4
    # Pads under everything, one chord per bar.
    for index, chord in enumerate(chords * (int(seconds / bar) + 1)):
        start = index * bar
        if start >= seconds:
            break
        track_start = int(start * RATE)
        seg = pad([hz(n) for n in chord], min(bar * 1.05, seconds - start))
        add_at(track, seg, 0.55)
    # Plucked bass on the root of each bar.
    for index, chord in enumerate(chords * (int(seconds / bar) + 1)):
        start = index * bar
        if start >= seconds:
            break
        for offset in (0, 2):
            track_start = int((start + offset * beat) * RATE)
            add_at(track, pluck(hz(chord[0] - 12), beat * 1.6), 0.5)
    # Melody, one note or rest per half beat.
    step = beat / 2
    for index, note in enumerate(melody * 4):
        start = index * step + (swing if index % 2 else 0)
        if start >= seconds - 0.5:
            break
        if note is None:
            continue
        track_start = int(start * RATE)
        if timbre == 'bell':
            add_at(track, bell(hz(note), 1.8, 0.5), 0.85)
        else:
            add_at(track, pad([hz(note)], 0.6), 0.7)
    # Sleigh-bell shimmer near the top of each bar.
    rng = np.random.RandomState(len(name))
    for index in range(int(seconds / bar)):
        for point in range(2):
            track_start = int((index * bar + point * beat * 2 + beat * 0.75) * RATE)
            n = int(RATE * 0.05)
            noise = rng.uniform(-1, 1, n) * np.exp(-28 * np.arange(n) / RATE)
            add_at(track, noise, 0.12)
    # Simple feedback echo for space.
    delay = int(RATE * 0.22)
    echo = np.zeros_like(track)
    echo[delay:] = track[:-delay] * 0.28
    mix = track + echo
    mix /= max(1.0, np.max(np.abs(mix)) * 1.05)
    pcm = (mix * 32767 * 0.85).astype('<i2')
    stereo = np.repeat(pcm, 2)
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(64)
    encoder.set_in_sample_rate(RATE)
    encoder.set_channels(2)
    encoder.set_quality(5)
    data = encoder.encode(stereo.tobytes()) + encoder.flush()
    path = os.path.join(OUT, name)
    with open(path, 'wb') as handle:
        handle.write(bytes(data))
    print(f'{name}: {len(data)} bytes, {seconds:.0f}s')


track_start = 0

PIECES = [
    ('carol-11.mp3', 96, [[48, 55, 60, 64], [45, 52, 57, 61], [41, 48, 53, 57], [43, 50, 55, 59]],
     [72, None, 76, 79, 76, None, 72, 74, 76, None, 72, 71, 69, None, 71, 72], 'bell', 34.0),
    ('carol-12.mp3', 84, [[50, 57, 62, 65], [46, 53, 58, 62], [43, 50, 55, 58], [45, 52, 57, 60]],
     [74, 77, 81, None, 79, 77, 74, None, 72, 74, 77, 79, 77, None, 74, None], 'bell', 36.0),
    ('carol-13.mp3', 104, [[53, 60, 65, 68], [48, 55, 60, 64], [50, 57, 62, 65], [43, 50, 55, 59]],
     [80, 79, 77, 75, 77, None, 72, 74, 75, 77, 80, 82, 80, None, 77, None], 'pad', 32.0),
    ('carol-14.mp3', 76, [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 58], [40, 47, 52, 56]],
     [69, None, 72, 74, 76, None, 74, 72, 69, None, 67, 69, 72, None, None, None], 'bell', 38.0),
    ('carol-15.mp3', 112, [[55, 62, 67, 71], [52, 59, 64, 67], [48, 55, 60, 64], [50, 57, 62, 65]],
     [83, 82, 79, 77, 79, None, 74, 77, 79, 82, 83, 86, 83, None, 79, None], 'pad', 30.0),
    ('carol-16.mp3', 88, [[43, 50, 55, 58], [48, 55, 60, 63], [45, 52, 57, 60], [41, 48, 53, 56]],
     [67, 71, 74, 77, 79, None, 77, 74, 72, None, 71, 67, 69, None, 71, None], 'bell', 40.0),
]

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, bpm, chords, melody, timbre, seconds in PIECES:
        render(name, bpm, chords, melody, timbre, seconds)
