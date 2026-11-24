// Black Sword Ultimate: the owner's sound studio gateway (Supabase Edge Function "bsu-audio").
//
// This is deliberately separate from `bsu-data`. If the studio is unavailable,
// cloud saves, chat and the rest of the online game keep working exactly as
// they are.
//
//   GET  ?list=1                 every published cue (public; used by the game)
//   POST { action: 'who' }       is this player the owner?
//   POST { action: 'publish' }   admin only: store a recorded file and publish it
//   POST { action: 'delete' }    admin only: stop serving a cue
//
// The caller proves who they are with a Firebase ID token in `Authorization:
// Bearer`. Only a player whose id is listed in `public.audio_admins` may
// publish. The service key never leaves this function.
//
// Written as plain JavaScript so the Node tests can import this same file.

const KEYS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const DEFAULT_PROJECT = 'black-sword-ultimate-43c4d';
const BUCKET = 'game-audio';
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const CUE_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}$/;
const KINDS = new Set(['sfx', 'music']);
const MIME_EXT = {
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg',
  'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const refuse = (code, message, status = 400) => json({ data: null, error: { code, message } }, status);

let keyCache = { at: 0, ttl: 0, keys: new Map() };

const fromBase64Url = (text) => {
  const plain = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(plain + '='.repeat((4 - (plain.length % 4)) % 4));
  return Uint8Array.from(binary, (letter) => letter.charCodeAt(0));
};
const readJson = (part) => JSON.parse(new TextDecoder().decode(fromBase64Url(part)));

async function loadKeys(fetcher, now, force) {
  const fresh = keyCache.keys.size > 0 && now - keyCache.at < keyCache.ttl;
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
  const signature = fromBase64Url(parts[2]);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed))) throw new Error('signature');
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

/** Talks to Supabase REST/Storage with the service key. */
function database(env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  const call = env.fetch || fetch;
  const headers = { apikey: key, Authorization: 'Bearer ' + key };
  return {
    ready: Boolean(url && key),
    async select(sqlPath) {
      const response = await call(`${url}/rest/v1/${sqlPath}`, { headers: { ...headers, Accept: 'application/json' } });
      if (!response.ok) throw new Error('select ' + response.status);
      return response.json();
    },
    async upsertCue(row) {
      const response = await call(`${url}/rest/v1/audio_cues`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(row)
      });
      if (!response.ok) throw new Error('publish ' + response.status);
      return response.json();
    },
    async updateCue(cue, patch) {
      const response = await call(`${url}/rest/v1/audio_cues?cue=eq.${encodeURIComponent(cue)}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(patch)
      });
      if (!response.ok) throw new Error('update ' + response.status);
      return response.json();
    },
    async upload(path, bytes, mime) {
      const response = await call(`${url}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': mime, 'x-upsert': 'true', 'Cache-Control': '3600' },
        body: bytes
      });
      if (!response.ok) throw new Error('storage ' + response.status);
      return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
    }
  };
}

const characters = request => {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : '';
};

const safeName = (name, ext) => {
  const base = String(name || 'recording').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'recording';
  return base.endsWith('.' + ext) ? base : `${base}.${ext}`;
};

