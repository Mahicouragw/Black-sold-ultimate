# Online-only play and the full audio audit — 7.63.0

Release **7.63.0**. The owner chose: the game is played **online only**, growth
comes before advertising, and the next task was a full audio audit. This release
ships the online gate, the audit, and one new way to hear every sound.

## 1. Online-only play

`online-required-v763.js` (loaded last) makes the connection a condition of play:

* At start-up, and whenever the device reports it is offline, a real
  `role="alertdialog"` panel appears: **Internet required**, one **Retry**
  button, and the promise that the hero is safe.
* Input is paused. `processCommand`, `move`, `castSpell`, `pray`, `palaceQuest`,
  `useItem`, `take`, `look` and `interact` refuse while the gate is closed and
  speak the reason, so a half-played action can never happen offline.
* Saves wait instead of failing silently: a hero is never written or erased
  while offline.
* `online`, `offline` and tab-visibility events re-check the connection. The
  moment the network returns the panel closes, the player hears **Internet is
  back. You can play again.**, and the open hero resumes automatically.
* The panel keeps focus on Retry (a modal `focusin` guard) so another start-up
  panel can never trap a screen-reader user behind the notice. Retry also
  re-checks every five seconds on its own.
* Telugu and Hindi wording is included.

This is a **connectivity** gate, not a sign-in gate: a guest can still play
online. Requiring a Google account would be one more switch — say the word.

The service worker still caches the shell, so a returning player gets the notice
quickly instead of the browser's offline page.

## 2. The audio audit

Facts, measured in this repository:

| Check | Result |
|---|---|
| Sound-effect files shipped | **68** (`assets/audio/sfx`) |
| Music files | **19** |
| Cue names the code can play | **88** |
| Cue names with no recording | **0** |
| Files missing / empty / wrong signature | **0** |
| Recordings with a verified checksum + licence + credit | **87 / 87** |
| Synthesised sound effects (oscillators, generated buffers) | **0** |
| Spell cues that borrow a success sound on failure | **0** (fixed in 7.62.1) |

Every effect is a genuine recording from a named creator (Kenney, artisticdude,
Oculus VR, HaelDB, rubberduck, Fupi, and others) under CC0/CC BY, with a stored
SHA-256 checksum in `recorded-audio-checksums.json` and a credit line in
`AUDIO_CREDITS.md`. `npm run audio:validate` checks all of that on every build.

### New: a spoken sound test

`audio-audit-v763.js` adds a player-facing way to verify the sound set:

* **`sound test`** — names and plays every recorded effect, one by one.
* **`sound test door`** — plays a single effect by name.
* **`stop sound test`** — stops the walk-through.

It also records any cue that has no recording in `window.AudioCatalog.unknownCues()`
instead of silently swallowing it, so a future missing sound is caught in tests.

### What is still synthesised, honestly

The **sound effects are all recordings**. Spoken narration uses the device's
speech engine (`speechSynthesis`) because the game narrates dynamic sentences —
room descriptions, combat maths, item names — that cannot be pre-recorded.
Those voices are real human-sounding voice models supplied by the device, not
tones, but they are still generated speech. Recording a human voice for every
dynamic line would be a separate project (thousands of lines). If you want a
recorded voice pack for the fixed lines — title screen, tutorial, death,
blessing, palace quests — that is doable; tell me which lines first.

## 3. Advertising: decisions and the application process

You chose **grow first**, and you have no ad account yet. Recorded here so the
next round can act on it.

1. **Users first.** Google requires a site or app with real content and traffic
   history before AdSense approval, so ads cannot fund the game until people
   are playing.
2. **Web ads (AdSense), when ready:** a Google account → add the site in
   AdSense → place the verification snippet → publish a privacy policy and
   cookie/consent notice → submit for review (days to weeks) → create ad units
   → add `ads.txt` → payment threshold 100 USD.
3. **Android ads (AdMob):** an AdMob account → add the Android app → create ad
   units → integrate the SDK through Capacitor → test with Google test ad units
   → `app-ads.txt` → publish on Play → same 100 USD threshold.
4. **Accessibility rule for this game:** no banner-only ads, no mid-sentence
   interruptions. Ads belong on the title screen and at chapter ends, with a
   spoken "an advertisement is playing" notice and a skip path where the ad
   network allows it.
5. **Realistic expectation:** ads pay per thousand impressions, and Indian
   traffic rates are low. Until monthly traffic is in the tens of thousands,
   donations/support links and grants earn more per visitor than ads.

## Tests

* `tests/online-required-v763.test.mjs` — 6 tests: offline opens the dialog and
  pauses input; a save is never written offline; reconnect resumes play; one
  Retry button keeps focus; Retry reopens after reconnect; online play is
  unaffected.
* `tests/audio-audit-v763.test.mjs` — 6 tests: every cue resolves to a real
  file; no oscillator/buffer synthesis; every spell cue exists; unknown cues are
  reported; `sound test` plays in order with names; single-cue lookup works.

Full suite and validation results are recorded in the pull request.
