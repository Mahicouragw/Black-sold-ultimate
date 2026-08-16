import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

async function managerFixture() {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://example.test/Black-sold-ultimate/', runScripts: 'outside-only', pretendToBeVisual: true });
    const window = dom.window;
    window.Audio = class {
        constructor() { this.dataset = {}; this.paused = true; this.volume = 1; this.currentTime = 0; this.listeners = {}; }
        addEventListener(type, listener) { this.listeners[type] = listener; }
        removeAttribute() {} load() {} pause() { this.paused = true; }
        play() { this.paused = false; return Promise.resolve(); }
    };
    window.AudioContext = class {
        constructor() { this.state = 'running'; this.destination = {}; }
        createGain() { return { gain: { value: 1 }, connect() {} }; }
        createBufferSource() { return { buffer: null, playbackRate: { value: 1 }, connect() {}, disconnect() {}, addEventListener() {}, start() {} }; }
        decodeAudioData() { return Promise.resolve({ duration: 0.01 }); }
    };
    const spoken = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    window.speechSynthesis = {
        getVoices: () => [{ name: 'English India', lang: 'en-IN' }],
        speak(utterance) { spoken.push(utterance.text); queueMicrotask(() => { utterance.onstart?.(); utterance.onend?.(); }); },
        cancel() {}, addEventListener() {}
    };
    window.fetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
    window.eval(await readFile('music.js', 'utf8'));
    return { dom, window, manager: window.AudioManager, spoken };
}

test('every category has multiple registered real tracks', async () => {
    const { dom, manager } = await managerFixture();
    for (const [context, tracks] of Object.entries(manager.playlists)) {
        assert.ok(new Set(tracks).size >= 2, `${context} needs at least two tracks`);
        tracks.forEach(track => assert.ok(manager.music[track], `${context} references ${track}`));
    }
    dom.window.close();
});

test('smart shuffle uses each track before reshuffling and avoids immediate repeat', async () => {
    const { dom, manager } = await managerFixture();
    const pool = manager.playlists.CITY;
    const firstCycle = Array.from({ length: pool.length }, () => manager.nextTrack('CITY'));
    assert.equal(new Set(firstCycle).size, pool.length);
    const next = manager.nextTrack('CITY');
    assert.notEqual(next, firstCycle.at(-1));
    dom.window.close();
});

test('device TTS is serialized and restores ducked music', async () => {
    const { dom, manager, spoken } = await managerFixture();
    manager.init();
    manager.voiceEnabled = true;
    await Promise.all([
        manager.playVoice('First announcement', { language: 'en-IN' }),
        manager.playVoice('Second announcement', { language: 'en-IN' })
    ]);
    assert.deepEqual(spoken, ['First announcement', 'Second announcement']);
    assert.equal(manager.speaking, false);
    assert.equal(manager.duckRequests.has('voice'), false);
    dom.window.close();
});
