#!/usr/bin/env python3
"""
Install REAL royalty-free audio assets (Kenney CC0 + OpenGameArt CC0/CC-BY)
into BlackSoul Ultimate, replacing the previously synthesized files.
All output: mono 44.1kHz 16-bit WAV (exact filenames the game code references).
"""
import os, shutil, subprocess

FFMPEG = "/usr/local/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
SRC = "/var/tmp/audio-src"
OUT = "/home/user/repos/Black-sold-ultimate/assets/audio/sfx"

def conv(src, dst, gain=None):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    cmd = [FFMPEG, "-y", "-i", src, "-ac", "1", "-ar", "44100", "-sample_fmt", "s16"]
    if gain: cmd += ["-filter:a", f"volume={gain}"]
    cmd += [dst]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"FAIL {src} -> {dst}: {r.stderr[-300:]}")
    else:
        print(f"OK  {os.path.basename(dst)}  ({os.path.getsize(dst)//1024} KB)")

K = f"{SRC}/x_kenney"
OGA = f"{SRC}/oga"

# Map: target filename <- source
MAP = [
    ("body-fall.wav",        f"{SRC}/x_impact-sounds/Audio/impactSoft_heavy_000.ogg", None),
    ("card-flip.wav",        f"{SRC}/x_rpg-audio/Audio/bookFlip1.ogg", None),
    ("carrom-strike.wav",    f"{SRC}/x_impact-sounds/Audio/impactMetal_light_000.ogg", None),
    ("check.wav",            f"{SRC}/x_interface-sounds/Audio/confirmation_001.ogg", None),
    ("checkmate.wav",        f"{SRC}/x_digital-audio/Audio/lowDown.ogg", None),
    ("chess-move.wav",       f"{SRC}/x_casino-audio/Audio/card-place-1.ogg", None),
    ("coin-collision.wav",   f"{SRC}/x_casino-audio/Audio/chips-collide-1.ogg", None),
    ("exp.wav",              f"{SRC}/x_music-jingles/Audio/Pizzicato jingles/jingles_PIZZI01.ogg", None),
    ("miss.wav",             f"{OGA}/whoosh2_0.wav", None),
    ("ghost-scream.wav",     f"{OGA}/scaryhighpitchedghost.ogg", None),
    ("ghost-moan.wav",       f"{OGA}/x_qubodup-GhostMoans/qubodup-GhostMoans/wav/qubodup-GhostMoan01.wav", None),
    ("goblin-cackle.wav",    f"{OGA}/Goblin%20Cackle.wav", None),
    ("haunted-wind.wav",     f"{OGA}/x_wind/wind/Wind2.ogg", None),
]

for name, src, gain in MAP:
    assert os.path.exists(src), f"missing source: {src}"
    conv(src, os.path.join(OUT, name), gain)
print("done")
