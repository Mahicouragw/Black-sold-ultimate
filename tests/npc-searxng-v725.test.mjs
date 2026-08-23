import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const NPC_HANDLER = require('../api/npc.js');

let ipCounter = 400;
async function ask(message) {
    ipCounter += 1;
    const res = { statusCode: 200, body: '', setHeader() {}, end(b) { this.body = b; return b; } };
    await NPC_HANDLER({
        method: 'POST',
        headers: {},
        socket: { remoteAddress: `10.8.${ipCounter % 250}.${ipCounter % 250}` },
        body: { message, npcName: 'Tavern Keeper', npcRole: 'tavern' }
    }, res);
    return JSON.parse(res.body);
}

test('SearXNG is used when SEARXNG_URL is configured', async () => {
    const saved = global.fetch;
    const savedUrl = process.env.SEARXNG_URL;
    process.env.SEARXNG_URL = 'https://searx.example.test';
    let hit = 0;
    global.fetch = async (url) => {
        const u = String(url);
        if (u.includes('searx.example.test/search') && u.includes('format=json')) {
            hit++;
            assert.match(u, /q=/, 'query is encoded');
            return {
                ok: true,
                json: async () => ({
                    results: [
                        { title: 'Telangana update', url: 'https://news.example/tl', content: 'Assembly met today.', publishedDate: '2026-08-23' },
                        { title: 'bad', url: 'javascript:alert(1)', content: 'ignore' }
                    ]
                })
            };
        }
        return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    };
    try {
        const data = await ask('what happened in Telangana');
        assert.equal(hit, 1);
        assert.equal(data.searchProvider, 'searxng');
        assert.equal(data.searched, true);
        assert.equal(data.sources.length, 1, 'javascript: URL rejected');
        assert.equal(data.sources[0].title, 'Telangana update');
        assert.match(data.sources[0].url, /^https:/);
    } finally {
        global.fetch = saved;
        if (savedUrl === undefined) delete process.env.SEARXNG_URL;
        else process.env.SEARXNG_URL = savedUrl;
    }
});

test('SearXNG JSON failure falls back to Google News then Wikipedia', async () => {
    const saved = global.fetch;
    const savedUrl = process.env.SEARXNG_URL;
    process.env.SEARXNG_URL = 'https://searx.example.test';
    global.fetch = async (url) => {
        const u = String(url);
        if (u.includes('searx.example.test')) return { ok: true, json: async () => ({ results: [] }) };
        if (u.includes('news.google.com/rss')) {
            return {
                ok: true,
                text: async () => '<rss><channel><item><title>Fallback headline - BBC</title><link>https://bbc.example/1</link><pubDate>Sat, 23 Aug 2026 10:00:00 GMT</pubDate></item></channel></rss>'
            };
        }
        return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    };
    try {
        const data = await ask('what is today\'s news about cricket');
        assert.equal(data.searchProvider, 'googlenews');
        assert.ok(data.sources[0].title.includes('Fallback'));
    } finally {
        global.fetch = saved;
        if (savedUrl === undefined) delete process.env.SEARXNG_URL;
        else process.env.SEARXNG_URL = savedUrl;
    }
});
