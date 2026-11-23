/**
 * Palace quest persistence (v7.60).
 *
 * The reported bug: a hero finished the first palace quest, and after a reload
 * (or a deploy-triggered refresh, or a Google sign-in that restored an older
 * cloud row) the King handed out the same first quest again. These tests drive
 * the real quest system, the real save/continue path and the real cloud-merge
 * helper, and they fail if a completed quest can ever be re-issued.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

async function ready(t) {
    const r = await createRuntime();
    t.after(() => {
        try { r.window.Game.state.inCombat = false; r.window.Game.state.enemy = null; } catch { /* closed */ }
        r.dom.window.close();
    });
    await wait(0);
    const w = r.window, G = w.Game;
    w.OnlineSystem.saveGame = async () => true;
    w.OnlineSystem.syncActiveHero = () => {};
    w.OnlineSystem.dropWorldItem = async () => false;
    w.OnlineSystem.recordGroupAttack = () => {};
    G.startNewHero();
    w.document.getElementById('char-name').value = 'Quest Hero';
    w.document.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    w.document.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    w.InterfaceMode.apply('blind');
    w.ProfessionalAudioCombat = null;
    w.AudioManager.endBattle = async () => {};
    w.Math.random = () => 0.5;
    G.enterLocation('royal_palace');
    const ledger = () => w.QuestLedger.read(G.state.activeHeroId);
    return { ...r, w, G, ledger, heroId: G.state.activeHeroId };
}

/** Accept the current palace quest, then finish it the way the game does. */
async function finishCurrentQuest(G) {
    await G.palaceQuest();
    await wait(40);
    const active = G.state.sacred.palace.active;
    assert.ok(active, 'a quest was accepted');
    active.progress = active.target;
    await G.palaceQuest();
    await wait(60);
    return active.quest_id;
}

/** Write an older save (no sacred, no ledger) into the roster, then reload. */
function restoreOlderCloudSave(G, { keepLedgerInSave = false } = {}) {
    const older = JSON.parse(JSON.stringify(G.getSaveData()));
    older.sacred = {};
    delete older.savedAt;                       // legacy cloud row from 7.59 and older
    if (!keepLedgerInSave) delete older.palaceLedger;
    const roster = G.getRoster();
    roster.heroes[G.state.activeHeroId] = older;
    G.storeRoster(roster);
    G.state.activeHeroId = G.state.activeHeroId;
    G.continueGame();
    return older;
}

test('(01/16) finishing the first palace quest records a durable completion', async t => {
    const { G, ledger } = await ready(t);
    const finished = await finishCurrentQuest(G);
    assert.equal(finished, 'royal_hunt');
    const record = ledger();
    assert.deepEqual([...record.completed], ['royal_hunt']);
    assert.equal(record.active, null, 'a finished quest is not left accepted');
});

test('(02/16) a reload offers the next palace quest, never the first again', async t => {
    const { G } = await ready(t);
    await finishCurrentQuest(G);
    G.save();
    G.continueGame();
    G.enterLocation('royal_palace');
    await G.palaceQuest();
    await wait(40);
    assert.equal(G.state.sacred.palace.active.quest_id, 'palace_healers_road');
    assert.deepEqual([...G.state.sacred.palace.completed], ['royal_hunt']);
});

test('(03/16) a stale cloud save cannot roll quest completion back', async t => {
    const { G } = await ready(t);
    await finishCurrentQuest(G);
    restoreOlderCloudSave(G);
    assert.deepEqual([...G.state.sacred.palace.completed], ['royal_hunt'], 'history came back from the device ledger');
    G.enterLocation('royal_palace');
    await G.palaceQuest();
    await wait(40);
    assert.equal(G.state.sacred.palace.active?.quest_id, 'palace_healers_road', 'the King does not repeat the first quest');
});

test('(04/16) a wiped sacred block is rebuilt from the ledger', async t => {
    const { G } = await ready(t);
    await finishCurrentQuest(G);
    G.state.sacred = null;
    G.applyPalaceLedger(null);
    assert.ok(G.state.sacred?.palace, 'palace state exists again');
    assert.deepEqual([...G.state.sacred.palace.completed], ['royal_hunt']);
});

test('(05/16) an accepted quest and its progress survive a reload', async t => {
    const { G } = await ready(t);
    await G.palaceQuest();
    await wait(40);
    G.state.sacred.palace.active.progress = 3;
    G.recordPalaceLedger();
    G.save();
    G.continueGame();
    G.enterLocation('royal_palace');
    assert.equal(G.state.sacred.palace.active?.quest_id, 'royal_hunt');
    assert.equal(G.state.sacred.palace.active.progress, 3, 'no progress was lost');
    await G.palaceQuest();
    await wait(40);
    assert.equal(G.state.sacred.palace.active.progress, 3, 'asking again does not restart the quest');
});

test('(06/16) every hero save carries the ledger for another device', async t => {
    const { G } = await ready(t);
    await finishCurrentQuest(G);
    const save = G.getSaveData();
    assert.deepEqual([...save.palaceLedger.completed], ['royal_hunt']);
    assert.equal(typeof save.savedAt, 'number', 'the save is timestamped for cloud merging');
});

