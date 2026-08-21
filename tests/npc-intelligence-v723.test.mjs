/**
 * v7.23.0 — Real LLM NPC intelligence (deterministic data layer) tests.
 *
 * Guards against fabricated current facts: time/date come from the real clock,
 * arithmetic from a safe evaluator, game-state from the client's real snapshot,
 * and current-events questions are answered honestly (never invented).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createRuntime } from '../scripts/load-world.mjs';

const require = createRequire(import.meta.url);
const NPC_HANDLER = require('../api/npc.js');

let ipCounter = 0;
async function ask(handler, message, extra = {}) {
    // A unique IP per call avoids the endpoint's per-IP rate limit in tests.
    ipCounter += 1;
    const res = { statusCode: 200, body: '', setHeader() {}, end(b) { this.body = b; return b; } };
    await handler({ method: 'POST', headers: {}, socket: { remoteAddress: `10.0.${ipCounter % 250}.${ipCounter % 250}` },
                    body: { message, npcName: 'Tavern Keeper', npcRole: 'tavern', ...extra } }, res);
    return JSON.parse(res.body);
}

const SNAP = {
    gold: 4321, hp: 80, maxHp: 100, mp: 20, maxMp: 50, level: 7,
    location: 'Wayfarer Tavern', weapon: 'Iron Sword',
    quests: ['Welcome to Kaliwasch'], companions: ['Aria'],
    inventory: [{ name: 'Bread', qty: 2 }], spells: ['Minor Heal', 'Shock']
};

/* ── Real current time and date (never hardcoded) ─────────────────────────── */

test('(101) the India time answer comes from the real clock, not a hardcoded value', async () => {
    const reply = (await ask(NPC_HANDLER, 'what time is it in India')).reply;
    const expected = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
    assert.ok(reply.includes(expected), `reply "${reply}" should contain the real clock "${expected}"`);
    assert.match(reply, /India/i);
    assert.doesNotMatch(reply, /11:15/, 'the old hardcoded example must never appear');
});

test('(102) other timezones resolve to their own real clock', async () => {
    const london = (await ask(NPC_HANDLER, 'what time is it in London')).reply;
    const expected = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/London', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
    assert.ok(london.includes(expected), `London reply "${london}" should contain "${expected}"`);
});

test('(103) today, tomorrow, yesterday and year are real computed dates', async () => {
    const h = NPC_HANDLER;
    const today = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
    assert.ok((await ask(h, "what is today's date")).reply.includes(today));
    const tomorrow = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(Date.now() + 86400000));
    assert.ok((await ask(h, "what is tomorrow's date")).reply.includes(tomorrow));
    const year = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(new Date());
    assert.ok((await ask(h, 'what year is it')).reply.includes(year));
});

/* ── Arithmetic is computed, not guessed ──────────────────────────────────── */

test('(104) simple arithmetic is evaluated safely and correctly', async () => {
    const h = NPC_HANDLER;
    assert.match((await ask(h, 'what is 12 times 15')).reply, /180/);
    assert.match((await ask(h, 'what is 2 plus 3 times 4')).reply, /14/); // precedence
    assert.match((await ask(h, 'what is 100 divided by 4')).reply, /25/);
});

/* ── Game-state questions use real player data ────────────────────────────── */

test('(105) player-specific questions read the real snapshot, not invented values', async () => {
    const h = NPC_HANDLER;
    assert.match((await ask(h, 'how much gold do i have', { game: SNAP })).reply, /4321/);
    assert.match((await ask(h, 'what is my health', { game: SNAP })).reply, /80 out of 100/);
    assert.match((await ask(h, 'what is my weapon', { game: SNAP })).reply, /Iron Sword/);
    assert.match((await ask(h, 'where am i', { game: SNAP })).reply, /Wayfarer Tavern/);
    assert.match((await ask(h, 'what are my quests', { game: SNAP })).reply, /Welcome to Kaliwasch/);
    assert.match((await ask(h, 'what spells do i know', { game: SNAP })).reply, /Minor Heal/);
});

test('(106) a game-state question without a snapshot never hallucinates a number', async () => {
    const reply = (await ask(NPC_HANDLER, 'what is my health')).reply;
    assert.match(reply, /cannot see your character details/i);
    assert.doesNotMatch(reply, /out of \d+/, 'must not invent HP values');
});

/* ── Current events are answered honestly, never fabricated ──────────────── */

