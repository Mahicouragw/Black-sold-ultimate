# The Sound Studio — where it is, and who may use it (7.68.0)

## In one line

Open the game, sign in with your own Google account, then say **`studio`**
(or press **Settings → 🎚️ Open the Sound Studio**). The studio is yours alone.

## Where it lives

| Way in | What happens |
|---|---|
| Type **`studio`** in the command box | Settings opens, the studio scrolls into view, and the owner's access is confirmed aloud |
| **⚙️ Settings** button → **🎚️ Open the Sound Studio** | Same panel, one press from the top of Settings (this button is only drawn for the owner) |
| Scroll inside Settings | The section **🎚️ Sound Studio — the owner's own recordings** |

The whole game keeps working for everyone; the studio section is simply not
drawn for anyone who is not on the owner list.

## Who is the owner

The server decides, never the browser. The owner list is the table
`public.audio_admins` in the Supabase project `tmkpdvljhnlnvbckbnsc`:

```sql
select user_id, note, created_at from public.audio_admins;
-- DehUYQB15gYxaHjEbMTaBGuP1Kp2  owner  2026-11-24 02:09:57Z
```

That id is the Google account that plays as **Mahi Couragw**, and it is the
only player account the game has seen. So the power is already granted: sign in
with that same Google account and the studio appears.

To grant the studio to another account later (a second Google account, a
helper), add its row — nothing else needs deploying:

```sql
insert into public.audio_admins (user_id, note)
values ('<the other account uId>', 'helper')
on conflict (user_id) do nothing;
```

A guest hero (not signed in with Google) can never publish: the server only
accepts a genuine Google-signed token. If the studio does not appear, the
status line says exactly why — sign in, or the account is not the owner.

## Publishing a sound

1. **Which sound do you want to change?** — a list of every sound in the game,
   grouped into *Sound effects* and *Music tracks*, each shown as
   `Door — door (door)`. The name and type fill themselves in.
   Choose **A new sound of my own** to name a cue that does not exist yet.
2. **Hear this sound as it is now** — plays the built-in recording (or your
   published one) so you hear what is being replaced.
3. **Recording file** — wav, mp3, ogg, m4a, aac or flac, up to 3 MB. The file is
   checked on the server for a real recording signature, not just a name.
4. **Publish this recording** — the file goes to the `game-audio` storage
   bucket, the row in `public.audio_cues` is written, and the game applies it
   at once for you. Every other player picks it up at their next start-up.
5. **Remove** beside any published sound — the built-in recording is heard again
   everywhere.

Cue names that the game already uses include `door`, `coin`, `attack`, `hit`,
`heal`, `levelup`, `treasure`, `game-win`, `step-gravel`, `car-horn`,
`card-flip`, and the music keys `town`, `battle`, `boss`, `temple`, `palace`,
`victory`. The picker is built from the running game, so it is always complete.

## What changed in 7.68.0

* `studio` (and `sound studio`, `studio help`) opens the panel from anywhere.
* The studio asks for *a specific sound of the game* instead of a name typed
  from memory, and can audition it first.
* Access is settled again whenever Settings is opened by a different account —
  signing in after opening Settings no longer needs a reload.
* A one-press shortcut sits at the top of Settings, for the owner only.
* Everything spoken as well as written, and the visible status line always
  matches what is said.
* The server gateway (`bsu-audio`, ACTIVE, version 2) is unchanged: `?list=1`
  for every player, and `who` / `publish` / `delete` behind the owner check.

## Verified

* `tests/sound-studio-v764.test.mjs` — **13 tests**: the picker lists every cue,
  the name and kind fill in, the shortcut appears only for the owner, `studio`
  opens Settings, signing in brings the studio out without a reload, a declined
  publish keeps the studio open, and publish/remove still send the right calls.
* `tests/audio-studio-server-v764.test.mjs` — 8 tests over the real gateway with
  real signed tokens and a mocked database.
* Live check: `GET https://tmkpdvljhnlnvbckbnsc.supabase.co/functions/v1/bsu-audio?list=1`
  answers `{"data":{"cues":[]}}` — reachable, and nothing published yet.
* Player-text audit: 10,286 strings, 0 leaks, 0 reward announcements.
