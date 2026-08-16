import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

test('launch, hero, movement, forest, dungeon, battle, victory transition, save and reload stay synchronized', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const { Game, AudioManager, WorldData } = window;
    window.OnlineSystem.saveGame = async () => true;
    window.OnlineSystem.syncActiveHero = () => {};
    window.OnlineSystem.dropWorldItem = async () => false;

    // Launch → New Adventure → Create Hero.
    Game.startNewHero();
    window.document.getElementById('char-name').value = 'Auralis Test';
    window.document.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    window.document.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    Game.createCharacter(false);
    assert.equal(Game.state.screen, 'game-screen');
    assert.equal(Game.state.location, 'kaliwasch');
    assert.equal(WorldData.locations.kaliwasch.name, 'Kaliwasch Market Square');

    // Market Square → N → E → S → W. Each accepted command emits one and only
    // one logical "You moved" event after the movement commits.
    for (const direction of ['north', 'east', 'south', 'west']) {
        const before = Game.state.location;
        assert.ok(WorldData.locations[before].exits[direction], `${before} supports ${direction}`);
        Game.move(direction);
        await wait(380);
        assert.notEqual(Game.state.location, before);
    }
    const movementLines = [...window.document.querySelectorAll('#narrative p')].filter(node => node.textContent.startsWith('You moved '));
    assert.equal(movementLines.length, 4);

    // Explore forest and dungeon contexts without allowing a random encounter to
    // race this deterministic smoke flow.
    const originalRandom = window.Math.random;
    window.Math.random = () => 0.1;
    Game.enterLocation('forest');
    assert.equal(WorldData.locations[Game.state.location].musicContext, 'FOREST');
    Game.look();
    Game.enterLocation('dungeon_entrance');
    assert.equal(WorldData.locations[Game.state.location].musicContext, 'DUNGEON');

    // Dungeon → battle override. Boss selection is independent of world music.
    Game.startCombat('goblin scout');
    await wait(560);
    assert.equal(Game.state.inCombat, true);
    assert.equal(AudioManager.battleActive, true);
    assert.equal(AudioManager.overlayContext, 'BATTLE_NORMAL');

    // The stabilized battle-summary module owns final rewards. Stub only the
    // real-time wait for the four-second fanfare while asserting the requested
    // victory→world transition contract.
    window.ProfessionalAudioCombat = null;
    if (Game.state.sacred) Game.state.sacred.enemyQueue = [];
    let transition;
    AudioManager.endBattle = async options => { transition = options; AudioManager.battleActive = false; AudioManager.overlayMode = null; };
    window.Math.random = () => 0.99;
    Game.enemyDefeated();
    for (let attempt = 0; attempt < 20 && !transition; attempt++) await wait(50);
    assert.equal(Game.state.inCombat, false);
    assert.ok(transition, 'battle requested a victory transition');
    assert.deepEqual({ victory: transition.victory, worldContext: transition.worldContext }, { victory: true, worldContext: 'DUNGEON' });

    // Wayfinder uses the same graph: every returned direction is executable.
    const route = window.WorldGraph.route(Game.state.location, 'forest');
    assert.ok(route?.length);
    let cursor = Game.state.location;
    for (const direction of route) {
        const next = WorldData.locations[cursor].exits[direction];
        assert.ok(next);
        cursor = next;
    }
    assert.equal(cursor, 'forest');

    // Save and reload preserve the committed location and hero state.
    Game.state.location = 'forest';
    Game.save();
    Game.state.location = 'kaliwasch';
    Game.continueGame();
    assert.equal(Game.state.location, 'forest');
    assert.equal(Game.state.player.name, 'Auralis Test');
    window.Math.random = originalRandom;
});
