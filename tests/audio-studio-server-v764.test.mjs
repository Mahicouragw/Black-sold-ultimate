import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../server/function/bsu-audio.js';

/* 7.64.0 — the owner's sound studio gateway. The real function is tested with a
 * real signed Firebase token and a mocked Supabase, so the permission rules and
 * the recording checks are exercised exactly as they run in production. */

const b64url = bytes => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* One signing key for the whole file: the function caches Google's key list,
   so each test must sign with the same key id it already knows. */
const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']
);
const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
jwk.kid = 'test-key';
globalThis.__jwks = jwk;
const header = b64url(JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' }));
const sign = async (claims = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const payload = b64url(JSON.stringify({
        aud: 'black-sword-ultimate-43c4d', iss: 'https://securetoken.google.com/black-sword-ultimate-43c4d',
        sub: 'owner-uid', iat: now, exp: now + 600,
        firebase: { sign_in_provider: 'google.com' }, email: 'owner@example.com', email_verified: true, name: 'Owner',
        ...claims
    }));
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${header}.${payload}`));
    return `${header}.${payload}.${b64url(new Uint8Array(signature))}`;
};
async function readySigner() { return { sign }; }


const wav = (() => {
    const bytes = new Uint8Array(2048);
    const text = s => [...s].map(c => c.charCodeAt(0));
    bytes.set(text('RIFF'), 0); bytes.set([0x24, 0x08, 0, 0], 4); bytes.set(text('WAVE'), 8);
    bytes.set(text('fmt '), 12);
    return Buffer.from(bytes).toString('base64');
})();

function mockSupabase({ admins = ['owner-uid'], rows = [] } = {}) {
    const calls = { uploads: [], upserts: [], patches: [], selects: [] };
    const fetch = async (url, options = {}) => {
        const target = String(url);
        if (target.includes('securetoken@system.gserviceaccount.com')) {
            const pair = globalThis.__jwks;
            return new Response(JSON.stringify({ keys: [pair] }), { status: 200, headers: { 'cache-control': 'max-age=3600' } });
        }
        if (target.includes('/rest/v1/audio_admins')) {
            calls.selects.push(target);
            const id = decodeURIComponent(target.split('user_id=eq.')[1] || '').split('&')[0];
            return Response.json(admins.includes(id) ? [{ user_id: id }] : []);
        }
        if (target.includes('/rest/v1/audio_cues') && (options.method || 'GET') === 'POST') {
            calls.upserts.push(JSON.parse(options.body));
            return Response.json([JSON.parse(options.body)]);
        }
        if (target.includes('/rest/v1/audio_cues') && options.method === 'PATCH') {
            calls.patches.push({ url: target, body: JSON.parse(options.body) });
            return Response.json([{ cue: 'door' }]);
        }
        if (target.includes('/rest/v1/audio_cues')) {
            calls.selects.push(target);
            return Response.json(rows);
        }
        if (target.includes('/storage/v1/object/game-audio/')) {
            calls.uploads.push({ url: target, type: options.headers['Content-Type'], size: options.body?.length || 0 });
            return new Response(JSON.stringify({ Key: 'game-audio/x' }), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    };
    return { fetch, calls };
}

const env = (mock) => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', fetch: mock.fetch });

test('the published list is public and needs no token', async t => {
    const rows = [{ cue: 'door', kind: 'sfx', url: 'https://x/door.wav', filename: 'door.wav', bytes: 1024 }];
    const mock = mockSupabase({ rows });
    const response = await handleRequest(new Request('https://x/bsu-audio?list=1'), env(mock));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.data.cues, rows);
});

test('an unsigned request is refused', async t => {
    const mock = mockSupabase();
    const response = await handleRequest(new Request('https://x/bsu-audio', { method: 'POST', body: JSON.stringify({ action: 'who' }) }), env(mock));
    assert.equal(response.status, 401);
});

test('a signed-in guest is refused', async t => {
    const { sign } = await readySigner(t);
    const token = await sign({ firebase: { sign_in_provider: 'anonymous' }, email: undefined, email_verified: false });
    const mock = mockSupabase();
    const response = await handleRequest(new Request('https://x/bsu-audio', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify({ action: 'who' })
    }), env(mock));
    assert.equal(response.status, 401);
});

test('a signed-in player who is not the owner sees admin false and cannot publish', async t => {
    const { sign } = await readySigner(t);
    const token = await sign({ sub: 'someone-else' });
    const mock = mockSupabase({ admins: ['owner-uid'] });
    const who = await handleRequest(new Request('https://x/bsu-audio', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify({ action: 'who' })
    }), env(mock));
    assert.equal(who.status, 200);
    assert.equal((await who.json()).data.admin, false);
    const publish = await handleRequest(new Request('https://x/bsu-audio', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'publish', cue: 'door', kind: 'sfx', mime: 'audio/wav', filename: 'door.wav', data: wav })
    }), env(mock));
    assert.equal(publish.status, 403);
    assert.equal(mock.calls.uploads.length, 0);
});

test('the owner publishes a recorded wav and it is stored and listed', async t => {
    const { sign } = await readySigner(t);
    const token = await sign();
    const mock = mockSupabase();
    const response = await handleRequest(new Request('https://x/bsu-audio', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'publish', cue: 'door', kind: 'sfx', mime: 'audio/wav', filename: 'Door Open.wav', data: wav })
    }), env(mock));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.published, true);
    assert.match(body.data.url, /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/public\/game-audio\/sfx\/door-/);
    assert.equal(mock.calls.uploads.length, 1);
    assert.equal(mock.calls.uploads[0].type, 'audio/wav');
    const row = mock.calls.upserts[0];
    assert.equal(row.cue, 'door');
    assert.equal(row.filename, 'door-open.wav');
    assert.equal(row.uploaded_by, 'owner-uid');
    assert.equal(row.enabled, true);
    assert.ok(row.bytes > 1000);
});

test('a file that is not really the chosen recording type is refused', async t => {
    const { sign } = await readySigner(t);
    const token = await sign();
    const mock = mockSupabase();
    const fake = Buffer.from('this is not a wav file at all').toString('base64');
    const response = await handleRequest(new Request('https://x/bsu-audio', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'publish', cue: 'door', kind: 'sfx', mime: 'audio/wav', filename: 'x.wav', data: fake })
    }), env(mock));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error.code, /signature|size/);
    assert.equal(mock.calls.uploads.length, 0);
});

test('bad names, kinds, mime types and oversized files are refused', async t => {
    const { sign } = await readySigner(t);
    const token = await sign();
    const mock = mockSupabase();
    const send = payload => handleRequest(new Request('https://x/bsu-audio', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify({ action: 'publish', ...payload })
    }), env(mock));
    assert.equal((await send({ cue: 'Door!', kind: 'sfx', mime: 'audio/wav', data: wav })).status, 400);
    assert.equal((await send({ cue: 'door', kind: 'video', mime: 'audio/wav', data: wav })).status, 400);
    assert.equal((await send({ cue: 'door', kind: 'sfx', mime: 'text/plain', data: wav })).status, 400);
    const huge = Buffer.alloc(3 * 1024 * 1024 + 10);
    huge.set([...Buffer.from('RIFF')], 0); huge.set([...Buffer.from('WAVE')], 8);
    assert.equal((await send({ cue: 'door', kind: 'sfx', mime: 'audio/wav', data: huge.toString('base64') })).status, 400);
    assert.equal(mock.calls.uploads.length, 0);
});

test('the owner removes a cue without deleting the recording', async t => {
    const { sign } = await readySigner(t);
    const token = await sign();
    const mock = mockSupabase();
    const response = await handleRequest(new Request('https://x/bsu-audio', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify({ action: 'delete', cue: 'door' })
    }), env(mock));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.removed, true);
    assert.equal(mock.calls.patches[0].body.enabled, false);
});