test('(107) current news questions perform a real search (keyless fallback) with sources', async t => {
    // v7.24 upgraded this path: instead of refusing, the NPC performs a real
    // server-side search. With no NewsAPI/Brave key, the keyless Wikipedia
    // fallback still returns real results. The search is mocked here for
    // determinism.
    const h = NPC_HANDLER;
    const savedFetch = global.fetch;
    t.after(() => { global.fetch = savedFetch; });
    global.fetch = async (url) => {
        if (String(url).includes('wikipedia.org/w/api.php')) {
            return { ok: true, json: async () => ({ query: { search: [{ title: '2026 in India', snippet: 'events', timestamp: '2026-08-20T00:00:00Z' }] } }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
    };
    const data = await ask(h, 'what is the latest news in india today');
    assert.equal(data.searched, true, 'a real search is performed');
    assert.equal(data.searchProvider, 'wikipedia');
    assert.ok(Array.isArray(data.sources) && data.sources.length, 'sources are returned');
    assert.match(data.reply, /2026 in India/i, 'relates the real retrieved results');
});

/* ── LLM / network failure never crashes or fabricates ───────────────────── */

test('(108) a failing LLM provider falls back to an offline reply, never crashing', async t => {
    const h = NPC_HANDLER;
    const savedKey = process.env.OPENAI_API_KEY;
    const savedFetch = global.fetch;
    t.after(() => { if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey; global.fetch = savedFetch; });
    process.env.OPENAI_API_KEY = 'test-key-not-real';
    global.fetch = async () => { throw new Error('network down'); };
    const reply = (await ask(h, 'what is gravity')).reply;
    assert.ok(reply.length > 5, 'still answers offline');
    assert.equal((await ask(h, 'what is gravity')).provider, 'offline');
});

test('(109) a live provider answering a time question is never allowed to hallucinate', async t => {
    // Time questions are answered deterministically BEFORE any LLM call, so even
    // a live model cannot return a wrong clock time.
    const h = NPC_HANDLER;
    const savedKey = process.env.OPENAI_API_KEY;
    const savedFetch = global.fetch;
    t.after(() => { if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey; global.fetch = savedFetch; });
    process.env.OPENAI_API_KEY = 'test-key-not-real';
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'It is 3:00 AM' } }] }) });
    const data = await ask(h, 'what time is it in india');
    const expected = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
    assert.ok(data.reply.includes(expected), 'the real clock wins over the model');
    assert.equal(data.provider, 'deterministic', 'no LLM is consulted for current time');
});

/* ── Client: snapshot shape, no credentials, duplicate prevention, TTS sync ── */

test('(110) the client snapshot carries game data only — never credentials', async () => {
    const client = await readFile('ai-npc-v7223.js', 'utf8');
    assert.match(client, /buildGameSnapshot/, 'client builds a snapshot');
    for (const banned of ['access_token', 'accessToken', 'apiKey', 'API_KEY', 'email', 'pin', 'password', 'secret']) {
        assert.doesNotMatch(client, new RegExp(`buildGameSnapshot[\\s\\S]{0,400}${banned}`), `${banned} must not be in the snapshot`);
    }
    assert.match(client, /emitGameEvent/, 'replies go through centralized TTS');
});

test('(111) one question produces one response: concurrent requests are refused', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const { Game, AiNpc, WorldData } = window;
    Game.state.player = { name: 'Hero', gold: 50, hp: 100, maxHp: 100, mp: 50, maxMp: 50, level: 1, weapon: 'Rusty Sword', spells: ['Minor Heal'] };
    Game.state.location = 'kaliwasch';
    WorldData.npcs.kaliwasch = [{ name: 'Merchant Aldric', role: 'trader', dialog: [] }];
    AiNpc.pending = false; AiNpc.lastSpoken = ''; AiNpc.lastSpokenAt = 0; AiNpc.histories.clear();
    let fetches = 0, emits = 0;
    const origEmit = Game.emitGameEvent;
    Game.emitGameEvent = () => { emits++; return Promise.resolve(true); };
    window.fetch = async (url) => {
        if (String(url).includes('api/npc')) {
            fetches++;
            await new Promise(r => setTimeout(r, 30));
            return { json: async () => ({ reply: 'Well met, traveller.', ai: true }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
    };

    const first = AiNpc.ask('hello');
    const concurrent = AiNpc.ask('hello');
    assert.equal(await first, true);
    assert.equal(await concurrent, false, 'a second request while one is pending is refused');

    await AiNpc.ask('hello'); // identical reply a moment later → suppressed
    assert.equal(fetches, 2, 'only two network calls for three attempts');
    assert.equal(emits, 1, 'the identical reply is announced exactly once');
    Game.emitGameEvent = origEmit;
});

test('(112) NPC replies still reach the narrative log when TTS is off', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const { Game, AiNpc, WorldData } = window;
    Game.state.player = { name: 'Hero', gold: 10, hp: 100, maxHp: 100, mp: 50, maxMp: 50, level: 1, weapon: 'Rusty Sword', spells: [] };
    Game.state.location = 'kaliwasch';
    WorldData.npcs.kaliwasch = [{ name: 'Merchant Aldric', role: 'trader', dialog: [] }];
    AiNpc.pending = false; AiNpc.lastSpoken = ''; AiNpc.lastSpokenAt = 0; AiNpc.histories.clear();
    window.fetch = async (url) => {
        if (String(url).includes('api/npc')) return { json: async () => ({ reply: 'Well met, traveller.', ai: true }) };
        return { ok: false, status: 404, json: async () => ({}) };
    };
    const spoken = [];
    Game.emitGameEvent = (text, type) => { spoken.push(text); /* log only, do not speak */ const el = window.document.getElementById('narrative'); if (el) el.appendChild(window.document.createTextNode(text)); return Promise.resolve(true); };
    await AiNpc.ask('hello');
    assert.equal(spoken.length, 1, 'exactly one announcement is produced');
    assert.ok(window.document.getElementById('narrative').textContent.includes('Merchant Aldric says: Well met, traveller.'));
});
