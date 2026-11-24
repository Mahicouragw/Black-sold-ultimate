import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../scripts/load-world.mjs';

test('quest journal explains objectives and palace turn-in without changing progress', async () => {
    const {window, dom} = await createRuntime();
    try {
        const {Game, document} = window;
        const list = document.querySelector('#quest-list');
        Game.state.quests = [];
        Game.showQuests();
        assert.match(list.textContent, /No active quests/);
        Game.state.quests.push({name: '<b>Hunt</b>', description: 'Go hunting.', objectives: [{type:'kill',target:'any',count:3,current:1}]});
        Game.state.sacred = {palace:{active:{quest_id:'royal_hunt',target:5,progress:4}}};
        Game.showQuests();
        assert.match(list.textContent, /4 of 5/);
        Game.state.sacred.palace.active.progress++;
        const before = JSON.stringify([Game.state.quests, Game.state.sacred]);
        Game.showQuests();
        assert.match(list.querySelector('section').textContent, /Return to the Royal Palace/i);
        assert.equal(list.querySelectorAll('h4')[1].textContent, '<b>Hunt</b>');
        assert.equal(list.querySelector('b'), null);
        assert.match(list.textContent, /Still waiting: the creatures on this road — 1 of 3/);
        assert.equal(JSON.stringify([Game.state.quests, Game.state.sacred]), before);
    } finally { dom.window.close(); }
});

test('court guidance recalculates from the current room and never moves or turns in the quest', async () => {
    const {window, dom} = await createRuntime();
    try {
        const {Game, WorldData, document} = window;
        const quest = {quest_id:'royal_hunt', target:5, progress:5};
        Game.state.sacred = {palace:{active:quest}};
        Game.state.quests = [];
        function readAt(room) {
            Game.state.location = room;
            Game.showQuests();
            assert.equal(Game.state.location, room);
            assert.equal(Game.state.sacred.palace.active, quest);
            return document.querySelector('#quest-list').textContent;
        }
        const palaceName = WorldData.locations.royal_palace.name;
        assert.ok(readAt('kaliwasch_palace_armory').includes(`west to ${palaceName}`));
        assert.ok(readAt('kaliwasch_palace_library').includes(`east to ${palaceName}`));
        for (const room of ['royal_palace','kaliwasch_palace_throne_room']) assert.match(readAt(room), /Choose Palace Quest/);
        WorldData.locations.isolated = {name:'Closed room', exits:{}};
        assert.match(readAt('isolated'), /No open route/);
        quest.progress--;
        assert.doesNotMatch(readAt('isolated'), /No open route|Next exit|Choose Palace Quest/);
    } finally { dom.window.close(); }
});
