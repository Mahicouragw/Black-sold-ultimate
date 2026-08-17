# How to give an AI model a key or token — without pasting it in chat

This works for **any** AI assistant, not just one. Pick whichever method fits.
All are free.

---

## Method 1 — The drop file (best on a phone, no terminal)

1. Open **`TOKEN-HERE.txt`** in the workspace file list.
2. Replace the placeholder line with your key or token.
3. Save.
4. Tell the AI: **"key added"**.

The AI reads it, moves the secret into a private store, and **blanks the file
automatically**. The file is git-ignored, so it can never be committed.

Works for GitHub tokens, OpenRouter keys, OpenAI keys — anything.

---

## Method 2 — OAuth device flow (best for GitHub, nothing to copy)

```bash
npm run auth
```

The AI shows you a link and a short code. You tap the link, approve on
github.com, done. **Nothing is ever typed or pasted.** The token is issued
directly to the machine, and you can revoke it any time.

This is the same mechanism Apple TV and `gh auth login` use.

---

## Method 3 — The hosting dashboard (best for production secrets)

For anything the **live website** needs — like the AI NPC key — put it in the
host, never in the repo:

**Vercel** → your project → *Settings* → *Environment Variables* → Add →
select all environments → **Redeploy**.

**GitHub Actions** → repo → *Settings* → *Secrets and variables* → *Actions* →
*New repository secret*.

The AI never sees the value, and the value never travels through a chat log.

---

## Method 4 — Local env file (developer machines)

```bash
printf 'OPENROUTER_API_KEY=your-key-here\n' > .env.local
chmod 600 .env.local
```

`.env.local` is git-ignored. Server code reads it via `process.env`.

---

## Why pasting a secret into chat is the worst option

- Chat transcripts keep it in plain text, forever, in scrollback.
- **Providers actively scan for leaked keys and auto-revoke them.** A pasted
  key often dies within minutes, so you get asked for a new one — that is the
  loop people keep hitting.
- Long keys wrap badly and make a small screen unusable.

If a secret *has* already been pasted anywhere, treat it as public and rotate it.

---

## Rotating a leaked secret

| Service | Revoke at |
|---|---|
| OpenRouter | <https://openrouter.ai/keys> |
| GitHub | <https://github.com/settings/tokens> |
| OpenAI | <https://platform.openai.com/api-keys> |
| Google AI | <https://aistudio.google.com/apikey> |

Delete the old key first, then create a new one and supply it with Method 1–4.

---

## This project's secrets

| Secret | Purpose | Where it belongs |
|---|---|---|
| GitHub token | Push and deploy | `npm run auth`, or `.deploy-token` |
| `OPENROUTER_API_KEY` | AI NPC replies | Vercel env var (production), `.env.local` (local) |

**Never** commit either. `.gitignore` already excludes `.deploy-token`,
`TOKEN-HERE.txt`, `.env` and `.env.local`. Verify any time with:

```bash
git status --porcelain | grep -iE 'token|env'   # must print nothing
npm run security                                 # secret scan
```
