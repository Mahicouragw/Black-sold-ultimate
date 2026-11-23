import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

/* 7.63.0 — the game is played online only. Without a connection it must say so,
 * pause every input path, keep the hero untouched, and reopen by itself when
 * the connection returns. */

async function ready(t) {
    const r = await createRuntime(); t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window, G = w.Game;
    w.OnlineSystem.saveGame = async () => true;
    w.OnlineSystem.syncActiveHero = () => {};
    G.startNewHero();
    w.document.getElementById('char-name').value = 'Online Hero';
    w.document.querySelector('[data-race="human"]').classList.add('selected');
    w.document.querySelector('[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    const setOnline = value => Object.defineProperty(w.navigator, 'onLine', { value, configurable: true });
    setOnline(true);
    if (w.OnlineRequired.blocked) w.OnlineRequired.check();
    return { w, G, setOnline };
}

const panel = w => w.document.getElementById('online-required');

test('going offline opens a spoken dialog and pauses the game', async t => {
    const { w, G, setOnline } = await ready(t);
    setOnline(false);
    w.dispatchEvent(new w.Event('offline'));
    await wait(20);
    const box = panel(w);
    assert.ok(box, 'the dialog exists');
    assert.equal(box.getAttribute('role'), 'alertdialog');
    assert.equal(box.getAttribute('aria-modal'), 'true');
    assert.equal(box.style.display, 'flex', 'the dialog is visible');
    assert.equal(w.OnlineRequired.blocked, true);
    assert.ok(G.state.player, 'the hero is still loaded');
    // Typed input and movement are refused, with the reason spoken.
    assert.equal(G.processCommand('look'), false);
    assert.equal(G.move('north'), false);
    assert.equal(G.castSpell('minor heal'), false);
});

test('an offline save never overwrites the hero', async t => {
    const { w, G, setOnline } = await ready(t);
    G.save();
    const before = w.localStorage.getItem(G.state.saveKey);
    setOnline(false);
    w.dispatchEvent(new w.Event('offline'));
    await wait(20);
    G.state.player.hp = 1;
    assert.equal(G.save(), false, 'the save waits instead of writing');
    assert.equal(w.localStorage.getItem(G.state.saveKey), before);
});

test('the connection returning closes the dialog and lets the player play', async t => {
    const { w, G, setOnline } = await ready(t);
    setOnline(false);
    w.dispatchEvent(new w.Event('offline'));
    await wait(20);
    assert.equal(w.OnlineRequired.blocked, true);
    setOnline(true);
    w.dispatchEvent(new w.Event('online'));
    await wait(20);
    assert.equal(w.OnlineRequired.blocked, false);
    assert.equal(panel(w).style.display, 'none');
    assert.ok(G.processCommand('look') !== false, 'commands work again');
});

test('the dialog has one focusable Retry button and stays offline if nothing changed', async t => {
    const { w, setOnline } = await ready(t);
    setOnline(false);
    w.OnlineRequired.check();
    const retry = panel(w).querySelector('#online-required-retry');
    assert.ok(retry, 'a Retry button exists');
    assert.equal(panel(w).querySelectorAll('button').length, 1, 'only one choice');
    retry.click();
    await wait(120);
    assert.equal(w.OnlineRequired.blocked, true, 'still offline, still closed');
    assert.equal(w.document.activeElement?.id, 'online-required-retry', 'focus stays on the only choice');
});

test('the retry button reopens the game once the connection is back', async t => {
    const { w, setOnline } = await ready(t);
    setOnline(false);
    w.OnlineRequired.check();
    assert.equal(w.OnlineRequired.blocked, true);
    setOnline(true);
    panel(w).querySelector('#online-required-retry').click();
    await wait(20);
    assert.equal(w.OnlineRequired.blocked, false);
});

test('a hero can be played normally while online', async t => {
    const { w, G } = await ready(t);
    assert.equal(w.OnlineRequired.blocked, false);
    G.processCommand('look');
    await wait(10);
    assert.match(w.document.getElementById('narrative').textContent, /\S/);
});
