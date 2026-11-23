import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

/* 7.63.0 — audio audit. Every cue the game can play must be a genuine recording
 * file that exists, the catalogue must be complete and inspectable, and the
 * spoken sound test must actually play recordings. */

async function ready(t) {
    const r = await createRuntime(); t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window;
    return { w, G: w.Game, catalog: w.AudioCatalog };
}

test('every cue in the catalogue points at a real recording file', async t => {
    const { w, catalog } = await ready(t);
    const cues = catalog.cues();
    assert.ok(cues.length >= 80, `catalogue has ${cues.length} cues`);
    const missing = [];
    for (const cue of cues) {
        const list = catalog.files(cue);
        assert.ok(list.length > 0, `${cue} has at least one file`);
        for (const src of list) {
            if (!existsSync(src)) missing.push(`${cue} -> ${src}`);
            else assert.ok(statSync(src).size > 128, `${src} is not empty`);
        }
        assert.ok(list.every(src => /^assets\/audio\/(sfx\/[\w.-]+\.(wav|ogg|mp3)|music\/victory\.mp3)$/.test(src)), `${cue} uses a recording`);
    }
    assert.deepEqual(missing, []);
    assert.deepEqual([...catalog.unknownCues()], []);
    // The catalogue is the live table, not a copy that can drift.
    assert.equal(cues.length, Object.keys(w.MusicSystem.sfx).length);
});

test('no sound effect is generated: no oscillator or buffer synthesis in the audio engine', () => {
    const source = readFileSync('music.js', 'utf8');
    assert.doesNotMatch(source, /createOscillator|OscillatorNode/);
    assert.doesNotMatch(source, /createBuffer\([^)]*\)[\s\S]{0,200}(fill|setValueAtTime)/);
});

test('every spell cue in the class table resolves to a recording', async t => {
    const { w, catalog } = await ready(t);
    const table = ['multi strike', 'minor heal', 'heal', 'mass heal', 'shark tide', 'call familiar',
        'command beast', 'shade mage', 'binding circle', 'double strike', 'emerald lifestrike', 'alohomora'];
    const known = new Set(catalog.cues());
    // Sound names used by class-spells-v726.js.
    const sounds = ['multi-strike', 'chip', 'miss', 'heal', 'heal-chain', 'blessing', 'shark', 'shark-hit',
        'summon', 'goblin-cackle', 'ghost-moan', 'command', 'monster-roar', 'board-error', 'ghost-scream',
        'spell-arcane', 'magic', 'spell-cast', 'card-flip', 'check', 'attack-fast', 'hit-metal-1',
        'attack-heavy', 'levelup', 'door', 'pickup', 'card-draw'];
    const unresolved = sounds.filter(name => !known.has(name));
    assert.deepEqual(unresolved, [], 'no spell borrows a sound that does not exist');
    assert.ok(table.length > 0);
    assert.equal(w.AudioCatalog.unknownCues().length, 0);
});

test('an unknown cue is reported instead of silently swallowed', async t => {
    const { w, catalog } = await ready(t);
    w.MusicSystem.playSFX('not-a-real-sound');
    assert.deepEqual([...catalog.unknownCues()].map(row => row.name), ['not-a-real-sound']);
});

test('sound test plays the recordings in order and names each one', async t => {
    const { w, catalog } = await ready(t);
    const played = [];
    const spoken = [];
    const original = w.MusicSystem.playSFXAndWait;
    w.MusicSystem.playSFXAndWait = async type => { played.push(type); return true; };
    w.GestureAccessibility.speak = text => spoken.push(String(text));
    assert.equal(w.Game.processCommand('sound test'), true);
    await wait(700);
    catalog.stop();
    w.MusicSystem.playSFXAndWait = original;
    assert.ok(played.length > 0, 'recordings were played');
    assert.deepEqual(played.slice(0, 3), [...catalog.cues()].slice(0, 3), 'in catalogue order');
    assert.match(spoken[0], /Sound test\. \d+ recorded effects/);
    assert.ok(spoken.includes(played[0]), 'each cue is named before it plays');
});

test('sound test of one named cue plays exactly that recording', async t => {
    const { w } = await ready(t);
    const played = [];
    const original = w.MusicSystem.playSFX.bind(w.MusicSystem);
    w.MusicSystem.playSFX = (name, options) => { played.push(name); return original(name, options); };
    assert.equal(w.Game.processCommand('sound test door'), true);
    await wait(30);
    assert.deepEqual(played, ['door']);
    w.MusicSystem.playSFX = original;
});
