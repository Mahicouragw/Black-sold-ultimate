import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
import {createRuntime} from '../scripts/load-world.mjs';

test('recipe inspection previews the next usable ingredient without rolling, spending or saving', async t => {
    const {window,dom}=await createRuntime(); t.after(()=>dom.window.close());
    const G=window.Game, lines=[];
    for(let i=0;!G.inspectCooking && i<20;i++) await wait(15);
    G.addNarrative=text=>lines.push(text);
    G.state.inventory=[{name:'knife',type:'weapon',quantity:1},{name:'old trout',type:'food',quantity:0}];
    G.processCommand('recipes');assert.match(lines.at(-1),/No cooking ingredients/);
    G.state.inventory.push({name:'river trout',type:'food',quantity:2},{name:'carp',type:'food',quantity:1});
    G.state.skills.cooking.level=2;
    const before=JSON.stringify([G.state.inventory,G.state.skills]);
    G.save=()=>assert.fail('inspection must not save');window.Math.random=()=>assert.fail('inspection must not roll');
    const cmd=window.document.querySelector('button[data-cmd="cooking recipes"]').dataset.cmd;
    G.processCommand(cmd);
    assert.match(lines.at(-2),/river trout \(2\); carp \(1\)/);
    assert.match(lines.at(-1),/one river trout makes cooked river trout.*30 HP/);
    assert.equal(JSON.stringify([G.state.inventory,G.state.skills]),before);
});

test('ingredient chooser spends the selected food only, and stale or partial names cannot spend a substitute', async t => {
    const {window,dom}=await createRuntime(); t.after(()=>dom.window.close());
    const G=window.Game,d=window.document,lines=[];
    for(let i=0;!G.inspectCooking && i<20;i++) await wait(15);
    G.addNarrative=text=>lines.push(text); let saves=0; G.save=()=>saves++;
    const carp={name:'Carp',type:'food',quantity:2}, trout={name:'River Trout',type:'food',quantity:2};
    G.state.inventory=[carp,trout];
    G.processCommand('recipes'); const select=d.getElementById('cooking-ingredient');select.value='River Trout';
    window.Math.random=()=>0;
    d.getElementById('cook-selected').click();
    assert.equal(trout.quantity,1);assert.equal(carp.quantity,2);assert.equal(saves,1);
    assert.ok(G.state.inventory.some(item=>item.name==='cooked River Trout'));
    G.processCommand('cook trout');assert.equal(saves,1);
    G.state.inventory=G.state.inventory.filter(item=>item!==trout);
    d.getElementById('cook-selected').click(); assert.equal(saves,1);assert.equal(carp.quantity,2);
    assert.match(lines.at(-1),/Nothing was used/);
    window.Math.random=()=>.99; G.processCommand('cook'); assert.equal(carp.quantity,1);assert.equal(saves,2);
});

test('cooking result identifies the dish and counts remaining ingredients across stacks', async t => {
    const {window,dom}=await createRuntime(); t.after(()=>dom.window.close());
    const G=window.Game, lines=[];
    for(let i=0;!G.goCooking && i<20;i++) await wait(15);
    G.addNarrative=text=>lines.push(text); G.save=()=>{};
    G.state.inventory=[1,1].map(quantity=>({name:'Carp',type:'food',quantity}));
    window.Math.random=()=>0;
    G.processCommand('cook Carp');
    assert.deepEqual(lines,['Used 1 Carp. Added 1 cooked Carp to your bag. Heals 25 HP. Carp remaining: 1.']);
    window.Math.random=()=>.99;
    G.processCommand('cook Carp');
    assert.equal(lines.at(-1),'Burned 1 Carp. No cooked Carp was added. Carp remaining: 0.');
    assert.equal(G.state.inventory.length,1); assert.equal(G.state.inventory[0].quantity,1);
    assert.equal(G.state.skills.cooking.xp,18);
});
