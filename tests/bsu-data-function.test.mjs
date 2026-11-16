// The server function that stands between the game and the database.
// It must accept only a real Firebase sign-in for this project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateKeyPairSync, createSign } from 'node:crypto';

const source = await readFile(new URL('../server/function/bsu-data.ts', import.meta.url), 'utf8');
const { verifyFirebaseToken, createHandler } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const PROJECT = 'black-sword-ultimate-43c4d';
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' };
let keyFetches = 0;
const fetcher = async () => { keyFetches++; return { ok: true, json: async () => ({ keys: [jwk] }), headers: { get: () => 'public, max-age=3600' } }; };
const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const NOW = 1800000000000;
function token(claims = {}, { key = pair.privateKey, header = {} } = {}) {
    const body = { aud: PROJECT, iss: 'https://securetoken.google.com/' + PROJECT, sub: 'player-1', iat: NOW / 1000 - 10, exp: NOW / 1000 + 3600,
        firebase: { sign_in_provider: 'google.com' }, email: 'Hero@Example.com', email_verified: true, name: 'Hero', ...claims };
    const head = enc({ alg: 'RS256', kid: 'key-1', typ: 'JWT', ...header }) + '.' + enc(body);
    return head + '.' + createSign('RSA-SHA256').update(head).sign(key).toString('base64url');
}
const check = (value, options = {}) => verifyFirebaseToken(value, { project: PROJECT, fetcher, now: NOW, ...options });

test('a real Google sign-in is accepted and described', async () => {
    assert.deepEqual(await check(token()), { uid: 'player-1', google: true, email: 'hero@example.com', name: 'Hero' });
});

test('a guest is accepted, but is not a Google player and has no e-mail', async () => {
    const guest = await check(token({ sub: 'guest-9', firebase: { sign_in_provider: 'anonymous' }, email: undefined, email_verified: undefined, name: undefined }));
    assert.deepEqual(guest, { uid: 'guest-9', google: false, email: '', name: '' });
});

test('an unverified e-mail address is never passed on', async () => {
    assert.equal((await check(token({ email_verified: false }))).email, '');
});

test('forged, foreign, expired and malformed tokens are refused', async () => {
    await assert.rejects(check(token({}, { key: stranger.privateKey })), /signature/);
    await assert.rejects(check(token({ aud: 'another-project' })), /audience/);
    await assert.rejects(check(token({ iss: 'https://securetoken.google.com/another-project' })), /issuer/);
    await assert.rejects(check(token({ exp: NOW / 1000 - 1 })), /expired/);
    await assert.rejects(check(token({ iat: NOW / 1000 + 4000 })), /not yet valid/);
    await assert.rejects(check(token({ sub: '' })), /subject/);
    await assert.rejects(check(token({}, { header: { alg: 'none' } })), /algorithm/);
    await assert.rejects(check(token({}, { header: { alg: 'HS256' } })), /algorithm/);
    await assert.rejects(check(token({}, { header: { kid: 'unknown' } })), /unknown key/);
    await assert.rejects(check('not-a-token'), /malformed/);
    await assert.rejects(check(''), /malformed/);
    // A token whose body was changed after signing.
    const [head, , signature] = token().split('.');
    await assert.rejects(check([head, enc({ aud: PROJECT, iss: 'https://securetoken.google.com/' + PROJECT, sub: 'someone-else', iat: NOW / 1000, exp: NOW / 1000 + 60 }), signature].join('.')), /signature/);
});

test('the key list is remembered instead of fetched for every request', async () => {
    const before = keyFetches;
    await check(token()); await check(token()); await check(token());
    assert.equal(keyFetches, before);
});

function makeHandler(overrides = {}) {
    const calls = [];
    const db = overrides.db || (async (player, request) => { calls.push({ player, request }); return request.kind === 'ping' ? { data: { ok: true } } : { data: [{ id: 1 }] }; });
    const handle = createHandler({ db, verify: value => check(value), ...overrides, db });
    const post = (body, auth = 'Bearer ' + token()) => handle(new Request('https://example.test/bsu-data', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: typeof body === 'string' ? body : JSON.stringify(body) }));
    return { handle, post, calls };
}

test('the player id comes from the token, never from the request body', async () => {
    const { post, calls } = makeHandler();
    const response = await post({ kind: 'query', table: 'profiles', p_uid: 'victim', uid: 'victim' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: [{ id: 1 }], error: null });
    assert.equal(calls[0].player.uid, 'player-1');
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
});

