// v7.55 — movement reasons, the EN/TE/HI narration layer, and the server-decided
// hunger, recovery, prayer, blessings and palace quests. The browser code runs
// in jsdom against the real server SQL (in-process PostgreSQL), so these tests
// exercise the same path a signed-in player uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../scripts/load-world.mjs';
import { createServer } from './helpers/bsu-db.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const lines = window => [...window.document.querySelectorAll('#narrative p')].map(node => node.textContent);
const clearLog = window => { window.document.getElementById('narrative').innerHTML = ''; };

async function liveGame(t, { server = null, uid = 'player-one' } = {}) {
    const runtime = await createRuntime();
    t.after(() => runtime.dom.window.close());
    const { window } = runtime, { Game } = window;
    window.OnlineSystem.saveGame = async () => true;
    window.OnlineSystem.syncActiveHero = () => {};
    window.OnlineSystem.dropWorldItem = async () => false;
    window.OnlineSystem.init = () => {};
    if (server) window.BSUServer.transport = (action, args) => server.handle(uid, action, JSON.parse(JSON.stringify(args)));
    Game.init();
    Game.startNewHero();
    window.document.getElementById('char-name').value = 'Asha';
    window.document.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    window.document.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    Game.createCharacter(false);
    Game.state.quests = [];
    window.InterfaceMode.apply('sighted');
    window.AudioManager.endBattle = async () => {};
    await wait(30);
    if (server) await window.BSUServer.tick();
    clearLog(window);
    return { window, G: Game, S: window.BSUServer, N: window.Narration };
}

/* ───────────────────────── movement ───────────────────────── */

test('a blocked move says "You did not move", gives the reason and the real exits, and never sounds like a successful move', async t => {
    const { window, G } = await liveGame(t);
    const here = window.WorldData.locations[G.state.location];
    const missing = ['north', 'south', 'east', 'west', 'up', 'down'].find(dir => !here.exits[dir]);
    assert.ok(missing, 'the start has at least one direction with no exit');
    const events = [];
    const emit = G.emitGameEvent.bind(G);
    G.emitGameEvent = (text, type, options) => { events.push({ text, type, options }); return emit(text, type, options); };
    const from = G.state.location;
    assert.equal(G.move(missing), false);
    await wait(380);
    assert.equal(G.state.location, from, 'the hero stays where they were');
    const log = lines(window);
    assert.equal(log.some(line => line.startsWith('You moved ')), false, 'no success wording');
    assert.equal(log.some(line => /^Going /.test(line)), false, 'no "going" line for a move that cannot happen');
    const blocked = log.find(line => line.startsWith('You did not move.'));
    assert.ok(blocked, 'the refusal is announced');
    assert.match(blocked, new RegExp(`There is no path ${missing} from ${here.name}`));
    for (const exit of Object.keys(here.exits)) assert.match(blocked, new RegExp(`\\b${exit}\\b`), `the line offers ${exit}`);
    assert.deepEqual([...events[0].options.sfx], ['board-error'], 'a blocked sound, not a footstep');
    assert.equal(G._lastMoveResult.moved, false);
    assert.equal(G._lastMoveResult.reason, 'move.noPath');
});

test('a successful move keeps its own wording and footstep', async t => {
    const { window, G } = await liveGame(t);
    const events = [];
    const emit = G.emitGameEvent.bind(G);
    G.emitGameEvent = (text, type, options) => { events.push({ text, type, options }); return emit(text, type, options); };
    assert.equal(G.move('north'), true);
    await wait(380);
    const moved = events.find(event => event.text.startsWith('You moved north to '));
    assert.ok(moved);
    assert.match(moved.options.sfx[0], /^step-/);
    assert.equal(lines(window).some(line => line.startsWith('You did not move')), false);
    assert.equal(G._lastMoveResult.moved, true);
});

