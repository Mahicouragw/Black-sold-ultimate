# Why the Sound Studio did not appear — and what is fixed (7.69.0)

## The cause (found, not guessed)

The studio hid itself behind a **local flag that is false at start-up**.

`sound-studio-v764.js` began with:

```js
if (!window.OnlineSystem?.linked) { show(false); return false; }
```

`OnlineSystem.linked` is set by `refreshIdentityStatus()`, which runs **after** the
Google/Firebase session has been read back — so for the first moments of every
page load it is `false`. The studio checked exactly once, at `DOMContentLoaded`,
saw `linked === false`, set its `checked` flag and **never asked again**. The
panel stayed `hidden` for the whole session, for the owner himself.

The owner's admin tools beside it (Christmas state, story clips) *did* appear,
because that panel has no such flag and re-checks on every click inside Settings
and again 2.5 s after start. That is exactly the picture the owner described:
Christmas tools visible, Sound Studio missing.

Evidence that access was never the problem:

| Check | Result |
|---|---|
| `public.audio_admins` | one row — `DehUYQB15gYxaHjEbMTaBGuP1Kp2` (plays as *Mahi Couragw*) |
| `public.bsu_players` | one player, that same uid |
| `GET …/bsu-audio?list=1` | `{"data":{"cues":[]}}` — function ACTIVE, reachable |
| Live `version.js` | `7.68.0` (so the deployed site was current; the browser was serving a cached build of the old check) |

## The fix

1. **The server decides, not a local flag.** The studio now simply asks the
   server `who` with the signed-in token. No `linked` gate anywhere.
2. **It asks again, often enough to be right:** on every opening of Settings, on
   every touch inside Settings (but never inside the studio itself), on a new
   `black-sword-auth-change` event, 2.5 s and 9 s after start while the account
   is not yet confirmed, and `online.js` now dispatches that auth event when the
   identity settles and after sign-out.
3. **One quiet retry** when the request itself fails (a phone waking up fails
   once), then an honest line if the service is really unreachable.
4. **A broken listener can no longer take the studio down:** `wire()` is wrapped,
   so the panel still opens even if one binding throws.
5. **Cache moved on** to `black-sword-v7.69.0-studio2`, so a normal reload
   replaces the old script.

## If it still does not appear

1. Open **⚙️ Settings** and read the **Version** row: it must say **7.69.0**.
   If it says anything else, the browser is still on an old copy — close the
   tab, reopen the site, or clear the site's data once.
2. Type **`studio`** in the command box. The status line under the legend now
   says exactly which of these is true:
   * *"The studio opens for the owner's own Google account…"* — no sign-in yet.
   * *"The studio could not confirm this account…"* — sign in with Google again.
   * *"…it is not the owner of the studio…"* — a different Google account.
   * *"Owner access confirmed for …"* — the panel is open and ready.

## How to publish a sound once it is open

1. **Which sound do you want to change?** — every cue of the game, grouped as
   *Sound effects* (`door`, `coin`, `attack`, `hit`, `heal`, `levelup`, `treasure`,
   `game-win`, `step-gravel`, `car-horn`, `card-flip`, …) and *Music tracks*
   (`town`, `battle`, `boss`, `temple`, `palace`, `victory`, …).
2. **Hear this sound as it is now** — plays the built-in recording.
3. Choose the file (wav, mp3, ogg, m4a, aac or flac, ≤ 3 MB).
4. **Publish this recording** — stored in `game-audio`, listed in
   `public.audio_cues`, applied to you at once, and heard by **every player at
   their next start-up**. *Remove* restores the built-in sound.

## Tests

`tests/sound-studio-v764.test.mjs` — **16 tests**, including the three that would
have caught this:

* a stale `linked` flag cannot hide the studio from a signed-in owner;
* the studio opens itself when the sign-in lands after Settings was opened
  (via `black-sword-auth-change`, no reload);
* a failed request is retried once before giving up.

Full suite, `validate`, `build` and `pwa:check` results are in the pull request.
