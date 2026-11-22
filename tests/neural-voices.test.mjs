/**
 * Synthetic per-character voices.
 *
 * The NPC speaks with a neural voice of its own (server-side TTS), not the
 * phone's TalkBack voice, and falls back to the device voice only when no
 * service is configured or the request fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

const require = createRequire(import.meta.url);
const TTS_HANDLER = require('../api/tts.js');

function ttsCall(body, headers = {}) {
    const res = {
        statusCode: 200, body: null, headers: {},
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        end(chunk) { this.body = chunk; return chunk; }
    };
    return TTS_HANDLER({ method: 'POST', headers, socket: { remoteAddress: `10.7.${Math.floor(Math.random() * 200)}.1` }, body }, res)
        .then(() => res);
}

function withEnv(t, values) {
    const keys = ['GEMINI_API_KEY', 'GOOGLE_TTS_API_KEY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID'];
    const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    const savedFetch = global.fetch;
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, values);
    t.after(() => {
        for (const key of keys) {
            if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
        }
        global.fetch = savedFetch;
    });
}

test('with no provider key the endpoint says so instead of pretending', async t => {
    withEnv(t, {});
    const res = await ttsCall({ text: 'Well met.', voice: 'Kore' });
    assert.equal(res.statusCode, 503);
    assert.equal(JSON.parse(res.body).error, 'tts-not-configured');
});

test('Gemini TTS audio is wrapped into a playable WAV', async t => {
    withEnv(t, { GEMINI_API_KEY: 'test-key' });
    const pcm = Buffer.alloc(4800, 1);
    let requested = null;
    global.fetch = async (url, options) => {
        requested = { url: String(url), body: JSON.parse(options.body) };
        return {
            ok: true,
            json: async () => ({
                candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } }]
            })
        };
    };
    const res = await ttsCall({ text: 'The road north is quiet.', voice: 'Puck' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'audio/wav');
    assert.equal(res.headers['x-voice-provider'], 'gemini');
    assert.equal(res.body.subarray(0, 4).toString(), 'RIFF', 'a real WAV container');
    assert.equal(res.body.readUInt32LE(24), 24000, 'with the sample rate the service used');
    assert.match(requested.url, /gemini-2\.5-flash-preview-tts/);
    assert.equal(requested.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Puck');
});

test('an unknown voice falls back to a real one instead of failing', async t => {
    withEnv(t, { GEMINI_API_KEY: 'test-key' });
    let asked = '';
    global.fetch = async (url, options) => {
        asked = JSON.parse(options.body).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName;
        return {
            ok: true,
            json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: Buffer.alloc(200, 0).toString('base64') } }] } }] })
        };
    };
    const res = await ttsCall({ text: 'Hello there.', voice: '<script>' });
    assert.equal(res.statusCode, 200);
    assert.match(asked, /^[A-Z][a-z]+$/, 'a valid voice name was used');
});

test('if the first provider fails, the next configured one answers', async t => {
    withEnv(t, { GEMINI_API_KEY: 'bad', GOOGLE_TTS_API_KEY: 'good' });
    global.fetch = async url => {
        if (String(url).includes('generativelanguage')) return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, json: async () => ({ audioContent: Buffer.alloc(1200, 5).toString('base64') }) };
    };
    const res = await ttsCall({ text: 'Snow is falling.', voice: 'Kore' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'audio/mpeg');
    assert.equal(res.headers['x-voice-provider'], 'google');
});

test('empty text is refused', async t => {
    withEnv(t, { GEMINI_API_KEY: 'test-key' });
    const res = await ttsCall({ text: '   ', voice: 'Kore' });
    assert.equal(res.statusCode, 400);
});

/* ── Client side ─────────────────────────────────────────────────────────── */

async function ready(t) {
    const r = await createRuntime(); t.after(() => r.dom.window.close());
    await wait(0);
    return r.window;
}

test('every character is assigned one of the synthetic voices, stably', async t => {
    const w = await ready(t);
    const names = ['Tavern Keeper Greta', 'Merchant Aldric', 'Crier Bell', 'Captain Marcus',
        'Keeper Maren', 'Cooper Bram', 'Temple Priest', 'Royal Steward', 'Palace Chaplain'];
    const voices = names.map(name => w.CharacterVoices.neuralVoice(name));
    for (const voice of voices) assert.match(voice, /^[A-Z][a-z]+$/);
    assert.equal(new Set(voices).size >= 6, true, 'the cast does not all share one voice');
    assert.equal(w.CharacterVoices.neuralVoice('Crier Bell'), w.CharacterVoices.neuralVoice('Crier Bell'), 'stable per character');
});

