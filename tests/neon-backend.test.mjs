import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { TextDecoder, TextEncoder } from 'node:util';
import { setTimeout as wait } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import { encryptHandoff, decryptHandoff, keyIdFor, publicKeyId } from '../scripts/neon-crypto.mjs';

const clientSource = readFileSync('neon-game-client.js', 'utf8');

function fixture(authOverrides = {}) {
    const dom = new JSDOM('', { url: 'https://example.test/', runScripts: 'outside-only' });
    const { window } = dom;
    const auth = {
        signUp: async () => ({ data: { session: { user: { id: 'guest-1' } } }, error: null }),
        signInWithPassword: async () => ({ data: { session: { user: { id: 'guest-1' } } }, error: null }),
        signOut: async () => ({ error: null }),
        ...authOverrides
    };
    const core = { auth, from: () => { throw new Error('Unexpected query'); } };
    window.NeonBackend = { createClient: () => core, SupabaseAuthAdapter: () => ({}) };
    window.eval(clientSource);
    const client = window.BlackSwordBackend.createClient({ authUrl: 'https://auth.example.test', dataApiUrl: 'https://data.example.test' });
    return { dom, window, auth, core, client };
}

async function until(predicate, timeout = 4000) {
    const end = Date.now() + timeout;
    while (!predicate()) {
        if (Date.now() > end) throw new Error('Timed out waiting for Neon polling event');
        await wait(40);
    }
}

test('Neon schema covers every backend feature without Supabase-only dependencies', () => {
    const sql = readFileSync('neon/schema.sql', 'utf8');
    for (const required of ['neon_auth."user"', 'neon_auth.account', 'public.game_saves', 'public.chat_room_messages', 'public.game_hall_sessions', 'public.trade_offers', 'public.accept_trade_offer']) {
        assert.ok(sql.includes(required), `Missing ${required}`);
    }
    for (const forbidden of [/auth\.users/i, /auth\.identities/i, /supabase_realtime/i, /\bservice_role\b/i, /\banon\b/i]) {
        assert.doesNotMatch(sql, forbidden);
    }
    const html = readFileSync('index.html', 'utf8');
    assert.ok(html.includes('assets/vendor/neon-0.9.0-beta.js'));
    assert.ok(html.includes('neon-game-client.js'));
    assert.ok(html.includes('backend-config.js'));
    assert.doesNotMatch(html, /supabase/i);
    assert.doesNotMatch(html, /accounts\.google\.com\/gsi\/client/i);
});

test('the shipped Neon browser bundle initializes with the compatibility client', t => {
    const dom = new JSDOM('', { url: 'https://example.test/', runScripts: 'outside-only' });
    const { window } = dom;
    t.after(() => dom.window.close());
    Object.assign(window, { TextEncoder, TextDecoder, Request, Response, Headers, fetch });
    window.BroadcastChannel = class {
        constructor() { this.onmessage = null; }
        postMessage() {} addEventListener() {} removeEventListener() {} close() {}
    };
    window.eval(readFileSync('assets/vendor/neon-0.9.0-beta.js', 'utf8'));
    window.eval(clientSource);
    const client = window.BlackSwordBackend.createClient({ authUrl: 'https://auth.example.test', dataApiUrl: 'https://data.example.test' });
    assert.equal(typeof client.auth.signInWithOAuth, 'function');
    assert.equal(typeof client.auth.signUp, 'function');
    assert.equal(typeof client.from, 'function');
    assert.equal(typeof client.channel, 'function');
});

test('persistent guest credentials survive session recovery and are cleared only on sign-out', async t => {
    let signUps = 0;
    let signInPayload;
    let displayName;
    const { dom, window, client } = fixture({
        signUp: async payload => {
            signUps++;
            displayName = payload.options.data.displayName;
            if (signUps > 1) return { data: { user: null, session: null }, error: new Error('User already exists') };
            return { data: { session: { user: { id: 'guest-1' } } }, error: null };
        },
        signInWithPassword: async payload => {
            signInPayload = payload;
            return { data: { session: { user: { id: 'guest-1' } } }, error: null };
        }
    });
    t.after(() => dom.window.close());
    const first = await client.auth.signInAnonymously({ options: { data: { display_name: 'Guest Hero' } } });
    assert.equal(first.error, null);
    const stored = JSON.parse(window.localStorage.getItem('black_sword_neon_guest_v1'));
    assert.match(stored.email, /^hero-[a-f0-9-]{36}@guest\.black-sword\.local$/);
    assert.ok(stored.password.length >= 40);
    assert.equal(displayName, 'Guest Hero');

    const recovered = await client.auth.signInAnonymously();
    assert.equal(recovered.error, null);
    assert.equal(signInPayload.email, stored.email);
    assert.equal(signInPayload.password, stored.password);
    assert.equal(window.localStorage.getItem('black_sword_neon_guest_v1'), JSON.stringify(stored));
    await client.auth.signOut();
    assert.equal(window.localStorage.getItem('black_sword_neon_guest_v1'), null);
});

