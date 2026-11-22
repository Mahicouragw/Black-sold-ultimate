# Synthetic character voices — setup

The game can give every NPC a **synthetic voice of its own** (the way the Gemini
app speaks with its own voice), instead of the phone's TalkBack / screen-reader
voice. The voice reads **exactly the words on screen**, so any answer to any
question can be spoken — nothing is pre-recorded.

> **API key, not APK.** An *APK* is an Android app installer. What the game needs
> is an **API key** — a long secret string from a voice service. You never paste
> it into the game, into this chat, or into a code file. You paste it into
> **Vercel → Settings → Environment Variables**, and only its *name* is shared.

## What happens with no key

Nothing breaks. Each character still speaks, using the device voice with its own
pitch and speed, and `voice status` says that the device voice is reading. The
moment a key is added, the same lines are spoken by the neural voices.

## Free keys — official pages

| Provider | Where to get a key | Free allowance | Notes |
| --- | --- | --- | --- |
| **Google Gemini TTS** (the Gemini-style voices) | https://aistudio.google.com/app/apikey | Free tier in the Gemini API; limits per day | 30 prebuilt voices (Kore, Puck, Charon, Aoede…). Best match for "Gemini voice". |
| **Google Cloud Text-to-Speech** | https://console.cloud.google.com/apis/library/texttospeech.googleapis.com then https://console.cloud.google.com/apis/credentials | Monthly free characters for Neural2/Standard voices | Enable the API first, then create an **API key** (Credentials → Create credentials → API key). |
| **ElevenLabs** | https://elevenlabs.io/app/sign-up then https://elevenlabs.io/app/settings/api-keys | Free plan gives a small monthly character quota | Highest quality, smallest free quota. Use one voice, or map voices per character. |

Notes:

- Gemini keys look like `AIza…`; Cloud keys look the same; ElevenLabs keys are
  long hex strings.
- Free quotas are monthly/daily and can change. If a provider runs out, the game
  quietly falls back to the device voice — you will hear the change, nothing
  breaks.
- Billing must be enabled on some Google projects even for the free tier.

## Steps in Vercel (2 minutes)

1. Open https://vercel.com/dashboard and choose the **black-sold-ultimate**
   project.
2. **Settings → Environment Variables → Add New**.
3. Fill in:
   - **Key**: `GEMINI_API_KEY` (or `GOOGLE_TTS_API_KEY`, or `ELEVENLABS_API_KEY`)
   - **Value**: paste the key here — Vercel stores it encrypted.
   - **Environments**: tick **Production** and **Preview**.
4. **Save**.
5. **Deployments → newest deployment → ⋯ → Redeploy** so the function picks up
   the variable.
6. In the game type **`voice status`**. It asks the server (no key ever leaves
   the server) and answers with either *"Characters are speaking with their own
   synthetic voices"* or *"No voice service key is configured"*, plus the name
   of the voice service that is ready.
7. Type **`voice test`**. The person you are standing with reads one short line
   in their own voice — the quickest way to hear whether the key works.
8. If you hear the phone voice instead, read the sentence `voice status` gives
   you:
   * *key rejected or the API is not enabled* — the key is wrong, or the Text to
     Speech API was never switched on for that Google project. Delete the old
     `GEMINI_API_KEY` value and paste a fresh key from
     https://aistudio.google.com/app/apikey, then redeploy.
   * *quota* — the free limit is used up. The Gemini speech preview gives only
     **15 requests a day** (3 a minute) on the free tier, which one long
     conversation can use up. The game keeps working in the device voice, says
     so in `voice status`, and retries by itself after half an hour. For real
     play, add a **Google Cloud Text-to-Speech** key as well
     (`GOOGLE_TTS_API_KEY`): its permanent free tier is **1 million Neural2
     characters a month** (about 18 hours of speech), and it has `en-IN`
     voices. Both keys can be present — Gemini is tried first, Cloud answers
     when Gemini is out of quota.
   * *no voice key is configured* — the variable is not on the Production
     environment, or the deployment happened before it was added. Redeploy.

Optional for Gemini: add `GEMINI_TTS_MODEL` to pin one speech model. Without
it the server tries the current Gemini speech models in order and remembers the
first that answers, so a retired preview model never silences the game.

Optional for ElevenLabs: add `ELEVENLABS_VOICE_ID` with one voice id, and/or
`ELEVENLABS_VOICE_MAP` as JSON mapping game voice names to ElevenLabs voice ids,
for example `{"Kore":"21m00Tcm4TlvDq8ikWAM","Puck":"AZnzlk1XvdvUeBnXmlld"}`.

## Which voice does each character get?

Each name maps to one of sixteen synthetic voices, stably, so Keeper Maren never
sounds like Cooper Bram and Crier Bell keeps the same voice all season. Voices
are chosen from the character's name, so they never shuffle between sessions.
The same assignment is used for the device-voice fallback (pitch and speed), so
the cast sounds different even before a key is added.

## Repeats cost nothing

Small free quotas only work if the game does not pay twice for the same line.
A sentence is cached in the browser (Cache Storage, so it survives a reload) and
again in the serverless function, keyed by character and words. A repeated
greeting, signpost or direction is replayed from disk instead of being billed
again.

## Door stories

Each of the twenty-five doors keeps its own recorded clip. If a door's clip is
missing, that door's keeper reads the same words in their synthetic voice — the
story is never silent and never a flat screen-reader monotone.

## Nothing is trusted from the browser

`/api/tts` accepts only up to 500 characters per request (longer answers are
split into several parts by the game and read in order), validates the voice
name, rate limits per IP (30 requests a minute), keeps the key server-side and
never echoes it. `GET /api/tts` reports only *whether* a key is configured and
which provider is ready; `GET /api/tts?probe=1` speaks two words once and
returns whether the key really works (used by the *Voice health* workflow). CORS is limited to the two live sites.