test('an NPC speaks with neural audio when the service answers', async t => {
    const w = await ready(t);
    const played = [];
    w.CharacterVoices.neuralAvailable = true;
    w.CharacterVoices.neuralRetryAt = 0;
    w.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        assert.match(body.voice, /^[A-Z][a-z]+$/);
        return { ok: true, status: 200, blob: async () => new w.Blob([new Uint8Array(2000)]) };
    };
    const OriginalAudio = w.Audio;
    w.URL.createObjectURL = () => 'blob:test-voice';
    w.URL.revokeObjectURL = () => {};
    w.Audio = class {
        constructor(src) { this.src = src; played.push(src); }
        addEventListener() {}
        play() { setTimeout(() => this.onended?.(), 0); return Promise.resolve(); }
        pause() {}
    };
    const ok = await w.CharacterVoices.speak('Tavern Keeper Greta', 'Care for an ale, adventurer?');
    w.Audio = OriginalAudio;
    assert.equal(ok, true);
    assert.equal(w.CharacterVoices.lastEngine, 'neural');
    assert.equal(played.length, 1, 'the synthetic recording was played');
});

test('with no voice service the NPC still speaks, in the device voice', async t => {
    const w = await ready(t);
    w.CharacterVoices.neuralAvailable = true;
    w.CharacterVoices.neuralRetryAt = 0;
    w.fetch = async () => ({ ok: false, status: 503, blob: async () => null });
    const queued = [];
    w.AudioManager.enqueueAudioEvent = options => { queued.push(options); return Promise.resolve(true); };
    const ok = await w.CharacterVoices.speak('Merchant Aldric', 'Welcome to my shop, traveler!');
    assert.equal(ok, true);
    assert.equal(w.CharacterVoices.lastEngine, 'device');
    assert.equal(queued.length, 1);
    assert.equal(queued[0].character, true, 'still the character channel, not narration');
    assert.equal(queued[0].text, 'Welcome to my shop, traveler!', 'and the exact words on screen');
    assert.equal(w.CharacterVoices.neuralAvailable, false, 'a 503 is not retried on every line');
});

test('a failed neural request retries later instead of hammering the service', async t => {
    const w = await ready(t);
    w.CharacterVoices.neuralAvailable = true;
    w.CharacterVoices.neuralRetryAt = 0;
    let calls = 0;
    w.fetch = async () => { calls++; throw new Error('offline'); };
    w.AudioManager.enqueueAudioEvent = () => Promise.resolve(true);
    await w.CharacterVoices.speak('Crier Bell', 'Hear the news!');
    await w.CharacterVoices.speak('Crier Bell', 'One door each night.');
    assert.equal(calls, 1, 'the second line goes straight to the device voice');
    assert.ok(w.CharacterVoices.neuralRetryAt > Date.now());
});

/* ── Diagnostics and resilience ──────────────────────────────────────────── */

function getCall() {
    const res = { statusCode: 200, body: null, headers: {}, setHeader(n, v) { this.headers[n.toLowerCase()] = v; }, end(b) { this.body = b; return b; } };
    return TTS_HANDLER({ method: 'GET', headers: {}, socket: { remoteAddress: '10.7.99.9' } }, res).then(() => res);
}

test('the endpoint can be checked in a browser without leaking the key', async t => {
    withEnv(t, {});
    const empty = await getCall();
    assert.equal(empty.statusCode, 200);
    assert.deepEqual(JSON.parse(empty.body), { configured: false, providers: [] });

    process.env.GEMINI_API_KEY = 'test-key';
    const ready = await getCall();
    const body = JSON.parse(ready.body);
    assert.equal(body.configured, true);
    assert.equal(body.providers[0].name, 'gemini');
    assert.doesNotMatch(ready.body, /test-key/, 'the key never appears');
});

test('a rejected key is reported as a key problem, not a silent failure', async t => {
    withEnv(t, { GEMINI_API_KEY: 'bad-key' });
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    const res = await ttsCall({ text: 'Hello.', voice: 'Kore' });
    assert.equal(res.statusCode, 502);
    assert.equal(JSON.parse(res.body).error, 'tts-auth-failed');
});

test('a retired speech model falls through to the next one', async t => {
    withEnv(t, { GEMINI_API_KEY: 'test-key' });
    const models = [];
    global.fetch = async (url, options) => {
        models.push(String(url).match(/models\/([^:]+):/)?.[1]);
        if (models.length === 1) return { ok: false, status: 404, json: async () => ({}) };
        return {
            ok: true,
            json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: Buffer.alloc(400, 3).toString('base64') } }] } }] })
        };
    };
    const res = await ttsCall({ text: 'Well met.', voice: 'Kore' });
    assert.equal(res.statusCode, 200);
    assert.ok(models.length >= 2 && models[0] !== models[1], 'a second speech model was tried');
    assert.ok(res.headers['x-voice-model'], 'the caller can see which model spoke');
});