const toBase64Bytes = (text) => {
  const clean = String(text || '').replace(/^data:[^;]+;base64,/, '');
  if (!/^[A-Za-z0-9+/=\s]*$/.test(clean)) throw new Error('bad-base64');
  const binary = atob(clean.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const looksRecorded = (bytes, mime) => {
  const head = bytes.subarray(0, 12);
  const text = String.fromCharCode(...head);
  if (mime === 'audio/wav' || mime === 'audio/x-wav' || mime === 'audio/wave') return text.slice(0, 4) === 'RIFF' && text.slice(8, 12) === 'WAVE';
  if (mime === 'audio/ogg') return text.slice(0, 4) === 'OggS';
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return text.slice(0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
  if (mime === 'audio/mp4' || mime === 'audio/aac' || mime === 'audio/flac') return text.slice(4, 8) === 'ftyp' || text.slice(0, 4) === 'fLaC' || head[0] === 0xff;
  return false;
};

/**
 * The whole HTTP surface, with every outside call injectable so the same code
 * runs in the edge runtime and in the Node tests.
 */
export async function handleRequest(request, env = {}) {
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const db = database(env);
  if (!db.ready) return refuse('not-configured', 'The sound studio is not configured yet.', 503);

  const url = new URL(request.url);

  if (method === 'GET') {
    try {
      const rows = await db.select('audio_cues?enabled=eq.true&select=cue,kind,mime,filename,bytes,url,updated_at&order=cue.asc');
      return json({ data: { cues: rows } }, 200);
    } catch (error) {
      return refuse('unavailable', 'The published sounds could not be read.', 502);
    }
  }

  if (method !== 'POST') return refuse('method', 'Only GET and POST are accepted.', 405);

  let body;
  try { body = await request.json(); } catch { return refuse('bad-json', 'The request was not readable JSON.'); }
  const action = String(body?.action || '').trim();

  const token = characters(request);
  let player = null;
  try {
    player = await verifyFirebaseToken(token, { fetcher: env.fetch || fetch });
    if (!player.google) throw new Error('google-only');
  } catch {
    return refuse('unauthenticated', 'Sign in with Google to use the sound studio.', 401);
  }

  let admin = false;
  try {
    const rows = await db.select(`audio_admins?user_id=eq.${encodeURIComponent(player.uid)}&select=user_id`);
    admin = Array.isArray(rows) && rows.length > 0;
  } catch {
    return refuse('unavailable', 'The owner check could not be read.', 502);
  }

  if (action === 'who') {
    return json({ data: { admin, uid: player.uid, name: player.name, email: player.email } });
  }
  if (!admin) return refuse('not-owner', 'Only the owner can publish sounds.', 403);

  if (action === 'publish') {
    const cue = String(body.cue || '').trim().toLowerCase();
    const kind = String(body.kind || 'sfx').trim().toLowerCase();
    const mime = String(body.mime || '').toLowerCase();
    if (!CUE_PATTERN.test(cue)) return refuse('cue', 'Use 2–41 lowercase letters, numbers or dashes for the sound name.');
    if (!KINDS.has(kind)) return refuse('kind', 'Choose sfx or music.');
    if (!MIME_EXT[mime]) return refuse('mime', 'Recorded wav, mp3, ogg, m4a, aac or flac files only.');
    let bytes;
    try { bytes = toBase64Bytes(body.data); } catch { return refuse('data', 'The recording could not be read.'); }
    if (!bytes.length) return refuse('data', 'The file is empty.');
    if (bytes.length > MAX_AUDIO_BYTES) return refuse('size', 'The recording must be 3 MB or smaller.');
    if (!looksRecorded(bytes, mime)) return refuse('signature', 'That file is not a real recording of the chosen type.');
    const ext = MIME_EXT[mime];
    const filename = safeName(body.filename, ext);
    const path = `${kind}/${cue}-${Date.now()}.${ext}`;
    try {
      const publicUrl = await db.upload(path, bytes, mime);
      const rows = await db.upsertCue({
        cue, kind, mime, filename, bytes: bytes.length, url: publicUrl, path,
        enabled: true, uploaded_by: player.uid, updated_at: new Date().toISOString()
      });
      return json({ data: { published: true, cue, url: publicUrl, rows } });
    } catch (error) {
      return refuse('publish-failed', 'The recording could not be published. Please try again.', 502);
    }
  }

  if (action === 'delete') {
    const cue = String(body.cue || '').trim().toLowerCase();
    if (!CUE_PATTERN.test(cue)) return refuse('cue', 'Unknown sound name.');
    try {
      const rows = await db.updateCue(cue, { enabled: false, updated_at: new Date().toISOString() });
      return json({ data: { removed: Array.isArray(rows) ? rows.length > 0 : true, cue } });
    } catch {
      return refuse('delete-failed', 'That sound could not be removed.', 502);
    }
  }

  return refuse('unknown-action', 'Unknown studio action.');
}

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(request => handleRequest(request, Deno.env.toObject()));
}
