# Firebase setup (free plan)

Black Sword Ultimate uses one Firebase project, `black-sword-ultimate-43c4d`, for everything online:

| Part | What it does |
| --- | --- |
| Firebase Authentication | Guest accounts and Google sign-in |
| Cloud Firestore | Cloud saves, hero names, friends, chat, chat rooms, feedback, guilds, combat groups, shared loot, map notes, Player ID + PIN recovery |

Both are on the free **Spark** plan. No card is needed. If the daily free amount is used up, online features pause until the next day; nothing is charged.

## One-time steps in the Firebase console

Open <https://console.firebase.google.com> and choose the project **black-sword-ultimate-43c4d**.

1. **Create the database.** Build → Firestore Database → **Create database**. Choose a location near your players (for India: `asia-south1`, Mumbai). Choose **Start in production mode**. Press Create.
2. **Install the rules.** In Firestore Database open the **Rules** tab. Delete the text that is there, paste the whole content of [`firestore.rules`](firestore.rules), and press **Publish**.
3. **Check sign-in.** Build → Authentication → Sign-in method: **Google** and **Anonymous** must both be enabled.
4. **Check the web address.** Authentication → Settings → Authorized domains must contain the address the game is played on (for example `black-sold-ultimate.vercel.app`).

No indexes have to be created by hand: every query the game makes works with the automatic indexes.

## Reading the feedback players send

Feedback is private. To read it in the game (the moderator inbox), do one of these:

- In `firestore.rules`, put your own Google e-mail address in `ownerEmails()`, for example `return ['myname@gmail.com'];`, and publish the rules again. Sign in to the game with that Google account.
- Or, in the Firestore console, create a collection `moderator_roles`, add a document whose name is the player's account id, with a field `active` (boolean) set to `true`.

You can also read all feedback directly in the console, in the `game_feedback` collection.

## What runs where

The free plan cannot run server code, so:

- Hunger, the daily prayer, the permanent blessing, palace quests and board games against the computer are decided on the player's device.
- Board games against another player, and trading between players, are switched off in this version. They need a referee that both players can trust.
- Chat messages are shown for five minutes. After that no player can see them, and the game removes them from the database the next time someone opens chat.

## How the data is laid out

| Collection | Content |
| --- | --- |
| `profiles/{uid}` | Public hero card: name, level, place, last seen |
| `accounts/{uid}` | Private Player ID (only the owner can read it) |
| `hero_names/{name}` | One document per hero name, so names are unique |
| `game_saves/{uid}` + `parts` | The save, stored as text in parts |
| `player_recovery/{code}` + `parts` | Copy of the save for Player ID + PIN sign-in. The document name is a one-way code made from the Player ID and the PIN; the PIN is never stored |
| `friend_requests`, `guild_invites`, `combat_group_invites`, `chat_room_invites` | Requests between two players |
| `public_messages`, `inbox/{uid}/messages` | World chat and private messages |
| `chat_rooms/{room}` + `members`, `messages`, `blacklist` | Chat rooms |
| `guilds`, `guild_members`, `combat_groups` + `actions`, `combat_group_members` | Groups |
| `world_drops`, `community_map_markers`, `game_feedback` | Shared loot, map notes, feedback |

The code that talks to Firebase is [`firebase-backend.js`](firebase-backend.js). Its tests (`tests/firebase-backend.test.mjs`) run against an in-memory stand-in for Firestore; they check the game's requests, not the security rules. The rules have to be tried once on the real project after publishing.
