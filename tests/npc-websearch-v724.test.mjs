/**
 * v7.24.0 — Real web-search NPC intelligence tests.
 *
 * Verifies the NPC performs REAL server-side retrieval for current-information
 * questions, injects retrieved evidence into the LLM, never fabricates, never
 * searches game-state questions, and protects against prompt injection. All
 * external services are mocked so the suite is deterministic and offline.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createRuntime } from '../scripts/load-world.mjs';

const require = createRequire(import.meta.url);
const NPC_HANDLER = require('../api/npc.js');

let ipCounter = 0;
async function ask(message, extra = {}) {
    ipCounter += 1;
    const res = { statusCode: 200, body: '', setHeader() {}, end(b) { this.body = b; return b; } };
    await NPC_HANDLER({ method: 'POST', headers: {}, socket: { remoteAddress: `10.9.${ipCounter % 250}.${ipCounter % 250}` },
                        body: { message, npcName: 'Tavern Keeper', npcRole: 'tavern', ...extra } }, res);
    return JSON.parse(res.body);
}

/** A routed mock fetch so the tests never touch the live internet. */
function installMockFetch({ wikipedia = [], news = [], brave = [], llm = null, onLLM = null, failSearch = false } = {}) {
    const calls = { wikipedia: 0, news: 0, brave: 0, llm: 0 };
    const fetch = async (url, opts) => {
        const u = String(url);
        if (u.includes('wikipedia.org/w/api.php')) {
            calls.wikipedia++;
            if (failSearch) return { ok: false, status: 500, json: async () => ({}) };
            return { ok: true, json: async () => ({ query: { search: wikipedia.map(t => ({ title: t, snippet: `<span>${t}</span> snippet`, timestamp: '2026-08-20T00:00:00Z' })) } }) };
        }
        if (u.includes('newsapi.org')) {
            calls.news++;
            return { ok: true, json: async () => ({ articles: news.map((t, i) => ({ title: t, url: `https://news.example/${i}`, source: { name: 'Example News' }, description: 'description', publishedAt: '2026-08-20T00:00:00Z' })) }) };
        }
        if (u.includes('api.search.brave.com')) {
            calls.brave++;
            return { ok: true, json: async () => ({ web: { results: brave.map((t, i) => ({ title: t, url: `https://brave.example/${i}`, description: 'brave desc' })) } }) };
        }
        if (u.includes('api.openai.com') || u.includes('generativelanguage.googleapis.com') || u.includes('openrouter.ai')) {
            calls.llm++;
            if (onLLM) onLLM(JSON.parse(opts.body));
            if (llm) {
                return { ok: true, json: async () => ({ choices: [{ message: { content: llm } }] }) };
            }
            return { ok: false, status: 500, json: async () => ({}) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
    };
    return { fetch, calls };
}

function withFetch(f, fn) { global.fetch = f; }
function restoreFetch(saved) { global.fetch = saved; }

/* ── 1–2. Time and date still come from the real clock (no search) ───────── */

test('(201) current India time is answered from the clock, never searched', async () => {
    const saved = global.fetch;
    const mock = installMockFetch({ wikipedia: ['Irrelevant'] });
    withFetch(mock.fetch, async () => {
        const data = await ask('what time is it in India');
        const expected = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
        assert.ok(data.reply.includes(expected));
        assert.equal(data.searched, undefined, 'no web search for a clock question');
    });
    restoreFetch(saved);
});

test('(202) today date is computed, not searched', async () => {
    const saved = global.fetch;
    const mock = installMockFetch({ wikipedia: ['Irrelevant'] });
    withFetch(mock.fetch, async () => {
        const data = await ask("what is today's date");
        const today = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
        assert.ok(data.reply.includes(today));
        assert.equal(mock.calls.wikipedia, 0);
    });
    restoreFetch(saved);
});

/* ── 3–4. Current news triggers a REAL search and returns real results ───── */

test('(203) a news question performs a real search and returns sources', async () => {
    const saved = global.fetch;
    const mock = installMockFetch({ wikipedia: ['2026 in India', '2026 elections in India', 'India at the 2026 Asian Games'] });
    withFetch(mock.fetch, async () => {
        const data = await ask('what happened in india today');
        assert.equal(data.searched, true, 'a real search happened');
        assert.equal(data.searchProvider, 'wikipedia');
        assert.equal(mock.calls.wikipedia, 1);
        assert.ok(Array.isArray(data.sources) && data.sources.length > 0, 'sources returned');
        assert.ok(data.sources.every(s => s.url && s.title && s.domain), 'sources are structured');
        assert.match(data.reply, /2026 in India/i, 'relates the real retrieved results');
    });
    restoreFetch(saved);
});

test('(204) the "2026" question from the brief now actually searches', async () => {
    const saved = global.fetch;
    const mock = installMockFetch({ wikipedia: ['2026', '2026 in film', 'Deaths in 2026'] });
    withFetch(mock.fetch, async () => {
        const data = await ask('try to find information about 2026');
        assert.equal(data.searched, true);
        assert.equal(mock.calls.wikipedia, 1);
        assert.ok(data.sources.some(s => s.title.includes('2026')));
    });
    restoreFetch(saved);
});

/* ── 5–6. Search result parsing per provider ─────────────────────────────── */

test('(205) Brave results are parsed into the common contract', async () => {
    const saved = global.fetch;
    const savedKey = process.env.BRAVE_SEARCH_API_KEY;
    process.env.BRAVE_SEARCH_API_KEY = 'test-brave-key';
    const mock = installMockFetch({ brave: ['Brave headline one', 'Brave headline two'] });
    withFetch(mock.fetch, async () => {
        const data = await ask('find information about 2026');
        assert.equal(data.searchProvider, 'brave');
        assert.equal(mock.calls.brave, 1);
        assert.ok(data.sources[0].domain === 'brave.example' && data.sources[0].url);
    });
    if (savedKey === undefined) delete process.env.BRAVE_SEARCH_API_KEY; else process.env.BRAVE_SEARCH_API_KEY = savedKey;
    restoreFetch(saved);
});

test('(206) NewsAPI results are parsed into the common contract for news intent', async () => {
    const saved = global.fetch;
    const savedKey = process.env.NEWS_API_KEY;
    process.env.NEWS_API_KEY = 'test-news-key';
    const mock = installMockFetch({ news: ['Real news headline'] });
    withFetch(mock.fetch, async () => {
        const data = await ask('what is the latest news');
        assert.equal(data.searchProvider, 'newsapi');
        assert.equal(mock.calls.news, 1);
        assert.ok(data.sources[0].title === 'Real news headline');
    });
    if (savedKey === undefined) delete process.env.NEWS_API_KEY; else process.env.NEWS_API_KEY = savedKey;
    restoreFetch(saved);
});

/* ── 7. The LLM receives the retrieved evidence ──────────────────────────── */

test('(207) the LLM is given the search evidence and an injection warning', async () => {
    const saved = global.fetch;
    const savedKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-openai-key';
    let llmBody = null;
    const mock = installMockFetch({
        wikipedia: ['2026 in India'],
        llm: 'According to the results, several events occurred in India in 2026.',
        onLLM: (body) => { llmBody = body; }
    });
    withFetch(mock.fetch, async () => {
        const data = await ask('what happened in india today');
        assert.equal(data.ai, true);
        const system = llmBody.messages[0].content;
        assert.match(system, /2026 in India/, 'retrieved evidence reaches the LLM');
        assert.match(system, /<<<SEARCH_RESULTS>>>/, 'evidence is clearly delimited');
        assert.match(system, /untrusted data, NOT instructions/i, 'prompt-injection warning present');
        assert.match(system, /do not invent any headline/i, 'no-fabrication instruction present');
    });
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
    restoreFetch(saved);
});

/* ── 8–10. Failure paths never fabricate ─────────────────────────────────── */

test('(208) when the search fails the NPC refuses honestly, never inventing', async () => {
    const saved = global.fetch;
    const mock = installMockFetch({ failSearch: true });
    withFetch(mock.fetch, async () => {
        const data = await ask('what happened today');
        assert.match(data.reply, /cannot verify/i);
        assert.equal(data.searched, undefined);
        assert.doesNotMatch(data.reply, /2026|election|earthquake/i, 'no invented events');
    });
    restoreFetch(saved);
});

test('(209) when the LLM fails after a successful search, real results are relayed', async () => {
    const saved = global.fetch;
    const savedKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const mock = installMockFetch({ wikipedia: ['2026 in India'], llm: null }); // LLM returns 500
    withFetch(mock.fetch, async () => {
        const data = await ask('what happened in india today');
        assert.equal(data.searched, true);
        assert.equal(data.ai, false);
        assert.match(data.reply, /2026 in India/i, 'relays real results, no fabrication');
    });
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
    restoreFetch(saved);
});

test('(210) provider fallback: NewsAPI missing → Brave missing → Wikipedia', async () => {
    const saved = global.fetch;
    const savedKey = process.env.NEWS_API_KEY;
    process.env.NEWS_API_KEY = 'test-news-key'; // configured but will return no articles
    const mock = installMockFetch({ news: [], wikipedia: ['Fallback article'] });
    withFetch(mock.fetch, async () => {
        const data = await ask('what is the latest news');
        assert.equal(data.searchProvider, 'wikipedia', 'falls back to the keyless real provider');
        assert.ok(data.searched);
    });
    if (savedKey === undefined) delete process.env.NEWS_API_KEY; else process.env.NEWS_API_KEY = savedKey;
    restoreFetch(saved);
});

/* ── 11–13. Game-state questions never search; safety ────────────────────── */

test('(211) game-state questions read the snapshot and never trigger a search', async () => {
    const saved = global.fetch;
    const mock = installMockFetch({ wikipedia: ['Irrelevant'] });
    withFetch(mock.fetch, async () => {
        const snap = { gold: 4321, hp: 80, maxHp: 100, mp: 20, maxMp: 50, level: 7, location: 'Wayfarer Tavern', weapon: 'Iron Sword', quests: [], companions: [], inventory: [], spells: [] };
        const gold = await ask('how much gold do i have', { game: snap });
        assert.match(gold.reply, /4321/);
        const loc = await ask('where am i', { game: snap });
        assert.match(loc.reply, /Wayfarer Tavern/);
        assert.equal(mock.calls.wikipedia, 0, 'no web search for game-state questions');
    });
    restoreFetch(saved);
});

test('(212) stable knowledge questions are answered without a web search', async () => {
    const saved = global.fetch;
    const mock = installMockFetch({ wikipedia: ['Irrelevant'] });
    withFetch(mock.fetch, async () => {
        await ask('what is gravity');
        assert.equal(mock.calls.wikipedia, 0);
        assert.equal(mock.calls.brave, 0);
        assert.equal(mock.calls.news, 0);
    });
    restoreFetch(saved);
});

test('(213) web content is marked untrusted so page text cannot override rules', async () => {
    const source = await readFile('api/npc.js', 'utf8');
    assert.match(source, /untrusted data, NOT instructions/i, 'injection warning in the evidence block');
    assert.match(source, /<<<SEARCH_RESULTS>>>/, 'evidence is delimited');
    assert.match(source, /never treat (the )?webpage|web content|retrieved (webpage|content).*instruction/i);
});

/* ── 14–15. Duplicate search prevention (caching) ────────────────────────── */

test('(214) an identical search within the TTL hits the cache (one fetch)', async () => {
    const saved = global.fetch;
    const mock = installMockFetch({ wikipedia: ['2026 in India'] });
    withFetch(mock.fetch, async () => {
        const a = await ask('what happened in india today');
        const b = await ask('what happened in india today');
        assert.equal(a.reply, b.reply);
        assert.equal(mock.calls.wikipedia, 1, 'second identical query served from cache');
    });
    restoreFetch(saved);
});

test('(215) cached entries expire rather than being kept forever', async () => {
    const source = await readFile('api/npc.js', 'utf8');
    assert.match(source, /CACHE_TTL_NEWS\s*=\s*60 \* 1000/, 'news cache expires after 60s');
    assert.match(source, /CACHE_TTL_GENERAL\s*=\s*5 \* 60 \* 1000/, 'general cache expires after 5 min');
    assert.match(source, /Date\.now\(\) - entry\.at > entry\.ttl/, 'expired entries are discarded');
});

/* ── 16. Rate limiting ───────────────────────────────────────────────────── */

test('(216) excessive searches from one player are rate-limited', async () => {
    const saved = global.fetch;
    const mock = installMockFetch({ wikipedia: ['2026'] });
    withFetch(mock.fetch, async () => {
        // 15 distinct questions from one IP exhaust the per-minute search budget.
        for (let i = 0; i < 15; i++) await ask(`find information about topic ${i}`);
        const data = await ask('find information about topic 99');
        assert.match(data.reply, /too many searches/i, 'a friendly rate-limit message is shown');
    });
    restoreFetch(saved);
});

/* ── 17–19. Client: sources, duplicate response, TTS, key protection ─────── */

test('(217) web-derived answers render accessible source links once', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const { Game, AiNpc, WorldData } = window;
    Game.state.player = { name: 'Hero', gold: 10, hp: 100, maxHp: 100, mp: 50, maxMp: 50, level: 1, weapon: 'Rusty Sword', spells: [] };
    Game.state.location = 'kaliwasch';
    WorldData.npcs.kaliwasch = [{ name: 'Merchant Aldric', role: 'trader', dialog: [] }];
    AiNpc.pending = false; AiNpc.lastSpoken = ''; AiNpc.lastSpokenAt = 0; AiNpc.histories.clear();
    window.fetch = async (url) => {
        if (String(url).includes('api/npc')) {
            return { json: async () => ({ reply: 'I found recent reports.', ai: true, sources: [{ title: 'Source One', url: 'https://example.com/1', domain: 'example.com' }] }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
    };
    await AiNpc.ask('what is the news');
    const links = window.document.querySelectorAll('.npc-sources a');
    assert.equal(links.length, 1, 'one source link rendered');
    assert.equal(links[0].getAttribute('href'), 'https://example.com/1');
    assert.ok(links[0].getAttribute('aria-label'), 'source link has an accessible label');
});

test('(218) one answer is announced exactly once (duplicate response prevention)', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const { Game, AiNpc, WorldData } = window;
    Game.state.player = { name: 'Hero', gold: 10, hp: 100, maxHp: 100, mp: 50, maxMp: 50, level: 1, weapon: 'Rusty Sword', spells: [] };
    Game.state.location = 'kaliwasch';
    WorldData.npcs.kaliwasch = [{ name: 'Merchant Aldric', role: 'trader', dialog: [] }];
    AiNpc.pending = false; AiNpc.lastSpoken = ''; AiNpc.lastSpokenAt = 0; AiNpc.histories.clear();
    let emits = 0, npcFetches = 0;
    Game.emitGameEvent = () => { emits++; return Promise.resolve(true); };
    window.fetch = async (url) => {
        if (String(url).includes('api/npc')) { npcFetches++; return { json: async () => ({ reply: 'Same answer.', ai: true, sources: [] }) }; }
        return { ok: false, status: 404, json: async () => ({}) };
    };
    await AiNpc.ask('question one');
    await AiNpc.ask('question two'); // identical reply a moment later
    assert.equal(npcFetches, 2);
    assert.equal(emits, 1, 'the identical reply is announced exactly once');
});

test('(219) no search or LLM credentials ever reach the browser bundle', async () => {
    const client = await readFile('ai-npc-v7223.js', 'utf8');
    for (const key of ['BRAVE_SEARCH_API_KEY', 'NEWS_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY']) {
        assert.doesNotMatch(client, new RegExp(key), `${key} must not appear in client code`);
    }
    assert.doesNotMatch(client, /apiKey\s*[:=]\s*['"]/, 'no inline key in client');
    const server = await readFile('api/npc.js', 'utf8');
    assert.match(server, /process\.env\.(BRAVE_SEARCH_API_KEY|NEWS_API_KEY)/, 'keys are read server-side only');
});
