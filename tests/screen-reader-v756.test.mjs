// v7.56 — what a screen reader (TalkBack, VoiceOver) hears when menus, panels,
// location actions and screens change. These run the real page in jsdom and
// assert on focus, accessible names and the status region, which is what a
// screen reader reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRuntime } from '../scripts/load-world.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const lines = window => [...window.document.querySelectorAll('#narrative p')].map(node => node.textContent);

async function liveGame(t) {
    const runtime = await createRuntime();
    t.after(() => runtime.dom.window.close());
    const { window } = runtime, { Game } = window;
    window.OnlineSystem.saveGame = async () => true;
    window.OnlineSystem.syncActiveHero = () => {};
    window.OnlineSystem.dropWorldItem = async () => false;
    window.OnlineSystem.init = () => {};
    Game.init();
    Game.startNewHero();
    window.document.getElementById('char-name').value = 'Asha';
    window.document.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    window.document.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    Game.createCharacter(false);
    window.InterfaceMode.apply('sighted');
    await wait(900);                                   // let the first "Actions here" announcement pass
    const D = window.document;
    return {
        window, D, G: Game, N: window.Narration, SR: window.ScreenReader,
        said: () => D.getElementById('sr-announcer').textContent,
        focused: () => D.activeElement,
        heard: () => D.activeElement?.getAttribute('aria-label') || D.activeElement?.textContent.trim() || '',
        button: command => D.querySelector(`.action-btn[data-cmd="${command}"]`)
    };
}