test('no token, a bad token, a bad body and a wrong method are refused before the database is asked', async () => {
    const { handle, post, calls } = makeHandler();
    assert.equal((await post({ kind: 'query' }, '')).status, 401);
    assert.equal((await post({ kind: 'query' }, 'Bearer ' + token({}, { key: stranger.privateKey }))).status, 401);
    assert.equal((await post('{not json')).status, 400);
    assert.equal((await post('[1,2]')).status, 400);
    assert.equal((await handle(new Request('https://example.test/', { method: 'DELETE' }))).status, 405);
    assert.equal(calls.length, 0);
    assert.equal((await handle(new Request('https://example.test/', { method: 'OPTIONS' }))).status, 204);
});

test('the health check answers without a sign-in and reports the database', async () => {
    const up = await (await makeHandler().handle(new Request('https://example.test/'))).json();
    assert.deepEqual(up, { ok: true, service: 'bsu-data', database: true });
    const down = await (await makeHandler({ db: async () => { throw new Error('down'); } }).handle(new Request('https://example.test/'))).json();
    assert.deepEqual(down, { ok: true, service: 'bsu-data', database: false });
});

test('a database failure becomes a friendly answer, and one player cannot flood the service', async () => {
    const broken = makeHandler({ db: async () => { throw new Error('boom'); } });
    const response = await broken.post({ kind: 'query' });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error.message, /cannot be reached/);
    const limited = makeHandler({ limit: 3 });
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await limited.post({ kind: 'rpc', name: 'changes' })).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});

test('a guest is known by the key of the device: same key same player, the id does not give the key away', async () => {
    const { guestUid } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const { handle, calls } = makeHandler();
    const keyA = 'a'.repeat(64), keyB = 'b'.repeat(64);
    const post = (headers, body = { kind: 'rpc', name: 'get_my_profile' }) => handle(new Request('https://example.test/bsu-data', { method: 'POST', headers, body: JSON.stringify(body) }));
    assert.equal((await post({ authorization: 'Guest ' + keyA, 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })).status, 200);
    assert.equal((await post({ authorization: 'Guest ' + keyA, 'x-forwarded-for': '203.0.113.7' })).status, 200);
    assert.equal((await post({ authorization: 'Guest ' + keyB })).status, 200);
    const [first, second, other] = calls.map(call => call.player);
    assert.match(first.uid, /^g-[a-f0-9]{40}$/);
    assert.equal(first.uid, await guestUid(keyA));
    assert.equal(second.uid, first.uid);
    assert.notEqual(other.uid, first.uid);
    assert.equal(first.google, false);
    assert.equal(first.email, '');
    assert.ok(!first.uid.includes('aaaa'));
    // The network is passed on only as a one-way code, never as the address.
    assert.match(first.net, /^[a-f0-9]{24}$/);
    assert.equal(first.net, second.net);
    assert.equal(other.net, '');
    assert.ok(!JSON.stringify(calls).includes('203.0.113.7'));
    // Short, long or otherwise malformed keys are refused.
    for (const bad of ['Guest abc', 'Guest ' + 'A'.repeat(64), 'Guest ' + 'a'.repeat(65), 'Guest', 'guest-id-123', 'Basic ' + keyA]) {
        assert.equal((await post({ authorization: bad })).status, 401, bad);
    }
    assert.equal(calls.length, 3);
});

test('a guest key next to a Google sign-in is passed on as proof; it means nothing for a guest or a non-Google token', async () => {
    const { guestUid } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const { handle, calls } = makeHandler();
    const key = 'c'.repeat(64);
    const post = headers => handle(new Request('https://example.test/bsu-data', { method: 'POST', headers, body: JSON.stringify({ kind: 'rpc', name: 'adopt_guest', args: { guest: 'g-someone-else' } }) }));
    await post({ authorization: 'Bearer ' + token(), 'x-guest-key': key });
    await post({ authorization: 'Bearer ' + token(), 'x-guest-key': 'not-a-key' });
    await post({ authorization: 'Bearer ' + token({ firebase: { sign_in_provider: 'anonymous' } }), 'x-guest-key': key });
    await post({ authorization: 'Guest ' + 'd'.repeat(64), 'x-guest-key': key });
    await post({ authorization: 'Bearer ' + token() });
    assert.deepEqual(calls.map(call => call.player.guest), [await guestUid(key), undefined, undefined, undefined, undefined]);
    // A token can never claim an id from the guest range.
    assert.equal((await post({ authorization: 'Bearer ' + token({ sub: 'g-' + '0'.repeat(40) }) })).status, 401);
    const preflight = await handle(new Request('https://example.test/', { method: 'OPTIONS' }));
    assert.match(preflight.headers.get('access-control-allow-headers'), /x-guest-key/);
});
