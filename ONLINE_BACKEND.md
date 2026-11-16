# Online backend

The game uses two free services. Nothing has to be set up to play; this page is for whoever maintains the game.

| Part | Service | What it does |
| --- | --- | --- |
| Google sign-in | Firebase Authentication (project `black-sword-ultimate-43c4d`) | Google sign-in only. Nothing else from Firebase is used. |
| Guest play | no service | The device makes one long random key and keeps it. The server turns the key into the guest's player id. |
| Data | Supabase (project `tmkpdvljhnlnvbckbnsc`, Mumbai region) | Cloud saves, hero names, friends, chat, chat rooms, feedback, guilds, combat groups, shared loot, map notes. |

## How a request travels

1. `online-backend.js` (in the page) sends the request to the server function `bsu-data` together with the player's sign-in: the Firebase token for a Google player, the device key for a guest.
2. `server/function/bsu-data.ts` checks the token with Google's public keys, or turns the guest key into the guest id. The player's id never comes from the request itself.
3. The function calls `public.bsu_data(...)` in the database. Only the function can call it; the public key cannot.
4. Inside the database the request runs as the role `bsu_player`, and the rules in `server/sql/bsu_004_social_rules.sql` decide what this player may read or write.

The page holds no database key.

## Files

- `server/sql/bsu_003_social_tables.sql` — tables
- `server/sql/bsu_004_social_rules.sql` — access rules and the query entry point
- `server/sql/bsu_005_social_functions.sql` — named actions (hero names, feedback, PIN recovery, chat rooms, live updates)
- `server/sql/bsu_006_social_selftest.sql` — `select bsu_social.selftest()`; it checks the rules with made-up players and rolls everything back
- `server/function/bsu-data.ts` — the server function
- `tests/online-backend.test.mjs` — runs the game's backend against the same SQL in an in-process PostgreSQL

## Guests

- A guest is tied to the device and browser. Clearing the browser data loses the key; the guest can come back with Player ID and PIN if a PIN was set.
- When a guest signs in with a Google account that has no heroes yet, the guest's cloud save and hero names move to that account. If the account already has heroes, the game switches to it and the guest stays as it was.
- One network can create at most 60 new guests per hour. The network is stored as a one-way code for one day, never as an address.

## Limits of the free plan

- Database size: 500 MB (shared with the owner's other app in the same project).
- A free project is paused after about a week without any request. Players opening the game count as requests. If it is paused, open the Supabase dashboard and press "Restore".
- Live updates (new chat lines, friend requests) are fetched every few seconds while the game is open, not pushed.

## Reading feedback

Moderators are listed in `bsu_social.owner_emails` (by verified Google e-mail) or `bsu_social.moderators` (by player id).

## Health check

Open `https://tmkpdvljhnlnvbckbnsc.supabase.co/functions/v1/bsu-data` in a browser. `{"ok":true,"service":"bsu-data","database":true}` means the function runs and reaches the database.
