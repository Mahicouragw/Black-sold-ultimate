/**
 * Tests for the Car Racing District (v28).
 * Covers world-graph integration, driving physics, AI opponents, collisions,
 * race rewards, dealership/upgrades, and save/load persistence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadWorld, createRuntime } from '../scripts/load-world.mjs';

const CAR_IDS = [
  'car_racing_gate', 'car_racing_plaza', 'car_racing_garage', 'car_racing_storage',
  'car_racing_dealership', 'car_racing_practice', 'car_racing_pit',
  'car_track_1', 'car_track_2', 'car_track_3', 'car_track_4', 'car_track_5', 'car_track_6'
];
const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east', northeast: 'southwest', southwest: 'northeast', northwest: 'southeast', southeast: 'northwest', up: 'down', down: 'up' };

function fakePlayer(gold) {
  return { name: 'TestHero', gold, hp: 100, maxHp: 100, mp: 50, maxMp: 50, xp: 0, xpToNext: 100, level: 1, armor: 'Traveler Clothes', defense: 1, spells: ['Minor Heal'] };
}
function defaultRacing() {
  return {
    ownedCars: { starter_falcon: { name: 'Starter Falcon', condition: 100, upgrades: {} } },
    selectedCarId: 'starter_falcon',
    unlockedTracks: { car_track_1: true },
    bestTimes: {}, results: [], achievements: {},
    settings: { voiceGuidance: true, speedAnnounce: 'normal', assistSteering: true, announceOpponents: true },
    xp: 0, level: 1
  };
}

let worldFixture;
test.before(async () => { worldFixture = await loadWorld(); });

test('Car Racing District registers 13 reachable, reciprocal, safe locations', () => {
  const L = worldFixture.world.locations;
  for (const id of CAR_IDS) assert.ok(L[id], `missing ${id}`);
  const reachable = new Set(['kaliwasch']), q = ['kaliwasch'];
  while (q.length) {
    const cur = q.shift();
    for (const d of Object.values(L[cur]?.exits || {})) if (L[d] && !reachable.has(d)) { reachable.add(d); q.push(d); }
  }
  for (const id of CAR_IDS) {
    assert.ok(reachable.has(id), `${id} unreachable from kaliwasch`);
    assert.equal(L[id].safe, true, `${id} should be safe`);
    assert.equal(L[id].region, 'Car Racing District', `${id} region`);
    for (const [dir, dest] of Object.entries(L[id].exits || {})) {
      assert.equal(L[dest]?.exits?.[OPPOSITE[dir]], id, `${id}.${dir} reverse link`);
    }
  }
  // District entrance hangs off the existing city without disturbing Market Square.
  assert.equal(L.kaliwasch_district_16.exits.northwest, 'car_racing_gate');
  assert.deepEqual(Object.keys(L.kaliwasch.exits).sort(), ['east', 'north', 'south', 'west']);
});

test('driving simulation: acceleration, steering, braking, AI and collisions', async t => {
  const { window, dom } = await createRuntime();
  t.after(() => dom.window.close());
  const { Game, CarRacing } = window;
  try { window.HTMLCanvasElement.prototype.getContext = function () { return null; }; } catch {}
  Game.state.player = fakePlayer(5000);
  Game.state.racing = defaultRacing();
  Game.state.location = 'car_racing_pit';

  CarRacing.startDriving('race', 'car_track_1', 'easy');
  const sim = CarRacing.activeSim;
  assert.equal(sim.mode, 'race');
  assert.equal(sim.ai.length, 3, 'three AI opponents');
  sim.stop(); sim.engineOn = true; sim._raceStarted = true;

  sim.input.forward = true;
  for (let i = 0; i < 200; i++) sim.update(0.016);
  assert.ok(sim.speed > 5, `acceleration produced speed ${sim.speed.toFixed(1)}`);

  const h0 = sim.heading; sim.input.left = true;
  for (let i = 0; i < 60; i++) sim.update(0.016);
  assert.ok(sim.heading < h0, 'steering left should reduce heading');

  sim.input.left = false; sim.input.forward = false; sim.input.brake = true;
  const s0 = sim.speed;
  for (let i = 0; i < 60; i++) sim.update(0.016);
  assert.ok(sim.speed < s0, 'braking should reduce speed');
  sim.input.brake = false;

  // A head-on AI collision must damage the player's car.
  sim.condition = 100;
  const ai = sim.ai[0]; ai.finished = false;
  ai.px = sim.px; ai.py = sim.py; ai.speed = 20; sim.speed = 20;
  sim.update(0.016);
  assert.ok(sim.condition < 100, `collision should damage the car (condition ${sim.condition})`);

  CarRacing.exitDriving();
});

test('race finish grants gold, unlocks the next track and records results', async t => {
  const { window, dom } = await createRuntime();
  t.after(() => dom.window.close());
  const { Game, CarRacing } = window;
  try { window.HTMLCanvasElement.prototype.getContext = function () { return null; }; } catch {}
  Game.state.player = fakePlayer(1000);
  Game.state.racing = defaultRacing();

  CarRacing.startDriving('race', 'car_track_1', 'easy');
  const sim = CarRacing.activeSim;
  sim.stop(); sim.engineOn = true; sim._raceStarted = true;
  sim._finishPlayer();
  const gold0 = Game.state.player.gold;
  CarRacing.onRaceFinished(sim);

  assert.ok(Game.state.player.gold > gold0, 'first place earns gold');
  assert.equal(Game.state.racing.unlockedTracks.car_track_2, true, 'next track unlocked');
  assert.equal(Game.state.racing.results.length, 1, 'one result recorded');
  assert.ok(Game.state.racing.bestTimes['car_track_1:easy'] >= 0, 'best time recorded');
  CarRacing.exitDriving();
});

test('dealership purchase and upgrades change gold and car state', async t => {
  const { window, dom } = await createRuntime();
  t.after(() => dom.window.close());
  const { Game, CarRacing } = window;
  try { window.HTMLCanvasElement.prototype.getContext = function () { return null; }; } catch {}
  Game.state.player = fakePlayer(5000);
  Game.state.racing = defaultRacing();

  // Buy the Street Runner (500 gold).
  CarRacing._confirmPurchase({ id: 'street_runner', name: 'Street Runner', price: 500, free: false, blurb: 'Quick.', speed: 80, accel: 76, handling: 66, braking: 70, durability: 60 });
  window.document.getElementById('bsu-buy-confirm').click();
  assert.equal(Game.state.player.gold, 4500, 'gold deducted');
  assert.ok(Game.state.racing.ownedCars.street_runner, 'car owned');

  // Upgrade the starter falcon's engine.
  const gold0 = Game.state.player.gold;
  CarRacing.openUpgrades();
  window.document.querySelector('.bsu-car-panel [data-up="engine"]').click();
  assert.equal(Game.state.player.gold, gold0 - 120, 'upgrade cost deducted');
  assert.equal(Game.state.racing.ownedCars.starter_falcon.upgrades.engine, 1, 'engine level 1');
  window.document.getElementById('bsu-car-panel-close')?.click();
});

test('racing state persists across save and reload', async t => {
  const { window, dom } = await createRuntime();
  t.after(() => dom.window.close());
  const { Game } = window;
  Game.state.player = fakePlayer(4500);
  Game.state.racing = {
    ownedCars: {
      starter_falcon: { name: 'My Falcon', condition: 87, upgrades: { engine: 3 } },
      street_runner: { name: 'Street Runner', condition: 100, upgrades: {} }
    },
    selectedCarId: 'street_runner',
    unlockedTracks: { car_track_1: true, car_track_2: true },
    bestTimes: { 'car_track_1:easy': 42 },
    results: [{ trackName: 'Beginner Circuit', position: 1 }],
    achievements: {}, settings: { voiceGuidance: true }, xp: 30, level: 1
  };

  Game.save();
  Game.state.racing = null;
  Game.state.player = null;
  Game.continueGame();

  assert.ok(Game.state.racing, 'racing state restored');
  assert.equal(Game.state.racing.selectedCarId, 'street_runner');
  assert.equal(Game.state.racing.ownedCars.starter_falcon.upgrades.engine, 3);
  assert.equal(Game.state.racing.ownedCars.starter_falcon.condition, 87);
  assert.equal(Game.state.racing.bestTimes['car_track_1:easy'], 42);
  assert.equal(Game.state.racing.unlockedTracks.car_track_2, true);
});

test('accessible racing commands: accelerate, map, boost, pause, tutorial', async t => {
  const { window, dom } = await createRuntime();
  t.after(() => dom.window.close());
  const { Game, CarRacing } = window;
  try { window.HTMLCanvasElement.prototype.getContext = function () { return null; }; } catch {}
  Game.state.player = fakePlayer(500);
  Game.state.racing = defaultRacing();
  Game.state.location = 'car_racing_pit';
  CarRacing.startDriving('race', 'car_track_1', 'easy');
  const sim = CarRacing.activeSim;
  sim.stop(); sim.engineOn = true; sim._raceStarted = true;
  assert.equal(CarRacing.handleCommand('accelerate'), true);
  assert.equal(sim.input.forward, true);
  assert.equal(CarRacing.handleCommand('map'), true);
  assert.equal(CarRacing.handleCommand('boost'), true);
  assert.equal(sim.boostOn, true);
  assert.equal(CarRacing.handleCommand('position'), true);
  assert.equal(CarRacing.handleCommand('pause'), true);
  assert.equal(sim._paused, true);
  assert.equal(CarRacing.handleCommand('resume'), true);
  assert.equal(sim._paused, false);
  assert.equal(CarRacing.handleCommand('tutorial'), true);
  CarRacing.exitDriving();
});

test('racing audio uses bounded manager-owned recordings for RPM, terrain and discrete cues', async t => {
  const source = await readFile('car-racing-v28.js', 'utf8');
  assert.doesNotMatch(source, /createOscillator|getChannelData|new\s+Audio\s*\(|noiseBuffer|synth/i);
  const { window, dom } = await createRuntime();
  const { Game, CarRacing, MusicSystem } = window;
  t.after(() => { try { CarRacing.activeSim?.stop(); MusicSystem.pausePageAudio(); } catch {} dom.window.close(); });
  try { window.HTMLCanvasElement.prototype.getContext = function () { return null; }; } catch {}
  Game.state.player = fakePlayer(5000); Game.state.racing = defaultRacing(); Game.state.location = 'car_racing_pit';
  CarRacing.startDriving('practice');
  const sim = CarRacing.activeSim;
  window.cancelAnimationFrame(sim.raf); sim.raf = null;
  const audio = sim.audio;
  audio.engineOn = true; audio._startEngineLoops();
  // v7.55: the engine is two real car recordings (idle and high revs), cross-faded by RPM.
  assert.ok(audio._loops.get('engine-low').audio.src.endsWith('engine-idle.ogg'));
  assert.ok(audio._loops.get('engine-high').audio.src.endsWith('engine-rev.ogg'));
  audio.setEngineRpm(.75);
  assert.equal(audio._loops.get('engine-low').audio.playbackRate, 1.18);
  assert.ok(audio._loops.get('engine-high').audio.playbackRate > 1);
  audio.startTerrain('mud');
  assert.ok(audio._loops.get('terrain').audio.src.endsWith('step-mud.ogg'));
  for (let i = 0; i < 12; i++) audio._playLoop(`bound-${i}`, 'car-horn', .01, 1);
  assert.equal(MusicSystem.sfxLoopPool.length, 8);
  assert.equal(MusicSystem.activeSFXLoops.size, 8, 'loop ownership remains bounded');
  const effects = [];
  MusicSystem.playSFX = (type, options) => { effects.push({ type, channel: options.channel }); return true; };
  audio.collision(.5); audio.checkpoint(); audio.countdownBeep(false); audio.winJingle(); audio.loseJingle();
  audio.collision(.9); audio.gearShift();
  assert.deepEqual(effects.map(e => e.type), ['car-collision', 'race-checkpoint', 'race-beep', 'victory', 'death', 'car-crash', 'gear-shift']);
  assert.ok(effects.every(e => e.channel === audio.channel));
  audio.stopAll();
  assert.equal(MusicSystem.activeSFXLoops.size, 0);
});

/* ───────────── v7.55: controls, fuel and turn calls ───────────── */

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function practiceSim(t, gold = 500) {
  const { window, dom } = await createRuntime();
  const { Game, CarRacing, MusicSystem } = window;
  t.after(() => { try { CarRacing.exitDriving(); MusicSystem.pausePageAudio(); } catch {} dom.window.close(); });
  try { window.HTMLCanvasElement.prototype.getContext = function () { return null; }; } catch {}
  Game.state.player = fakePlayer(gold); Game.state.racing = defaultRacing(); Game.state.location = 'car_racing_pit';
  const said = [];
  Game.emitGameEvent = text => { said.push(String(text)); return Promise.resolve(true); };
  CarRacing.startDriving('practice');
  const sim = CarRacing.activeSim;
  window.cancelAnimationFrame(sim.raf); sim.raf = null;
  sim.engineOn = true;
  said.length = 0;
  return { window, Game, CarRacing, sim, said, doc: window.document };
}
const pointer = (window, type, props = {}) => Object.assign(new window.Event(type, { bubbles: true, cancelable: true }), { pointerId: 1, clientX: 0, clientY: 0 }, props);

