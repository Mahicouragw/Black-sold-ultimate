import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

async function ready(t) {
    const r = await createRuntime(); t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window, G = w.Game;
    G.state.player = { name: 'Voice Tester', gold: 10, hp: 100, maxHp: 100, mp: 50, maxMp: 50, level: 1, weapon: 'Rusty Sword', spells: [] };
    G.state.location = 'kaliwasch';
    w.WorldData.npcs.kaliwasch = [{ name: 'Merchant Aldric', role: 'shopkeeper', dialog: ['Welcome to my shop, traveler!'] }];
    w.AiNpc.pending = false; w.AiNpc.lastSpoken = ''; w.AiNpc.lastSpokenAt = 0; w.AiNpc.histories.clear();
    return { w, G };
}

/** Capture what the game asks the speech engine to say. */
function spySpeech(w, G) {
    const spoken = [];
    const original = G.emitGameEvent;
    G.emitGameEvent = (text, type, options = {}) => { spoken.push({ text, type, options }); return Promise.resolve(true); };
    return { spoken, restore() { G.emitGameEvent = original; } };
}

test('a greeting is written for this moment and read aloud word for word', async t => {
    const { w, G } = await ready(t);
    let clips = 0;
    const play = w.CharacterRecordings.play;
    w.CharacterRecordings.play = (...args) => { const result = play.apply(w.CharacterRecordings, args); if (result) clips++; return result; };
    const spy = spySpeech(w, G);
    assert.equal(await w.AiNpc.ask('hello'), true);
    spy.restore();

    assert.equal(spy.spoken.length, 1, 'exactly one answer is spoken');
    const answer = spy.spoken[0];
    assert.match(answer.text, /^Merchant Aldric says: /, 'the character is named as the speaker');
    assert.match(answer.text, /Merchant Aldric, shopkeeper, here in Kaliwasch Market Square/, 'the reply is built from who and where he is');
    assert.equal(clips, 0, 'no pre-recorded clip is substituted for the answer');
    assert.notEqual(answer.options.eventId, undefined, 'a stable event id keeps it from repeating');
});

test('the spoken words are exactly the words written on screen', async t => {
    const { w, G } = await ready(t);
    const spoken = [];
    const original = G.emitGameEvent;
    G.emitGameEvent = (text, type, options = {}) => { spoken.push({ text, type, options }); return original.call(G, text, type, options); };
    w.fetch = async () => ({ json: async () => ({ reply: 'The forest entrance lies north of the market square.', ai: true }) });
    await w.AiNpc.ask('where is the forest entrance');
    G.emitGameEvent = original;
    const log = w.document.getElementById('narrative').textContent;
    assert.ok(log.includes('Merchant Aldric says: The forest entrance lies north of the market square.'), 'the reply is on screen');
    const answer = spoken.find(item => item.text.startsWith('Merchant Aldric says:'));
    assert.ok(answer, 'and the same reply is spoken');
    assert.ok(answer.text.includes('The forest entrance lies north of the market square.'), 'word for word, nothing swapped in');
});

test('any question is answered out loud, even with no network', async t => {
    const { w, G } = await ready(t);
    const spy = spySpeech(w, G);
    w.fetch = async () => { throw new Error('offline'); };
    assert.equal(await w.AiNpc.ask('what should I do about the goblins'), true);
    spy.restore();
    assert.equal(spy.spoken.length, 1, 'the offline answer is still spoken');
    assert.match(spy.spoken[0].text, /^Merchant Aldric says: .{10,}/, 'with real words, not a placeholder');
    assert.doesNotMatch(spy.spoken[0].text, /thinking|let me think|reasoning/i, 'never a "thinking" line');
});

test('every character keeps a stable voice of its own', async t => {
    const { w } = await ready(t);
    const names = ['Merchant Aldric', 'Tavern Keeper Greta', 'Crier Bell', 'Captain Marcus'];
    const profiles = names.map(name => w.CharacterVoices.profile(name));
    for (const [i, profile] of profiles.entries()) {
        assert.equal(typeof profile.pitch, 'number');
        assert.ok(profile.pitch >= 0.5 && profile.pitch <= 1.5, `${names[i]} pitch is in range`);
        assert.ok(profile.rate >= 0.6 && profile.rate <= 1.6, `${names[i]} rate is in range`);
        assert.match(profile.voiceId, /^system:/);
    }
    const signature = profile => `${profile.voiceId}|${profile.pitch}|${profile.rate}`;
    const unique = new Set(profiles.map(signature));
    assert.ok(unique.size >= 3, 'different people do not all sound the same');
    assert.deepEqual(w.CharacterVoices.profile('Crier Bell'), profiles[2], 'the same person always sounds the same');
});

test('the speech engine really receives the character pitch and speed', async t => {
    const { w } = await ready(t);
    const made = [];
    w.speechSynthesis = {
        getVoices: () => [{ name: 'Test Voice', lang: 'en-US' }],
        speak: utterance => { made.push(utterance); setTimeout(() => utterance.onend?.(), 0); },
        cancel() {}, pause() {}, resume() {}
    };
    w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    const profile = w.CharacterVoices.profile('Crier Bell');
    const done = w.MusicSystem.speakQueuedItem({
        text: 'Well met, traveller.', language: 'en-US', voiceId: profile.voiceId,
        pitch: profile.pitch, rate: profile.rate, cancelled: false, resolve() {}
    });
    await Promise.race([done, wait(1500)]);
    assert.equal(made.length, 1, 'one utterance is queued');
    assert.equal(made[0].text, 'Well met, traveller.', 'it reads the answer text');
    assert.equal(made[0].pitch, profile.pitch, 'with the character pitch');
    assert.ok(Math.abs(made[0].rate - profile.rate) < 0.001, 'and the character speed');
});

test('a free-form question to the crier is answered live, not with a fixed clip', async t => {
    const { w, G } = await ready(t);
    w.ChristmasCrier.sync(G);
    G.state.location = 'kaliwasch';
    const text = w.ChristmasCrier.smallTalk ? '' : '';
    assert.equal(text, ''); // the crier has no canned picker any more
    const answered = w.ChristmasCrier.ask(G, 'would you like some tea?');
    assert.equal(answered, false, 'an off-script question goes to the live NPC brain');
    assert.equal(w.ChristmasCrier.ask(G, 'hello there'), true, 'a greeting is answered at once');
});
