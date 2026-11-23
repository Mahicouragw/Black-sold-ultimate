import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

/* 7.62.0 — a refresh, a version update or a stale cloud row must never hand out
 * the same palace quest, the lasting blessing or the same day's blessing twice. */

async function ready(t) {
    const r = await createRuntime(); t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window, G = w.Game;
    w.OnlineSystem.saveGame = async () => true;
    w.OnlineSystem.syncActiveHero = () => {};
    w.OnlineSystem.dropWorldItem = async () => false;
    G.startNewHero();
    w.document.getElementById('char-name').value = 'Progress Hero';
    w.document.querySelector('[data-race="human"]').classList.add('selected');
    w.document.querySelector('[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    w.InterfaceMode.apply('blind');
    return { w, G, guard: w.ProgressGuard };
}

async function acceptPalaceQuest(G) {
    G.enterLocation('royal_palace');
    await G.palaceQuest();
    await wait(30);
    return G.state.sacred.palace.active;
}

async function prayAndChooseBlessing(G) {
    G.enterLocation('grand_temple');
    await G.pray('healing');
    await wait(30);
    await G.claimPermanentTempleBlessing('strength');
    await wait(30);
    G.save();
    return { str: G.state.player.str, maxHp: G.state.player.maxHp, grantedAt: G.state.sacred.lastTemporaryPrayer };
}

/** A real page load starts with empty runtime fields and resumes the slot. */
function simulateReload(G) {
    G.resetHeroRuntime();
    G.autoResumeIfActive();
}

test('a refresh resumes the hero through the full loader and keeps the lasting blessing', async t => {
    const { G } = await ready(t);
    const before = await prayAndChooseBlessing(G);
    assert.equal(G.state.sacred.permanentTempleBlessing, 'strength');
    simulateReload(G);
    assert.ok(G.state.player, 'the hero resumed');
    assert.equal(G.state.sacred.permanentTempleBlessing, 'strength', 'the lasting blessing survived the refresh');
    assert.equal(G.state.player.str, before.str, 'no stat was applied a second time');
    assert.ok(G.state.sacred.dailyBattleBlessing?.expiresAt > Date.now(), 'the daily blessing is still standing');
});

test('a refresh keeps the accepted palace quest instead of re-issuing it', async t => {
    const { G } = await ready(t);
    const accepted = await acceptPalaceQuest(G);
    assert.equal(accepted.quest_id, 'royal_hunt');
    G.save();
    simulateReload(G);
    assert.equal(G.state.sacred.palace.active?.quest_id, 'royal_hunt', 'the accepted quest came back');
    assert.deepEqual([...G.state.sacred.palace.completed], []);
    const completedBefore = [...G.state.sacred.palace.completed];
    G.enterLocation('royal_palace');
    await G.palaceQuest();
    await wait(20);
    assert.equal(G.state.sacred.palace.active?.quest_id, 'royal_hunt');
    assert.deepEqual([...G.state.sacred.palace.completed], completedBefore, 'the same quest was not issued again');
});

test('a refresh never hands out the lasting blessing or the daily blessing twice', async t => {
    const { G } = await ready(t);
    const before = await prayAndChooseBlessing(G);
    simulateReload(G);
    G.state.player.hp = 10; G.state.player.mp = 0;
    const strAfterReload = G.state.player.str;
    G.enterLocation('grand_temple');
    await G.pray('healing');
    await wait(20);
    assert.equal(G.state.sacred.lastTemporaryPrayer, before.grantedAt, 'the day was not restarted');
    assert.equal(G.state.player.hp, 10, 'a second daily blessing did not refill health');
    await G.claimPermanentTempleBlessing('strength');
    await wait(20);
    assert.equal(G.state.player.str, strAfterReload, 'the lasting blessing cannot be taken twice');
});

test('merging a stale cloud row keeps blessing and quest history', async t => {
    const { w, G } = await ready(t);
    await acceptPalaceQuest(G);
    const cloud = JSON.parse(JSON.stringify(G.getSaveData()));
    delete cloud.sacred;
    delete cloud.blessings;
    delete cloud.palaceByName;
    cloud.savedAt = Number(cloud.savedAt) + 1000;      // even a "newer" stale row
    const local = JSON.parse(JSON.stringify(G.getSaveData()));
    const out = w.OnlineSystem.mergeNewestRoster(
        { version: 2, activeHeroId: G.state.activeHeroId, heroes: { [G.state.activeHeroId]: cloud } },
        { version: 2, activeHeroId: G.state.activeHeroId, heroes: { [G.state.activeHeroId]: local } }
    );
    const hero = out.merged.heroes[G.state.activeHeroId];
    assert.equal(hero.sacred?.palace?.active?.quest_id, 'royal_hunt', 'the accepted quest survived the stale row');
    assert.equal(out.repaired, true, 'the repaired roster is written back');
});

test('a slower cloud merge cannot resurrect a completed quest as accepted', async t => {
    const { w, G } = await ready(t);
    await acceptPalaceQuest(G);
    const local = JSON.parse(JSON.stringify(G.getSaveData()));
    local.sacred.palace.completed = ['royal_hunt'];
    local.sacred.palace.active = null;
    const cloud = JSON.parse(JSON.stringify(local));
    cloud.savedAt = 1;
    cloud.sacred.palace = { active: { quest_id: 'royal_hunt', progress: 5, target: 5 }, completed: [] };
    const out = w.OnlineSystem.mergeNewestRoster(
        { heroes: { [G.state.activeHeroId]: cloud }, activeHeroId: G.state.activeHeroId },
        { heroes: { [G.state.activeHeroId]: local }, activeHeroId: G.state.activeHeroId }
    );
    const palace = out.merged.heroes[G.state.activeHeroId].sacred.palace;
    assert.equal(palace.active, null, 'a finished quest is not accepted again');
    assert.deepEqual([...palace.completed], ['royal_hunt']);
});

test('a hero whose slot id changed (Google merge) keeps its palace history by name', async t => {
    const { w, G } = await ready(t);
    await acceptPalaceQuest(G);
    const local = JSON.parse(JSON.stringify(G.getSaveData()));
    const name = G.state.player.name;
    const oldId = G.state.activeHeroId;
    const cloudHero = JSON.parse(JSON.stringify(local));
    cloudHero.savedAt = 1;
    delete cloudHero.sacred;
    const out = w.OnlineSystem.mergeNewestRoster(
        { heroes: { hero_google_new: { ...cloudHero, player: { ...cloudHero.player, name } } }, activeHeroId: 'hero_google_new' },
        { heroes: { [oldId]: local }, activeHeroId: oldId }
    );
    const merged = out.merged.heroes.hero_google_new;
    assert.equal(merged.sacred?.palace?.active?.quest_id, 'royal_hunt', 'the same hero kept the quest under the new slot id');
    assert.ok(out.repaired);
});

test('a blessing restored without its timestamp is not granted again the same day', async t => {
    const { w, G } = await ready(t);
    await prayAndChooseBlessing(G);
    const expiresAt = G.state.sacred.dailyBattleBlessing.expiresAt;
    delete G.state.sacred.lastTemporaryPrayer;
    w.ProgressGuard.restoreBlessings(G);
    const rebuilt = G.state.sacred.lastTemporaryPrayer;
    assert.ok(rebuilt > 0, 'the timestamp was rebuilt');
    G.state.player.hp = 20;
    G.enterLocation('grand_temple');
    await G.pray('healing');
    await wait(20);
    assert.equal(G.state.sacred.lastTemporaryPrayer, rebuilt, 'the rebuilt day still blocks a second blessing');
    assert.equal(G.state.player.hp, 20, 'no second blessing');
    assert.equal(G.state.sacred.dailyBattleBlessing.expiresAt, expiresAt, 'the standing blessing was not replaced');
});

test('the hero save carries the blessing record and the palace history by name', async t => {
    const { G } = await ready(t);
    await acceptPalaceQuest(G);
    const save = G.getSaveData();
    assert.ok(save.blessings && typeof save.blessings === 'object');
    assert.ok(save.palaceByName && Array.isArray(save.palaceByName.completed));
    assert.equal(save.palaceByName.active?.quest_id, 'royal_hunt');
});

test('settings show the real Google account instead of hiding it', async t => {
    const { w } = await ready(t);
    const online = w.OnlineSystem;
    online.connecting = false;
    online.linked = true; online.ready = true; online.user = { id: 'u1', email: 'player@example.com' };
    online.updateIndicators();
    const account = w.document.getElementById('settings-account-status');
    assert.equal(account.parentElement.hidden, false);
    assert.match(account.textContent, /player@example\.com/);
    assert.equal(w.document.getElementById('btn-google-signin').hidden, true);
    online.linked = false; online.user = { id: 'u2', identities: [] };
    online.updateIndicators();
    assert.match(account.textContent, /Guest account/);
    assert.equal(w.document.getElementById('btn-google-signin').hidden, false);
});