test('recorded engine sounds are real car recordings with licence records, and the old files are gone', async () => {
  const manifest = JSON.parse(await readFile('assets/audio/audio-manifest.json', 'utf8'));
  const music = await readFile('music.js', 'utf8');
  for (const name of ['engine-idle.ogg', 'engine-rev.ogg', 'engine-start.ogg', 'engine-stop.ogg', 'gear-shift.ogg', 'car-crash.ogg', 'fuel-cap.ogg', 'fuel-pour.ogg']) {
    const record = manifest.assets.find(asset => asset.path === `assets/audio/sfx/${name}`);
    assert.ok(record, `${name} has a manifest record`);
    assert.equal(record.license, 'CC BY 4.0');
    assert.match(record.attribution, /Oculus Audio Pack 01/);
    assert.ok(music.includes(`assets/audio/sfx/${name}`), `${name} is wired into the audio manager`);
    assert.equal((await readFile(`assets/audio/sfx/${name}`)).subarray(0, 4).toString(), 'OggS');
  }
  for (const gone of ['engine-low.wav', 'engine-high.wav', 'car-start.mp3']) {
    assert.equal(manifest.assets.some(asset => asset.path.endsWith(gone)), false);
    assert.equal(music.includes(gone), false);
  }
});

test('Forward works by tap (screen reader activation): it keeps accelerating until tapped again; Brake releases it', async t => {
  const { sim, doc, said, window } = await practiceSim(t);
  const forward = doc.getElementById('bsu-car-forward');
  forward.click();                                  // what TalkBack / VoiceOver / Enter send: no pointer events at all
  assert.equal(sim.latch.forward, true);
  assert.equal(forward.getAttribute('aria-pressed'), 'true');
  assert.match(said.join('\n'), /Accelerating\. The car keeps accelerating until you tap Forward again or brake/);
  for (let i = 0; i < 60; i++) sim.update(0.05);
  assert.ok(sim.speed > 8, `the car accelerates without anything being held (speed ${sim.speed})`);
  forward.click();
  assert.equal(sim.latch.forward, false);
  assert.match(said.join('\n'), /Throttle released\. Coasting/);
  const coasting = sim.speed;
  for (let i = 0; i < 20; i++) sim.update(0.05);
  assert.ok(sim.speed < coasting, 'the car slows when the throttle is released');

  forward.click();
  doc.getElementById('bsu-car-brake').click();
  assert.equal(sim.latch.forward, false, 'braking always releases the accelerator');
  assert.equal(sim.input.brake, true);
  await wait(1300);
  assert.equal(sim.input.brake, false, 'a tapped brake is momentary');
  doc.getElementById('bsu-car-left').click();
  assert.equal(sim.input.left, true);
  await wait(650);
  assert.equal(sim.input.left, false);
  assert.equal(window.CarRacing.handleCommand('coast'), true);
});

