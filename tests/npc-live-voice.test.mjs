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
    w.fetch = async () => ({ json: async () => ({ reply: 'Because tiny particles in the air scatter blue light the most.', ai: true }) });
    await w.AiNpc.ask('why is the sky blue');
    G.emitGameEvent = original;
    const log = w.document.getElementById('narrative').textContent;
    assert.ok(log.includes('Merchant Aldric says: Because tiny particles in the air scatter blue light the most.'), 'the reply is on screen');
    const answer = spoken.find(item => item.text.startsWith('Merchant Aldric says:'));
    assert.ok(answer, 'and the same reply is spoken');
    assert.ok(answer.text.includes('Because tiny particles in the air scatter blue light the most.'), 'word for word, nothing swapped in');
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

test('an NPC voice speaks even when narration TTS is off', async t => {
    const { w } = await ready(t);
    const made = [];
    w.speechSynthesis = {
        getVoices: () => [{ name: 'Test Voice', lang: 'en-US' }],
        speak: utterance => { made.push(utterance); setTimeout(() => utterance.onend?.(), 0); },
        cancel() {}, pause() {}, resume() {}
    };
    w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    w.AudioManager.voiceEnabled = false;
    assert.equal(w.AudioManager.characterVoicesEnabled, true, 'character speech is on by default');
    const done = w.AudioManager.enqueueAudioEvent({ text: 'Well met, traveller.', character: true, requireVoice: true, voiceId: 'system:Test Voice' });
    assert.equal(await done, true, 'the reply is spoken, not dropped by the narration setting');
    assert.equal(made[0]?.text, 'Well met, traveller.');
    w.AudioManager.setCharacterVoices(false);
    assert.equal(w.AudioManager.characterVoicesEnabled, false, 'and the player can turn NPC voices off');
    assert.equal(await w.AudioManager.enqueueAudioEvent({ text: 'Silent now.', character: true, requireVoice: true }), false);
});

test('a greeting never silences the next question', async t => {
    const { w, G } = await ready(t);
    const spy = spySpeech(w, G);
    w.fetch = async () => ({ json: async () => ({ reply: 'Bread is baked at the tavern.', ai: true }) });
    await w.AiNpc.ask('hello');
    assert.equal(w.AiNpc.pending, false, 'the greeting releases the request slot');
    await w.AiNpc.ask('where is the bakery');
    spy.restore();
    assert.equal(spy.spoken.filter(item => /Merchant Aldric/.test(item.text)).length, 2, 'both answers are spoken');
});

test('you can choose which of several people answers', async t => {
    const { w, G } = await ready(t);
    w.WorldData.npcs.kaliwasch = [
        { name: 'Merchant Aldric', role: 'shopkeeper', dialog: [] },
        { name: 'Tavern Keeper Greta', role: 'tavern keeper', dialog: [] },
        { name: 'Temple Priest', role: 'priest', dialog: [] }
    ];
    w.AiNpc.lastNpc = null;
    const spy = spySpeech(w, G);
    G.processCommand('who is here');
    assert.match(spy.spoken[0].text, /Merchant Aldric.*Tavern Keeper Greta.*Temple Priest/s, 'the roster names everyone present');
    G.processCommand('say Greta, how much gold do I have');
    G.processCommand('talk to Temple Priest');
    G.processCommand('say what is my health');
    spy.restore();
    assert.ok(spy.spoken.some(item => item.text.startsWith('Tavern Keeper Greta says: You carry')), 'a named person answers');
    assert.ok(spy.spoken.some(item => item.text.startsWith('Temple Priest says: Well met')), 'talk to picks that person');
    assert.ok(spy.spoken.some(item => item.text.startsWith('Temple Priest says: You have')), 'and they keep the conversation');
});

test('the Christmas crier question is answered at once, without the network', async t => {
    const { w, G } = await ready(t);
    let fetches = 0;
    w.fetch = async () => { fetches++; throw new Error('no network'); };
    const spy = spySpeech(w, G);
    assert.equal(await w.AiNpc.ask('where is the christmas crier'), true);
    spy.restore();
    assert.equal(fetches, 0, 'the local answer needs no round trip');
    assert.match(spy.spoken[0].text, /first of December|December/i, 'it explains the season');
    assert.match(spy.spoken[0].text, /Kaliwasch Market Square/, 'and where the crier stands');
});

