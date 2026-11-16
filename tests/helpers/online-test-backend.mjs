// Test stand-ins for the two online services.
//   - The database is REAL: an in-process PostgreSQL (PGlite) loaded with the
//     very SQL files that are installed on the live project, so the tests run
//     the same tables, rules and functions as production.
//   - Firebase sign-in is a small in-memory stand-in (no network). As in the
//     real project, it offers Google only: guest accounts are not made there.
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

// The guest-id rule is taken from the real server function, so the page and the server are checked against each other.
const functionSource = readFileSync(new URL('../../server/function/bsu-data.ts', import.meta.url), 'utf8');
const { guestUid } = await import('data:text/javascript;base64,' + Buffer.from(functionSource).toString('base64'));
export { guestUid };

/** What the server function passes on after checking a sign-in. */
export const claimsOf = user => ({ google: !user.isAnonymous, email: user.email || '', name: user.displayName || '' });

/**
 * Plays the part of the server function. The player never comes from the request:
 * a guest is worked out from the guest key, a Google player from the signed-in user.
 */
export function transportFor(db, log, { net = '' } = {}) {
    return async (request, user, extra = {}) => {
        const uid = user.guestKey ? await guestUid(user.guestKey) : user.uid;
        if (user.guestKey && uid !== user.uid) throw new Error('the page and the server disagree about the guest id');
        const claims = { ...claimsOf(user), net, guest: !user.isAnonymous && extra.guestKey ? await guestUid(extra.guestKey) : '' };
        log?.push({ uid, request, sent: user.guestKey ? 'guest key' : 'google token' });
        const result = await db.query('select public.bsu_data($1, $2::jsonb, $3::jsonb) as answer', [uid, JSON.stringify(claims), JSON.stringify(request)]);
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
        async signInAnonymously() { throw Object.assign(new Error('ADMIN_ONLY_OPERATION'), { code: 'auth/admin-restricted-operation' }); },
        async signOut() { auth.currentUser = null; tell(); },
        async signInWithPopup() { auth.currentUser = sdk.nextGoogleUser; tell(); return { user: auth.currentUser }; },
        async signInWithCredential() { return auth.signInWithPopup(); }
    };
    const sdk = { apps: [{}], initializeApp() {}, auth: () => auth, nextGoogleUser: null };
    sdk.auth.GoogleAuthProvider = class { setCustomParameters() {} };
    return sdk;
}
