# Black Sword Ultimate — Neon backend

Black Sword Ultimate uses **Neon Postgres, Managed Better Auth, and the Neon Data API**. The browser only ever receives public Auth and Data API URLs. It never receives a database password, identity assertion, service-role key, or Google client secret.

## No-card provisioning and ownership

The project is provisioned through **Claimable Neon** without signup or payment details. An unclaimed project is temporary: it expires after **72 hours**. A human must claim it to keep it.

- Claim links last **15 minutes**.
- Claiming rotates the pre-claim database password. The Auth and Data API URLs, and every row already in the database, transfer unchanged.

### Where secrets live

| Secret | Location | Notes |
| --- | --- | --- |
| Identity assertion (durable) | `~/.black-sword-neon/secrets.json` | mode `0600`, directory `0700` |
| Pre-claim database password | `~/.black-sword-neon/secrets.json` | same file, never printed |
| Handoff private key | `~/.black-sword-neon/handoff-private-key.pem` | mode `0600` |
| Public configuration | `~/.black-sword-neon/public.json` | Auth/Data API URLs, safe to publish |

`scripts/neon-secrets.mjs` refuses to write any of these inside the repository, inside `.neon/`, or under `/tmp`. The Git tree only contains the RSA **public** key (`neon/handoff-public-key.pem`).

If the identity assertion is lost, the unclaimed project cannot be recovered and must be re-provisioned. If the private key is lost, the encrypted handoff comment cannot be decrypted (the printed claim URL and a fresh recovery are still possible from the stored assertion). Say so plainly rather than guessing.

## Provisioning runbook

1. **Create the handoff key pair once.**

   ```sh
   npm run neon:keygen            # refuses to overwrite an existing pair
   git add neon/handoff-public-key.pem
   ```

   The private key is written to `~/.black-sword-neon/handoff-private-key.pem`. Back it up.

2. **Provision and claim immediately.** Locally:

   ```sh
   npm run neon:provision
   ```

   or from Actions (manual dispatch only — this workflow never provisions on push):

   ```sh
   gh workflow run neon-backend.yml -f stage=provision
   gh run watch
   ```

   The **same run** creates the project, stores the credentials outside the tree, mints the claim link, and **prints the full claim URL** (also in the job summary). Do not defer this step.

3. **Open the claim URL now** (15-minute window) and sign in to Neon to take ownership. Schema work deliberately happens *after* this point. If the code expires, run `npm run neon:claim` to mint a new link from the stored assertion — never re-provision just because a code expired.

4. **Apply the schema and verify.**

   ```sh
   npm run neon:schema            # regenerate + commit neon/schema.sql if sources changed
   npm run neon:migrate           # advisory lock + one transaction, safe to run twice
   npm run neon:refresh           # refresh the Data API schema cache
   npm run neon:verify
   npm run neon:apply-config      # write the public URLs into backend-config.js
   ```

   From Actions, dispatch `stage=verify` with repository secrets `NEON_PROJECT_SECRETS` (the JSON content of `~/.black-sword-neon/secrets.json`) and `NEON_PUBLIC_CONFIG` (the JSON content of `public.json`). The workflow materialises them in the runner's home directory with mode `0600` for the duration of the job.

## Client architecture

- `assets/vendor/neon-0.9.0-beta.js` is a reproducible browser bundle of `@neondatabase/neon-js` (`npm run neon:vendor`).
- `neon-game-client.js` supplies persistent guest sign-in and authenticated polling.
- `backend-config.js` contains only public Auth/Data API URLs.
- `online.js`, `chat-rooms.js`, and `game-hall.js` keep their existing query and RPC shapes through Neon's Supabase auth adapter.

Neon has no anonymous sign-in. The compatibility client creates a real, persistent account from a cryptographically random credential (`hero-<uuid>@guest.black-sword.local`, 40+ character password) stored in `localStorage`. Sign-out clears it. Regenerating a credential creates a genuinely new account.

Google sign-in uses Neon's managed full-page OAuth flow; no Google secret is shipped. **Google is optional**: if the provider is not configured, verification prints `Google sign-in not configured` and passes, and prints the exact redirect URI to register:

```
<AUTH_URL>/callback/google
```

Realtime: Neon has no publications, so the client polls authenticated, RLS-protected tables — roughly 1.2 s for an active Game Hall match, 2 s for chat rooms, 5 s in the background. A failed poll keeps the last good snapshot and is never reported as a deletion.

## Schema

`neon/schema.sql` is generated from the ordered, reviewed migrations:

```sh
npm run neon:schema
```

`scripts/build-neon-schema.mjs`:

- rewrites `auth.users` → `neon_auth."user"` and `auth.identities` → `neon_auth.account`;
- rewrites the `anon` role to `anonymous` and drops `supabase_realtime` publications and `service_role` grants;
- emits a bootstrap that creates the `authenticated`/`anonymous` roles if absent and re-implements `auth.uid()`, `auth.role()`, and `auth.jwt()` on top of the Data API's `request.jwt.claims`;
- bridges Neon Auth's text user ids to the application's uuid keys with `public.neon_subject_uuid()` (UUID-shaped ids pass through unchanged);
- makes every `CREATE POLICY` rerunnable and strips `BEGIN`/`COMMIT` (the runner owns the transaction);
- **fails the build** if any Supabase-only dependency survives.

`scripts/neon-migrate.mjs` preflights Neon Auth, takes an advisory lock, applies the file in a single transaction, and records `public.backend_migrations`. Applying twice is safe.

## Verification

`npm test` includes a Postgres-backed schema test (PGlite — PostgreSQL compiled to WebAssembly, so no server is needed):

- applies `neon/schema.sql` **twice**;
- asserts every table has RLS enabled;
- creates two identities, then proves cross-account reads and writes are denied;
- exercises the Auth trigger, the uuid bridge (for both text and uuid Auth ids), linked-identity gating, friend-request acceptance, and cascade deletion.

The live verifier (`npm run neon:verify`) covers guest sign-up, automatic profile creation, cloud-save read/write, cross-account RLS denial, public and room chat, friend request + accept, Game Hall invite/join/versioned state, atomic trading, and Google OAuth initialization (optional). Verification users are deleted afterwards. It does not claim that a human completed Google sign-in; production sign-in is verified in the browser.

## Checks

```sh
npm ci
npm run neon:schema
npm run neon:vendor
npm test
npm run validate
npm run security
npm run pwa:check
npm run build
```

## Existing Supabase saves

This migration creates a new backend. It does **not** copy cloud saves from the inactive Supabase project, and no Supabase project is modified. Local guest rosters stay on the device and can be saved to Neon after the player continues or links an account.