test('Forward works by hold: active while held, released on lift, cancel or lost pointer, never stuck', async t => {
  const { sim, doc, window } = await practiceSim(t);
  const forward = doc.getElementById('bsu-car-forward');
  forward.dispatchEvent(pointer(window, 'pointerdown'));
  assert.equal(sim.input.forward, true);
  await wait(330);
  forward.dispatchEvent(pointer(window, 'pointerup'));
  assert.equal(sim.input.forward, false);
  assert.equal(sim.latch.forward, false, 'a hold does not latch');
  forward.dispatchEvent(pointer(window, 'pointerdown'));
  forward.dispatchEvent(pointer(window, 'pointercancel'));
  assert.equal(sim.input.forward, false, 'a cancelled touch releases the control');
  const left = doc.getElementById('bsu-car-left');
  left.dispatchEvent(pointer(window, 'pointerdown'));
  assert.equal(sim.input.left, true);
  left.dispatchEvent(pointer(window, 'lostpointercapture'));
  assert.equal(sim.input.left, false);
  // A quick touch is a tap: pointerdown, pointerup, then the browser's click must not double-toggle.
  forward.dispatchEvent(pointer(window, 'pointerdown'));
  forward.dispatchEvent(pointer(window, 'pointerup'));
  forward.click();
  assert.equal(sim.latch.forward, true, 'one tap latches once');
});