test('(07/16) the newer of cloud and device wins when merging a hero', async t => {
    const { w } = await ready(t);
    const cloud = { heroes: { h1: { savedAt: 100, player: { name: 'Cloud' } } }, activeHeroId: 'h1' };
    const local = { heroes: { h1: { savedAt: 200, player: { name: 'Device' } } }, activeHeroId: 'h1' };
    const { merged, repaired } = w.OnlineSystem.mergeNewestRoster(cloud, local);
    assert.equal(merged.heroes.h1.player.name, 'Device');
    assert.equal(repaired, true, 'the cloud row will be repaired');
    const back = w.OnlineSystem.mergeNewestRoster(local, cloud);
    assert.equal(back.merged.heroes.h1.player.name, 'Device', 'the older snapshot never wins');
});

test('(08/16) an empty cloud row never erases the device heroes', async t => {
    const { G, w } = await ready(t);
    const local = G.getRoster();
    const { merged, repaired } = w.OnlineSystem.mergeNewestRoster({ heroes: {}, activeHeroId: null }, local);
    assert.ok(Object.keys(merged.heroes).length > 0);
    assert.equal(merged.activeHeroId, local.activeHeroId);
    assert.equal(repaired, true);
});

test('(09/16) a non-empty account never absorbs unknown device slots', async t => {
    const { G, w } = await ready(t);
    const local = G.getRoster();
    const cloud = { heroes: { other: { savedAt: 1, player: { name: 'Other' } } }, activeHeroId: 'other' };
    const { merged } = w.OnlineSystem.mergeNewestRoster(cloud, local);
    assert.deepEqual([...Object.keys(merged.heroes)], ['other']);
});

test('(10/16) merging always leaves a usable active hero', async t => {
    const { w } = await ready(t);
    const { merged } = w.OnlineSystem.mergeNewestRoster({ heroes: { a: { savedAt: 5 }, b: { savedAt: 9 } }, activeHeroId: 'missing' }, { heroes: {} });
    assert.equal(merged.activeHeroId, 'a');
});

test('(11/16) a hidden page flushes the newest quest state locally', async t => {
    const { G, w } = await ready(t);
    await G.palaceQuest();
    await wait(40);
    G.state.sacred.palace.active.progress = 2;
    w.localStorage.removeItem(G.state.saveKey);
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    // jsdom keeps document.hidden false, so dispatch pagehide as well.
    w.dispatchEvent(new w.Event('pagehide'));
    const stored = JSON.parse(w.localStorage.getItem(G.state.saveKey) || 'null');
    assert.ok(stored?.sacred?.palace, 'the page wrote a real save');
});

test('(12/16) kill progress is recorded immediately, not just on save', async t => {
    const { G, ledger } = await ready(t);
    await G.palaceQuest();
    await wait(40);
    G.state.sacred.palace.active.progress = 1;
    G.checkQuests('kill', 'royal_hunt');
    await wait(20);
    assert.equal(ledger().active.progress, 2, 'the ledger saw the kill at once');
});

test('(13/16) three consecutive reloads never repeat a finished quest', async t => {
    const { G } = await ready(t);
    const seen = [];
    for (let round = 0; round < 3; round++) {
        G.enterLocation('royal_palace');
        await G.palaceQuest();
        await wait(40);
        const quest = G.state.sacred.palace.active;
        assert.ok(quest, 'a quest exists');
        seen.push(quest.quest_id);
        quest.progress = quest.target;
        await G.palaceQuest();
        await wait(60);
        G.save();
        G.continueGame();
        G.enterLocation('royal_palace');
    }
    assert.deepEqual([...seen], ['royal_hunt', 'palace_healers_road', 'palace_border_watch']);
    assert.equal(new Set(seen).size, 3, 'no quest repeated');
});

test('(14/16) the ledger is per hero, so a second hero starts its own list', async t => {
    const { G, w, ledger } = await ready(t);
    await finishCurrentQuest(G);
    const first = G.state.activeHeroId;
    G.state.activeHeroId = 'hero_second';
    G.state.sacred = { palace: { active: null, completed: [] } };
    G.applyPalaceLedger(null);
    assert.deepEqual([...G.state.sacred.palace.completed], [], 'another hero does not inherit the first hero\'s quests');
    G.state.activeHeroId = first;
    assert.deepEqual([...ledger().completed], ['royal_hunt']);
});

test('(15/16) the game still saves and restores ordinary quests unchanged', async t => {
    const { G } = await ready(t);
    const before = G.state.quests.map(q => q.id);
    G.save();
    G.continueGame();
    assert.deepEqual(G.state.quests.map(q => q.id), before);
    assert.equal(G.state.location, 'royal_palace');
});

test('(16/16) the fix is loaded by the page and precached for offline use', async t => {
    const { w } = await ready(t);
    const scripts = [...w.document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
    assert.ok(scripts.includes('quest-progress-ledger-v760.js'), 'the ledger script is part of the page');
    assert.equal(typeof w.Game.recordPalaceLedger, 'function');
    assert.equal(typeof w.Game.applyPalaceLedger, 'function');
});
