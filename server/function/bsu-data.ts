// Black Sword Ultimate: online data gateway (Supabase Edge Function "bsu-data").
//
// Players sign in with Firebase Authentication (Google or guest). The game
// sends every online request here with that sign-in token. This file checks
// the token against Google's public keys, then hands the request to the
// database function public.bsu_data() together with the verified player id.
// The player id is never taken from the request body.
//
// Deployed with gateway JWT verification OFF, because the token is a Firebase
// token, not a Supabase one. Written as plain JavaScript so the Node tests can
// load this same file.

const KEYS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const DEFAULT_PROJECT = 'black-sword-ultimate-43c4d';
const MAX_BODY = 3200000;

let keyCache = { at: 0, ttl: 0, keys: new Map() };

const fromBase64Url = (text) => {
  const plain = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(plain + '='.repeat((4 - (plain.length % 4)) % 4));
  return Uint8Array.from(binary, (letter) => letter.charCodeAt(0));
};
const readJson = (part) => JSON.parse(new TextDecoder().decode(fromBase64Url(part)));

async function loadKeys(fetcher, now, force) {
  const fresh = keyCache.keys.size > 0 && now - keyCache.at < keyCache.ttl;
  // Keys rotate, so an unknown key id may ask for a new list, but at most once a minute.
  if (fresh && !(force && now - keyCache.at > 60000)) return keyCache.keys;
  const response = await fetcher(KEYS_URL);
  if (!response.ok) throw new Error('keys ' + response.status);
  const body = await response.json();
  const keys = new Map();
  for (const jwk of body.keys || []) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    keys.set(jwk.kid, await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  if (!keys.size) throw new Error('no keys');
  const maxAge = /max-age=(\d+)/.exec(response.headers?.get?.('cache-control') || '');
  const ttl = (maxAge ? Number(maxAge[1]) : 3600) * 1000;
  keyCache = { at: now, ttl: Math.min(Math.max(ttl, 60000), 6 * 3600000), keys };
  return keys;
}

/** Checks a Firebase ID token. Returns who the player is, or throws. */
export async function verifyFirebaseToken(token, { project = DEFAULT_PROJECT, fetcher = fetch, now = Date.now() } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const header = readJson(parts[0]), claims = readJson(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('algorithm');
  let keys = await loadKeys(fetcher, now, false);
  if (!keys.has(header.kid)) keys = await loadKeys(fetcher, now, true);
  const key = keys.get(header.kid);
  if (!key) throw new Error('unknown key');
  const signed = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64Url(parts[2]), signed))) throw new Error('signature');
  const seconds = Math.floor(now / 1000);
  if (claims.aud !== project) throw new Error('audience');
  if (claims.iss !== 'https://securetoken.google.com/' + project) throw new Error('issuer');
  if (!(Number(claims.exp) > seconds)) throw new Error('expired');
  if (!(Number(claims.iat) <= seconds + 300)) throw new Error('not yet valid');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) throw new Error('subject');
  return {
    uid: claims.sub,
    google: claims.firebase?.sign_in_provider === 'google.com',
    email: claims.email_verified === true && typeof claims.email === 'string' ? claims.email.toLowerCase().slice(0, 200) : '',
    name: typeof claims.name === 'string' ? claims.name.slice(0, 80) : '',
  };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const refuse = (code, message, status) => json({ data: null, error: { code, message } }, status);

/** db(player, request) calls public.bsu_data(); verify(token) checks the sign-in. */
export function createHandler({ db, verify, limit = 300 }) {
  const hits = new Map();
  const allowed = (uid) => {
    const now = Date.now(), entry = hits.get(uid);
    if (!entry || now - entry.at > 60000) { if (hits.size > 5000) hits.clear(); hits.set(uid, { at: now, n: 1 }); return true; }
    return ++entry.n <= limit;
  };
  return async function handle(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'GET') {
      // Health check: is the function up, and can it reach the database? No player data.
      try {
        const probe = await db({ uid: 'health-check' }, { kind: 'ping' });
        return json({ ok: true, service: 'bsu-data', database: probe?.data?.ok === true });
      } catch (_error) {
        return json({ ok: true, service: 'bsu-data', database: false });
      }
    }
    if (request.method !== 'POST') return refuse('method', 'Method not allowed.', 405);
    const header = request.headers.get('authorization') || '';
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    let player;
    try { player = await verify(token); } catch (_error) { return refuse('unauthenticated', 'Please sign in again.', 401); }
    if (!allowed(player.uid)) return refuse('slow_down', 'Too many requests. Please wait a moment.', 429);
    let body;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) return refuse('too_large', 'That is too large for the cloud.', 413);
      body = JSON.parse(text);
    } catch (_error) { return refuse('bad-request', 'The request could not be read.', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return refuse('bad-request', 'The request could not be read.', 400);
    try {
      const result = await db(player, body);
      if (!result || typeof result !== 'object') throw new Error('bad answer');
      return json({ data: result.data ?? null, error: result.error ?? null });
    } catch (_error) {
      return refuse('server', 'The online service cannot be reached right now.', 502);
    }
  };
}

if (typeof Deno !== 'undefined') {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const PROJECT = Deno.env.get('BSU_FIREBASE_PROJECT') ?? DEFAULT_PROJECT;
  const db = async (player, request) => {
    const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/bsu_data', {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_uid: player.uid, p_claims: { google: player.google === true, email: player.email || '', name: player.name || '' }, p_req: request }),
    });
    if (!response.ok) throw new Error('database ' + response.status);
    return await response.json();
  };
  Deno.serve(createHandler({ db, verify: (token) => verifyFirebaseToken(token, { project: PROJECT }) }));
}
