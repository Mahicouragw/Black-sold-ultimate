import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../scripts/load-world.mjs';

test('compass exposes diagonal and vertical destinations without moving on focus', async () => {
    const { window, dom } = await createRuntime();
    try {
        const { Game, WorldData, document } = window;
        const buttons = [...document.querySelectorAll('.dpad button')];
        assert.equal(new Set(buttons.map(button => button.dataset.cmd)).size, 10);
        const before = Game.state.location;
        for (const direction of ['northwest','northeast','southeast','southwest','up','down']) {
            const button = buttons.find(button => button.dataset.cmd === direction);
            Game.updateDirectionButtons({ [direction]: 'kaliwasch' });
            button.focus();
            assert.equal(button.disabled, false);
            assert.equal(button.getAttribute('aria-label'), `${direction} to ${WorldData.locations.kaliwasch.name}`);
            Game.updateDirectionButtons({});
            assert.equal(button.disabled, true);
            assert.equal(button.getAttribute('aria-label'), `${direction}, unavailable`);
        }
        assert.equal(Game.state.location, before);
    } finally { dom.window.close(); }
});

test('Look Around and compass agree on a diagonal-only room and a closed path', async () => {
    const {window, dom} = await createRuntime();
    try {
        const {Game, WorldData, document} = window;
        const room = {name:'Training ledge', description:'A narrow ledge.', exits:{southwest:'kaliwasch', up:'missing-room'}};
        WorldData.locations.training_ledge = room;
        Game.state.location = 'training_ledge';
        const messages = [];
        Game.addNarrative = text => messages.push(text);
        Game.updateDirectionButtons(room.exits);
        Game.processCommand('look around');
        const button = document.querySelector('.dir-btn[data-cmd="southwest"]');
        assert.equal(button.disabled,false);
        assert.equal(messages.at(-1), `Directions: ${button.getAttribute('aria-label')}.`);
        assert.equal(document.querySelector('.dir-btn[data-cmd="up"]').disabled,true);
        delete room.exits.southwest;
        Game.updateDirectionButtons(room.exits);
        Game.processCommand('look around');
        assert.equal(messages.at(-1),'No exits from here.');
        assert.equal(button.disabled,true);
        assert.equal(Game.state.location,'training_ledge');
    } finally { dom.window.close(); }
});

test('Where Am I counts real compass steps to reachable landmarks without moving', async () => {
    const {window,dom} = await createRuntime();
    try {
        const {Game,WorldData,CityDirectory} = window;
        const market = CityDirectory.cities[0].targets.marketplace;
        const rooms = WorldData.locations;
        rooms.ledge = {name:'Ledge', exits:{northeast:market, up:'missing'}};
        rooms[market].exits = {up:'forest', southwest:'ledge'};
        rooms.forest.exits = {};
        const lines=[];
        Game.addNarrative = text => lines.push(text);
        const inspect = id => {
            Game.state.location=id; Game.processCommand('where am i');
            assert.equal(Game.state.location,id);
            return lines.at(-1);
        };
        assert.equal(inspect('ledge'),`Nearby landmarks: ${rooms[market].name}: 1 step, start northeast; ${rooms.forest.name}: 2 steps, start northeast.`);
        assert.equal(inspect(market),`Nearby landmarks: ${rooms[market].name}: here; ${rooms.forest.name}: 1 step, start up.`);
        // A newly opened direct exit must replace the longer route, without
        // changing the first direction reported for the other landmark.
        rooms.ledge.exits.down = 'forest';
        assert.equal(inspect('ledge'),`Nearby landmarks: ${rooms[market].name}: 1 step, start northeast; ${rooms.forest.name}: 1 step, start down.`);
        delete rooms.ledge.exits.down;
        delete rooms.ledge.exits.northeast;
        assert.equal(inspect('ledge'),'No mapped landmark is reachable from here.');
    } finally {dom.window.close();}
});

test('story road follows real exits and its hold cancels an uncommitted step on release',async t=>{
    const {window:w,dom}=await createRuntime();t.after(()=>dom.window.close());
    const g=w.Game,d=w.document,rooms=w.WorldData.locations;
    g.state.player={name:'Walker'};g.state.screen='game-screen';g.state.location='kaliwasch';
    w.RoadWalking.bind(g);
    const target=d.querySelector('#road-target'),button=d.querySelector('#road-step');
    for(const option of target.options){
        target.value=option.value;
        const route=g.findPhysicalRoute(g.state.location,target.value);assert.ok(route?.length);
        let count=0;g.processCommand=dir=>{g.state.location=rooms[g.state.location].exits[dir];count++;};
        for(const _ of route)button.click();assert.equal(g.state.location,target.value);button.click();assert.equal(count,route.length);
    }
    const north=d.querySelector('[data-cmd="north"].dir-btn');north.disabled=false;
    let steps=0;g.processCommand=()=>{steps++;g._movementPending=true;};
    north.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0}));
    await new Promise(r=>setTimeout(r,550));assert.equal(steps,1);
    d.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true}));
    north.dispatchEvent(new w.MouseEvent('click',{bubbles:true,detail:1}));
    assert.equal(g._movementPending,false);assert.equal(steps,1,'release does not dispatch a click step');
});

test('opening the road atlas offers real regional and city destinations without traveling',async t=>{
    const {window:w,dom}=await createRuntime();t.after(()=>dom.window.close());
    const d=w.document,g=w.Game,origin=g.state.location;
    w.RoadWalking.bind(g);const road=d.querySelector('#story-road');road.open=true;road.dispatchEvent(new w.Event('toggle'));
    const groups=[...d.querySelectorAll('#road-target optgroup')];
    assert.ok(groups.some(group=>group.label==='Ironspire City'));assert.ok(groups.some(group=>group.label==='Regional waypoints'));
    for(const group of groups) for(const opt of group.children) assert.ok(w.WorldData.locations[opt.value]);
    assert.equal(g.state.location,origin);
    g.state.player={name:'Traveler'};g.state.visited=['kaliwasch'];g.save=()=>true;
    w.confirm=()=>false;d.querySelector('#road-rediscover').click();assert.equal(g.state.player.roadDiscoveries,undefined);
    w.confirm=()=>true;d.querySelector('#road-rediscover').click();assert.deepEqual([...g.state.player.roadDiscoveries],[]);assert.deepEqual([...g.state.visited],['kaliwasch']);
});
