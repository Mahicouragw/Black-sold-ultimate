import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

async function managerFixture({ autoFinish = true } = {}) {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://example.test/Black-sold-ultimate/', runScripts: 'outside-only', pretendToBeVisual: true });
    const window = dom.window;
    const utterances = [], mediaStarts = [];
    window.Audio = class {
        constructor() { this.dataset = {}; this.paused = true; this.volume = 1; this.currentTime = 0; this.duration = 0.01; this.loop = false; this.listeners = {}; }
        addEventListener(type, listener) { (this.listeners[type] ||= new Set()).add(listener); }
        removeEventListener(type, listener) { if (listener) this.listeners[type]?.delete(listener); else delete this.listeners[type]; }
        emit(type) { for (const listener of [...(this.listeners[type] || [])]) listener(); }
        removeAttribute(name) { if (name === 'src') this.src = ''; } load() {} pause() { this.paused = true; }
        play() { this.paused = false; if (this.dataset.busy === 'true' && !this.loop) { mediaStarts.push(this); if (autoFinish) queueMicrotask(() => this.emit('ended')); } return Promise.resolve(); }
    };
    window.AudioContext = class {
        constructor() { this.state = 'running'; this.destination = {}; }
        createGain() { return { gain: { value: 1 }, connect() {} }; }
        createBufferSource() { const listeners = {}; return { buffer: null, playbackRate: { value: 1 }, connect() {}, disconnect() {},
            addEventListener(type, listener) { (listeners[type] ||= new Set()).add(listener); },
            start() { queueMicrotask(() => { for (const listener of listeners.ended || []) listener(); }); },
            stop() { queueMicrotask(() => { for (const listener of listeners.ended || []) listener(); }); } }; }
        decodeAudioData() { return Promise.resolve({ duration: 0.01 }); }
        resume() { return Promise.resolve(); }
        suspend() { return Promise.resolve(); }
    };
    const spoken = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    window.speechSynthesis = {
        getVoices: () => [{ name: 'English India', lang: 'en-IN' }],
        speak(utterance) { spoken.push(utterance.text); utterances.push(utterance); if (autoFinish) queueMicrotask(() => { utterance.onstart?.(); utterance.onend?.(); }); },
        cancel() {}, addEventListener() {}
    };
    window.fetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
    window.eval(await readFile('music.js', 'utf8'));
    return { dom, window, manager: window.AudioManager, spoken, utterances, mediaStarts };
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

test('page hide and SFX-off stop active Web Audio, fallback media and speech', async () => {
    const { dom, window, manager } = await managerFixture();
    manager.init();let stopped=0,cancelled=0;
    window.speechSynthesis.cancel=()=>{cancelled++;};
    manager.activeSFX.add({stop(){stopped++;},disconnect(){}});
    manager.sfxFallbackPool[0].paused=false;
    manager.worldAudio.paused=false;
    manager.pausePageAudio();
    assert.equal(stopped,1);assert.equal(manager.activeSFX.size,0);
    assert.ok(manager.worldAudio.paused);assert.ok(manager.sfxFallbackPool.every(p=>p.paused));assert.ok(cancelled>0);
    assert.equal(manager.playSFXSource('assets/audio/sfx/music-transition.wav'),false);
    assert.equal(await manager.playVoice('Must not speak while hidden'),false);
    await manager.resumeWorldMusic();assert.ok(manager.worldAudio.paused);
    manager.pageSuspended=false;manager.activeSFX.add({stop(){stopped++;},disconnect(){}});manager.setSFXEnabled(false);
    assert.equal(stopped,2);dom.window.close();
});

const flushAudio = () => new Promise(resolve => setTimeout(resolve, 0));

test('narration completes before its matching hit and goblin reaction, with no overlap', async () => {
    const { dom, manager, spoken, utterances, mediaStarts } = await managerFixture({ autoFinish: false });
    manager.init(); manager.setVoiceEnabled(true, false);
    const task = manager.playAction('You hit root goblin for 18 damage.', ['weapon-hit', 'goblin-reaction']);
    assert.deepEqual(spoken, ['You hit root goblin for 18 damage.']);
    assert.equal(mediaStarts.length, 0, 'the hit must not start during narration');
    utterances[0].onstart?.(); utterances[0].onend?.(); await flushAudio();
    assert.equal(mediaStarts.length, 1, 'exactly one weapon impact follows narration');
    assert.match(mediaStarts[0].src, /assets\/audio\/sfx\/hit\.wav$/);
    mediaStarts[0].emit('ended'); await flushAudio();
    assert.equal(mediaStarts.length, 2, 'the reaction waits for the complete impact');
    assert.match(mediaStarts[1].src, /assets\/audio\/sfx\/goblin-reaction\.ogg$/);
    mediaStarts[1].emit('ended');
    assert.equal(await task, true);
    assert.equal(manager.currentSpeechItem, null);
    dom.window.close();
});

test('event IDs and same-action signatures deduplicate without dropping the first event', async () => {
    const { dom, manager, spoken, mediaStarts } = await managerFixture();
    manager.init(); manager.setVoiceEnabled(true, false);
    const first = manager.playAction('You hit root goblin for 18 damage.', ['weapon-hit'], { eventId: 'attack:42' });
    const duplicate = manager.playAction('You hit root goblin for 18 damage.', ['weapon-hit'], { eventId: 'attack:42' });
    assert.equal(await duplicate, false);
    assert.equal(await first, true);
    const repeated = manager.playAction('You eat Bread.', ['eat']);
    const repeatedDuplicate = manager.playAction('You eat Bread.', ['eat']);
    assert.deepEqual(await Promise.all([repeated, repeatedDuplicate]), [true, false]);
    assert.deepEqual(spoken, ['You hit root goblin for 18 damage.', 'You eat Bread.']);
    assert.equal(mediaStarts.length, 2);
    manager.playSFX('button'); manager.playSFX('click');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(mediaStarts.length, 3, 'button/click aliases produce one physical UI sound');
    dom.window.close();
});

test('channel cancellation settles the active event and the next action recovers', async () => {
    const { dom, manager, utterances, mediaStarts } = await managerFixture({ autoFinish: false });
    manager.init(); manager.setVoiceEnabled(true, false);
    const cancelled = manager.playAction('Cancel this vehicle door.', ['car-door-open'], { channel: 'racing-test' });
    manager.cancelAudioChannel('racing-test');
    assert.equal(await cancelled, false);
    assert.equal(mediaStarts.length, 0, 'cancelled narration must not release its effect later');
    const recovered = manager.playAction('The next control still works.', ['eat'], { channel: 'racing-test' });
    assert.equal(utterances.length, 2);
    utterances[1].onstart?.(); utterances[1].onend?.(); await flushAudio();
    assert.equal(mediaStarts.length, 1);
    mediaStarts[0].emit('ended');
    assert.equal(await recovered, true);
    dom.window.close();
});

test('speech errors release the matching recording and later narration still works', async () => {
    const { dom, manager, utterances, mediaStarts } = await managerFixture({ autoFinish: false });
    manager.init(); manager.setVoiceEnabled(true, false);
    const recovered = manager.playAction('You drink the potion.', ['drink', 'heal']);
    utterances[0].onerror?.({ error: 'voice-unavailable' }); await flushAudio();
    assert.equal(mediaStarts.length, 1, 'a speech engine error must not block consumption audio');
    assert.match(mediaStarts[0].src, /drink\.ogg$/);
    mediaStarts[0].emit('ended'); await flushAudio();
    assert.equal(mediaStarts.length, 2, 'the healing stage still follows the complete drink recording');
    mediaStarts[1].emit('ended');
    assert.equal(await recovered, false, 'the result honestly reports the speech failure');
    const next = manager.playVoice('Narration recovered.');
    utterances[1].onstart?.(); utterances[1].onend?.();
    assert.equal(await next, true);
    dom.window.close();
});

test('voice and SFX settings degrade independently without blocking queued controls', async () => {
    const { dom, manager, spoken, mediaStarts } = await managerFixture();
    manager.init(); manager.setVoiceEnabled(false, false);
    assert.equal(await manager.playAction('You eat Bread.', ['eat']), true);
    assert.deepEqual(spoken, []);
    assert.equal(mediaStarts.length, 1);
    manager.setVoiceEnabled(true, false); manager.setSFXEnabled(false, false);
    assert.equal(await manager.playAction('You eat Bread again.', ['eat']), true);
    assert.deepEqual(spoken, ['You eat Bread again.']);
    assert.equal(mediaStarts.length, 1, 'disabled SFX never start after the narration');
    manager.setSFXEnabled(true, false);
    dom.window.close();
});

test('turning narration off does not cancel independent pending or active recordings', async () => {
    const { dom, manager, utterances, mediaStarts } = await managerFixture({ autoFinish: false });
    manager.init(); manager.setVoiceEnabled(true, false);
    const action = manager.playAction('You eat Bread.', ['eat']);
    manager.playSFX('click'); await Promise.resolve();
    manager.setVoiceEnabled(false, false); await flushAudio();
    assert.equal(mediaStarts.length, 1, 'the active action still releases its consumption recording');
    assert.match(mediaStarts[0].src, /eat\.ogg$/);
    mediaStarts[0].emit('ended');
    assert.equal(await action, false);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(mediaStarts.length, 2, 'the independent UI click remains queued');
    assert.match(mediaStarts[1].src, /ui-click\.wav$/);
    mediaStarts[1].emit('ended');
    assert.equal(utterances.length, 1, 'no new speech is produced while narration is off');
    dom.window.close();
});