test('the status region for screen readers is in the page before any script runs', () => {
    const html = readFileSync('index.html', 'utf8');
    assert.match(html, /<div id="sr-announcer" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"><\/div>/);
    assert.ok(html.indexOf('id="sr-announcer"') < html.indexOf('<script src="version.js">'), 'the region must exist before content is put into it');
    assert.match(html, /<script defer src="screen-reader-v756\.js"><\/script>/);
    for (const file of ['service-worker.js', 'sw.js']) assert.match(readFileSync(file, 'utf8'), /'screen-reader-v756\.js'/, `${file} must cache the module for offline play`);
});

for (const [command, panelId, pattern] of [
    ['inventory', 'inventory-panel', /^Inventory\. \d+ kinds? of items?\./],
    ['stats', 'stats-panel', /^Character stats\. Level 1\. Health \d+ of \d+\. Magic \d+ of \d+\. \d+ rupees\./],
    ['map', 'city-directory-panel', /^City directory\. \d+ places to choose from\./],
    ['quests', 'quests-panel', /^Quests\. (\d+ quests?|No quests yet)\./],
    ['settings', 'settings-panel', /^Settings\./]
]) {
    test(`pressing the ${command} button moves the screen reader into the panel and says what opened`, async t => {
        const { D, button, focused, heard, said } = await liveGame(t);
        const opener = button(command);
        assert.ok(opener, `the ${command} button exists`);
        opener.focus(); opener.click();
        await wait(150);

        const panel = D.getElementById(panelId);
        assert.equal(panel.classList.contains('hidden'), false, 'the panel is open');
        assert.ok(panel.getAttribute('role'), 'the panel has a role');
        assert.ok(panel.getAttribute('aria-label') || panel.getAttribute('aria-labelledby'), 'the panel has a name');
        assert.ok(panel.contains(focused()), 'focus is inside the panel, not left on the button');
        assert.match(focused().tagName, /^H[2-4]$/, 'focus is on the panel heading');
        assert.match(heard(), pattern);
        assert.match(heard(), /Swipe right to read it\. The Close button is at the end\.$/);

        panel.querySelector('.close-btn').click();
        await wait(500);
        assert.equal(focused(), opener, 'closing returns to the button that opened the panel');
        assert.match(said(), /closed\.$/);
        assert.equal(panel.querySelector('h2,h3,h4').getAttribute('aria-label'), null, 'the heading goes back to its own short name');
    });
}

test('a typed command keeps the cursor in the command box and announces the panel instead', async t => {
    const { D, G, focused, said } = await liveGame(t);
    const input = D.getElementById('cmd-input');
    input.focus();
    input.dispatchEvent(new D.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    G.processCommand('inventory');
    await wait(200);
    assert.equal(focused(), input, 'the cursor stays where the player is typing');
    assert.match(said(), /^Inventory\. \d+ kinds? of items?\./);
    G.closePanels();
    await wait(500);
    assert.equal(focused(), input);
    assert.equal(said(), 'Inventory closed.');
});

test('escape closes a panel, says so, and never throws focus away', async t => {
    const { D, button, focused, said } = await liveGame(t);
    const opener = button('stats');
    opener.focus(); opener.click();
    await wait(150);
    D.dispatchEvent(new D.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(500);
    assert.equal(D.getElementById('stats-panel').classList.contains('hidden'), true);
    assert.equal(focused(), opener);
    assert.equal(said(), 'Character stats closed.');
});

test('going from one panel straight to another announces the new one once, with no "closed" in between', async t => {
    const { D, G, SR, button, focused, heard } = await liveGame(t);
    const opener = button('inventory');
    opener.focus(); opener.click();
    await wait(150);
    const before = SR.history.length;
    G.closePanels(); G.showStats();
    await wait(450);
    assert.ok(D.getElementById('stats-panel').contains(focused()));
    assert.match(heard(), /^Character stats\./);
    assert.equal(SR.history.slice(before).some(line => /closed/.test(line)), false);
    // and closing the second panel still returns to the original button
    G.closePanels();
    await wait(500);
    assert.equal(focused(), opener);
});

test('a shop: the heading gives the count and the money, every Buy button names its item, and buying keeps focus', async t => {
    const { D, G, focused, heard } = await liveGame(t);
    G.state.location = 'kaliwasch_palace_armory'; G.state.player.gold = 5000;
    G.updateContextActions();
    await wait(100);
    const open = [...D.querySelectorAll('#context-actions button')].find(b => /open shop/i.test(b.textContent));
    assert.ok(open, 'the armory offers an Open Shop action');
    open.focus();
    G.showShop();                                       // what the button's handler calls
    await wait(200);
    assert.match(heard(), /^Shop\. \d+ things for sale\. You have 5000 rupees\./);

    const buys = [...D.querySelectorAll('#shop-panel .shop-item-card button')].filter(b => /^Buy/.test(b.textContent));
    assert.ok(buys.length > 5);
    for (const buy of buys) assert.match(buy.getAttribute('aria-label'), /^Buy: .+/, 'each Buy button says what it buys');
    assert.equal(new Set(buys.map(b => b.getAttribute('aria-label'))).size, buys.length, 'no two Buy buttons sound the same');

    const first = buys[0], name = first.getAttribute('aria-label');
    first.focus();
    await G.buyShopQuantity(name.replace(/^Buy: /, '').toLowerCase());
    await wait(300);
    assert.equal(first.isConnected, false, 'the shop redraws after a purchase');
    assert.ok(D.getElementById('shop-panel').contains(focused()), 'focus is still in the shop');
    assert.equal(focused().getAttribute('aria-label'), name, 'on the same Buy button');
    assert.ok(lines(D.defaultView).some(line => /^Bought 1 /.test(line)), 'and the purchase is spoken through the story log');
});

test('item rows that carry buttons get the item name on each button', async t => {
    const { D, button } = await liveGame(t);
    button('inventory').click();
    await wait(150);
    // The row layout game.js draws for an item that can be used and sold.
    const row = D.createElement('div');
    row.className = 'inv-item';
    row.innerHTML = '<span>Healing Potion <small>potion</small></span><span>x2 <button>Use</button><button>Sell</button><button aria-label="Look closely at the potion">Examine</button></span>';
    D.getElementById('inv-list').appendChild(row);
    await wait(120);
    const [use, sell, examine] = row.querySelectorAll('button');
    assert.equal(use.getAttribute('aria-label'), 'Use: Healing Potion');
    assert.equal(sell.getAttribute('aria-label'), 'Sell: Healing Potion');
    assert.equal(examine.getAttribute('aria-label'), 'Look closely at the potion', 'a name that is already there is kept');
});

test('location actions are announced when they change, once, and not again while they stay the same', async t => {
    const { G, SR, said } = await liveGame(t);
    G.state.location = 'grand_temple';
    G.updateContextActions();
    await wait(900);
    assert.match(said(), /^Actions here: .*Pray/);
    const count = SR.history.length;
    G.updateContextActions(); G.updateContextActions();
    await wait(900);
    assert.equal(SR.history.length, count, 'redrawing the same actions is silent');
});

test('pressing an action that is replaced by choices puts focus on the first choice', async t => {
    const { D, G, focused } = await liveGame(t);
    G.state.location = 'grand_temple';
    G.updateContextActions();
    await wait(900);
    const pray = [...D.querySelectorAll('#context-actions button')].find(b => /^Pray$/.test(b.textContent.trim()));
    assert.ok(pray);
    pray.focus();
    G.showPrayerChoices();                              // what the Pray button does in a temple
    await wait(100);
    assert.equal(pray.isConnected, false, 'the Pray button was replaced');
    const choices = [...D.querySelectorAll('#context-actions button')];
    assert.ok(choices.length >= 4);
    assert.equal(focused(), choices[0], 'focus is on the first prayer choice, not lost');
    assert.ok(lines(D.defaultView).some(line => /What would you like to pray about/.test(line)), 'and the question is spoken through the story log');
});

test('the location action box is a named group and no longer a live region of its own', async t => {
    const { D } = await liveGame(t);
    const box = D.getElementById('context-actions');
    assert.equal(box.getAttribute('role'), 'group');
    assert.equal(box.getAttribute('aria-label'), 'Location actions');
    assert.equal(box.getAttribute('aria-live'), 'off');
});

test('changing screen moves the screen reader to the new screen heading', async t => {
    const { D, G, focused } = await liveGame(t);
    G.showScreen('help-screen');
    await wait(30);
    assert.equal(focused(), D.querySelector('#help-screen h1, #help-screen h2, #help-screen h3'));
    assert.match(focused().textContent, /How to Play/);
});

test('the counters at the top and the music button have spoken names', async t => {
    const { D, G } = await liveGame(t);
    const p = G.state.player;
    p.hp = 40; p.gold = 321; G.updateHUD();
    const label = id => D.getElementById(id).closest('.stat').getAttribute('aria-label');
    assert.equal(label('hp'), `Health 40 of ${p.maxHp}`);
    assert.match(label('mp'), /^Magic \d+ of \d+$/);
    assert.match(label('xp'), /^Experience \d+ of \d+$/);
    assert.equal(label('gold'), '321 rupees');
    assert.equal(D.getElementById('btn-hud-music').getAttribute('aria-label'), 'Music on or off');
});

test('modal dialogs keep their own focus handling and still return focus when they close', async t => {
    const { D, SR, focused } = await liveGame(t);
    const opener = D.getElementById('btn-look-around');
    opener.focus();
    const dialog = D.getElementById('heal-target-panel');
    const before = SR.history.length;
    dialog.classList.remove('hidden');
    await wait(200);
    assert.ok(dialog.contains(focused()), 'accessible-dialogs.js moved focus into the dialog');
    assert.equal(D.getElementById('sr-announcer').getAttribute('aria-hidden'), null, 'the status region is never hidden behind a dialog');
    assert.notEqual(D.getElementById('sr-announcer').inert, true);
    dialog.classList.add('hidden');
    await wait(450);
    assert.equal(focused(), opener);
    assert.equal(SR.history.length, before, 'no second announcement on top of the dialog');
});

test('the Game Hall gets focus and a name, and its own voice is not doubled', async t => {
    const { D, window, focused, heard } = await liveGame(t);
    const spoken = [];
    const play = window.AudioManager.playVoice.bind(window.AudioManager);
    window.AudioManager.playVoice = (text, options) => { spoken.push(String(text)); return play(text, options); };
    const opener = D.getElementById('btn-look-around');
    opener.focus();
    // The hall scripts are not part of the shared test runtime; this is the panel game-hall.js builds.
    const panel = D.createElement('div');
    panel.id = 'game-hall-panel'; panel.className = 'panel hidden wide-panel';
    panel.innerHTML = '<h3>Accessible Game Hall</h3><div id="hall-status" role="log" aria-live="assertive"></div><button class="menu-btn close-btn">Close</button>';
    D.getElementById('game-screen').appendChild(panel);
    await wait(100);
    panel.classList.remove('hidden');
    await wait(200);
    assert.equal(panel.classList.contains('hidden'), false);
    assert.ok(panel.contains(focused()), 'focus moved into the hall');
    assert.match(heard(), /^Game Hall\./);
    assert.equal(spoken.some(text => /^Game Hall\. /.test(text)), false, 'the hall speaks its own events; no extra game-voice line');
    panel.classList.add('hidden');
    await wait(450);
    assert.equal(focused(), opener);
});

test('with the built-in voice switched off, gesture menus are handed to the screen reader', async t => {
    const { window, said } = await liveGame(t);
    const { UI, settings } = window.GestureAccessibility;
    UI.enable();
    settings.narration = false;
    await wait(200);
    UI.open('Test menu', [{ label: 'First', run() {} }, { label: 'Second', run() {} }]);
    await wait(200);
    assert.match(said(), /^Test menu\. 2 options\./);
    assert.match(said(), /1\. First\. 2\. Second\./, 'the title and the options arrive as one announcement');
    UI.browse(1);
    await wait(200);
    assert.equal(said(), 'Second');
});

test('with the built-in voice on, gesture menus use that voice and not the status region', async t => {
    const { window, SR } = await liveGame(t);
    const { UI, settings } = window.GestureAccessibility;
    UI.enable();
    await wait(200);
    assert.equal(settings.narration, true);
    const before = SR.history.length;
    UI.open('Test menu', [{ label: 'First', run() {} }]);
    await wait(200);
    assert.equal(SR.history.slice(before).some(line => /Test menu/.test(line)), false, 'no double speech');
});

test('the same announcement twice in a row is delivered twice', async t => {
    const { D, SR } = await liveGame(t);
    const region = D.getElementById('sr-announcer'), seen = [];
    new D.defaultView.MutationObserver(() => { if (region.textContent) seen.push(region.textContent); }).observe(region, { childList: true, characterData: true, subtree: true });
    SR.announce('Hello there.');
    await wait(200);
    SR.announce('Hello there.');
    await wait(200);
    assert.equal(seen.filter(text => text === 'Hello there.').length, 2);
});

test('panel announcements follow the chosen language', async t => {
    const { D, N, button, heard, said } = await liveGame(t);
    N.setLang('te');
    const opener = button('inventory');
    opener.focus(); opener.click();
    await wait(150);
    assert.match(heard(), /^సంచి\./);
    assert.match(heard(), /కుడివైపు స్వైప్/);
    D.querySelector('#inventory-panel .close-btn').click();
    await wait(500);
    assert.equal(said(), 'సంచి మూసుకుంది.');

    N.setLang('hi');
    opener.focus(); opener.click();
    await wait(150);
    assert.match(heard(), /^थैला।|^थैला\./);
    N.setLang('en');
});

test('every new line exists in English, Telugu and Hindi', async t => {
    const { N } = await liveGame(t);
    const source = readFileSync('screen-reader-v756.js', 'utf8');
    const keys = [...source.matchAll(/'(sr\.[a-zA-Z0-9.]+)':/g)].map(match => match[1]);
    assert.ok(keys.length >= 40);
    for (const key of keys) {
        const en = N.t(key, {}, 'en'), te = N.t(key, {}, 'te'), hi = N.t(key, {}, 'hi');
        assert.ok(en && te && hi, key);
        assert.match(te, /[\u0C00-\u0C7F]/, `${key} has Telugu text`);
        assert.match(hi, /[\u0900-\u097F]/, `${key} has Hindi text`);
    }
});
