/**
 * v7.24.1 — URL → fetch → examine tests.
 *
 * When a player pastes a link, the NPC fetches that page server-side (SSRF-safe,
 * size/time-capped), extracts readable text, injects it as untrusted evidence,
 * and has the LLM summarize it. All network is mocked for determinism.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const NPC_HANDLER = require('../api/npc.js');

let ipCounter = 0;
async function ask(message, extra = {}) {
    ipCounter += 1;
    const res = { statusCode: 200, body: '', setHeader() {}, end(b) { this.body = b; return b; } };
    await NPC_HANDLER({ method: 'POST', headers: {}, socket: { remoteAddress: `10.4.${ipCounter % 250}.${ipCounter % 250}` },
                        body: { message, npcName: 'Tavern Keeper', npcRole: 'tavern', ...extra } }, res);
    return JSON.parse(res.body);
}

const PAGE_HTML = `<html><head><title>Example - Test</title></head><body><script>SECRET_INJECTED_COMMAND_DO_THIS</script><p>Example is a fictional entity used in tests. It has no real meaning.</p></body></html>`;

function mockFetchForPage() {
    return async (url, opts) => {
        const u = String(url);
        if (u.includes('openrouter.ai')) {
            const body = JSON.parse(opts?.body || '{}');
            const system = body.messages?.[0]?.content || '';
            return { ok: true, json: async () => ({ choices: [{ message: { content: `Summary says: ${system.includes('Example is a fictional entity') ? 'page-content-seen' : 'page-content-missing'}` } }] }) };
        }
        if (u.startsWith('https://example.com') || u.startsWith('http://example.com')) {
            return { ok: true, headers: { get: () => 'text/html' }, text: async () => PAGE_HTML };
        }
        return { ok: false, status: 404, text: async () => '' };
    };
}

test('(301) a pasted URL is fetched and its readable text reaches the LLM', async t => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    const savedFetch = global.fetch;
    t.after(() => { if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = savedKey; global.fetch = savedFetch; });
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = mockFetchForPage();

    const data = await ask('read https://example.com/article and summarize it');
    assert.equal(data.searched, true);
    assert.equal(data.searchProvider, 'url-fetch');
    assert.equal(data.ai, true);
    assert.match(data.reply, /page-content-seen/, 'the LLM received the extracted page text');
    assert.equal(data.sources[0].title, 'Example - Test');
    assert.equal(data.sources[0].url, 'https://example.com/article');
    assert.equal(data.sources[0].domain, 'example.com');
});

test('(302) webpage scripts are stripped so injected text never overrides rules', async t => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    const savedFetch = global.fetch;
    t.after(() => { if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = savedKey; global.fetch = savedFetch; });
    process.env.OPENROUTER_API_KEY = 'test-key';
    let system = '';
    global.fetch = async (url, opts) => {
        const u = String(url);
        if (u.includes('openrouter.ai')) {
            system = JSON.parse(opts.body).messages[0].content;
            return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
        }
        if (u.startsWith('https://example.com')) return { ok: true, headers: { get: () => 'text/html' }, text: async () => PAGE_HTML };
        return { ok: false, status: 404, text: async () => '' };
    };
    await ask('read https://example.com/article');
    assert.doesNotMatch(system, /SECRET_INJECTED_COMMAND_DO_THIS/, 'script text is removed before it reaches the LLM');
    assert.match(system, /untrusted data, NOT instructions/i, 'injection warning present');
    assert.match(system, /<<<WEBPAGE_CONTENT>>>/, 'page content is delimited');
});

test('(303) localhost and private IP addresses are blocked (SSRF protection)', async t => {
    const savedFetch = global.fetch;
    t.after(() => { global.fetch = savedFetch; });
    let fetched = [];
    global.fetch = async (url) => { fetched.push(String(url)); return { ok: false, status: 500, text: async () => '' }; };
    for (const url of ['http://localhost:8000/x', 'http://192.168.1.1/x', 'http://10.0.0.5/x', 'http://169.254.169.254/latest/meta-data', 'http://metadata.google.internal/']) {
        const data = await ask(`read ${url}`);
        assert.match(data.reply, /couldn't open that page/i, url);
    }
    assert.equal(fetched.length, 0, 'no request is made to a blocked host');
});

test('(304) a failed fetch is reported honestly, never fabricated', async t => {
    const savedFetch = global.fetch;
    t.after(() => { global.fetch = savedFetch; });
    global.fetch = async () => ({ ok: false, status: 404, text: async () => '' });
    const data = await ask('read https://example.com/does-not-exist');
    assert.match(data.reply, /couldn't open that page/i);
    assert.equal(data.searched, undefined);
});

test('(305) non-http protocols are never fetched', async () => {
    const source = await readFile('api/npc.js', 'utf8');
    assert.match(source, /parsed\.protocol !== 'http:' && parsed\.protocol !== 'https:'/, 'only http(s) is allowed');
    assert.match(source, /isBlockedHost\(parsed\.hostname\)/, 'host is checked before fetching');
});
