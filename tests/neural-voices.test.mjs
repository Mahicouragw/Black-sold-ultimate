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
