/**
 * v7.22.2 — Snake & Ladder audio regression suite (§14–§18).
 *
 * game-hall.js is loaded as an ES module in the browser and was excluded from
 * the shared world harness, so this board game previously had NO automated
 * coverage. This suite evaluates it in a jsdom runtime and asserts the exact
 * audio event counts the specification requires:
 *
 *   - a roll of N produces exactly N token-movement sounds
 *   - a snake collision plays the snake sound exactly once
 *   - a ladder climb plays the ladder sound exactly once
 *   - no game event can double-fire its audio
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRuntime } from '../scripts/load-world.mjs';

/** Boot the normal game runtime, then evaluate the Game Hall module on top. */
async function hallFixture(t) {
    const runtime = await createRuntime();
    t.after(() => runtime.dom.window.close());
    const { window } = runtime;
    window.OnlineSystem.saveGame = async () => true;
    window.OnlineSystem.init = () => {};

    // game-hall.js is an ES module; strip its import/export lines so it can be
    // evaluated as a classic script inside the same window.
    const source = (await readFile('game-hall.js', 'utf8'))
        .split('\n')
        .filter(line => !/^\s*import\s.*from\s/.test(line) && !/^\s*export\s/.test(line))
        .join('\n');
    window.eval(source);

    const hall = window.GameHall;
    assert.ok(hall, 'GameHall must load');

    // Capture every sound id without touching real audio.
    const sounds = [];
    const audio = window.ProfessionalAudioCombat;
    if (audio) {
        audio.playExact = async id => { sounds.push(id); return 5; };
        audio.narrate = async () => true;
    }
    window.MusicSystem.playSFXAndWait = async type => { sounds.push(type); };
    window.MusicSystem.playSFX = type => { sounds.push(type); return true; };

    // Silence pacing and rendering so the tests run fast and deterministically.
    hall.announce = () => {};
    hall.pause = async () => {};
    hall.render = () => {};
    hall.finish = () => {};
    hall.type = 'snakes';
    return { window, hall, sounds };
}

const stepCount = sounds => sounds.filter(id => id === 'boardPieceStep' || id === 'board-piece').length;
const newGame = (hall, at = 0) => {
    hall.state = { positions: [at], players: ['Tester'], colors: ['red'], mode: 'solo', turn: 0, winner: null };
};

/* ── §14 token movement: one sound per square travelled ─────────────────── */

test('(H1) a roll of six plays exactly six token-movement sounds', async t => {
    const { hall, sounds } = await hallFixture(t);
    newGame(hall, 0);
    sounds.length = 0;
    await hall.snakesMove(6);
    assert.equal(stepCount(sounds), 6, 'six squares travelled means six sounds');
});

test('(H2) movement sound count always equals the squares actually travelled', async t => {
    const { hall, sounds } = await hallFixture(t);
    for (const die of [1, 2, 3, 4, 5, 6]) {
        newGame(hall, 0);
        sounds.length = 0;
        await hall.snakesMove(die);
        assert.equal(stepCount(sounds), die, `a roll of ${die} must play ${die} sounds`);
    }
});

test('(H3) a blocked move near square 100 plays no movement sound', async t => {
    const { hall, sounds } = await hallFixture(t);
    newGame(hall, 98);            // 98 + 6 overshoots, so the token cannot move
    sounds.length = 0;
    await hall.snakesMove(6);
    assert.equal(stepCount(sounds), 0, 'no movement means no movement sound');
    assert.equal(hall.state.positions[0], 98, 'the token stays put');
});

/* ── §15 snake collision: exactly one snake sound ───────────────────────── */

test('(H4) landing on a snake plays the snake sound exactly once', async t => {
    const { hall, sounds } = await hallFixture(t);
    newGame(hall, 61);            // 61 + 1 = 62, a snake head
    sounds.length = 0;
    await hall.snakesMove(1);
    const snakeSounds = sounds.filter(id => id === 'miss' || id === 'bodyFall');
    assert.ok(snakeSounds.length > 0, 'a snake sound must play');
    assert.equal(sounds.filter(id => id === 'miss').length, 1, 'the slide sound plays once');
    assert.equal(sounds.filter(id => id === 'bodyFall').length, 1, 'the landing sound plays once');
    assert.equal(hall.state.positions[0], 19, 'the token slides to the snake tail');
});

test('(H5) no snake sound plays when the token does not land on a snake', async t => {
    const { hall, sounds } = await hallFixture(t);
    newGame(hall, 0);             // 0 + 2 = 2, no snake and no ladder
    sounds.length = 0;
    await hall.snakesMove(2);
    assert.equal(sounds.filter(id => id === 'bodyFall').length, 0, 'no snake landing sound');
    assert.equal(hall.state.positions[0], 2);
});

/* ── §16 ladder climb: exactly one ladder sound, only when it climbs ─────── */

test('(H6) climbing a ladder plays the ladder sound exactly once', async t => {
    const { hall, sounds } = await hallFixture(t);
    newGame(hall, 3);             // 3 + 1 = 4, a ladder foot
    sounds.length = 0;
    await hall.snakesMove(1);
    assert.equal(sounds.filter(id => id === 'healingStart').length, 1, 'the climb sound plays once');
    assert.equal(sounds.filter(id => id === 'levelUp').length, 1, 'the arrival sound plays once');
    assert.equal(hall.state.positions[0], 14, 'the token climbs to the ladder top');
});

test('(H7) no ladder sound plays when the token does not climb', async t => {
    const { hall, sounds } = await hallFixture(t);
    newGame(hall, 0);
    sounds.length = 0;
    await hall.snakesMove(3);     // square 3 has no ladder
    assert.equal(sounds.filter(id => id === 'healingStart').length, 0, 'no climb sound');
    assert.equal(hall.state.positions[0], 3);
});

/* ── §17 deduplication: one event may never double-fire ─────────────────── */

test('(H8) a single move never double-fires its audio', async t => {
    const { hall, sounds } = await hallFixture(t);
    // Square 5 is neutral: no ladder foot and no snake head.
    newGame(hall, 1);
    sounds.length = 0;
    await hall.snakesMove(4);
    assert.equal(hall.state.positions[0], 5, 'lands on a neutral square');
    // Exactly four steps, and no snake or ladder audio leaked into a plain move.
    assert.equal(stepCount(sounds), 4);
    assert.equal(sounds.filter(id => id === 'bodyFall').length, 0);
    assert.equal(sounds.filter(id => id === 'healingStart').length, 0);
});

test('(H9) sequential turns keep their audio counts independent', async t => {
    const { hall, sounds } = await hallFixture(t);
    newGame(hall, 0);
    for (const die of [2, 3, 1]) {
        sounds.length = 0;
        const before = hall.state.positions[0];
        await hall.snakesMove(die);
        const travelled = Math.abs(hall.state.positions[0] - before);
        // Snakes and ladders teleport, so only assert on plain moves.
        if (travelled === die) assert.equal(stepCount(sounds), die, `turn rolling ${die}`);
        hall.state.turn = 0;
    }
});

test('(H10) the board game audio path reuses the single shared AudioManager', async () => {
    const source = await readFile('game-hall.js', 'utf8');
    assert.doesNotMatch(source, /new\s+Audio\s*\(/, 'no second audio engine may be created');
    assert.doesNotMatch(source, /new\s+AudioContext/, 'no competing AudioContext');
    assert.match(source, /MusicSystem|ProfessionalAudioCombat/, 'uses the shared audio system');
});
