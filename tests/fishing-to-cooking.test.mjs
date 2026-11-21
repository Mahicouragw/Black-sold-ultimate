import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
import {createRuntime} from '../scripts/load-world.mjs';

for (const burns of [false, true]) {
    test(`cast, select the fresh catch, and ${burns ? 'burn' : 'cook'} it using only gameplay controls`, async t => {
        const {window, dom} = await createRuntime();
        t.after(() => dom.window.close());
        const {Game, document} = window;
        for (let i = 0; !Game.goCooking && i < 20; i++) await wait(15);
        Game.bindEvents();
        Game.save = () => {}; // Exercise inventory, not disk or network saves.
        Game.state.location = 'seabreeze_ferry';
        Game.state.inventory = [
            {name:'Bread', type:'food', quantity:2},
            {id:'fishing rod', quantity:1}, {id:'fishing bait', quantity:2}
        ];
        const quantity = name => Game.state.inventory.filter(i => i.name === name).reduce((n,i) => n+i.quantity,0);
        const clickCommand = cmd => document.querySelector(`button[data-cmd="${cmd}"]`).click();
        window.Math.random = () => .8; // Ordinary pier catch: Silver Trout.
        clickCommand('cast fishing line');
        assert.equal(quantity('Silver Trout'),1);
        clickCommand('cooking recipes');
        const select = document.querySelector('#cooking-ingredient');
        assert.equal(document.querySelector('#cooking-choice').hidden,false);
        assert.equal(select.value,'Bread'); // Must not cook the default ingredient.
        select.value = 'Silver Trout';
        assert.equal(select.selectedOptions[0].textContent,'Silver Trout (1)');
        assert.equal(quantity('Silver Trout'),1);
        window.Math.random = () => burns ? .99 : 0;
        document.querySelector('#cook-selected').click();
        assert.equal(quantity('Silver Trout'),0);
        assert.equal(quantity('cooked Silver Trout'),burns ? 0 : 1);
        assert.equal(quantity('Bread'),2);
        assert.equal(Game.state.inventory.find(i => i.id === 'fishing bait').quantity,1);
        assert.equal(Game.state.fishing.catches,1);
        assert.equal(Game.state.skills.cooking.xp,burns ? 3 : 15);
        assert.ok(![...select.options].some(o => o.value === 'Silver Trout'));
    });
}

for (const [start, restored] of [[30,30],[94,6],[100,0]]) {
    test(`inventory meal at ${start} HP restores ${restored} once, even with a full stomach`, async t => {
        const {window,dom}=await createRuntime(); t.after(()=>dom.window.close());
        const {Game,document}=window;
        for(let i=0; !Game.goCooking && i<20; i++) await wait(15);
        Game.bindEvents(); Game.save=()=>{};
        Game.state.player={hp:start,maxHp:100,mp:10,maxMp:10,satiety:100,str:10};
        Game.state.location='seabreeze_ferry'; Game.state.skills.cooking.level=2;
        Game.state.inventory=[{id:'fishing rod',name:'Rod',quantity:1},{id:'fishing bait',name:'Bait',quantity:1},
            {type:'food',effect:'heal',name:'cooked Silver Trout',power:30,value:25,quantity:1}];
        const click=cmd=>document.querySelector(`button[data-cmd="${cmd}"]`).click();
        window.Math.random=()=>.8; click('cast fishing line');click('cooking recipes');
        document.querySelector('#cooking-ingredient').value='Silver Trout';
        window.Math.random=()=>0; document.querySelector('#cook-selected').click();
        const stack=Game.state.inventory.find(i=>i.name==='cooked Silver Trout');assert.equal(stack.quantity,2);
        const messages=[];Game.emitGameEvent=text=>{messages.push(text);return Promise.resolve(true);};
        click('inventory');
        const use=[...document.querySelectorAll('#inv-list button')].find(b=>b.textContent==='Eat cooked Silver Trout');
        assert.ok(use,'inventory offers a named meal action');use.click();use.click();
        assert.equal(Game.state.player.hp,start+restored);assert.equal(stack.quantity,restored?1:2);
        if(restored) assert.equal(messages.filter(text=>text.includes(`Recovered ${restored} HP.`)).length,1);
    });
}

test('a cooked meal survives a fresh local session and a consumed serving stays gone on the next resume', async t => {
    async function boot(saved = {}) {
        const {window, dom} = await createRuntime();
        t.after(() => dom.window.close());
        for (const [key,value] of Object.entries(saved)) window.localStorage.setItem(key,value);
        // No cloud restore can supply a missing inventory entry in this test.
        window.OnlineSystem.init = () => {};
        window.OnlineSystem.saveGame = async () => false;
        window.OnlineSystem.syncActiveHero = () => {};
        window.Game.init();
        for (let i=0; !window.Game.goCooking && i<20; i++) await wait(15);
        return window;
    }
    const storage = w => Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]));
    const first = await boot();
    const G = first.Game, name = 'cooked Silver Trout';
    G.startNewHero(); first.document.getElementById('char-name').value = 'River Cook';
    first.document.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    first.document.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    assert.notEqual(G.createCharacter(false),false);
    const id = G.state.activeHeroId;
    G.state.player.hp = 20; G.state.player.maxHp = 100;
    G.state.skills.cooking.level = 2;
    G.state.inventory = [{...first.WorldData.items['silver trout'],id:'silver trout',quantity:2}];
    first.Math.random = () => 0;
    G.processCommand('cook Silver Trout'); G.processCommand('cook Silver Trout');
    // Only serialized browser storage crosses session boundaries. Cooking and
    // eating must each perform their own save; don't manually save here.
    const second = await boot(storage(first));
    const meal = w => w.Game.state.inventory.find(i=>i.name===name);
    assert.equal(second.Game.state.activeHeroId,id);
    assert.equal(meal(second).quantity,2); assert.equal(meal(second).power,30);
    second.document.querySelector('button[data-cmd="inventory"]').click();
    const eat = [...second.document.querySelectorAll('#inv-list button')].find(b=>b.textContent===`Eat ${name}`);
    assert.ok(eat); eat.click();
    assert.equal(meal(second).quantity,1); assert.equal(second.Game.state.player.hp,50);
    const third = await boot(storage(second));
    assert.equal(third.Game.state.activeHeroId,id);
    assert.equal(meal(third).quantity,1); assert.equal(meal(third).power,30);
    assert.equal(third.Game.state.player.hp,50);
});
