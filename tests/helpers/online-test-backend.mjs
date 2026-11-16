// Test stand-ins for the two online services.
//   - The database is REAL: an in-process PostgreSQL (PGlite) loaded with the
//     very SQL files that are installed on the live project, so the tests run
//     the same tables, rules and functions as production.
//   - Firebase sign-in is a small in-memory stand-in (no network).
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';

const FILES = ['bsu_003_social_tables', 'bsu_004_social_rules', 'bsu_005_social_functions'];

export async function createDatabase({ selftest = false } = {}) {
    const db = new PGlite({ extensions: { pgcrypto } });
    // What a Supabase project already has before our files are applied.
    await db.exec('create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema extensions; create extension pgcrypto with schema extensions;');
    for (const file of selftest ? [...FILES, 'bsu_006_social_selftest'] : FILES) await db.exec(readFileSync(new URL(`../../server/sql/${file}.sql`, import.meta.url), 'utf8'));
    return db;
}

/** What the server function passes on after checking a sign-in token. */
export const claimsOf = user => ({ google: !user.isAnonymous, email: user.email || '', name: user.displayName || '' });

/** Plays the part of the server function: the player comes from the signed-in user, never from the request. */
export function transportFor(db, log) {
    return async (request, user) => {
        log?.push({ uid: user.uid, request });
        const result = await db.query('select public.bsu_data($1, $2::jsonb, $3::jsonb) as answer', [user.uid, JSON.stringify(claimsOf(user)), JSON.stringify(request)]);
        return result.rows[0].answer;
    };
}

export const googleUser = (uid, name) => ({ uid, isAnonymous: false, displayName: name, email: `${uid}@example.test`, providerData: [{ providerId: 'google.com', displayName: name, email: `${uid}@example.test` }], getIdToken: async () => 'token' });

export function createFakeSdk(user) {
    const listeners = new Set();
    const tell = () => { for (const callback of listeners) callback(auth.currentUser); };
    const auth = {
        currentUser: user || null,
        onAuthStateChanged(callback) { listeners.add(callback); queueMicrotask(() => callback(auth.currentUser)); return () => listeners.delete(callback); },
        async signInAnonymously() { auth.currentUser = { uid: 'guest-' + Math.random().toString(36).slice(2, 8), isAnonymous: true, providerData: [], displayName: null, getIdToken: async () => 'token' }; tell(); return { user: auth.currentUser }; },
        async signOut() { auth.currentUser = null; tell(); },
        async signInWithPopup() { auth.currentUser = sdk.nextGoogleUser; tell(); return { user: auth.currentUser }; },
        async signInWithCredential() { return auth.signInWithPopup(); }
    };
    const sdk = { apps: [{}], initializeApp() {}, auth: () => auth, nextGoogleUser: null };
    sdk.auth.GoogleAuthProvider = class { setCustomParameters() {} };
    return sdk;
}
