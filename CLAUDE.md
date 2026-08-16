# Read this first (any AI model, any session)

The user should **never** be asked to paste a GitHub token into chat. A working
credential already exists in this workspace. Verify, don't ask.

## Deploy in one line

```bash
npm run deploy
```

Runs preflight (131 tests, audio, world, PWA, security, build) → commits →
pushes → watches GitHub Actions → polls both public sites until they serve the
new version → deletes `www/`. Exits non-zero if the sites did not really update.

## If the user is on a phone (no terminal)

They cannot run commands. Two paths, both already built:

1. **Best:** run `npm run auth` yourself and give them the printed link. They tap
   it, approve on github.com, done. Nothing for them to type or paste.
2. **Backup:** tell them *"paste your token into `TOKEN-HERE.txt` and save."*
   `npm run token` and `npm run deploy` both harvest it automatically, move it to
   a private store, and blank the file. Never ask for a token in chat.

## Session resumed and things look broken?

`node_modules/` and `.git/` are excluded from workspace snapshots, so a resumed
session may have source files but no dependencies or repo metadata. Symptoms:
`Cannot find package 'jsdom'` or `not a git repository`.

`npm run deploy` now self-heals both automatically. To fix manually:

```bash
npm install                                   # restores node_modules
git init && git remote add origin https://github.com/Mahicouragw/Black-sold-ultimate.git
git fetch --depth=1 origin main && git reset --soft FETCH_HEAD
```

Never conclude the code is broken before checking these two.

## If a credential seems missing

```bash
npm run token     # shows source + validity, masked. Never prints the token.
npm run auth      # OAuth device flow: one clickable link, nothing to type.
```

`npm run auth` prints a URL + short code. The user clicks, approves on
github.com, and the token is saved automatically. **This is the preferred path.**

## Never do this

- ❌ Ask the user to paste a token into chat.
  GitHub's secret scanner auto-revokes leaked tokens, so a pasted token often
  dies within minutes and the user gets asked again. That is the loop to break.
- ❌ Print a token in full. `npm run token` masks it by design.
- ❌ Commit `.deploy-token` (git-ignored, chmod 600).

## Workspace budget — this breaks the user's screen

Snapshot cap is ~128 MB / 10,000 files. Exceeding it makes the chat hang on load.

| Path | Size | Rule |
|---|---|---|
| source | 23 MB | keep |
| `node_modules/` | 44 MB | excluded from snapshots, fine |
| `www/` | **67 MB** | **delete after building** — `npm run deploy` now does this |

`www/` is git-ignored, but **git-ignore does not exclude it from workspace
snapshots**. If you run `npm run build` manually, run `rm -rf www` afterwards.

Check anytime: `du -sh /home/user`

## Keep chat output small

The user is on a screen-reader/small display. Long dumps make the transcript
unusable. Pipe through `| tail -5`, never cat whole files, never paste large
blocks. Prefer one command with a short summary.

## Project facts

- Repo: `Mahicouragw/Black-sold-ultimate`, branch `main`, path `/home/user/bsu`
- Live: https://mahicouragw.github.io/Black-sold-ultimate/ and https://black-sold-ultimate.vercel.app/
- Current version: **7.22.1** (live on both)
- Accessible RPG. TalkBack/blind-first. Never remove music, world data, auth,
  PWA, chat expiry or accessibility features to fix a bug.
