/**
 * Tests for the Car Racing District (v28).
 * Covers world-graph integration, driving physics, AI opponents, collisions,
 * race rewards, dealership/upgrades, and save/load persistence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
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
