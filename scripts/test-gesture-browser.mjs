// Optional real Chromium touch smoke. Install playwright-core and @sparticuz/chromium
// without saving dependencies, or supply CHROMIUM_PATH for an installed browser.
import assert from 'node:assert/strict';
import { chromium as playwright } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const browser = await playwright.launch({ executablePath: process.env.CHROMIUM_PATH || await chromium.executablePath(), args: chromium.args, headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 800, height: 1000 }, hasTouch: true, isMobile: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    // External identity/cloud providers are unavailable in this sandbox. No game
    // scripts, gesture events, movement, or combat functions are replaced.
    await page.route('https://**', r => r.abort());
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:3000/');
    await page.locator('#gesture-launch').tap();
    assert.equal(await page.locator('#gesture-heading').textContent(), 'Welcome');
    await page.evaluate(() => {
        OnlineSystem.saveGame = async () => true; OnlineSystem.syncActiveHero = () => {};
        Game.startNewHero(); document.getElementById('char-name').value = 'Touch Browser Hero';
        document.querySelector('[data-race="human"]').classList.add('selected');
        document.querySelector('[data-class="warrior"]').classList.add('selected');
        Game.createCharacter(false); GestureAccessibility.UI.close(); Game.closePanels();
    });
    const client = await page.context().newCDPSession(page);
    const box = await page.locator('#gesture-pad').boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const touch = (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, px, py]) => ({ id, x: px, y: py })) });
    const swipe = async (dx, dy, hold = 0) => {
        await touch('touchStart', [[1, x, y]]); await touch('touchMove', [[1, x + dx, y + dy]]);
        if (hold) await page.waitForTimeout(hold);
        await touch('touchEnd', []);
    };
    await swipe(0, -100); await page.waitForFunction(() => Game.state.location === 'kaliwasch_district_3');
    assert.equal(await page.evaluate(() => Game.state.location), 'kaliwasch_district_3');
    await swipe(0, 100, 1900); // walk south, then release while next step may be pending
    const stopped = await page.evaluate(() => Game.state.location);
    assert.equal(stopped, 'kaliwasch_district_27', 'hold commits more than one real southward step');
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => Game.state.location), stopped);
    assert.equal(await page.evaluate(() => Game._movementPending), false);
    // Two-finger tap is one inventory action, not a pair of world taps.
    await touch('touchStart', [[1, x - 30, y], [2, x + 30, y]]); await touch('touchEnd', []);
    assert.match(await page.locator('#gesture-heading').textContent(), /Inventory/);
    // Two-finger swipe is a fixed cancellation, independent of remapping.
    await touch('touchStart', [[1, x - 30, y], [2, x + 30, y]]);
    await touch('touchMove', [[1, x - 30, y + 100], [2, x + 30, y + 100]]); await touch('touchEnd', []);
    await page.locator('#gesture-all').tap();
    assert.ok(await page.evaluate(() => GestureAccessibility.UI.menu.choices.length > 1));
    await page.evaluate(() => InterfaceMode.apply('sighted'));
    assert.equal(await page.locator('#gesture-interface').isVisible(), false);
    assert.equal(await page.locator('#cmd-input').isVisible(), true);
    await page.locator('#gesture-launch').tap();
    assert.equal(await page.locator('#gesture-interface').isVisible(), true);
    // Actual synthesis may error in a headless Linux image with no voices. Check
    // that the UI reports it, never infer audible speech from a resolved call.
    const speech = await page.locator('#gesture-speech-status').textContent();
    assert.deepEqual(errors, []);
    console.log('PASS: real page, user-activated launcher, native touch swipe, hold/release, two-finger inventory/cancel, mode switching, no uncaught page errors.');
    console.log('Speech status (not an audible Android verification): ' + speech);
} finally { await browser.close(); }