test('dragging on the track view steers in the dragged direction; swipe up accelerates, swipe down brakes', async t => {
  const { sim, doc, window } = await practiceSim(t);
  const canvas = doc.getElementById('bsu-car-canvas');
  sim.speed = 10;
  const before = sim.heading;
  canvas.dispatchEvent(pointer(window, 'pointerdown', { clientX: 200, clientY: 200 }));
  canvas.dispatchEvent(pointer(window, 'pointermove', { clientX: 110, clientY: 205 }));
  assert.equal(sim.swipeSteer, -1);
  for (let i = 0; i < 10; i++) { sim.speed = 10; sim.update(0.05); }
  assert.ok(sim.heading < before, 'dragging left turns the car left');
  // The Left button and a left drag agree.
  const dragged = sim.heading;
  canvas.dispatchEvent(pointer(window, 'pointerup'));
  assert.equal(sim.swipeSteer, 0, 'lifting the finger centres the wheel');
  sim.setInput('left', true);
  for (let i = 0; i < 10; i++) { sim.speed = 10; sim.update(0.05); }
  sim.setInput('left', false);
  assert.ok(sim.heading < dragged);

  canvas.dispatchEvent(pointer(window, 'pointerdown', { clientX: 200, clientY: 300 }));
  canvas.dispatchEvent(pointer(window, 'pointermove', { clientX: 203, clientY: 230 }));
  assert.equal(sim.latch.forward, true, 'swipe up accelerates');
  canvas.dispatchEvent(pointer(window, 'pointerup'));
  canvas.dispatchEvent(pointer(window, 'pointerdown', { clientX: 200, clientY: 200 }));
  canvas.dispatchEvent(pointer(window, 'pointermove', { clientX: 203, clientY: 270 }));
  assert.equal(sim.latch.forward, false);
  assert.equal(sim.input.brake, true, 'swipe down brakes while held');
  canvas.dispatchEvent(pointer(window, 'pointerup'));
  assert.equal(sim.input.brake, false);
});

