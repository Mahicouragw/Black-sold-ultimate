import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime} from '../scripts/load-world.mjs';

test('compass buttons send all four diagonals to movement, not unknown command',async t=>{
 const {window:w,dom}=await createRuntime();t.after(()=>dom.window.close());const g=w.Game;
 g.state.player={};g.state.screen='game-screen';g.bindEvents();const moves=[];g.move=dir=>{moves.push(dir);return true;};
 for(const d of ['northwest','northeast','southwest','southeast']){const btn=w.document.querySelector(`.dir-btn[data-cmd="${d}"]`);btn.disabled=false;btn.click();assert.equal(moves.at(-1),d);}
});
test('Christmas opens and closes on India dates; quiz pays once and the pond and kitchen have hosts',async t=>{
 const {window:w,dom}=await createRuntime();t.after(()=>dom.window.close()); const g=w.Game,S=w.StarlightFair, rooms=w.WorldData.locations;
 const DateBase=w.Date;let now='2026-11-30T18:29:59Z';w.Date=class extends DateBase{constructor(...args){super(...(args.length?args:[now]));}};
 assert.equal(S.sync(g),false);now='2026-11-30T18:30:00Z';assert.equal(S.sync(g),true);assert.equal(rooms.kaliwasch.exits.northeast,'starlight_square');
 for(const id of ['starlight_square','starlight_pond','starlight_kitchen']){assert.equal(rooms[id].musicContext,'CHRISTMAS');assert.ok(w.WorldData.npcs[id].length);}
 assert.equal(new Set(w.AudioManager.playlists.CHRISTMAS).size,5);g.state.location='starlight_square';g.state.player={gold:5};g.save=()=>true;g.updateHUD=()=>{};
 for(const word of ['wrong','east','greta','star','star'])g.processCommand('christmas answer '+word);assert.equal(g.state.player.gold,80);
 now='2026-12-25T18:30:00Z';assert.equal(S.sync(g),false);assert.notEqual(rooms.kaliwasch.exits.northeast,'starlight_square');
});

test('Christmas City has a walkable district, individual secret door and annual Santa reward',async t=>{
 const {window:w,dom}=await createRuntime();t.after(()=>dom.window.close());const g=w.Game,S=w.StarlightFair;
 const Base=w.Date;w.Date=class extends Base{constructor(...args){super(...(args.length?args:['2026-12-25T10:00:00Z']));}};
 g.state.player={gold:0,hp:5,maxHp:12,inventory:[],diamonds:0,name:'Tester'};g.addItemToInventory=w.Game.addItemToInventory.bind(g);g.updateHUD=()=>{};g.save=()=>true;S.sync(g);const rooms=w.WorldData.locations, city=Object.keys(rooms).filter(k=>k.startsWith('starlight_'));assert.equal(city.length,29);
 assert.ok(w.WorldData.npcs.kaliwasch.some(n=>n.name==='Santa Claus'));g.state.location='starlight_city_1_2';assert.equal(rooms[g.state.location].exits.down,undefined);
 g.processCommand('christmas ring bell');g.state.location=rooms[g.state.location].exits.down;g.processCommand('christmas recruit');g.state.location='starlight_city_2_2';g.state.inCombat=true;S.elf(g);assert.equal(g.state.player.hp,9);g.state.inCombat=false;
 for(let i=0;i<3;i++)S.victory(g,{name:'Glass-frost prowler'});g.state.location='starlight_city_4_2';g.processCommand('christmas decorate');g.state.location='kaliwasch';g.processCommand('christmas gift');
 assert.equal(g.state.inventory.find(i=>i.name==='Santa’s Star'),undefined,'Santa refuses while doors are unfinished');
 assert.equal(g.state.player.diamonds,0);
 const j=w.AdventCalendar.journal(g);for(let n=1;n<=25;n++)j.done[n]=1;
 g.processCommand('christmas gift');
 const star=g.state.inventory.find(i=>i.name==='Santa’s Star');assert.ok(star,'Santa hands over one real present after all 25 doors, not gold');
 assert.ok(g.state.player.diamonds>0);assert.equal(g.state.player.gold,0);
 const before=JSON.stringify(g.state.inventory);g.processCommand('christmas gift');assert.equal(JSON.stringify(g.state.inventory),before,'the great present is given once a year');
});
