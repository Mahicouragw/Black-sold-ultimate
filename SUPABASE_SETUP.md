# Supabase Multiplayer Setup (Two One-Time Actions)

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

## Optional: enable Google linking later

Follow Supabase's official guide: https://supabase.com/docs/guides/auth/social-login/auth-google

Set the site URL to:

`https://black-sold-ultimate.vercel.app`

Add this redirect URL:

`https://black-sold-ultimate.vercel.app/**`

The Google OAuth secret belongs only in the Supabase dashboard and must never be committed to GitHub.
