# Deployment — one command, any agent, any model

## Why a release previously stopped at "please push manually"

It was never a code problem, and it is not specific to one AI model. Sandboxed
agent environments are deliberately created with **no GitHub credential**:

| Checked | Result |
|---|---|
| Network to `github.com` / `api.github.com` | ✅ reachable (HTTP 200) |
| Anonymous **read** (clone, API) | ✅ works |
| `GITHUB_TOKEN` / `GH_TOKEN` in environment | ❌ not present |
| `gh` CLI | ❌ not installed |
| SSH key (`~/.ssh`) | ❌ none |
| Git credential helper | ❌ none configured |
| Anonymous **write** (push) | ❌ `could not read Username for 'https://github.com'` |

GitHub will not accept an anonymous write. Only the repository owner can mint a
credential. **That is a security guarantee, not a bug** — an environment that let
an AI agent push to arbitrary repositories without your consent would be a far
worse problem than a manual push. So the correct engineering answer is not to
bypass the credential; it is to make supplying it a **one-time, 60-second action**
that unlocks a **fully autonomous** pipeline forever after.

That is what `scripts/deploy.mjs` does.

## The one command

```bash
npm run deploy
```

That single command performs the entire release with no further input:

1. **Credential resolution** — env var or token file (details below).
2. **Scope check** — confirms the token really has write access *before* touching anything.
3. **Preflight gates** — regression suite, audio + world validation, PWA check,
   security/secret scan, production build. **Any failure aborts before committing.**
4. **Commit** — only if the tree is dirty.
5. **Push** — `HEAD:main`, using an in-memory authenticated URL.
6. **Watch GitHub Actions** — polls the runs for that exact commit SHA and fails
   loudly if any workflow fails.
7. **Verify the live sites** — polls `version.js` on GitHub Pages *and* Vercel until
   both actually serve the new version.

It exits non-zero if the release did not genuinely reach production. It cannot
report a false success, because success is defined as *the public sites serving
the new version*, not *the push returned 0*.

## Supplying the credential (once)

Create a fine-grained token — <https://github.com/settings/personal-access-tokens/new>

| Setting | Value |
|---|---|
| Repository access | Only select repositories → `Mahicouragw/Black-sold-ultimate` |
| Contents | **Read and write** |
| Workflows | Read and write *(only needed if `.github/workflows/**` changes)* |
| Expiration | 30–90 days is fine; the script tells you when it expires |

Then either:

```bash
# Option A — environment variable (nothing touches disk)
export GITHUB_TOKEN=github_pat_xxx
npm run deploy
```

```bash
# Option B — token file (survives across agent sessions)
printf '%s' 'github_pat_xxx' > .deploy-token
npm run deploy
```

`.deploy-token` is in `.gitignore` and `.vercelignore`, and credential paths are
excluded from workspace snapshots.

Accepted env vars, in priority order: `GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_PAT`,
`BSU_DEPLOY_TOKEN`. Token files: `.deploy-token`, `~/.bsu-deploy-token`.
This covers essentially every convention an agent or CI system already uses, so
**any** model that lands in this repo finds the credential automatically.

## Token safety (verified, not asserted)

| Guarantee | How it is enforced | Verified |
|---|---|---|
| Never written to `.git/config` | Auth URL is a one-shot argument; `git remote set-url` is never called | ✅ 0 occurrences |
| Never cached by a helper | Push runs with `-c credential.helper=` (disabled) | ✅ |
| Never printed in logs or errors | `redact()` scrubs the secret from every output path | ✅ 0 occurrences |
| Never committed | `.gitignore` + `.vercelignore` + snapshot exclusion | ✅ 0 staged |
| Never used if invalid | Scope check runs before any commit | ✅ 401 aborts cleanly |

Revoke any time at <https://github.com/settings/tokens>.

## Zero-credential fallback

If you would rather not create a token at all, use
`.github/workflows/release.yml`. GitHub Actions injects its own short-lived
token, so the release runs entirely inside GitHub:

**Actions tab → "Release and verify" → Run workflow**

It runs the identical preflight gates and the identical live-site verification,
then fails the run if either public site does not serve the expected version.

## Other commands

```bash
npm run deploy:verify   # what version are the live sites serving right now?
npm run deploy:dry      # full preflight + commit, stops before pushing
npm run deploy -- --message "Custom commit message"
npm run deploy -- --skip-tests    # emergency hotfix only; skips the gates
```

## Current state

- Local: **v7.22.1**, committed, 131/131 tests passing, all gates green.
- Live: **v7.22.0** on both sites (confirmed by `npm run deploy:verify`).
- Remaining action: supply a credential once, then `npm run deploy`.
