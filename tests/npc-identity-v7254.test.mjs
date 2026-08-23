/**
 * v7.25.4 — application identity for the NPC / assistant.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const NPC_HANDLER = require('../api/npc.js');

let ip = 0;
async function ask(message) {
    let payload = '';
    const res = {
        setHeader() {},
        end(s) { payload = s; }
    };
    ip += 1;
    await NPC_HANDLER({
        method: 'POST',
        headers: {},
        socket: { remoteAddress: `10.25.4.${ip % 250}` },
        body: { message, npcName: 'Tavern Keeper', npcRole: 'tavern' }
    }, res);
    return JSON.parse(payload);
}

test('who are you uses Black Soul Ultimate AI, not a vendor', async () => {
    const r = await ask('Who are you?');
    assert.match(r.reply, /Black Soul Ultimate AI/i);
    assert.doesNotMatch(r.reply, /nvidia|openai|google|language model/i);
});

test('what is this names the game and the assistant', async () => {
    const r = await ask('What is this?');
    assert.match(r.reply, /Black Soul Ultimate/i);
    assert.match(r.reply, /AI assistant|NPC intelligence/i);
    assert.doesNotMatch(r.reply, /nvidia|openai/i);
});

test('who created you attributes the game team, not a vendor', async () => {
    const r = await ask('Who created you?');
    assert.match(r.reply, /Black Soul Ultimate/i);
    assert.match(r.reply, /development team/i);
    assert.doesNotMatch(r.reply, /trained by|nvidia|openai/i);
});

test('who developed you stays on the game identity', async () => {
    const r = await ask('Who developed you?');
    assert.match(r.reply, /Black Soul Ultimate AI/i);
    assert.doesNotMatch(r.reply, /nvidia|openai/i);
});

test('technical model question does not invent a trainer', async () => {
    const r = await ask('What AI model are you using?');
    assert.match(r.reply, /Black Soul Ultimate AI/i);
    assert.match(r.reply, /underlying AI providers/i);
    assert.doesNotMatch(r.reply, /trained by the Black Soul/i);
    assert.doesNotMatch(r.reply, /nvidia|openai|gemini/i);
});

test('system prompt encodes application identity, not a vendor brand', async () => {
    const src = await readFile('api/npc.js', 'utf8');
    assert.match(src, /Black Soul Ultimate AI/);
    assert.match(src, /Never say you are a language model/);
    assert.match(src, /IDENTITY_RULES/);
});