test('fuel: drains while driving, warns at 25 and 10 percent, stops the engine at zero, and refuelling costs rupees', async t => {
  const { sim, said, Game, CarRacing } = await practiceSim(t, 500);
  assert.equal(sim.fuel, 100);
  sim.latch.forward = true;
  for (let i = 0; i < 200; i++) sim.update(0.05);                 // ten seconds of throttle
  assert.ok(sim.fuel < 100 && sim.fuel > 95, `fuel drains slowly (${sim.fuel})`);
  sim.fuel = 25.2;
  for (let i = 0; i < 40; i++) sim.update(0.05);
  assert.ok(said.some(line => /^Fuel low: 25 percent/.test(line)));
  sim.fuel = 10.2;
  for (let i = 0; i < 40; i++) sim.update(0.05);
  assert.ok(said.some(line => /^Fuel critical: 10 percent/.test(line)));
  assert.equal(said.filter(line => /^Fuel low/.test(line)).length, 1, 'each warning is spoken once');
  sim.fuel = 0.1;
  for (let i = 0; i < 40; i++) sim.update(0.05);
  assert.equal(sim.fuel, 0);
  assert.equal(sim.engineOn, false, 'the engine stops with an empty tank');
  assert.equal(sim.latch.forward, false);
  assert.ok(said.some(line => /^Out of fuel\. The engine has stopped/.test(line)));
  CarRacing.toggleEngine();
  assert.equal(sim.engineOn, false, 'the engine will not start without fuel');

  assert.equal(CarRacing.handleCommand('refuel'), true);
  await wait(3400);
  assert.equal(sim.fuel, 100);
  assert.equal(Game.state.player.gold, 400, 'one rupee per percent');
  assert.ok(said.some(line => /^Tank filled to 100 percent\. 100 rupees paid/.test(line)));
  assert.equal(Game.state.racing.ownedCars[sim.carId].fuel, 100, 'fuel is saved with the car');
  assert.equal(sim.refuel(), false, 'a full tank is not refilled');

  // No money: an emergency can, never a stranded driver.
  Game.state.player.gold = 0; sim.fuel = 0;
  sim.refuel();
  await wait(3400);
  assert.equal(sim.fuel, 15);
  assert.ok(said.some(line => /emergency can/.test(line)));
});

