import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../scripts/load-world.mjs';

test('inspect living enemies is turn-free and reads current rather than stale health', async () => {
    const { window, dom } = await createRuntime();
    try {
        const { Game, document } = window;
        Object.assign(Game.state, {inCombat:true, enemy:{name:'root goblin', hp:4, maxHp:12}, encounterTargets:[
            {name:'root goblin',active:true,hp:12,maxHp:12},
            {name:'root goblin',hp:7,maxHp:12}, {name:'lost spirit',defeated:true}
        ]});
        const roster = document.querySelector('#combat-status #encounter-roster');
        document.querySelector('#combat-status').classList.remove('hidden');
        const before = JSON.stringify(Game.state.encounterTargets);
        Game.updateEnemyGroupHUD();
        roster.querySelector('summary').click();
        assert.equal(roster.open,true);
        const rows = roster.querySelectorAll('li');
        assert.equal(rows.length,2);
        assert.match(rows[0].textContent,/current target.*4 of 12 health/);
        assert.match(rows[1].textContent,/7 of 12 health/);
        assert.doesNotMatch(rows[1].textContent,/current target/);
        assert.equal(JSON.stringify(Game.state.encounterTargets), before);
        assert.equal(Game.state.enemy.hp,4);
        Game.finishCommandCombat();
        assert.equal(roster.open,false);
    } finally {dom.window.close();}
});

test('numbered attack hits only the requested duplicate and keeps its number after a defeat', async () => {
    const {window, dom} = await createRuntime();
    try {
        const {Game, document} = window;
        const targets = [{name:'root goblin',active:true,hp:40,maxHp:40}, {name:'root goblin',hp:40,maxHp:40}];
        Object.assign(Game.state, {inCombat:true, enemy:{...targets[0]}, encounterTargets:targets, player:{str:10,dex:10}});
        window.Math.random = () => .8;
        let turns = 0;
        Game.enemyGroupTurn = () => turns++;
        window.OnlineSystem.recordGroupAttack = () => {};
        Game.emitGameEvent = () => {};
        Game.updateEnemyGroupHUD();
        const button = document.querySelector('#enemy-group-list button[data-slot="2"]');
        document.querySelector("#combat-status").classList.remove("hidden");
        document.querySelector("#encounter-roster").open = true;
        window.InterfaceMode.apply("sighted");
        Game.showScreen("game-screen");
        await new Promise(resolve => setTimeout(resolve, 30));
        button.focus();
        assert.equal(turns,0);
        button.click();
        assert.equal(turns,1);
        assert.equal(Game.state.enemy.hp,40);
        assert.ok(targets[1].hp < 40);
        assert.equal(document.activeElement.dataset.slot,'2');
        targets[0].defeated = true;
        Game.updateEnemyGroupHUD();
        assert.equal(document.querySelector('#enemy-group-list button').dataset.slot,'2');
        Game.attackNamedTarget('target 1');
        assert.equal(turns,1);
    } finally { dom.window.close(); }
});

test('hit, miss and block feedback identifies the duplicate without changing the recorded enemy name', async t => {
    const {window,dom} = await createRuntime();
    t.after(() => dom.window.close());
    const G = window.Game, name = 'root goblin';
    const targets = [{name,active:true,hp:80,maxHp:80},{name,hp:80,maxHp:80}];
    Object.assign(G.state,{inCombat:true,enemy:{...targets[0]},encounterTargets:targets,player:{str:10,dex:10}});
    G.companionTurn = G.enemyAttack = G.enemyGroupTurn = G.updateEnemyHUD = () => {};
    const events=[], records=[];
    G.emitGameEvent=text=>{events.push(text); return Promise.resolve(true);};
    window.OnlineSystem.recordGroupAttack=n=>records.push(n);
    window.Math.random=()=>.5;
    G.attackNamedTarget('target 1'); G.attackNamedTarget('target 2');
    assert.match(events[0],/You hit root goblin \(target 1\) for/);
    assert.match(events[1],/You hit root goblin \(target 2\) for/);
    assert.deepEqual(records,[name,name]);
    window.Math.random=()=>.99; G.attackNamedTarget('target 1');
    assert.equal(events.at(-1),'You miss root goblin (target 1).');
    window.Math.random=()=>0; G.attackNamedTarget('target 2');
    assert.equal(events.at(-1),'root goblin (target 2) blocks your attack.');
});

test('incoming hits and misses identify both members of a same-name group', async t => {
    const {window,dom} = await createRuntime();
    t.after(() => dom.window.close());
    const G=window.Game, name='root goblin';
    Object.assign(G.state,{inCombat:true, enemy:{name,hp:60,maxHp:60,attack:8},
        encounterTargets:[{name,active:true,hp:60},{name,hp:60}], companions:[],
        player:{hp:100,maxHp:100,mp:20,maxMp:20,dex:10,wis:10,level:1}});
    const lines=[], spoken=[];
    window.ProfessionalAudioCombat={monsterAttack:async label=>spoken.push(label)};
    let activeTurn;
    G.combatSequence=fn=>{activeTurn=fn();};
    G.updateHUD=G.save=()=>{};
    G.addNarrative=G.emitGameEvent=text=>{lines.push(text);return true;};
    window.Math.random=()=>.5;
    G.enemyGroupTurn(); await activeTurn;
    for (const slot of [1,2]) assert.ok(lines.some(line=>line.startsWith(`${name} (target ${slot}) hits you for `)));
    assert.deepEqual(spoken,[`${name} (target 1)`]);
    window.Math.random=()=>.99;
    G.enemyGroupTurn(); await activeTurn;
    assert.ok(lines.includes(`${name} (target 2) misses you.`));
    assert.equal(G.state.enemy.name,name);
});
