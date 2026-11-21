import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime} from '../scripts/load-world.mjs';

test('fishing inspection uses casting requirements without spending bait or starting a catch',async t=>{
    const {window,dom}=await createRuntime();t.after(()=>dom.window.close());
    const {Game,document}=window, lines=[];
    Game.addNarrative=text=>lines.push(text);
    Game.save=()=>assert.fail('inspection must not save');
    Game.state.location='royal_palace';Game.state.inventory=[];
    const cmd=document.querySelector('[data-cmd="check fishing"]').dataset.cmd;
    const check=()=>{Game.processCommand(cmd);return lines.at(-1);};
    assert.match(check(),/no fishable water/i);
    Game.state.location='seabreeze_ferry';assert.match(check(),/Missing: fishing rod and fishing bait/);
    Game.state.inventory=[{id:'fishing rod',quantity:1},{id:'fishing bait',quantity:0}];
    assert.match(check(),/Missing: fishing bait/);
    Game.processCommand('cast fishing line');assert.match(lines.at(-1),/Missing: fishing bait/);
    Game.state.inventory[1].quantity=2;Game.state.fishing={lastAttempt:Date.now(),catches:3,skill:1};
    assert.match(check(),/Wait .* before casting/);
    Game.state.fishing.lastAttempt=0;assert.match(check(),/Ready/);
    assert.equal(Game.state.inventory[1].quantity,2);assert.equal(Game.state.fishing.catches,3);
});

test('casting from the action bar spends one bait only on a valid cast',async t=>{
    const {window,dom}=await createRuntime();t.after(()=>dom.window.close());
    const {Game,document}=window, lines=[];
    Game.bindEvents();
    const check=document.querySelector('[data-cmd="check fishing"]');
    const cast=check.nextElementSibling;
    assert.equal(cast.textContent,'Cast fishing line');
    Game.addNarrative=text=>lines.push(text);Game.save=()=>{};
    Game.state.location='seabreeze_ferry';Game.state.inventory=[];
    cast.click();assert.match(lines.at(-1),/Missing: fishing rod and fishing bait/);
    const bait={id:'fishing bait',quantity:2};Game.state.inventory.push({id:'fishing rod',quantity:1},bait);
    check.click();assert.match(lines.at(-1),/Ready. Choose Cast fishing line/);
    cast.focus();assert.equal(bait.quantity,2);
    cast.click();assert.match(lines.at(-1),/Fishing catch:/);assert.equal(bait.quantity,1);
    cast.click();assert.match(lines.at(-1),/Wait .* before casting/);
    assert.equal(Game.state.fishing.catches,1);assert.equal(bait.quantity,1);
});

test('marked-water receipt names the catch and counts usable bait across stacks, including the last cast',async t=>{
    const {window,dom}=await createRuntime();t.after(()=>dom.window.close());
    const {Game}=window, lines=[];
    Game.addNarrative=text=>lines.push(text);Game.save=()=>{};window.Math.random=()=>.8;
    Game.state.location='seabreeze_ferry';Game.state.fishing={lastAttempt:0,catches:4,skill:1};
    Game.state.inventory=[{id:'fishing rod',quantity:1}, ...[1,1,0].map(quantity=>({id:'fishing bait',quantity}))];
    Game.processCommand('cast fishing line');
    assert.match(lines.at(-1),/^Fishing catch: Silver Trout\. Bait remaining: 1\. Fishing skill 2; total catches 5\.$/);
    Game.state.fishing.lastAttempt=0;Game.processCommand('cast fishing line');
    assert.match(lines.at(-1),/Silver Trout\. Bait remaining: 0\. Buy more bait at a provision shop/);
    Game.processCommand('cast fishing line');assert.match(lines.at(-1),/Missing: fishing bait/);
    assert.equal(lines.filter(line=>line.startsWith('Fishing catch:')).length,2);
    assert.equal(Game.state.fishing.catches,6);
});