test('turn calls: about 500 m, 50 m and 30 m, then "turn now"; each once; and the side matches the steering', async t => {
  const { sim, said } = await practiceSim(t);
  // A rectangle: 800 m straight along +x, then a 90 degree corner. On the track
  // view y points down, so +x then +y is a turn to the driver's right.
  const corners = [[0, 0], [800, 0], [800, 400], [0, 400]], points = [];
  for (let c = 0; c < 4; c++) {
    const [ax, ay] = corners[c], [bx, by] = corners[(c + 1) % 4], steps = Math.round(Math.hypot(bx - ax, by - ay) / 25);
    for (let k = 0; k < steps; k++) points.push({ x: ax + (bx - ax) * k / steps, y: ay + (by - ay) * k / steps });
  }
  let cum = 0;
  points.forEach((p, i) => { p.cum = cum; const q = points[(i + 1) % points.length]; cum += Math.hypot(q.x - p.x, q.y - p.y); });
  sim.track = { points, total: cum, checkpoints: [0], cfg: { name: 'Test Rectangle', laps: 1, surface: 'asphalt' } };
  sim._turns = null; sim._turnCalls.clear();
  sim.px = 250; sim.py = 0; sim.heading = 0;

  const turn = sim.upcomingTurn();
  assert.equal(turn.side, 'right');
  assert.equal(turn.kind, 'sharp');
  assert.ok(Math.abs(turn.distance - 550) < 1);
  // Pressing Right must turn the car the way the call says.
  sim.speed = 10; sim.setInput('right', true); sim.update(0.05); sim.setInput('right', false);
  assert.ok(sim.heading > 0, 'Right increases the heading, which is what a "right" call needs');
  sim.heading = 0; sim.py = 0; sim.steer = 0;

  const drive = speed => {
    sim.px = 250; sim.py = 0; sim.heading = 0; sim._turnCalls.clear(); sim._g = null; sim._t += 60;
    said.length = 0;
    const calls = [];
    for (let i = 0; i < 4000 && sim.px < 797; i++) {
      sim.speed = speed; sim.heading = 0; sim.py = 0;
      const before = said.length;
      sim.update(0.02);
      for (const line of said.slice(before)) if (/turn|^\d+ meters/i.test(line)) calls.push({ line, distance: Math.round(800 - sim.px) });
    }
    return calls;
  };

  const slow = drive(10);
  assert.deepEqual(slow.map(c => c.line), [
    'In 500 meters, sharp right turn.',
    'Sharp right turn in 50 meters.',
    'Sharp right turn in 30 meters.',
    'Turn right now.'
  ]);
  assert.ok(slow[0].distance <= 520 && slow[0].distance >= 480, `first call near 500 m (${slow[0].distance})`);
  assert.ok(slow[1].distance <= 50 && slow[1].distance >= 46, `second call at 50 m (${slow[1].distance})`);
  assert.ok(slow[2].distance <= 30 && slow[2].distance >= 26, `third call at 30 m (${slow[2].distance})`);
  assert.ok(slow[3].distance <= 9 && slow[3].distance >= 5, `final call at the turn (${slow[3].distance})`);

  // At speed the driver is told to slow down, the 30 m call is shortened so it
  // finishes in time, and "turn now" comes earlier to leave time to react.
  const fast = drive(20);
  assert.deepEqual(fast.map(c => c.line), [
    'In 500 meters, sharp right turn.',
    'Sharp right turn in 50 meters. Slow down.',
    '30 meters.',
    'Turn right now.'
  ]);
  assert.ok(fast[2].distance <= 30 && fast[2].distance >= 25);
  assert.ok(fast[3].distance <= 9 && fast[3].distance >= 4);
});

