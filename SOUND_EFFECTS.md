# Sound effects: what to search for, and how to publish it

Every effect in this game is a **real recording** with a licence in
[`AUDIO_CREDITS.md`](AUDIO_CREDITS.md). Nothing is generated, and a new sound
only reaches players after the owner publishes it in the **Sound Studio**
(Settings → *Open the Sound Studio*, or say `studio`).

This page is the shopping list: the exact cue names to publish, what each one
should sound like, and the words to put into a free sound library's search box.

---

## 1. Where to search (free, no copyright problems)

Use these libraries and keep the **licence filter on CC0** (or CC BY, which only
asks for a credit line):

| Library | Address | Why |
| --- | --- | --- |
| Freesound | `freesound.org` | The largest CC0 library. Set *License → Creative Commons 0* in the filter bar. |
| Pixabay Sound Effects | `pixabay.com/sound-effects` | CC0-style licence, no credit needed, safe for a shipped game. |
| Mixkit (free SFX) | `mixkit.co/free-sound-effects` | Free for commercial use, no attribution. |
| OpenGameArt | `opengameart.org` | Game-ready packs; check each pack's licence line (CC0 / CC BY 3.0 / CC BY-SA). |
| Kenney audio packs | `kenney.nl/assets?q=audio` | All CC0, small, clean, made for games. |
| Sonniss GDC bundles | `sonniss.com/gameaudiogdc` | Royalty-free packs, hundreds of gigabytes, searchable by folder name. |
| Archive.org | `archive.org` | Old public-domain recordings: bells, choirs, cathedral organs. |

**Never use:** a YouTube/song rip, a "free download" site that hides a licence
behind a subscription, or a pack whose licence forbids redistribution — the game
is downloaded to every player's device, which *is* redistribution.

Save the licence page URL for each file you keep: it goes into
`assets/audio/audio-manifest.json` and `AUDIO_CREDITS.md` alongside the file.

---

## 2. The opening story (six lines, played when a hero is made)

Music already plays under the whole sequence (`MusicSystem` track `intro`,
*"Adventure Intro Title"*). Each line rings one recorded effect. The cue name on
the right is the one to type into the studio's **Sound name** box, with
**What is this recording? = A sound effect**:

| Line | Words | Cue to publish | What it should sound like | Search terms |
| --- | --- | --- | --- | --- |
| 1 | "Welcome to Black Sword." | `magic` | a soft arcane swell, one second of air | `magic sparkle`, `arcane shimmer`, `harp glissando`, `mystical chime` |
| 2 | "This world is in danger…" | `blessing` | a warm choral bloom, sacred, no words | `choir swell`, `church choir aah`, `angelic choir short`, `cathedral choir` |
| 3 | "You were born in Market Square…" | `explore` | a market morning: distant voices, cart wheels, birds | `medieval market ambience`, `village crowd distant`, `town square morning` |
| 4 | "First, guidance. Say palace…" | `check` | one clean bell, an answer to a question | `single bell chime`, `temple bell`, `notification chime temple` |
| 5 | "Ser Aldric… rides with you." | `levelup` | a short rising flourish, a companion joining | `achievement flourish`, `level up orchestral short`, `fanfare short` |
| 6 | "Take your first step." | `step-leaves` | boots on a gravel road, three steps | `footsteps gravel`, `boots on stone path`, `walking dirt road` |

### Giving one line its own effect

Publishing `blessing` replaces the blessing **everywhere** — the temple, the
story, battle prayers. To change only the story's second line, publish the cue
named after the line with `-sfx` on the end, *still as a sound effect*:

```
intro-02-sfx   ← only the story's second line
intro-06-sfx   ← only "Take your first step."
```

The studio lists the story lines under **Owner tools → Story clips**; a
recording published as **A story line** (kind `story`) replaces that line's
spoken voice instead, not its effect.

---

## 3. Other moments worth a real recording

| Cue | When it plays | Search terms |
| --- | --- | --- |
| `ladder-up` | a decoration hung on the Grand Christmas Tree | `sleigh bell single`, `hand bell ring`, `christmas bell` |
| `game-win` | the tree finished, a board game won | `victory sting orchestra`, `win fanfare short` |
| `door` | a door opens in the world | `wooden door creak open`, `heavy door latch` |
| `coin` | money paid or found | `coins clink`, `coin drop single` |
| `levelup` | a new level | `level up chime`, `achievement bell` |
| `blessing` | a temple blessing, the story's second line | `choir aah short`, `blessing bell choir` |
| `heal` | a potion or a healing spell | `healing shimmer`, `soft magic heal` |
| `attack`, `attack-heavy`, `attack-fast` | sword, hammer, dagger swings | `sword whoosh`, `heavy weapon swing`, `dagger slash` |
| `monster-hit`, `body-fall` | a blow lands, a creature drops | `flesh impact wet`, `body fall thud` |
| `treasure` | a chest or a reward is opened | `chest open creak`, `treasure sparkle` |

---

## 4. Making a file the studio will accept

- **Format:** wav, mp3, ogg, m4a, aac or flac. Mono is plenty for effects.
- **Size:** 3 MB or smaller (about 30 s of mp3 at 128 kbps).
- **Trim** the silence at both ends — a half-second of nothing makes a bell feel late.
- **Normalise** to about −16 LUFS so one effect is never far louder than another.
- **Name** the file after the cue: `blessing.mp3`, `intro-02-sfx.mp3`.
- The studio checks the file's real header, so a renamed `.txt` is refused.

## 5. Publishing, and what to do when it refuses

1. Settings → **Open the Sound Studio** (or say `studio`).
2. Choose the sound, or type its cue name; choose what kind of recording it is.
3. Pick the file, listen back, then **Publish this recording**.
4. Press **Check publishing** if anything is unclear. It answers in plain words:
   - *"the studio gateway is not answering at this address…"* — the `bsu-audio`
     function has not been deployed to the server yet.
   - *"this account is not on the owner list yet… This account is `<id>`. Add that
     id to the studio owner list…"* — run this once in the project's SQL editor:

     ```sql
     insert into public.audio_admins (user_id) values ('<the id the studio printed>')
     on conflict (user_id) do nothing;
     ```
   - *"the studio is reachable and publishing is open"* — publish away.
5. Every player hears the new recording from their next start-up; nothing has to
   be rebuilt.
