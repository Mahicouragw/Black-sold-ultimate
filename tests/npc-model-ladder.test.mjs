/**
 * The OpenRouter model ladder.
 *
 * A retired or rate-limited model id must never take the whole conversation
 * down: the endpoint walks a list of known-good models and uses the first one
 * that answers. This is the regression that made NPCs reply with one canned
 * line even with the internet working.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const NPC_HANDLER = require('../api/npc.js');

let ipCounter = 0;
async function ask(message) {
    ipCounter += 1;
    const res = { statusCode: 200, body: '', setHeader() {}, end(b) { this.body = b; return b; } };
    await NPC_HANDLER({
        method: 'POST',
        headers: {},
        socket: { remoteAddress: `10.9.${ipCounter % 250}.${(ipCounter * 7) % 250}` },
        body: { message, npcName: 'Tavern Keeper Greta', npcRole: 'tavern keeper' }
    }, res);
    return JSON.parse(res.body);
}

function withEnv(t) {
    const saved = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, GEMINI_API_KEY: process.env.GEMINI_API_KEY, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, NPC_MODEL: process.env.NPC_MODEL };
    const savedFetch = global.fetch;
    t.after(() => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        global.fetch = savedFetch;
    });
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.NPC_MODEL;
    process.env.OPENROUTER_API_KEY = 'test-key';
}

test('a retired model id falls through to the next model instead of giving up', async t => {
    withEnv(t);
    const tried = [];
    global.fetch = async (url, options) => {
        const body = JSON.parse(options?.body || '{}');
        tried.push(body.model);
        if (tried.length === 1) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'The barrels are stacked behind the inn.' } }] }) };
    };
    const data = await ask('tell me about the barrels');
    assert.equal(data.ai, true, 'the second model answers');
    assert.match(data.reply, /barrels are stacked/);
    assert.ok(tried.length >= 2, 'more than one model was attempted');
    assert.notEqual(tried[0], tried[1], 'and it was a different model');
});

test('every model failing still produces a spoken-able answer, not an error', async t => {
    withEnv(t);
    let attempts = 0;
    global.fetch = async () => { attempts += 1; return { ok: false, status: 429, json: async () => ({}) }; };
    const data = await ask('what will you do for christmas');
    assert.equal(data.ai, false);
    assert.equal(data.provider, 'offline');
    assert.ok(attempts >= 3, 'it tried the ladder before falling back');
    assert.ok(data.reply.length > 20, 'the player still hears an answer');
    assert.doesNotMatch(data.reply, /error|undefined|null/i);
});

test('the offline fallback is not the same sentence for every question', async t => {
    withEnv(t);
    global.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    const a = await ask('tell me about the harbour');
    const b = await ask('what will you do for christmas');
    assert.notEqual(a.reply, b.reply, 'different subjects get different words');
    assert.match(b.reply, /December|Christmas|Advent/i, 'the Christmas answer is about Christmas');
});