test('every circuit is a smooth road and its turn zones name the side the driver must steer', async t => {
  const { CarRacing } = await practiceSim(t);
  for (const id of ['car_track_1', 'car_track_2', 'car_track_3', 'car_track_4', 'car_track_5', 'car_track_6']) {
    const track = CarRacing.buildTrack(id), pts = track.points, n = pts.length;
    const heading = i => Math.atan2(pts[(i + 1) % n].y - pts[i].y, pts[(i + 1) % n].x - pts[i].x);
    const bend = i => { let d = heading(i) - heading((i - 1 + n) % n); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d * 180 / Math.PI; };
    // No zigzag: neighbouring bends never flip between hard left and hard right.
    for (let i = 0; i < n; i++) { const a = bend(i), b = bend((i + 1) % n); assert.ok(a * b >= 0 || Math.min(Math.abs(a), Math.abs(b)) < 15, `${id} does not zigzag at point ${i} (${a.toFixed(0)}, ${b.toFixed(0)})`); }
    const zones = CarRacing.trackZones(track);
    assert.ok(zones.length >= 1, `${id} has turn zones`);
    for (const zone of zones) {
      // Positive bend = heading increases = what the Right control does.
      let total = 0;
      for (let k = 0, i = zone.start; k < n; k++, i = (i + 1) % n) { total += bend(i); if (i === zone.end) break; }
      assert.equal(zone.side, total > 0 ? 'right' : 'left', `${id} zone at ${zone.start}`);
      assert.ok(['slight', 'normal', 'sharp'].includes(zone.kind));
    }
    if (!['car_track_1', 'car_track_5'].includes(id)) assert.ok(zones.some(z => z.side === 'left' && z.kind !== 'slight') && zones.some(z => z.side === 'right' && z.kind !== 'slight'), `${id} has real turns both ways`);
  }
});

/* A "driver" who cannot see: it reacts only to the lines the game speaks.
 * No geometry, no screen. This is the test that the racing can be played by ear. */
