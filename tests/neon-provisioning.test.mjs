/*
 * Provisioning guarantees: secrets never land in the git tree or /tmp, the
 * claim URL is printed in full, and the schema generator is reproducible.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Must be set before the modules that read it are imported.
const sandbox = mkdtempSync(join(homedir(), '.black-sword-neon-test-'));
process.env.NEON_SECRET_DIR = sandbox;
process.env.NEON_SECRET_FILE = join(sandbox, 'secrets.json');
process.env.NEON_PUBLIC_FILE = join(sandbox, 'public.json');
process.env.NEON_CLAIM_FILE = join(sandbox, 'claim.json');

const { assertSafeSecretPath, writeSecretJSON, SECRET_FILE, PRIVATE_KEY_FILE, redact } = await import('../scripts/neon-secrets.mjs');

const ASSERTION = 'identity-assertion-do-not-print-0123456789';
const DATABASE_URL = 'postgresql://neondb_owner:super-secret-password@example.neon.tech/neondb?sslmode=require';

test.after(() => rmSync(sandbox, { recursive: true, force: true }));

test('credential paths inside the repository or /tmp are refused', () => {
    assert.throws(() => assertSafeSecretPath(`${process.cwd()}/.neon/secrets.json`), /git tree/);
    assert.throws(() => assertSafeSecretPath('/tmp/black-sword-neon-secrets.json'), /temporary directory/);
    assert.throws(() => assertSafeSecretPath(`${process.cwd()}/secrets.json`), /git tree/);
    assert.equal(assertSafeSecretPath(join(homedir(), '.black-sword-neon', 'secrets.json')),
        join(homedir(), '.black-sword-neon', 'secrets.json'));
    assert.match(PRIVATE_KEY_FILE, /handoff-private-key\.pem$/);
    assert.ok(!PRIVATE_KEY_FILE.startsWith(process.cwd()), 'the handoff private key must live outside the git tree');
});

test('secret files are written with mode 0600 outside the working tree', () => {
    writeSecretJSON(SECRET_FILE, { project_id: 'p1', identity_assertion: ASSERTION, database_url: DATABASE_URL });
    const mode = statSync(SECRET_FILE).mode & 0o777;
    assert.equal(mode, 0o600);
    assert.equal(readFileSync(SECRET_FILE, 'utf8').includes(ASSERTION), true);
    assert.ok(!SECRET_FILE.startsWith(process.cwd()));
    assert.equal(redact(`bad ${DATABASE_URL} and ${ASSERTION}`, [DATABASE_URL, ASSERTION]), 'bad [redacted] and [redacted]');
});

test('claim minting prints the complete claim URL and never the identity assertion', async t => {
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith('/oauth2/token')) {
            return new Response(JSON.stringify({ access_token: 'short-lived-token' }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (String(url).includes('/claim')) {
            return new Response(JSON.stringify({
                verification_uri_complete: 'https://claimable.neon.tech/claim?code=ABCD-1234',
                expires_in: 900,
                interval: 5,
                status: 'pending'
            }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('{}', { status: 404 });
    };
    t.after(() => { globalThis.fetch = originalFetch; });

    const { mintClaim } = await import('../scripts/neon-claim.mjs');
    const logged = [];
    const originalLog = console.log;
    console.log = (...args) => logged.push(args.join(' '));
    let claim;
    try {
        claim = await mintClaim();
    } finally {
        console.log = originalLog;
    }
    const output = logged.join('\n');
    assert.equal(claim.verification_uri_complete, 'https://claimable.neon.tech/claim?code=ABCD-1234');
    assert.match(output, /https:\/\/claimable\.neon\.tech\/claim\?code=ABCD-1234/, 'the full claim URL must be printed');
    assert.match(output, /15 minutes/);
    assert.doesNotMatch(output, /identity-assertion-do-not-print/);
    assert.doesNotMatch(output, /super-secret-password/);
    assert.equal(calls[0].url, 'https://claimable.neon.tech/v1/oauth2/token');
    assert.equal(calls[1].url, 'https://claimable.neon.tech/v1/projects/p1/claim');
    const stored = JSON.parse(readFileSync(join(sandbox, 'claim.json'), 'utf8'));
    assert.equal(stored.minted_at.length > 0, true);
    assert.equal(statSync(join(sandbox, 'claim.json')).mode & 0o777, 0o600);
});

test('an already-claimed project does not need a new claim link', async t => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async url => {
        if (String(url).endsWith('/oauth2/token')) {
            return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { code: 'project_claimed', message: 'Project already claimed' } }), { status: 409 });
    };
    t.after(() => { globalThis.fetch = originalFetch; });
    const { mintClaim } = await import('../scripts/neon-claim.mjs');
    const originalLog = console.log;
    console.log = () => {};
    const claim = await mintClaim().finally(() => { console.log = originalLog; });
    assert.equal(claim, null);
});

test('neon/schema.sql is reproducible from the committed sources', () => {
    const before = readFileSync('neon/schema.sql');
    execFileSync(process.execPath, ['scripts/build-neon-schema.mjs'], { stdio: 'pipe' });
    const after = readFileSync('neon/schema.sql');
    const hash = buffer => createHash('sha256').update(buffer).digest('hex');
    assert.equal(hash(before), hash(after), 'regenerating the schema changed the committed file');
});
