# 🔊 Audio Sync Fixes — v7.8.5 (2026-07-19)

## Problem reported
Sound effects were **not syncing with gameplay**: footsteps, dice rolls, card
deals, hits and spells were heard *after* the on-screen action, with random
extra lag between repeats of the same effect.

## Root cause (found in code review)
In `music.js`:

- `playSFX()` created a **brand-new `new Audio(src)` element on every call**.
  The browser then had to **fetch + decode the file from scratch** before it
  could play — typically 200 ms–1 s, and longer on tablets/slow storage.
  The game code had already moved on, so the sound landed late.
- `playSFXAndWait(type, maxMs)` raced a blind `setTimeout(maxMs)` against a
  **still-loading** file. On slower devices the timeout fired *before* the
  effect even started — the animation moved on while the audio was behind.
- Each `playSFX` call also picked a **random variant** of an effect; uncached
  variants lagged differently from cached ones, making latency inconsistent
  ("sometimes synced, sometimes not").

## Fix: Web Audio SFX engine (all in `music.js`)
1. **Decode-once architecture** — every effect is fetched once and decoded to
   an `AudioBuffer` via the Web Audio API (`AudioContext.decodeAudioData`),
   starting at `init()` (no user gesture needed for fetch/decode).
   Buffers are cached for the life of the session.
2. **Sample-accurate playback** — effects play through
   `AudioBufferSourceNode.start(0)`: ~**sub-10 ms latency**, locked to the game
   event instead of the network.
3. **`playSFXAndWait` now waits on the buffer's REAL duration**
   (`min(buffer.duration, maxMs)`) instead of guessing — board-game pacing
   (ludo steps, card deals, dice) stays aligned with what you hear.
4. **First-use fallback** — if an effect hasn't finished decoding on its very
   first use, the old HTMLAudio path plays it so nothing is ever dropped.
5. **Autoplay-policy safe** — the `AudioContext` is created/resumed on the
   first pointer/key gesture (wired into the existing music-unlock listener).
6. **Subtle pitch jitter (±3%)** on repeated buffers so rapid repeats
   (multi-strike hits) don't sound robotic.
7. **Master SFX gain node** — `setSFXVolume()` now exists and updates live.

Music continues to stream via a single owned `<audio>` element (unchanged).

## Bonus fix
- `game-hall.js`: grammar bug in dice announcement
  (`You is rolling the dice` → `You are rolling the dice`).

## Verification
- `node --check` passes for all repo JS files.
- All 32 SFX files and 13 music tracks referenced in `music.js` verified to
  exist under `assets/audio/`.