test('the same sentence is fetched once and reused', async t => {
    const w = await ready(t);
    w.CharacterVoices.neuralAvailable = true;
    w.CharacterVoices.neuralRetryAt = 0;
    w.CharacterVoices.speechCache.clear();
    let calls = 0;
    w.fetch = async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ configured: true, providers: [] }), blob: async () => new w.Blob([new Uint8Array(2000)]) }; };
    await w.CharacterVoices.cachedSpeech('Crier Bell', 'Hear the news of Christmas City!');
    await w.CharacterVoices.cachedSpeech('Crier Bell', 'Hear the news of Christmas City!');
    assert.equal(calls, 1, 'the second request came from the cache');
});

test('long text is split into several short voice requests', async t => {
    const w = await ready(t);
    w.CharacterVoices.neuralAvailable = true;
    w.CharacterVoices.neuralRetryAt = 0;
    w.CharacterVoices.speechCache.clear();
    const bodies = [];
    w.fetch = async (url, options) => {
        bodies.push(JSON.parse(options.body).text);
        return { ok: true, status: 200, blob: async () => new w.Blob([new Uint8Array(2000)]) };
    };
    w.URL.createObjectURL = () => 'blob:test';
    w.URL.revokeObjectURL = () => {};
    w.Audio = class { constructor() {} addEventListener() {} play() { setTimeout(() => this.onended?.(), 0); return Promise.resolve(); } pause() {} };
    const long = 'The road north is quiet tonight. ' .repeat(20).trim();
    const ok = await w.CharacterVoices.speakNeural('Cooper Bram', long);
    assert.equal(ok, true);
    assert.ok(bodies.length >= 2, 'the story was read in several pieces');
    for (const part of bodies) assert.ok(part.length <= 450, 'each piece stays under the cap');
});

test('voice status reports the voice service truthfully', async t => {
    const w = await ready(t);
    const G = w.Game;
    G.state.player = { name: 'Tester', gold: 1, hp: 10, maxHp: 10, mp: 1, maxMp: 1, level: 1, inventory: [], spells: [] };
    G.state.location = 'kaliwasch';
    const said = [];
    G.emitGameEvent = (text) => { said.push(text); return Promise.resolve(true); };
    w.CharacterVoices.diagnose = async () => ({ reachable: true, configured: true, providers: [{ name: 'gemini' }] });
    w.AiNpc.lastCall = { provider: 'openrouter', ai: true, ms: 900, at: new Date() };
    await w.AiNpc.reportStatus(G);
    assert.match(said[0], /openrouter/);
    assert.match(said[0], /voice service is configured with gemini/i);

    w.CharacterVoices.diagnose = async () => ({ reachable: true, configured: false, providers: [] });
    await w.AiNpc.reportStatus(G);
    assert.match(said.at(-1), /no voice key is configured/i);
});

test('voice test speaks a sample line in the character voice', async t => {
    const w = await ready(t);
    const G = w.Game;
    G.state.player = { name: 'Tester', gold: 1, hp: 10, maxHp: 10, mp: 1, maxMp: 1, level: 1, inventory: [], spells: [] };
    G.state.location = 'kaliwasch';
    w.WorldData.npcs.kaliwasch = [{ name: 'Merchant Aldric', role: 'shopkeeper', dialog: [] }];
    const spoken = [];
    const original = w.CharacterVoices.speak;
    w.CharacterVoices.speak = (name, text) => { spoken.push({ name, text }); return Promise.resolve(true); };
    G.processCommand('voice test');
    w.CharacterVoices.speak = original;
    assert.equal(spoken.length, 1);
    assert.equal(spoken[0].name, 'Merchant Aldric');
    assert.match(spoken[0].text, /This is my voice/);
});

test('a probe speaks two words and reports whether the key really works', async t => {
    withEnv(t, { GEMINI_API_KEY: 'test-key' });
    global.fetch = async () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: Buffer.alloc(400, 5).toString('base64') } }] } }] })
    });
    const res = probeRes();
    await TTS_HANDLER({ method: 'GET', url: '/api/tts?probe=1', headers: {}, socket: { remoteAddress: '10.7.99.8' } }, res);
    const body = JSON.parse(res.body);
    assert.equal(res.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(body.provider, 'gemini');
    assert.ok(body.bytes > 44, 'the probe produced real audio');
    assert.doesNotMatch(res.body, /test-key/);

    global.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
    const rejectedRes = probeRes();
    await TTS_HANDLER({ method: 'GET', url: '/api/tts?probe=1', headers: {}, socket: { remoteAddress: '10.7.99.7' } }, rejectedRes);
    const rejected = JSON.parse(rejectedRes.body);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error, 'tts-auth-failed');
});

function probeRes() {
    const res = { statusCode: 200, body: null, headers: {}, setHeader(n, v) { this.headers[n.toLowerCase()] = v; }, end(b) { this.body = b; return b; } };
    return res;
}