test('authenticated polling emits only subsequent inserts, updates, and deletes', async t => {
    let rows = [{ id: 'session-1', version: 0, state: { turn: 0 }, created_at: '2026-01-01T00:00:00Z' }];
    let queries = 0;
    const { dom, client, core } = fixture();
    t.after(() => dom.window.close());
    core.from = table => {
        assert.equal(table, 'game_hall_sessions');
        const builder = {
            select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
            then(resolve, reject) {
                queries++;
                return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
            }
        };
        return builder;
    };
    const events = [];
    const channel = client.channel('hall-session-1').on('postgres_changes', {
        event: '*', schema: 'public', table: 'game_hall_sessions', filter: 'id=eq.session-1'
    }, payload => events.push(payload)).subscribe();
    t.after(() => client.removeChannel(channel));
    await until(() => queries > 0);
    await wait(60);
    assert.equal(events.length, 0, 'Initial snapshot must not replay as a new event');

    rows = [{ ...rows[0], version: 1, state: { turn: 1 } }];
    await until(() => events.some(event => event.eventType === 'UPDATE'));
    assert.equal(events[0].new.version, 1);
    assert.equal(events[0].old.version, 0);

    rows = [];
    await until(() => events.some(event => event.eventType === 'DELETE'));
    assert.equal(events.at(-1).old.id, 'session-1');
});

test('claim handoff encryption never exposes credentials in the public payload', t => {
    const directory = mkdtempSync(join(tmpdir(), 'black-sword-neon-crypto-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const publicPath = join(directory, 'public.pem');
    const privatePath = join(directory, 'private.pem');
    writeFileSync(publicPath, publicKey);
    writeFileSync(privatePath, privateKey, { mode: 0o600 });
    const value = {
        secret: { identity_assertion: 'private-assertion', database_url: 'postgresql://private-password' },
        claim: { verification_uri_complete: 'https://claim.example/private-code' },
        publicConfig: { project_id: 'public-project' }
    };
    const encrypted = encryptHandoff(value, publicPath);
    const serialized = JSON.stringify(encrypted);
    assert.doesNotMatch(serialized, /private-assertion|private-password|private-code/);
    assert.deepEqual(decryptHandoff(encrypted, privatePath), value);
});

test('handoff key ids identify the exact key pair and reject mismatches', t => {
    const directory = mkdtempSync(join(tmpdir(), 'black-sword-neon-keyid-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    function pair(name) {
        const { publicKey, privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        const publicPath = join(directory, `${name}-public.pem`);
        const privatePath = join(directory, `${name}-private.pem`);
        writeFileSync(publicPath, publicKey);
        writeFileSync(privatePath, privateKey, { mode: 0o600 });
        return { publicPath, privatePath, publicKey };
    }
    const first = pair('first');
    const second = pair('second');
    const encrypted = encryptHandoff({ claim: { verification_uri_complete: 'https://claim.example/code' } }, first.publicPath);
    assert.equal(encrypted.key_id, keyIdFor(first.publicKey));
    assert.equal(encrypted.key_id, publicKeyId(first.publicPath));
    assert.deepEqual(decryptHandoff(encrypted, first.privatePath).claim.verification_uri_complete, 'https://claim.example/code');
    assert.throws(() => decryptHandoff(encrypted, second.privatePath), /encrypted for key .+ local private key/);
});

test('the key generator refuses to overwrite an existing handoff key', t => {
    const directory = mkdtempSync(join(tmpdir(), 'black-sword-neon-keygen-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const env = {
        ...process.env,
        NEON_PUBLIC_KEY_FILE: join(directory, 'neon', 'handoff-public-key.pem'),
        NEON_PRIVATE_KEY_FILE: join(directory, '.neon', 'handoff-private-key.pem')
    };
    const first = spawnSync(process.execPath, ['scripts/neon-keygen.mjs'], { env, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Key id:\s+[A-Za-z0-9_-]{16}/);
    assert.equal(existsSync(env.NEON_PUBLIC_KEY_FILE), true);
    assert.equal(existsSync(env.NEON_PRIVATE_KEY_FILE), true);
    const second = spawnSync(process.execPath, ['scripts/neon-keygen.mjs'], { env, encoding: 'utf8' });
    assert.equal(second.status, 1);
    assert.match(second.stderr, /Refusing to replace it/);
    const forced = spawnSync(process.execPath, ['scripts/neon-keygen.mjs', '--force'], { env, encoding: 'utf8' });
    assert.equal(forced.status, 0, forced.stderr);
});

test('the committed handoff public key matches a readable key id', () => {
    const keyId = publicKeyId();
    assert.match(keyId, /^[A-Za-z0-9_-]{16}$/);
    const payload = encryptHandoff({ project: 'black-sword' });
    assert.equal(payload.key_id, keyId);
    assert.doesNotMatch(JSON.stringify(payload), /black-sword/);
    // CI only has the public key; the workspace also holds the private key and
    // must be able to read its own handoffs.
    if (existsSync('.neon/handoff-private-key.pem')) {
        assert.equal(decryptHandoff(payload).project, 'black-sword');
    }
});
