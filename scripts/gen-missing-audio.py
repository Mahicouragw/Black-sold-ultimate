#!/usr/bin/env python3
"""
BlackSoul Ultimate — missing audio asset regenerator (v7.17.0)
Generates original, royalty-free (CC0) replacements for every audio file that was
referenced by the game but missing from the repo. Pure procedural synthesis — these
are brand-new original sounds, released CC0 by the author, so no licensing ambiguity.

Output: 44100 Hz, 16-bit WAV (mono for foley, stereo for ambience).
"""
import os, wave, numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')

def wav(name, data, stereo=False):
    if stereo:
        d = np.asarray(data, dtype=np.float64)
        if d.ndim == 1:
            d = np.column_stack([d, d])
        d = d.T  # interleave
    else:
        d = np.asarray(data, dtype=np.float64)
        d = d.reshape(-1)
    d = np.clip(d, -1, 1)
    pcm = (d * 32767).astype(np.int16)
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as f:
        f.setnchannels(2 if stereo else 1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(pcm.tobytes())
    print(f'  ✓ {name}  {pcm.nbytes/1024:.1f} KB  {len(pcm)/SR:.2f}s')

def t(sec): return np.arange(int(sec * SR)) / SR

def env(n, a=0.01, d=0.3, curve=3.0):
    """attack/decay envelope"""
    N = len(n); e = np.ones(N)
    ai = max(1, int(a * SR)); di = max(1, int(d * SR))
    if ai < N: e[:ai] = np.linspace(0, 1, ai)
    if di < N: e[-di:] = np.linspace(1, 0, di) ** (1 / curve)
    return e

def lowpass(x, alpha):
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc += alpha * (x[i] - acc); y[i] = acc
    return y

def bandpass(x, sr, lo, hi):
    from scipy.signal import butter, sosfiltfilt
    sos = butter(4, [lo / (sr / 2), hi / (sr / 2)], btype='band', output='sos')
    return sosfiltfilt(sos, x)

def noise(N, color='white'):
    r = np.random.default_rng(42).normal(0, 1, N)
    if color == 'brown':
        r = np.cumsum(r); r /= (np.max(np.abs(r)) + 1e-9)
    elif color == 'pink':
        from scipy.signal import lfilter
        b = [0.04992235, -0.095993537, 0.050612699, -0.004408786]
        a = [1, -2.494956002, 2.017265875, -0.522189400]
        r = lfilter(b, a, r)
    return r

def fade(x, n=1200):
    if len(x) <= 2 * n: return x
    r = np.ones(len(x)); r[:n] = np.linspace(0, 1, n); r[-n:] = np.linspace(1, 0, n)
    return x * r

def norm(x, peak=0.89):
    m = np.max(np.abs(x)) + 1e-9
    return x / m * peak

# ---------------------------------------------------------------- foley SFX
print('— SFX (original CC0 synthesis) —')

# body-fall.wav: heavy body hitting ground — low sine drop + cloth noise burst
n = t(1.0)
thud_f = 90 * np.exp(-n / 0.16)
thud = np.sin(2 * np.pi * np.cumsum(thud_f) / SR) * np.exp(-n / 0.35)
cloth = bandpass(noise(len(n), 'brown'), SR, 300, 2500) * np.exp(-n / 0.09) * 0.5
body = thud * 1.0 + cloth * 0.8
body = norm(fade(body, 800)); wav('sfx/body-fall.wav', body)

# card-flip.wav: single riffle flip — two clicks + paper flutter
n = t(0.22)
click = lambda pos, amp: amp * np.exp(-np.maximum(0, n - pos) / 0.006)
flip = click(0.02, 0.9) * 1.2 + click(0.09, 0.5)
paper = bandpass(noise(len(n), 'white'), SR, 900, 5200) * np.exp(-n / 0.05) * 0.35
flip = flip + paper
wav('sfx/card-flip.wav', norm(flip))

# carrom-strike.wav: striker snap — hard transient + bright ring
n = t(0.5)
crack = noise(len(n), 'white') * np.exp(-n / 0.004) * 1.2
ring = np.sin(2 * np.pi * 1850 * n) * np.exp(-n / 0.09) * 0.5
ring += np.sin(2 * np.pi * 3720 * n) * np.exp(-n / 0.05) * 0.2
wav('sfx/carrom-strike.wav', norm(crack + ring))

# check.wav: alert chime (chess) — two quick bright tones
n = t(0.5)
chk = np.sin(2 * np.pi * 987.77 * n) * np.exp(-n / 0.12) * 0.7
chk += np.roll(np.sin(2 * np.pi * 1318.5 * np.maximum(0, n - 0.09)) * np.exp(-np.maximum(0, n - 0.09) / 0.12) * 0.7, int(0.09 * SR))
wav('sfx/check.wav', norm(chk))

# checkmate.wav: descending cadence — solemn defeat
n = t(1.0)
notes = [880, 698.46, 587.33, 440]
mate = np.zeros_like(n)
for i, f in enumerate(notes):
    st = 0.12 * i
    seg = np.maximum(0, n - st)
    tone = np.sin(2 * np.pi * f * seg) * np.exp(-seg / 0.35)
    mate += np.roll(tone, int(st * SR))
wav('sfx/checkmate.wav', norm(mate))

# chess-move.wav: wooden piece clack
n = t(0.25)
clack = noise(len(n), 'white') * np.exp(-n / 0.003) * 0.9
thump = np.sin(2 * np.pi * 520 * n) * np.exp(-n / 0.03) * 0.7
thump2 = np.sin(2 * np.pi * 310 * n) * np.exp(-n / 0.05) * 0.4
wav('sfx/chess-move.wav', norm(clack + thump + thump2))

# coin-collision.wav: two coins tapping — bright metallic beating
n = t(0.6)
def coinring(f0, beat, start, amp):
    seg = np.maximum(0, n - start)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.3 * seg)
    c = np.sin(2 * np.pi * f0 * vib * seg) + 0.45 * np.sin(2 * np.pi * f0 * 1.003 * seg) + 0.3 * np.sin(2 * np.pi * f0 * 2.001 * seg)
    return np.roll(c * np.exp(-seg / 0.13) * amp, int(start * SR))