test('each kind of blocked move has its own reason: combat, a locked rune door, a locked house, sitting down', async t => {
    const { window, G } = await liveGame(t);
    const WD = window.WorldData;
    // Combat
    G.startCombat('root goblin');
    const exit = Object.keys(WD.locations[G.state.location].exits)[0];
    clearLog(window);
    G.move(exit);
    assert.match(lines(window).join('\n'), /You did not move\. You are in combat and cannot go/);
    assert.equal(G._lastMoveResult.reason, 'move.combat');
    G.state.inCombat = false; G.state.enemy = null; G.state.encounterTargets = [];
    // Rune door
    const doorRoom = Object.entries(WD.locations).find(([, loc]) => loc.specialDoor && !loc.specialDoor.open);
    assert.ok(doorRoom, 'the world has a locked special door');
    G.state.location = doorRoom[0];
    clearLog(window);
    await wait(450);
    G.move(doorRoom[1].specialDoor.direction);
    assert.match(lines(window).join('\n'), /A locked rune door blocks the way/);
    assert.equal(G._lastMoveResult.reason, 'move.lockedDoor');
    // Private house
    const street = Object.entries(WD.locations).find(([, loc]) => Object.values(loc.exits || {}).some(id => WD.locations[id]?.privateHouse));
    assert.ok(street, 'the world has a private house door');
    const houseDir = Object.entries(street[1].exits).find(([, id]) => WD.locations[id]?.privateHouse)[0];
    G.state.location = street[0];
    clearLog(window);
    await wait(450);
    assert.equal(G.move(houseDir), false);
    assert.match(lines(window).join('\n'), /The door of this private house is locked/);
    assert.equal(G.state.location, street[0]);
    // Posture
    G.state.location = 'kaliwasch';
    G.state.player.gesturePosture = 'sitting';
    clearLog(window);
    await wait(450);
    G.move('north');
    assert.match(lines(window).join('\n'), /Stand up before walking/);
    assert.equal(G.state.location, 'kaliwasch');
});

/* ───────────────────────── language ───────────────────────── */

test('Telugu and Hindi: the log and the narrator use the chosen language, with the matching voice tag', async t => {
    const { window, G, N } = await liveGame(t);
    const spoken = [];
    const A = window.AudioManager;
    A.voiceEnabled = true;
    window.speechSynthesis.speak = utterance => { spoken.push({ text: utterance.text, lang: utterance.lang }); queueMicrotask(() => { utterance.onstart?.(); utterance.onend?.(); }); };
    assert.ok([...window.document.getElementById('game-language').options].some(o => o.value === 'te'), 'Telugu is offered in Settings');

    N.setLang('te', { announce: false });
    clearLog(window);
    G.move('north');
    await wait(450);
    const te = lines(window);
    const movedTe = te.find(line => line.includes('చేరుకున్నారు'));
    assert.ok(movedTe, 'the move is narrated in Telugu');
    assert.match(movedTe, /ఉత్తరం/);
    assert.equal(te.some(line => line.startsWith('You moved')), false);
    await wait(60);
    assert.ok(spoken.some(s => s.lang === 'te-IN' && /[\u0C00-\u0C7F]/.test(s.text)), 'Telugu text is spoken with a Telugu voice tag');
    assert.equal(spoken.some(s => s.lang === 'te-IN' && !/[\u0C00-\u0C7F]/.test(s.text)), false, 'English is never read by the Telugu voice');

    // An older English line written elsewhere in the game is rewritten too.
    assert.equal(N.localize('You pick up Bread!'), 'మీరు Bread తీసుకున్నారు!');
    assert.equal(N.localize('Exits: North, East'), 'దిక్కులు: ఉత్తరం, తూర్పు');
    // A line with no translation stays English and gets the English voice.
    assert.equal(N.localize('Some brand new sentence nobody translated.'), 'Some brand new sentence nobody translated.');
    assert.equal(N.tagFor('Some brand new sentence nobody translated.'), 'en-US');

    N.setLang('hi', { announce: false });
    clearLog(window);
    const here = window.WorldData.locations[G.state.location];
    const missing = ['north', 'south', 'east', 'west', 'up', 'down'].find(dir => !here.exits[dir]);
    G.move(missing);
    const hi = lines(window).join('\n');
    assert.match(hi, /आप आगे नहीं बढ़े/);
    assert.match(hi, /कोई रास्ता नहीं है/);
    assert.equal(N.tagFor(hi), 'hi-IN');

    N.setLang('en', { announce: false });
    assert.equal(N.t('move.moved', { dir: 'north', place: 'Muddy Bog' }), 'You moved north to Muddy Bog.');
});

test('narration keys have English, Telugu and Hindi text', async t => {
    const { N } = await liveGame(t);
    const keys = ['move.moved', 'move.noPath', 'move.combat', 'move.lockedDoor', 'move.houseLocked', 'hunger.hungry', 'eat.meal', 'pray.daily', 'pray.already',
        'pray.permanentGranted', 'quest.accepted', 'quest.completed', 'regen.away', 'pray.text.courage', 'pray.text.gratitude'];
    for (const key of keys) {
        const en = N.t(key, {}, 'en'), te = N.t(key, {}, 'te'), hi = N.t(key, {}, 'hi');
        assert.notEqual(en, key, `${key} exists`);
        assert.match(te, /[\u0C00-\u0C7F]/, `${key} has Telugu`);
        assert.match(hi, /[\u0900-\u097F]/, `${key} has Hindi`);
    }
});

