/**
 * Unlimited on-device voices (Kokoro-82M in the browser).
 *
 * The cloud voice services have free quotas; the on-device model has none. These
 * tests use a stand-in engine so they never download the real ninety megabytes,
 * and they check the promise that matters: once the pack is ready every line is
 * spoken locally with no server call, and if the pack cannot load the game falls
 * back exactly as before.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

async function ready(t) {
    const runtime = await createRuntime();
    t.after(() => runtime.dom.window.close());
    await wait(0);
    return runtime.window;
}

function standInEngine(w, calls = []) {
    return {
        generate: async (text, options) => {
            calls.push({ text, voice: options?.voice });
            return { toBlob: async () => new w.Blob([new Uint8Array(4000)], { type: 'audio/wav' }) };
        }
    };
}

function quietAudio(w) {
    const played = [];
    w.URL.createObjectURL = () => 'blob:on-device';
    w.URL.revokeObjectURL = () => {};
    w.Audio = class {
        constructor(src) { this.src = src; played.push(src); }
        addEventListener() {}
        play() { setTimeout(() => this.onended?.(), 0); return Promise.resolve(); }
        pause() {}
    };
    return played;
}

test('the pack is off, costs nothing, and says how to get it', async t => {
    const w = await ready(t);
    const pack = w.KokoroVoicePack;
    assert.ok(pack, 'the module is loaded');
    assert.equal(pack.state, 'off');
    assert.equal(pack.ready, false);
    assert.equal(pack.wanted, false);
    assert.match(pack.statusLine(), /voice pack/);
});

test('downloading the pack makes it ready and remembers the choice', async t => {
    const w = await ready(t);
    const pack = w.KokoroVoicePack;
    pack.loader = async url => {
        assert.match(url, /^https:\/\//, 'the engine comes from a real CDN');
        return {
            KokoroTTS: {
                from_pretrained: async (model, options) => {
                    assert.equal(model, 'onnx-community/Kokoro-82M-v1.0-ONNX');
                    assert.equal(options.dtype, 'q8', 'the small model, not the 300 MB one');
                    options.progress_callback?.({ loaded: 46, total: 92 });
                    return standInEngine(w);
                }
            }
        };
    };
    assert.equal(await pack.load(), true);
    assert.equal(pack.state, 'ready');
    assert.equal(pack.progress, 100);
    assert.equal(pack.wanted, true, 'the choice survives a reload');
    assert.match(pack.statusLine(), /unlimited and offline/);
});

test('a ready pack speaks every line locally, with no server call at all', async t => {
    const w = await ready(t);
    const pack = w.KokoroVoicePack;
    const generated = [];
    pack.loader = async () => ({ KokoroTTS: { from_pretrained: async () => standInEngine(w, generated) } });
    await pack.load();
    const played = quietAudio(w);
    let serverCalls = 0;
    w.fetch = async () => { serverCalls += 1; throw new Error('the server must not be used'); };
    w.CharacterVoices.neuralAvailable = true;
    w.CharacterVoices.neuralRetryAt = 0;

    const ok = await w.CharacterVoices.speak('Crier Bell', 'Hear the news of Christmas City! The tree is lit tonight.');
    assert.equal(ok, true);
    assert.equal(w.CharacterVoices.lastEngine, 'kokoro');
    assert.equal(serverCalls, 0, 'no quota was spent');
    assert.equal(played.length, 1);
    assert.match(generated[0].voice, /^[ab][fm]_[a-z]+$/, 'a real Kokoro speaker');
});

test('each character keeps one on-device speaker, and the cast is varied', async t => {
    const w = await ready(t);
    const pack = w.KokoroVoicePack;
    const cast = ['Crier Bell', 'Merchant Aldric', 'Keeper Maren', 'Cooper Bram', 'Temple Priest',
        'Royal Steward', 'Captain Marcus', 'Tavern Keeper Greta', 'Palace Chaplain', 'Nim Vex'];
    const voices = cast.map(name => pack.voiceFor(name));
    for (const voice of voices) assert.match(voice, /^[ab][fm]_[a-z]+$/);
    assert.equal(new Set(voices).size >= 5, true, 'the cast does not share one speaker');
    assert.equal(pack.voiceFor('Crier Bell'), pack.voiceFor('Crier Bell'));
});

test('a script the on-device model cannot say is left to the cloud voice', async t => {
    const w = await ready(t);
    const pack = w.KokoroVoicePack;
    const generated = [];
    pack.loader = async () => ({ KokoroTTS: { from_pretrained: async () => standInEngine(w, generated) } });
    await pack.load();
    quietAudio(w);
    let serverCalls = 0;
    w.fetch = async () => { serverCalls += 1; return { ok: true, status: 200, blob: async () => new w.Blob([new Uint8Array(2000)]) }; };
    w.CharacterVoices.neuralAvailable = true;
    w.CharacterVoices.neuralRetryAt = 0;
    w.CharacterVoices.speechCache.clear();
    assert.equal(await w.CharacterVoices.speak('Crier Bell', 'క్రిస్మస్ రాత్రి శుభాకాంక్షలు.'), true);
    assert.equal(generated.length, 0, 'the English-only pack did not mangle the words');
    assert.equal(serverCalls, 1, 'the cloud voice read it instead');
    assert.equal(w.CharacterVoices.lastEngine, 'neural');
});

test('if the download fails the game keeps its old voices and says why', async t => {
    const w = await ready(t);
    const pack = w.KokoroVoicePack;
    pack.loader = async () => { throw new Error('the network refused the model'); };
    assert.equal(await pack.load(), false);
    assert.equal(pack.state, 'failed');
    assert.equal(pack.wanted, false);
    assert.match(pack.statusLine(), /network refused/);

    let serverCalls = 0;
    w.fetch = async () => { serverCalls += 1; return { ok: true, status: 200, blob: async () => new w.Blob([new Uint8Array(2000)]) }; };
    quietAudio(w);
    w.CharacterVoices.neuralAvailable = true;
    w.CharacterVoices.neuralRetryAt = 0;
    w.CharacterVoices.speechCache.clear();
    assert.equal(await w.CharacterVoices.speak('Crier Bell', 'A line after a broken download.'), true);
    assert.equal(w.CharacterVoices.lastEngine, 'neural', 'the cloud voice still answered');
    assert.equal(serverCalls, 1);
});

test('the player can turn the pack off without losing the download', async t => {
    const w = await ready(t);
    const pack = w.KokoroVoicePack;
    pack.loader = async () => ({ KokoroTTS: { from_pretrained: async () => standInEngine(w) } });
    await pack.load();
    assert.equal(pack.wanted, true);
    pack.disable();
    assert.equal(pack.wanted, false, 'the choice is forgotten');
    assert.equal(pack.state, 'off');
});

test('voice pack orders are understood by the game, and voice status reports it', async t => {
    const w = await ready(t);
    const G = w.Game;
    G.state.player = { name: 'Tester', gold: 1, hp: 10, maxHp: 10, mp: 1, maxMp: 1, level: 1, inventory: [], spells: [] };
    G.state.location = 'kaliwasch';
    const said = [];
    G.emitGameEvent = text => { said.push(text); return Promise.resolve(true); };
    w.KokoroVoicePack.loader = async () => ({ KokoroTTS: { from_pretrained: async () => standInEngine(w) } });

    G.processCommand('voice pack');
    await wait(20);
    assert.match(said[0], /about ninety megabytes/i, 'the player is told the size before it downloads');
    assert.equal(w.KokoroVoicePack.state, 'ready');
    assert.match(said.at(-1), /unlimited voice of their own/i);

    await w.AiNpc.reportStatus(G);
    assert.match(said.at(-1), /on-device voices are ready: unlimited and offline/i);

    G.processCommand('voice pack off');
    assert.equal(w.KokoroVoicePack.wanted, false);
    assert.match(said.at(-1), /On-device voices are off/i);
});