async function driveByEar(t, trackId, cruise, mode = 'hold') {
  const { sim, said, CarRacing } = await practiceSim(t);
  sim.track = CarRacing.buildTrack(trackId);
  sim.restart();
  sim.engineOn = true;
  said.length = 0;
  let steer = 0, heard = 0, offRoad = 0, driven = 0, frames = 0, last = 0;
  const heardLines = [];
  while (driven < sim.track.total * 1.05 && frames < 60 * 600) {
    for (; heard < said.length; heard++) {
      const line = said[heard];
      heardLines.push(line);
      let m;
      if (mode === 'tap') {
        // A screen-reader user: one tap per instruction, nothing is ever held.
        if ((m = /^Turn (left|right) now|^Off the road\. Steer (left|right)\.$|^Back on the road\. Keep steering (left|right)/.exec(line))) CarRacing.tapControl(m[1] || m[2] || m[3]);
        continue;
      }
      if (/^Turn left now|^Keep steering left|Steer left\.$/.test(line)) steer = -1;
      else if (/^Turn right now|^Keep steering right|Steer right\.$/.test(line)) steer = 1;
      else if (/^Straighten up/.test(line)) steer = 0;
      else if ((m = /^Back on the road\. (Straighten up|Keep steering (left|right))/.exec(line))) steer = m[2] === 'left' ? -1 : m[2] === 'right' ? 1 : 0;
    }
    if (mode === 'hold') { sim.setInput('left', steer < 0); sim.setInput('right', steer > 0); }
    sim.latch.forward = sim.speed < cruise; if (sim.speed > cruise) sim.speed = cruise;
    sim.update(1 / 60); frames++;
    if (sim.distanceOffTrack(sim.px, sim.py) > 26) offRoad++;
    const progress = sim._progressAt(sim.px, sim.py);
    let step = progress - last; if (step < -sim.track.total / 2) step += sim.track.total; if (step > sim.track.total / 2) step -= sim.track.total;
    driven += step; last = progress;
  }
  return { sim, heardLines, lapDone: driven >= sim.track.total * 1.05, offRoadShare: offRoad / frames, seconds: frames / 60 };
}

const REAL_TURNS = ['car_track_2', 'car_track_3', 'car_track_4', 'car_track_6'];      // 1 and 5 are ovals of gentle bends
for (const [trackId, cruise, mode] of [['car_track_1', 14, 'hold'], ['car_track_2', 14, 'hold'], ['car_track_3', 14, 'tap'], ['car_track_4', 12, 'hold'], ['car_track_4', 12, 'tap'], ['car_track_5', 18, 'tap'], ['car_track_6', 18, 'hold'], ['car_track_6', 18, 'tap']]) {
  test(`${trackId} by ear (${mode}): following only the spoken calls completes a lap on the road`, async t => {
    const run = await driveByEar(t, trackId, cruise, mode);
    assert.equal(run.lapDone, true, `a full lap was driven by ear in ${run.seconds.toFixed(0)} s`);
    assert.ok(run.offRoadShare < 0.08, `off the road ${(run.offRoadShare * 100).toFixed(1)}% of the time`);
    if (REAL_TURNS.includes(trackId)) {
      assert.ok(run.heardLines.some(line => /^Turn right now/.test(line)) && run.heardLines.some(line => /^Turn left now/.test(line)));
      assert.ok(run.heardLines.filter(line => /in 50 meters/.test(line)).length >= 4, '50 m calls were made');
      assert.ok(run.heardLines.filter(line => /in 30 meters|^30 meters/.test(line)).length >= 4, '30 m calls were made');
    }
    // The narrator is not flooded: well under one line per second on average.
    assert.ok(run.heardLines.length / run.seconds < 0.75, `${run.heardLines.length} lines in ${run.seconds.toFixed(0)} s`);
  });
}

test('steering assist: ignoring a real turn runs the car off the road, and steering the wrong way does too', async t => {
  const ignore = async wrongWay => {
    const { sim, said, CarRacing } = await practiceSim(t);
    sim.track = CarRacing.buildTrack('car_track_6');
    sim.restart(); sim.engineOn = true; said.length = 0;
    let worst = 0;
    for (let i = 0; i < 60 * 40; i++) {
      const zone = sim.currentTurn();
      sim.setInput('left', false); sim.setInput('right', false);
      if (wrongWay && zone) sim.setInput(zone.side === 'right' ? 'left' : 'right', true);
      sim.latch.forward = sim.speed < 14; if (sim.speed > 14) sim.speed = 14;
      sim.update(1 / 60);
      worst = Math.max(worst, sim.distanceOffTrack(sim.px, sim.py));
    }
    return { worst, said };
  };
  const passive = await ignore(false);
  assert.ok(passive.worst > 26, `a driver who never steers leaves the road (${passive.worst.toFixed(0)} m from centre)`);
  assert.ok(passive.said.some(line => /^Off the road\. Steer (left|right)\.$/.test(line)), 'and is told which way to steer back');
  const wrong = await ignore(true);
  assert.ok(wrong.worst > 26);
});