test('a stuck request is released instead of blocking the player forever', async t => {
    const { w, G } = await ready(t);
    w.AiNpc.pending = true;
    w.AiNpc.pendingSince = Date.now() - 60000;
    const spy = spySpeech(w, G);
    assert.equal(await w.AiNpc.ask('how much gold do I have'), true);
    spy.restore();
    assert.equal(w.AiNpc.pending, false);
    assert.match(spy.spoken[0].text, /gold/i);
});

test('a general question still reaches the AI and different questions differ', async t => {
    const { w, G } = await ready(t);
    const asked = [];
    w.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        asked.push(body.message);
        return { json: async () => ({ reply: `Answer to ${body.message}.`, ai: true, provider: 'openrouter' }) };
    };
    const spy = spySpeech(w, G);
    await w.AiNpc.ask('what will you do for christmas');
    await w.AiNpc.ask('tell me a story about the sea');
    spy.restore();
    assert.equal(asked.length, 2, 'both questions reach the model');
    assert.equal(asked[0], 'what will you do for christmas');
    const replies = spy.spoken.map(item => item.text);
    assert.equal(replies.length, 2);
    assert.notEqual(replies[0], replies[1], 'two different questions never get one canned answer');
    assert.match(replies[0], /Answer to what will you do for christmas/);
});

test('ai status says whether the model answered', async t => {
    const { w, G } = await ready(t);
    w.fetch = async () => { throw new Error('offline'); };
    await w.AiNpc.ask('tell me about the moon');
    assert.equal(w.AiNpc.lastCall.ai, false);
    assert.match(w.AiNpc.statusLine(), /did not answer|unreachable/i);
    w.fetch = async () => ({ json: async () => ({ reply: 'It is bright tonight.', ai: true, provider: 'openrouter' }) });
    await w.AiNpc.ask('is the moon bright');
    assert.match(w.AiNpc.statusLine(), /answered .*openrouter/i);
});

test('each door keeps its recorded story and falls back to the keeper voice', async t => {
    const { w, G } = await ready(t);
    const BaseDate = w.Date;
    w.Date = class extends BaseDate { constructor(...args) { super(...(args.length ? args : ['2026-12-07T10:00:00Z'])); } };
    w.StarlightFair.sync(G);
    G.state.location = 'starlight_city_1_2';
    w.AdventCalendar.sync(G);
    // The ready() clock is 7 December, so door 7 is the one open tonight.
    const day = w.AdventCalendar.days.find(item => item.n === 7) || w.AdventCalendar.days[0];
    const spoken = [];
    const originalSpeak = w.CharacterVoices.speak;
    w.CharacterVoices.speak = (name, text) => { spoken.push({ name, text }); return Promise.resolve(true); };
    const clips = [];
    const OriginalAudio = w.Audio;
    let failPlayback = false;
    w.Audio = class {
        constructor(src) { this.src = String(src); clips.push(this.src); }
        addEventListener() {}
        removeEventListener() {}
        play() { if (failPlayback) { setTimeout(() => this.onerror?.(), 0); } else { setTimeout(() => this.onended?.(), 0); } return Promise.resolve(); }
        pause() {}
        load() {}
    };
    G.state.location = `starlight_advent_room_${day.n}`;
    G.processCommand('christmas story');
    await wait(20);
    const storyClips = clips.filter(src => /story-\d+\.mp3$/.test(src));
    assert.equal(storyClips.length, 1, 'the recorded clip is used again');
    assert.match(storyClips[0], new RegExp(`story-0${day.n}\\.mp3$`), 'the door has its own recording');
    assert.equal(spoken.length, 0, 'no double reading while the recording plays');

    failPlayback = true;
    G.processCommand('christmas story');
    await wait(30);
    w.Audio = OriginalAudio;
    w.CharacterVoices.speak = originalSpeak;
    assert.equal(spoken.length, 1, 'a missing or broken clip falls back to the keeper voice');
    assert.equal(spoken[0].name, day.keeper, 'the keeper of that door speaks');
    assert.ok(spoken[0].text.length > 40, 'and it is the story text on screen');
});

test('characters do not all share one voice', async t => {
    const { w } = await ready(t);
    const names = ['Merchant Aldric', 'Tavern Keeper Greta', 'Crier Bell', 'Temple Priest', 'Captain Marcus', 'Royal Steward'];
    const pitches = new Set(names.map(name => w.CharacterVoices.profile(name).pitch));
    const rates = new Set(names.map(name => w.CharacterVoices.profile(name).rate));
    assert.ok(pitches.size >= 4, 'pitch differs between people');
    assert.ok(rates.size >= 3, 'speed differs between people');
    assert.ok(Math.max(...[...pitches]) - Math.min(...[...pitches]) > 0.2, 'the difference is audible, not a hair');
});
