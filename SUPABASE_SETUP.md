# Supabase Multiplayer Setup

## Fast path for all post-schema updates

If `supabase/schema.sql` was already run, open [`supabase/apply_all_updates.sql`](supabase/apply_all_updates.sql), paste it into the Supabase SQL Editor, and press **Run** once. It safely applies Player ID/PIN recovery, spoken guest chat, brotherhood invitations, online combat groups, cooperative battle actions, and feedback tables together.

The public project URL and publishable key are already configured in `supabase-config.js`. Never put a service-role key, database password, or JWT secret in that file.

## 1. Install the secure database schema

1. Open https://supabase.com/dashboard/project/zncepqzgsidqjvkayxdr/sql/new
2. Open [`supabase/schema.sql`](supabase/schema.sql) from this repository.
3. Copy all of it, paste it into the SQL Editor, and press **Run** once.

This creates profiles, permanent Player IDs, cloud saves, friend requests, messages, guilds, blocks, reports, indexes, Realtime subscriptions, and Row Level Security policies.

## 2. Enable anonymous guest accounts

1. Open https://supabase.com/dashboard/project/zncepqzgsidqjvkayxdr/auth/providers
2. Find **Anonymous Sign-Ins** (under Authentication settings/providers).
3. Turn it **On** and save.

Anonymous authentication gives every new player a secure Supabase user and permanent `KND-XXXX-XXXX` Player ID without asking them to register. Guests can play, cloud-save, read public chat and receive friend requests. Sending messages/requests and joining guilds requires a linked Google identity.

## 3. Install Sacred Realms recovery functions

1. Open https://supabase.com/dashboard/project/zncepqzgsidqjvkayxdr/sql/new
2. Open [`supabase/features_v3.sql`](supabase/features_v3.sql), copy all of it, paste it into the SQL Editor, and press **Run** once.

This adds secure Player ID + six-digit PIN progress recovery. PINs are hashed with bcrypt-compatible PostgreSQL `crypt`, never returned to the browser, and failed recovery attempts are limited.

## 4. Enable 20-profile spoken chat and guest messaging

1. Open https://supabase.com/dashboard/project/zncepqzgsidqjvkayxdr/sql/new
2. Open [`supabase/features_v5_voice_chat.sql`](supabase/features_v5_voice_chat.sql), copy all of it, paste it into the SQL Editor, and press **Run** once.

This stores the sender's selected `boy-1`…`boy-10` or `girl-1`…`girl-10` voice profile with each message and permits authenticated guests to chat. Text remains the source of truth; recipients' browsers synthesize it with the selected profile.

## 5. Enable brotherhoods, online combat groups, cooperative attacks, and feedback

1. Open https://supabase.com/dashboard/project/zncepqzgsidqjvkayxdr/sql/new
2. Open [`supabase/features_v6_multiplayer.sql`](supabase/features_v6_multiplayer.sql), copy all of it, paste it into the SQL Editor, and press **Run** once.

This adds invitation-only brotherhood membership, online combat groups, shared battle-damage events, and secure player feedback/bug reports with Row Level Security.

## 6. Make Player IDs private

Run [`supabase/features_v7_private_ids.sql`](supabase/features_v7_private_ids.sql) to revoke public `player_code` reads. The owner retrieves their own code through a protected RPC; public social queries receive only hero names and safe gameplay fields. This section is already included in `apply_all_updates.sql`.

## 7. Fix six-digit PIN recovery cryptography

Run [`supabase/features_v8_recovery_fix.sql`](supabase/features_v8_recovery_fix.sql) if PIN recovery reports `crypt(text, text) does not exist`. It resolves Supabase's `extensions` schema explicitly. This fix is already included in the latest `apply_all_updates.sql`.

## 8. Enable public dropped items

Run [`supabase/features_v9_housing_drops.sql`](supabase/features_v9_housing_drops.sql) so items dropped outside private houses become location-based public loot that another online player may take. This migration is already included in `apply_all_updates.sql`.

## 9. Enable secure chat rooms

Run [`supabase/features_v10_chat_rooms.sql`](supabase/features_v10_chat_rooms.sql) to add four permanent public rooms, owner-only personal rooms, custom public/private rooms, room invitations, member limits, five/ten-minute activation, occupancy, creator deletion, room blacklists, messages, and Realtime subscriptions. This migration is included in `apply_all_updates.sql`.

## 10. Enable community-created maps

Run [`supabase/features_v11_community_maps.sql`](supabase/features_v11_community_maps.sql) to let linked heroes publish public or brotherhood-visible map markers with creator-only editing/deletion and Row Level Security. This migration is included in `apply_all_updates.sql`.

## 11. Enable realtime chat translation metadata

Run [`supabase/features_v12_translation.sql`](supabase/features_v12_translation.sql) to store each sender's source language with direct and room messages. Every recipient then translates locally into their selected game language. This migration is included in `apply_all_updates.sql`.

## 12. Enforce unique hero names and real system voices

Run [`supabase/features_v13_unique_names_real_voices.sql`](supabase/features_v13_unique_names_real_voices.sql) to reserve hero names case-insensitively across all accounts and allow actual device voice descriptors instead of Boy/Girl profile codes. This migration is included in `apply_all_updates.sql`.

## Optional: enable Google linking later

Follow Supabase's official guide: https://supabase.com/docs/guides/auth/social-login/auth-google

Set the site URL to:

`https://black-sold-ultimate.vercel.app`

Add this redirect URL:

`https://black-sold-ultimate.vercel.app/**`

The Google OAuth secret belongs only in the Supabase dashboard and must never be committed to GitHub.
