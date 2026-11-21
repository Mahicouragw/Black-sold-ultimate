import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../scripts/load-world.mjs';

test('Look Around lists current speakers without starting dialogue; a listed full name addresses the right person', async t => {
    const {window,dom}=await createRuntime(); t.after(()=>dom.window.close());
    const {Game,WorldData}=window, lines=[];
    WorldData.locations.training_inn={name:'Practice inn',description:'A quiet hall.',exits:{}};
    WorldData.npcs.training_inn=['Mira the Elder','Mira'].map(name=>({name,dialog:['Hello.']}));
    Game.state.location='training_inn';
    Game.addNarrative=text=>lines.push(text);
    Game.processCommand('look around');
    assert.ok(lines.some(line=>line.startsWith('People here: Mira the Elder, Mira.') && line.includes('talk to Mira the Elder')));
    assert.ok(lines.every(line=>!line.includes(' says:')));
    assert.equal(Game.state.location,'training_inn');
    Game.processCommand('talk to Mira');
    assert.ok(lines.some(line=>line.startsWith('Mira says:')));
    WorldData.npcs.training_inn=[]; lines.length=0;
    Game.processCommand('look around');
    assert.ok(lines.includes('There is no one here to talk to.'));
    assert.ok(lines.every(line=>!line.includes('Mira')));
});

test('People here offers named conversation without typing and refuses a departed speaker', async t => {
    const {window,dom}=await createRuntime(); t.after(()=>dom.window.close());
    const {Game,WorldData,document}=window, lines=[];
    Game.state.location='test_inn';
    WorldData.locations.test_inn={name:'Inn',description:'A quiet hall.',exits:{}};
    WorldData.npcs.test_inn=['Mira the Elder','Mira'].map(name=>({name,dialog:['Hello.']}));
    Game.addNarrative=text=>lines.push(text);
    Game.lookAround();
    document.querySelector('#room-speakers summary').click();
    const list=document.querySelector('#room-speaker-actions');
    const [elder,mira]=list.querySelectorAll('button');
    assert.equal(mira.textContent,'Talk to Mira');
    Game.updateSpeakerButtons(); assert.equal(mira,list.lastChild);
    assert.ok(lines.every(line=>!line.includes(' says:')));
    mira.click(); assert.ok(lines.some(line=>line.startsWith('Mira says:')));
    WorldData.npcs.test_inn=[]; lines.length=0; elder.click();
    assert.deepEqual(lines,['That person is no longer here.']);
    assert.equal(list.querySelector('button'),null);
    assert.equal(Game.state.location,'test_inn');
});

test('courier patrol follows open exits, updating conversation targets while the hero stays put', async t => {
    const {window,dom}=await createRuntime(); t.after(()=>dom.window.close());
    const {Game,WorldData,PalaceRooms,document}=window;
    const library='kaliwasch_palace_library', entrance='royal_palace';
    Object.assign(Game.state,{location:library,screen:'game-screen',player:{},inCombat:false});
    const count=id=>Game.roomNpcs(id).filter(n=>n.name==='Palace Courier').length;
    const lines=[];Game.addNarrative=text=>lines.push(text);
    Game.updateSpeakerButtons();
    const button=()=>document.querySelector('button[data-speaker="Palace Courier"]');
    assert.ok(button()); assert.equal(PalaceRooms.advanceCourier(),true);
    assert.equal(button(),null);assert.equal(count(entrance),1);assert.equal(count(library),0);
    assert.match(lines.at(-1),/walks east/);
    Game.state.inCombat=true;assert.equal(PalaceRooms.advanceCourier(),false);Game.state.inCombat=false;
    delete WorldData.locations[entrance].exits.west; assert.equal(PalaceRooms.advanceCourier(),false);
    WorldData.locations[entrance].exits.west=library;assert.equal(PalaceRooms.advanceCourier(),true);
    assert.match(lines.at(-1),/arrives from the east/);assert.ok(button());button().click();
    assert.ok(lines.some(line=>line.startsWith('Palace Courier says:')));
    assert.equal(count(entrance),0);assert.equal(count(library),1);assert.equal(Game.state.location,library);
});