/* ───────────────────────── hunger ───────────────────────── */

test('hunger follows elapsed time: 3.5 hours without food makes a full hero hungry; walking does not', async t => {
    const server = await createServer();
    t.after(() => server.close());
    const { window, G, S } = await liveGame(t, { server });
    const p = G.state.player;
    assert.ok(S.online, 'the game is talking to the server');
    assert.equal(Math.round(p.satiety), 100);

    // Walking around costs no food.
    for (const dir of ['north', 'south', 'north', 'south']) { G.move(dir); await wait(380); }
    window.ItemHunger.hungerTick(G);
    assert.ok(p.satiety > 99.5, 'steps do not drain satiety');

    // 3.5 hours pass on the server clock (the game could be closed meanwhile).
    await server.sql("update bsu_heroes set satiety_at = satiety_at - interval '3 hours 30 minutes'");
    clearLog(window);
    G._lastHungerLine = 0;
    await S.tick();
    assert.ok(Math.abs(p.satiety - 40) < 0.5, `about 40 after 3.5 hours, got ${p.satiety}`);
    assert.ok(lines(window).some(line => /^You are hungry\./.test(line)), 'hunger is announced');
    assert.ok(p.hungerStrPenalty > 0, 'hunger weakens the hero');

    // A snack helps a little; a proper meal fills the hero and resets the clock on the server.
    G.state.inventory = [
        { ...window.WorldData.items.bread, id: 'bread', name: 'Bread', quantity: 1, type: 'food', effect: 'hunger', satiety: 24 },
        { id: 'roast boar', name: 'Roast Boar', quantity: 1, type: 'food', effect: 'hunger', satiety: 60 }
    ];
    G.useItem('bread');
    await wait(60);
    assert.ok(Math.abs(p.satiety - 64) < 0.6, `snack adds its value, got ${p.satiety}`);
    G.useItem('roast boar');
    await wait(60);
    assert.ok(p.satiety > 99.5);
    const [row] = await server.sql('select satiety, last_meal_at from bsu_heroes');
    assert.equal(Number(row.satiety), 100, 'the server recorded the meal');
    assert.ok(row.last_meal_at, 'the server knows when the last meal was');
    assert.equal(p.hungerStrPenalty, 0, 'strength returns after eating');
});

test('offline, the same hunger formula runs from the saved timestamp', async t => {
    const { G, S, window } = await liveGame(t);
    assert.equal(S.canCall(), false);
    const p = G.state.player;
    p.satiety = 100; p.satietyAt = Date.now() - 3.5 * 3600000;
    window.ItemHunger.hungerTick(G, 0, { force: true });
    assert.ok(Math.abs(p.satiety - 40) < 0.5);
    p.satietyAt = Date.now() - 7 * 3600000; p.satiety = 100;
    window.ItemHunger.settleHunger(G);
    assert.equal(p.satiety, 0, 'never below zero');
});

/* ───────────────────────── recovery ───────────────────────── */

test('health and magic recover from server minutes only: once, and not from the device clock', async t => {
    const server = await createServer();
    t.after(() => server.close());
    const { window, G, S } = await liveGame(t, { server });
    const p = G.state.player;
    p.hp = 10; p.mp = 0;
    const maxMp = p.maxMp;

    // Moving the device clock forward used to heal the hero. It no longer does.
    const realNow = window.Date.now;
    window.Date.now = () => realNow() + 6 * 3600000;
    G.applyTimedRegeneration(true);
    window.Date.now = realNow;
    assert.equal(p.hp, 10, 'the device clock grants nothing while the server is reachable');

    await server.sql("update bsu_heroes set regen_at = regen_at - interval '30 minutes 20 seconds'");
    clearLog(window);
    await S.tick();
    assert.equal(p.hp, 40, 'thirty server minutes, one point each');
    assert.equal(p.mp, Math.min(maxMp, 30));
    assert.ok(lines(window).some(line => /While you were away for 30 minutes, you recovered 30 health/.test(line)));

    await S.tick();
    await S.tick();
    assert.equal(p.hp, 40, 'the same minutes are never paid twice');

    // Recovery never overfills.
    p.hp = p.maxHp - 3;
    await server.sql("update bsu_heroes set regen_at = regen_at - interval '50 minutes'");
    await S.tick();
    assert.equal(p.hp, p.maxHp);
});