coins = coinring(3100, 0, 0.0, 0.9) + coinring(4200, 0, 0.0, 0.35) + coinring(2900, 0, 0.14, 0.55) + coinring(3900, 0, 0.14, 0.2)
tap = noise(len(n), 'white') * np.exp(-n / 0.002) * 0.8
wav('sfx/coin-collision.wav', norm(coins + tap))

# exp.wav: XP gained — rising two-tone blip
n = t(0.5)
xp = np.sin(2 * np.pi * 523.25 * n) * np.exp(-n / 0.1) * 0.6
xp += np.roll(np.sin(2 * np.pi * 1046.5 * np.maximum(0, n - 0.08)) * np.exp(-np.maximum(0, n - 0.08) / 0.14) * 0.7, int(0.08 * SR))
wav('sfx/exp.wav', norm(xp))

# miss.wav: whoosh — swept bandpass noise
n = t(0.35)
who = bandpass(noise(len(n), 'white'), SR, 250, 1600)
for i, f in enumerate(np.linspace(300, 1400, 12)):
    who[int(i * len(n) / 14):] *= 1  # keep
who = bandpass(noise(len(n), 'white'), SR, 300, 1500) * env(n, 0.12, 0.2, 2)
# add slight sweep character via AM
who *= 0.7 + 0.3 * np.sin(2 * np.pi * 9 * n)
wav('sfx/miss.wav', norm(fade(who, 400)))

# ghost-scream.wav: spectral scream — gliding high tone + air
n = t(1.15)
freq = 1250 * np.exp(-np.maximum(0, n - 0.55) / 0.22) + 380
scream = np.sin(2 * np.pi * np.cumsum(freq) / SR)
scream *= 1 + 0.08 * np.sin(2 * np.pi * 6.5 * n)
air = bandpass(noise(len(n), 'white'), SR, 1500, 6000) * 0.22
env_s = np.exp(-np.maximum(0, n - 0.12) / 0.4) * (1 - np.exp(-n / 0.05))
scream = (scream * env_s * 0.85 + air * env_s)
wav('sfx/ghost-scream.wav', norm(fade(scream, 300)))

# ghost-moan.wav: eerie detuned choir pad
n = t(1.6)
def pad(f0, det, amp):
    s = np.sin(2 * np.pi * f0 * n) + np.sin(2 * np.pi * f0 * (1 + det) * n) + 0.6 * np.sin(2 * np.pi * f0 * (1 + det * 2.01) * n)
    trem = 1 + 0.35 * np.sin(2 * np.pi * 0.9 * n + 1.3)
    return s * trem * amp
moan = pad(196.0, 0.011, 0.55) + pad(294.0, 0.008, 0.3) + pad(392.0, 0.006, 0.12)
glide = np.sin(2 * np.pi * np.cumsum(180 + 26 * np.exp(-n / 0.5)) / SR) * np.exp(-np.maximum(0, n - 0.3) / 0.5) * 0.25
moan = moan + glide
moan = bandpass(moan, SR, 120, 2400)
wav('sfx/ghost-moan.wav', norm(fade(moan, 1500)))

# goblin-cackle.wav: short uneven laughter bursts
n = t(1.0)
cackle = np.zeros_like(n)
rng = np.random.default_rng(7)
starts = [0.02, 0.2, 0.34, 0.52, 0.66, 0.84]
for i, st in enumerate(starts):
    seg = np.maximum(0, n - st)
    bw = np.exp(-seg / (0.055 + 0.01 * (i % 3)))
    f = 500 + rng.uniform(250, 700) * np.exp(-seg / 0.12)
    burst = np.sin(2 * np.pi * np.cumsum(f) / SR) * bw
    cackle += np.roll(burst, int(st * SR)) * 0.5
cackle = bandpass(cackle, SR, 350, 3200)
wav('sfx/goblin-cackle.wav', norm(fade(cackle, 200)))

# haunted-wind.wav: blowing wind — filtered brown noise, slow gusts, faint glides
n = t(3.2)
wind = noise(len(n), 'brown')
wind = bandpass(wind, SR, 140, 900)
gust = 0.55 + 0.45 * np.sin(2 * np.pi * 0.35 * n) + 0.2 * np.sin(2 * np.pi * 0.83 * n + 0.7)
wind *= gust
howl1 = np.sin(2 * np.pi * (430 + 60 * np.sin(2 * np.pi * 0.22 * n)) * n) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.3 * n)) * 0.12
howl2 = np.sin(2 * np.pi * (615 + 80 * np.sin(2 * np.pi * 0.17 * n + 2)) * n) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.25 * n + 1)) * 0.08
wav('sfx/haunted-wind.wav', norm(fade(wind + howl1 + howl2, 1200)))

print('— done —')
