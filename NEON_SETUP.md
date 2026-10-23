# Black Sword Ultimate — Neon backend

Black Sword Ultimate uses **Neon Postgres, Managed Better Auth, and the Neon Data API**. The browser never receives a database password, identity assertion, service-role key, or Google client secret.

## No-card provisioning and ownership

The initial project is provisioned through Claimable Neon without signup or payment details. An unclaimed project is temporary: it expires after **72 hours**, with Claimable Neon storage/transfer limits. A human must claim it to keep it. Claim links last **15 minutes**; starting a claim rotates the database password, while Auth and Data API URLs remain enabled.

The reviewed GitHub Actions workflow performs provisioning, the complete schema migration, integration/security verification, and claim handoff in one job. It does not depend on the unavailable Actions secrets API. Public configuration is posted to the pull request you name when dispatching the workflow. The claim URL and project-scoped credentials are encrypted with the workspace-held RSA key; the private key remains in gitignored `.neon/` and is never committed or printed.

## Provisioning runbook

1. **Create the handoff key pair once.** The public key is committed; the private key stays in the workspace.

   ```sh
   npm run neon:keygen            # refuses to overwrite an existing pair
   git add neon/handoff-public-key.pem
   ```

   Back up `.neon/handoff-private-key.pem`. A published handoff cannot be decrypted without it, and `--force` rotation makes older claim links permanently unreadable.

2. **Dispatch the provisioning workflow** from `main`, naming the pull request that should receive the encrypted handoff (any open or merged PR in this repository works):

   ```sh
   gh workflow run neon-backend.yml -f handoff_pr=<pull-request-number>
   gh run watch
   ```

   If the automation token cannot dispatch workflows, touch `neon/provision-request` on an `arena/**` session branch and push. That path is the only push trigger, so ordinary pushes never create projects. The handoff target falls back to the pull request recorded in `neon/handoff-pr`.

   The job provisions a Claimable Neon project, publishes the encrypted handoff and public configuration to that PR, applies `neon/schema.sql`, refreshes the Data API schema cache, and runs the integration/security verifier. The job does **not** wait for a human unless you also pass `-f wait_for_claim=true`.

3. **Recover and apply the public configuration** in the workspace:

   ```sh
   npm run neon:recover          # prints the claim URL and writes .neon/*.json
   npm run neon:apply-config     # writes the Auth/Data API URLs into backend-config.js
   ```

4. **Claim the project.** Open the printed `claim_url` and sign in to Neon within **15 minutes** of it being minted, before the project's **72-hour** pre-claim expiry. Claiming rotates the pre-claim database password (so `.neon/credentials.json` stops working for direct Postgres access) while the Auth and Data API URLs — and every cloud save inside the project — transfer unchanged.

Re-running provisioning without an identity assertion creates a *new* project. To re-apply schema to the existing project, reuse `.neon/credentials.json` locally with `NEON_IDENTITY_ASSERTION` and `NEON_PROJECT_ID` set, or run `npm run neon:migrate` after writing that file to `NEON_SECRET_FILE`.

## Client architecture

- `assets/vendor/neon-0.9.0-beta.js` is a reproducible browser bundle of `@neondatabase/neon-js`.
- `neon-game-client.js` supplies persistent guest sign-in and authenticated synchronization.
- `backend-config.js` contains only public Auth/Data API URLs.
- `online.js`, `chat-rooms.js`, and `game-hall.js` retain their existing query and RPC shapes through Neon's Supabase auth adapter.

Neon does not support Supabase anonymous sign-in. The compatibility client creates a real, persistent guest account with a cryptographically random local credential. That credential stays in this browser's local storage, and local guest progress remains separate and safe. Signing out clears the guest credential so a subsequent guest session can be new.

Google sign-in uses Neon's managed full-page OAuth flow. No Google secret is shipped to the browser. After return, the existing guest-merge and cloud-restore flow runs unchanged.

Supabase realtime publications are not available on Claimable Neon. The compatibility client uses authenticated, RLS-protected polling for the same message, invitation, combat, chat-room, and Game Hall table events. Active matches synchronize approximately every 1–2 seconds; background intervals are slower. A failed poll retains the last valid snapshot and is never treated as deletion.

## Schema

`neon/schema.sql` is generated from the ordered, reviewed application migrations:

```sh
npm run neon:schema
```

The generator replaces Supabase `auth.users`/`auth.identities`, role names, and realtime publication statements. It keeps pgcrypto in `extensions`, makes named policies rerunnable, and preserves all features through player-to-player trading v20. `scripts/neon-migrate.mjs` applies the generated file in one owner transaction with an advisory lock, then the workflow refreshes the Data API schema cache through Neon's management API before browser-level verification.

The integration verifier checks:

- persistent guest sign-up and automatic profile creation;
- cloud-save reads/writes and cross-account RLS isolation;
- public and room chat, including five-minute expiry metadata;
- friend requests and linked-identity authorization;
- online Game Hall invitation, membership, and versioned state updates;
- atomic item/gold trading;
- real Google OAuth initialization and Neon callback configuration.

Verification users and their data are deleted afterward. The OAuth configuration check does not claim that a human has completed Google sign-in; production sign-in is verified separately in the browser.

## Rebuild and checks

```sh
npm ci
npm run neon:schema
npm run neon:vendor
npm test
npm run validate
npm run pwa:check
npm run security
```

## Existing Supabase saves

This migration creates a new backend. It does **not** recover or copy cloud saves from the inactive Supabase project, and no existing Supabase project is modified by this setup. Local guest rosters remain on the player's device and can be saved to Neon after the player continues or links an account.