/* ───────────────────────── prayer and blessings ───────────────────────── */

test('prayer: the first prayer restores and offers one lasting blessing; praying again the same day restores nothing', async t => {
    const server = await createServer();
    t.after(() => server.close());
    const { window, G } = await liveGame(t, { server });
    const p = G.state.player;
    const s = new Proxy({}, { get: (_, key) => G.state.sacred[key], set: (_, key, value) => { G.state.sacred[key] = value; return true; } });   // the game replaces state.sacred when it saves

    // Not in a temple.
    await G.pray('courage');
    assert.match(lines(window).join('\n'), /Prayer is offered inside a temple/);

    G.state.location = 'grand_temple';
    p.hp = 5; p.mp = 0;
    clearLog(window);
    await G.pray('');
    assert.match(lines(window).join('\n'), /What would you like to pray about\?/);
    assert.equal(p.hp, 5, 'opening the list does nothing to the hero');
    const buttons = [...window.document.querySelectorAll('#context-actions button')].map(b => b.textContent);
    assert.equal(buttons.length, 8, 'eight prayers to choose from');

    clearLog(window);
    await G.pray('for courage');
    let log = lines(window).join('\n');
    assert.match(log, /You ask for courage to face what frightens you/);
    assert.match(log, /A blessing of dexterity will stand with you in battle until this time tomorrow/);
    assert.match(log, /Because this is your first prayer, you may receive one lasting blessing/);
    assert.equal(p.hp, p.maxHp, 'the daily blessing restores health');
    assert.equal(p.mp, p.maxMp);
    assert.equal(s.dailyBattleBlessing.type, 'dexterity');
    assert.ok(s.dailyBattleBlessing.expiresAt > Date.now() + 23 * 3600000);

    // The old exploit: get hurt, pray again, be refilled for free.
    p.hp = 7; p.mp = 1;
    clearLog(window);
    await G.pray('healing');
    log = lines(window).join('\n');
    assert.match(log, /Today's blessing of dexterity is already with you, and a new one can be received in about 24 hours/);
    assert.match(log, /Prayer does not restore health or magic again today/);
    assert.equal(p.hp, 7, 'no free refill');
    assert.equal(p.mp, 1);
    assert.equal(s.dailyBattleBlessing.type, 'dexterity', 'the blessing of the day does not change');
    for (let i = 0; i < 5; i++) await G.pray('gratitude');
    assert.equal(p.hp, 7);
    assert.equal((await server.sql("select count(*)::int as n from bsu_blessings where kind = 'daily'"))[0].n, 1);

    // The lasting blessing: once per hero, decided by the server.
    const str = p.str;
    clearLog(window);
    assert.equal(await G.claimPermanentTempleBlessing('strength'), true);
    assert.equal(p.str, str + 3);
    assert.match(lines(window).join('\n'), /You receive the lasting blessing of strength: plus 3 strength/);
    const maxHp = p.maxHp;
    assert.equal(await G.claimPermanentTempleBlessing('health'), false);
    assert.equal(p.maxHp, maxHp, 'a second lasting blessing is refused');
    s.permanentTempleBlessing = null;                   // a tampered save asks again
    assert.equal(await G.claimPermanentTempleBlessing('health'), false);
    assert.equal(p.maxHp, maxHp, 'the server refuses even when the device forgot');
    assert.equal(s.permanentTempleBlessing, 'strength');

    // A day later the next prayer is a new daily blessing with a new restore.
    await server.sql("update bsu_blessings set granted_at = granted_at - interval '24 hours 1 minute' where kind = 'daily'");
    p.hp = 9;
    clearLog(window);
    await G.pray('guidance');
    assert.equal(p.hp, p.maxHp);
    assert.equal(s.dailyBattleBlessing.type, 'wisdom');
    assert.match(lines(window).join('\n'), /A blessing of wisdom will stand with you/);
});

test('prayer offline keeps the once-a-day rule on the device', async t => {
    const { window, G } = await liveGame(t);
    const p = G.state.player;
    G.state.location = 'grand_temple';
    p.hp = 5;
    await G.pray('protection');
    assert.equal(p.hp, p.maxHp);
    p.hp = 6;
    clearLog(window);
    await G.pray('protection');
    assert.equal(p.hp, 6);
    assert.match(lines(window).join('\n'), /already with you/);
});

/* ───────────────────────── palace quests ───────────────────────── */

test('palace quests: a named companion joins, progress is counted per battle, and the reward is paid once at the palace', async t => {
    const server = await createServer();
    t.after(() => server.close());
    const { window, G } = await liveGame(t, { server });
    const p = G.state.player;

    await G.palaceQuest();
    assert.match(lines(window).join('\n'), /Go to the Royal Palace first/);

    G.state.location = 'royal_palace';
    clearLog(window);
    await G.palaceQuest();
    let log = lines(window).join('\n');
    assert.match(log, /The Royal Court gives you the quest Royal Forest Hunt/);
    assert.match(log, /Ser Aldric, Royal Huntsman, joins you/);
    const aldric = G.state.companions.find(c => c.name === 'Ser Aldric');
    assert.ok(aldric, 'the fixed companion is in the group');
    assert.equal(aldric.questCompanion, 'royal_hunt');
    assert.ok(G.state.combatGroup.includes('Ser Aldric'));
    assert.equal(G.state.quests.some(q => q.id === 'royal_hunt'), false, 'the old device-only quest object is not used');

    // Asking again reports status and does not hand out a second quest or companion.
    clearLog(window);
    await G.palaceQuest();
    assert.match(lines(window).join('\n'), /You are on the quest Royal Forest Hunt: 0 of 5 battles won/);
    assert.equal(G.state.companions.filter(c => c.name === 'Ser Aldric').length, 1);

    // Reporting early pays nothing.
    const gold = p.gold, xp = p.xp, level = p.level;
    G.state.location = 'kaliwasch';
    for (let i = 1; i <= 4; i++) G.checkQuests('kill', 'root goblin');
    await wait(80);
    G.state.location = 'royal_palace';
    await G.palaceQuest();
    assert.equal(p.gold, gold);

    clearLog(window);
    G.state.location = 'kaliwasch';
    const events = [];
    const emit = G.emitGameEvent.bind(G);
    G.emitGameEvent = (text, type, options) => { events.push({text, options}); return emit(text, type, options); };
    G.checkQuests('kill', 'root goblin');
    await wait(80);
    assert.match(lines(window).join('\n'), /Final battle won for Royal Forest Hunt\. Reward not collected yet\. Open Quests/);
    assert.equal(p.gold, gold, 'nothing is paid in the field');
    G.checkQuests('kill', 'root goblin');               // extra battles do not over-count
    assert.equal(G.state.sacred.palace.active.progress, 5);

    const victories = events.filter(e => e.text.startsWith('Final battle won'));
    assert.equal(victories.length, 1);
    assert.deepEqual([...victories[0].options.sfx], ['game-win']);
    G.state.location = 'royal_palace';
    clearLog(window);
    await G.palaceQuest();
    log = lines(window).join('\n');
    assert.match(log, /Royal Forest Hunt is complete\. You receive 250 experience and 180 rupees\. Ser Aldric bows and returns to the palace/);
    assert.deepEqual([...events.find(e => e.text.includes('You receive 250 experience')).options.sfx], ['coin']);
    assert.equal(p.gold, gold + 180);
    assert.ok(p.level > level || p.xp === xp + 250, 'experience is paid through the normal level-up rules');
    assert.equal(G.state.companions.some(c => c.name === 'Ser Aldric'), false, 'the companion leaves when the quest ends');
    assert.equal((await server.sql("select count(*)::int as n from bsu_rewards where source = 'quest'"))[0].n, 1);

    // The next visit starts the next quest with its own companion; the first is never paid again.
    clearLog(window);
    await G.palaceQuest();
    assert.match(lines(window).join('\n'), /The Healer's Road/);
    assert.ok(G.state.companions.some(c => c.name === 'Sister Meera' && c.heal === 14));
    assert.equal(p.gold, gold + 180);
    const direct = await server.handle('player-one', 'quest_complete', { hero_id: G.state.activeHeroId, quest_id: 'royal_hunt' });
    assert.equal(direct.completed, false, 'the server will not pay a finished quest twice');
});

test('the cloud save goes to the game server and comes back for the same player only', async t => {
    const server = await createServer();
    t.after(() => server.close());
    const { G, S } = await liveGame(t, { server });
    G.state.player.gold = 4321;
    G.save();
    assert.equal(await S.putSave(JSON.parse(JSON.stringify(G.getCloudData()))), true);
    const mine = await S.getSave();
    assert.equal(mine.save_data.heroes[G.state.activeHeroId].player.gold, 4321);
    const other = await server.handle('someone-else', 'save_get', {});
    assert.equal(other.save, null, 'another player cannot read it');
});
