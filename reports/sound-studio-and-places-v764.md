# The owner's Sound Studio, Google vs guest heroes, and a description for every place — 7.64.0

Release **7.64.0**. Three things the owner asked for, plus the rule that decides
which hero you play.

## 1. Who plays which hero

This already worked, and is now locked in tests
(`tests/google-guest-heroes-v764.test.mjs`):

* **Signed in with Google** — the game uses that account's own storage
  (`black_sword_ultimate_save:<uid>`, `black_sword_hero_roster_v2:<uid>`). The
  heroes, quests, blessings and cloud save belong to that Google account.
* **Not signed in** — a guest hero on this device only (`black_sword_ultimate_save`).
  Nobody else's heroes are ever shown.
* Signing out returns to the guest saves and hides the Google heroes. The first
  account to sign in on a device adopts the heroes that were already there
  (moved, not copied), and a later different account never receives them.
* The Settings line now names the **hero** ("Signed in with Google — hero Mahi
  Couragw"), not an email or an account link, and a guest is told plainly
  "Guest account — heroes stay on this device".

## 2. The owner's Sound Studio

The owner asked for powers to upload music and sound effects, with publishing
only for him. That is now live, end to end.

### In the game

Settings → **🎚️ Sound Studio — owner only**. It appears only after asking the
server whether this Google account is the owner. The owner can:

* choose a recorded file (wav, mp3, ogg, m4a, aac, flac; 3 MB limit),
* hear it back before publishing,
* name the cue (`door`, `coin`, `battle-theme`, …),
* publish it — every player receives it on their next start-up, replacing the
  built-in recording of that cue,
* remove it — the built-in recording is used again.

Everything is spoken as well as written: state changes go through the game's
screen-reader channel and the visible status line always matches what is said.

### Server

A new, separate Supabase Edge Function `bsu-audio` (deployed and ACTIVE) does the
work. It is deliberately not part of `bsu-data`, so if the studio is ever down,
cloud saves, chat and the rest of the online game are unaffected.

| Route | Who may call it |
|---|---|
| `GET ?list=1` | everyone (the game reads the published list) |
| `POST {action:'who'}` | any signed-in Google player |
| `POST {action:'publish'}` | **only** ids in `public.audio_admins` |
| `POST {action:'delete'}` | **only** ids in `public.audio_admins` |

Rules enforced on the server, not in the browser:

* the caller must present a genuine Firebase ID token signed by Google, and the
  provider must be `google.com` (guests are refused);
* the owner list is a database table — `audio_admins` currently holds exactly
  one row, the owner's account;
* the cue name must be 2–41 lowercase letters, numbers or dashes;
* the file must be a real recording of the declared type (RIFF/WAVE, OggS, MP3
  frame, ftyp, fLaC signatures are checked — a renamed text file is refused);
* 3 MB maximum; recordings are stored in the public `game-audio` bucket and the
  row in `public.audio_cues` replaces any earlier file for that cue.

`audio_cues` and `audio_admins` have row-level security on; the public may read
only enabled cues. The service key exists only inside the function.

### How to publish a sound (owner)

1. Sign in with your Google account and open **Settings**.
2. Scroll to **Sound Studio — owner only**.
3. Type the sound name, choose *Sound effect* or *Music track*, pick your
   recorded file, listen back, then **Publish this recording**.
4. Everyone hears it at their next start-up. To undo, press **Remove**.

## 3. Every place now describes itself

The world has 1164 locations, and **525 of them shared one of 100 descriptions**:
four forest paths in a row said exactly the same paragraph, every private-house
hallway read the same, several cave chambers were indistinguishable by ear.

`distinct-places-v764.js` rewrites every shared description using that place's
own name, region, features and exits, for example:

> Great Forest — Whisper Path stands as a forest path in Great Forest. You can
> see tracks and hidden clearing here. Ways lead south toward Great Forest — Owl
> Path, west toward Great Forest — Fern Trail and east toward Great Forest —
> Moss Crossing. The trail is soft underfoot and easy to follow.

The place's name is always in the sentence, and all 1164 names are unique, so no
two descriptions can ever collide again. Locations that already had their own
description keep it word for word, and a second pass changes nothing.

Result: **1164 places, 1164 different descriptions, 0 duplicates.**

## Tests

* `tests/audio-studio-server-v764.test.mjs` (8) — the real gateway with a real
  signed Firebase token and a mocked Supabase: public list, unsigned and guest
  refusals, non-owner refusal, owner publish (storage + row + URL), fake-file
  refusal, bad name/kind/mime/size refusals, owner removal.
* `tests/sound-studio-v764.test.mjs` (7) — the in-game studio: published cues
  replace built-ins at start-up, unreachable studio leaves them alone, hidden
  from non-owners, owner publishes (correct bearer token and payload), local
  refusals, removal, automatic cue name from the file name.
* `tests/distinct-places-v764.test.mjs` (5) — uniqueness across the whole world,
  every rewritten place names itself, idempotency, honest counts, no placeholders.
* `tests/google-guest-heroes-v764.test.mjs` (4) — Google heroes, guest heroes,
  sign-out isolation, guest never called signed-in.

Full suite and validation results are recorded in the pull request.

## Infrastructure now live

* Edge function `bsu-audio` — project `tmkpdvljhnlnvbckbnsc`.
* Tables `public.audio_cues`, `public.audio_admins` (RLS on).
* Storage bucket `game-audio` (public read, 3 MB limit, audio types only).
* Owner row: the Google account that plays as **Mahi Couragw**.

## Not in this release

The 60-second spoken introduction / share cards from the earlier list were not
built in this round — the owner's message asked for the studio and the location
descriptions first. They are queued for the next round.
