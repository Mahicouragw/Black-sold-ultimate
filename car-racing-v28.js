/**
 * v28 — Car Racing District for Black Sword Ultimate.
 *
 * A fully-integrated, accessible (TalkBack/blind-first) car-racing area added to
 * the existing open-world RPG. Reuses the game's WorldData map/navigation,
 * gold (rupees) currency, save system, MusicSystem audio manager and
 * emitGameEvent TTS so nothing is duplicated.
 *
 * What's here:
 *   - 13 new world locations (Car Racing District) reachable by walking
 *     northwest from Kaliwasch District 16, or via waystone
 *     "travel to car racing".
 *   - A real driving simulation (acceleration, steering, braking, reverse,
 *     traction, gears/clutch, handbrake, collisions, vehicle condition).
 *   - An accessible driving mode with track-aware turn guidance, wrong-way
 *     detection, opponent announcements and status readouts.
 *   - A synthesized racing audio engine (engine RPM, doors, horn, brakes,
 *     reverse beeper, collisions, countdown, checkpoints, terrain, ambience)
 *     built with the Web Audio API — no external files, so it is license-clean
 *     by construction (documented in AUDIO_CREDITS.md).
 *   - AI opponent cars with 4 difficulty levels, checkpoints, laps, positions,
 *     rewards (gold + XP), garage, dealership, upgrades and persistence.
 */

(function () {
  'use strict';

  const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'up', 'down'];
  const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east', northeast: 'southwest', southwest: 'northeast', northwest: 'southeast', southeast: 'northwest', up: 'down', down: 'up' };

  /* =====================================================================
   * 1. WORLD REGISTRATION (Car Racing District)
   * =================================================================== */

  const REGION = 'Car Racing District';

  function addLoc(id, def) {
    const WD = window.WorldData;
    if (!WD || !WD.locations) return;
    if (WD.locations[id]) return; // never clobber an existing location
    const exits = def.exits || {};
    const exitMetadata = {};
    for (const d of Object.keys(exits)) exitMetadata[d] = { kind: 'district-road', reciprocal: true };
    const loc = {
      id,
      name: def.name,
      region: REGION,
      description: def.description,
      exits,
      features: def.features || [],
      items: def.items || [],
      enemies: [],
      safe: true,
      music: 'CITY',
      locationType: def.locationType || 'racing district',
      musicContext: 'CITY',
      musicContexts: ['CITY'],
      accessibleDescription: `${def.name}. ${def.description}`,
      coordinates: def.coordinates || { x: 0, y: 0, z: 0 },
      exitMetadata
    };
    WD.locations[id] = loc;
    return id;
  }

  function registerWorld() {
    const WD = window.WorldData;
    if (!WD || !WD.locations) return;

    addLoc('car_racing_gate', {
      name: 'Car Racing District — Grand Entrance',
      description: 'You have entered the Car Racing District. Engines roar in the distance, and the smell of fuel and hot rubber fills the air. A wide avenue stretches ahead toward the central racing ground.',
      exits: { southeast: 'kaliwasch_district_16', west: 'car_racing_plaza' },
      features: ['district gate', 'waystone', 'racing banners', 'grandstand in the distance'],
      locationType: 'racing district',
      coordinates: { x: 0, y: 0, z: 0 }
    });
    addLoc('car_racing_plaza', {
      name: 'Car Racing District — Central Plaza',
      description: 'A large racing ground opens before you, ringed by grandstands and bright banners. The garage stands to the north, the car dealership to the northeast, the practice track to the west, and the main race track and pit area to the south.',
      exits: { east: 'car_racing_gate', north: 'car_racing_garage', northeast: 'car_racing_dealership', west: 'car_racing_practice', south: 'car_racing_pit' },
      features: ['racing ground', 'grandstands', 'announcement board', 'crowd'],
      locationType: 'racing district',
      coordinates: { x: 12, y: 0, z: 0 }
    });
    addLoc('car_racing_garage', {
      name: 'Racing Garage',
      description: 'A cluttered workshop smelling of oil and grease. Tool racks line the walls and a mechanic works on a stripped-down engine block. This is where you keep, repair and upgrade your cars.',
      exits: { south: 'car_racing_plaza', up: 'car_racing_storage' },
      features: ['tool rack', 'engine lift', 'workbench', 'mechanic'],
      locationType: 'garage',
      coordinates: { x: 12, y: 12, z: 0 }
    });
    addLoc('car_racing_storage', {
      name: 'Car Storage Vault',
      description: 'A cool, secure vault where your owned vehicles are stored. Each bay holds a car under a soft cover. This is your personal collection.',
      exits: { down: 'car_racing_garage' },
      features: ['vehicle bays', 'storage lift', 'car covers'],
      locationType: 'storage',
      coordinates: { x: 12, y: 12, z: 1 }
    });
    addLoc('car_racing_dealership', {
      name: 'Car Dealership',
      description: 'A gleaming showroom of polished vehicles under bright lights. A dealer stands ready to describe each car and sell you the one you want.',
      exits: { southwest: 'car_racing_plaza' },
      features: ['showroom floor', 'new cars', 'dealer', 'price board'],
      locationType: 'dealership',
      coordinates: { x: 24, y: 12, z: 0 }
    });
    addLoc('car_racing_practice', {
      name: 'Practice Track',
      description: 'A wide open practice circuit with soft barriers. No races, no penalties — just you and the car. The perfect place to learn to drive.',
      exits: { east: 'car_racing_plaza' },
      features: ['practice circuit', 'soft barriers', 'timing board'],
      locationType: 'racetrack',
      coordinates: { x: 0, y: 0, z: 0 }
    });
    addLoc('car_racing_pit', {
      name: 'Racing Ground — Pit & Starting Area',
      description: 'The bustling pit area where races begin. Pit crews wave you in, and six race tracks branch off from here. The beginner circuit lies south, with five more tracks around it.',
      exits: { north: 'car_racing_plaza', south: 'car_track_1', east: 'car_track_2', west: 'car_track_3', southeast: 'car_track_4', southwest: 'car_track_5', northeast: 'car_track_6' },
      features: ['starting grid', 'pit lane', 'fuel pump', 'race organizer'],
      locationType: 'racetrack',
      coordinates: { x: 12, y: -12, z: 0 }
    });

    const trackDefs = [
      ['car_track_1', 'Race Track 1 — Beginner Circuit', 'south', 'A gentle oval circuit with wide, forgiving corners. The perfect first race for a new driver.', { x: 12, y: -24, z: 0 }],
      ['car_track_2', 'Race Track 2 — City Circuit', 'east', 'A tight circuit that weaves between concrete barriers like city streets. Precision matters here.', { x: 24, y: -12, z: 0 }],
      ['car_track_3', 'Race Track 3 — Forest Circuit', 'west', 'A winding circuit through dense trees. Dappled light, dirt shoulders and sharp turns.', { x: 0, y: -12, z: 0 }],
      ['car_track_4', 'Race Track 4 — Mountain Circuit', 'southeast', 'A steep, twisting climb with hairpin bends and dramatic drops. The most technical track in the district.', { x: 24, y: -24, z: 0 }],
      ['car_track_5', 'Race Track 5 — Night Circuit', 'southwest', 'A fast circuit under floodlights with long straights and sweeping corners. High speeds, low grip when it is cold.', { x: 0, y: -24, z: 0 }],
      ['car_track_6', 'Race Track 6 — Championship Circuit', 'northeast', 'The grand championship circuit. A demanding mix of every turn type. Only unlocked drivers race here.', { x: 12, y: -36, z: 0 }]
    ];
    trackDefs.forEach(([id, name, back, desc, coords]) => {
      // 'back' is the pit -> track direction; the track returns via OPPOSITE[back].
      addLoc(id, {
        name, description: desc,
        exits: { [OPPOSITE[back]]: 'car_racing_pit' },
        features: ['race track', 'starting line', 'checkpoints', 'grandstands'],
        locationType: 'racetrack',
        coordinates: coords
      });
      const pit = window.WorldData.locations.car_racing_pit;
      if (pit) { pit.exits[back] = id; pit.exitMetadata[back] = { kind: 'district-road', reciprocal: true }; }
    });

    // Connect the district entrance to the existing world: walk northwest from
    // Kaliwasch District 16 (Mage Quarter) to reach the Car Racing District.
    const gateBack = window.WorldData.locations.kaliwasch_district_16;
    if (gateBack && !gateBack.exits.northwest) {
      gateBack.exits.northwest = 'car_racing_gate';
      gateBack.exitMetadata = gateBack.exitMetadata || {};
      gateBack.exitMetadata.northwest = { kind: 'district-road', reciprocal: true };
    }

    // Racing NPCs
    WD.npcs = WD.npcs || {};
    WD.npcs.car_racing_garage = [
      { name: 'Mechanic Torque', role: 'mechanic', dialog: ['Welcome to the racing garage.', 'Pick a car, and I can repair or upgrade it for you.', 'Keep your condition high and your lap times will drop.'] },
      { name: 'Garage Owner Vara', role: 'garage owner', dialog: ['This garage is yours to use.', 'Select your car here and it will be ready whenever you return.', 'Every new driver gets a free starter car.'] }
    ];
    WD.npcs.car_racing_dealership = [
      { name: 'Dealer Jinx', role: 'dealer', dialog: ['Welcome to the dealership.', 'I have several fine cars for sale — listen to each one.', 'Tell me what you want to buy and I will name the price.'] }
    ];
    WD.npcs.car_racing_plaza = [
      { name: 'Race Organizer Petra', role: 'race organizer', dialog: ['Ready for your first race?', 'Finish races to earn coins and unlock new tracks.', 'The beginner circuit is a good place to start.'] }
    ];
    WD.npcs.car_racing_gate = [
      { name: 'District Guide', role: 'guide', dialog: ['Welcome to the Car Racing District.', 'The garage is north, the dealership northeast, the practice track west, and the race tracks south.', 'Type "drive" to get behind the wheel.'] }
    ];
  }

  /* =====================================================================
   * 2. CAR CATALOG, UPGRADES, TRACKS
   * =================================================================== */

  const CAR_CATALOG = [
    { id: 'starter_falcon', name: 'Starter Falcon', price: 0, free: true, tier: 1, blurb: 'A dependable all-rounder. Your first car is free.', speed: 62, accel: 60, handling: 78, braking: 72, traction: 72, durability: 80, weight: 1200, color: '#d8a23a' },
    { id: 'street_runner', name: 'Street Runner', price: 500, tier: 2, blurb: 'Quick and light for the city circuits.', speed: 80, accel: 76, handling: 66, braking: 70, traction: 64, durability: 60, weight: 1050, color: '#3a86ff' },
    { id: 'rally_beast', name: 'Rally Beast', price: 900, tier: 3, blurb: 'Sticks to any surface. Built for rough tracks.', speed: 72, accel: 72, handling: 80, braking: 76, traction: 92, durability: 74, weight: 1250, color: '#e05a33' },
    { id: 'iron_wagon', name: 'Iron Wagon', price: 1200, tier: 3, blurb: 'Slow to move, nearly impossible to break.', speed: 58, accel: 50, handling: 62, braking: 66, traction: 80, durability: 95, weight: 2100, color: '#6b7280' },
    { id: 'thunder_gt', name: 'Thunder GT', price: 1500, tier: 4, blurb: 'Blistering top speed, but it fights you in the corners.', speed: 93, accel: 84, handling: 54, braking: 72, traction: 56, durability: 55, weight: 980, color: '#b5179e' },
    { id: 'night_phantom', name: 'Night Phantom', price: 3000, tier: 5, blurb: 'The championship machine. Fast, precise, balanced.', speed: 88, accel: 82, handling: 82, braking: 84, traction: 78, durability: 72, weight: 1150, color: '#2b2d42' }
  ];

  const UPGRADE_DEFS = [
    { key: 'engine', name: 'Engine', cost: 120, effect: { accel: 4, speed: 2 }, desc: 'More power and top speed.' },
    { key: 'brakes', name: 'Brakes', cost: 90, effect: { braking: 5 }, desc: 'Stops harder and later.' },
    { key: 'tires', name: 'Tires', cost: 90, effect: { traction: 4, handling: 2 }, desc: 'More grip in every corner.' },
    { key: 'handling', name: 'Handling', cost: 100, effect: { handling: 5 }, desc: 'Sharper, more responsive steering.' },
    { key: 'suspension', name: 'Suspension', cost: 110, effect: { handling: 3, traction: 2 }, desc: 'Keeps the car stable over bumps.' },
    { key: 'transmission', name: 'Transmission', cost: 130, effect: { accel: 3, speed: 1 }, desc: 'Smoother, faster gear changes.' },
    { key: 'durability', name: 'Durability', cost: 100, effect: { durability: 6 }, desc: 'Takes hits without falling apart.' }
  ];
  const MAX_UPGRADE_LEVEL = 5;

  // Difficulty profiles for AI opponents.
  const DIFFICULTY = {
    easy:   { label: 'Easy',   skill: 0.72, topSpeed: 0.78, cornering: 0.75, rewardMult: 1 },
    normal: { label: 'Normal', skill: 0.86, topSpeed: 0.90, cornering: 0.88, rewardMult: 1.5 },
    hard:   { label: 'Hard',   skill: 0.95, topSpeed: 1.00, cornering: 0.96, rewardMult: 2 },
    expert: { label: 'Expert', skill: 1.04, topSpeed: 1.08, cornering: 1.05, rewardMult: 3 }
  };

  // Track procedural shapes: baseRadius, lobes, sharpness, jitter, surface, laps.
  const TRACK_CONFIGS = {
    car_track_1: { name: 'Beginner Circuit', laps: 2, surface: 'asphalt', baseRadius: 260, lobes: 0, sharpness: 0, jitter: 0.06, seed: 101, reward: 60, unlock: 1 },
    car_track_2: { name: 'City Circuit', laps: 3, surface: 'asphalt', baseRadius: 210, lobes: 3, sharpness: 0.22, jitter: 0.10, seed: 202, reward: 120, unlock: 2 },
    car_track_3: { name: 'Forest Circuit', laps: 2, surface: 'dirt', baseRadius: 240, lobes: 4, sharpness: 0.30, jitter: 0.12, seed: 303, reward: 200, unlock: 3 },
    car_track_4: { name: 'Mountain Circuit', laps: 2, surface: 'gravel', baseRadius: 200, lobes: 5, sharpness: 0.40, jitter: 0.14, seed: 404, reward: 320, unlock: 4 },
    car_track_5: { name: 'Night Circuit', laps: 3, surface: 'asphalt', baseRadius: 300, lobes: 2, sharpness: 0.16, jitter: 0.08, seed: 505, reward: 450, unlock: 5 },
    car_track_6: { name: 'Championship Circuit', laps: 3, surface: 'asphalt', baseRadius: 260, lobes: 6, sharpness: 0.34, jitter: 0.10, seed: 606, reward: 800, unlock: 6 }
  };

  function buildTrackPoints(trackId) {
    const cfg = TRACK_CONFIGS[trackId] || TRACK_CONFIGS.car_track_1;
    const n = 60;
    let s = cfg.seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const r = cfg.baseRadius * (1 + cfg.sharpness * Math.sin(cfg.lobes * t + cfg.seed * 0.37) + (rnd() - 0.5) * cfg.jitter * 2);
      pts.push({ x: Math.cos(t) * r, y: Math.sin(t) * r });
    }
    // cumulative distances along the loop
    let cum = 0;
    for (let i = 0; i < n; i++) {
      pts[i].cum = cum;
      const j = (i + 1) % n;
      cum += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
    }
    const total = cum;
    const checkpoints = [];
    const cpCount = 6;
    for (let k = 0; k < cpCount; k++) checkpoints.push((total / cpCount) * k);
    return { points: pts, total, checkpoints, cfg };
  }

  /* =====================================================================
   * 3. SAVE-STATE HELPERS (persisted through Game.save)
   * =================================================================== */

  function defaultRacingState() {
    return {
      ownedCars: {
        starter_falcon: { name: 'Starter Falcon', condition: 100, upgrades: {} }
      },
      selectedCarId: 'starter_falcon',
      unlockedTracks: { car_track_1: true },
      bestTimes: {},
      results: [],
      achievements: {},
      settings: { voiceGuidance: true, speedAnnounce: 'normal', assistSteering: true, announceOpponents: true },
      xp: 0,
      level: 1
    };
  }

  function ensureState() {
    const G = window.Game;
    if (!G) return defaultRacingState();
    if (!G.state.racing) G.state.racing = defaultRacingState();
    return G.state.racing;
  }

  function persist() {
    try { window.Game?.save?.(); } catch (e) {}
  }

  // Computes effective stats for a car instance (catalog + upgrades).
  function computeStats(carId) {
    const rs = ensureState();
    const base = CAR_CATALOG.find(c => c.id === carId) || CAR_CATALOG[0];
    const instance = rs.ownedCars[carId] || {};
    const upgrades = instance.upgrades || {};
    const stats = { ...base };
    for (const u of UPGRADE_DEFS) {
      const lvl = Math.min(MAX_UPGRADE_LEVEL, Number(upgrades[u.key] || 0));
      for (const [stat, amt] of Object.entries(u.effect)) stats[stat] += amt * lvl;
    }
    stats.condition = Number.isFinite(instance.condition) ? instance.condition : 100;
    stats.name = instance.name || base.name;
    return stats;
  }

  // Physics constants derived from 0-100 stats.
  function physicsFrom(stats) {
    const condFactor = stats.condition <= 0 ? 0 : (stats.condition < 25 ? 0.55 : stats.condition < 50 ? 0.8 : 1);
    return {
      maxSpeed: (18 + stats.speed * 0.42) * condFactor,       // m/s
      accel: (3.5 + stats.accel * 0.13) * condFactor,          // m/s^2
      braking: (7 + stats.braking * 0.22) * condFactor,        // m/s^2
      reverseMax: 9 * condFactor,
      turnRate: 1.1 + stats.handling * 0.03,                   // rad/s at low speed
      grip: 0.35 + stats.traction * 0.012,
      drag: 0.28
    };
  }

  /* =====================================================================
   * 4. ANNOUNCE (centralised TTS with priority & dedup)
   * =================================================================== */

  function say(text, opts = {}) {
    const G = window.Game;
    if (G && typeof G.emitGameEvent === 'function') {
      return G.emitGameEvent(text, 'system', { critical: !!opts.critical, eventId: opts.eventId || '' });
    }
    if (G && typeof G.announceForBlind === 'function') { G.announceForBlind(text); return Promise.resolve(true); }
    return Promise.resolve(false);
  }

  /* =====================================================================
   * 5. RACING AUDIO ENGINE (procedural Web Audio — license-clean)
   * =================================================================== */

  class RacingAudio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.engine = null;      // {osc, sub, filter, gain}
      this.engineOn = false;
      this.terrain = null;     // noise loop + filter + gain
      this.terrainType = 'asphalt';
      this._noiseBuf = null;
      this._enabled = true;
    }
    _unlock() {
      if (this._enabled === false) return false;
      if (this.ctx) { if (this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} } return true; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this._enabled = false; return false; }
        const ctx = new AC();
        // Feature-detect the methods we rely on so a limited/restricted audio
        // environment degrades silently instead of throwing mid-drive.
        if (typeof ctx.createOscillator !== 'function' || typeof ctx.createBuffer !== 'function' || typeof ctx.createGain !== 'function' || typeof ctx.createBiquadFilter !== 'function') {
          this._enabled = false; return false;
        }
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = 0.85;
        this.master.connect(ctx.destination);
        return true;
      } catch (e) { this._enabled = false; return false; }
    }
    _noise() {
      if (!this._noiseBuf) {
        const len = this.ctx.sampleRate * 2;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this._noiseBuf = buf;
      }
      return this._noiseBuf;
    }
    _noiseSource() {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noise();
      src.loop = true;
      return src;
    }
    _buildEngine() {
      const c = this.ctx;
      this.engine = {};
      this.engine.osc = c.createOscillator(); this.engine.osc.type = 'sawtooth';
      this.engine.sub = c.createOscillator(); this.engine.sub.type = 'square';
      this.engine.filter = c.createBiquadFilter(); this.engine.filter.type = 'lowpass'; this.engine.filter.frequency.value = 400;
      this.engine.gain = c.createGain(); this.engine.gain.value = 0;
      this.engine.osc.connect(this.engine.filter);
      this.engine.sub.connect(this.engine.filter);
      this.engine.filter.connect(this.engine.gain);
      this.engine.gain.connect(this.master);
      this.engine.osc.start();
      this.engine.sub.start();
      this.engineOn = true;
    }
    setEngineRpm(rpm) { // rpm 0..1
      if (!this.engine || !this.engineOn) return;
      const c = this.ctx, t = c.currentTime;
      const f = 52 + rpm * 340;
      this.engine.osc.frequency.setTargetAtTime(f, t, 0.05);
      this.engine.sub.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      this.engine.filter.frequency.setTargetAtTime(280 + rpm * 2800, t, 0.08);
      this.engine.gain.gain.setTargetAtTime(0.10 + rpm * 0.22, t, 0.08);
    }
    // Full ignition sequence: click -> starter motor -> idle.
    startEngineSequence(onDone) {
      if (!this._unlock() || !this.ctx) { onDone && onDone(); return; }
      const c = this.ctx, t = c.currentTime;
      this._buildEngine();
      this.setEngineRpm(0);
      // ignition click
      this._blip(1200, 0.06, t, 0.05);
      // starter motor: rising saw + noise for ~700ms
      const s = c.createOscillator(); s.type = 'sawtooth'; s.frequency.setValueAtTime(60, t); s.frequency.linearRampToValueAtTime(220, t + 0.7);
      const sg = c.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.16, t + 0.15); sg.gain.linearRampToValueAtTime(0.0001, t + 0.72);
      s.connect(sg); sg.connect(this.master); s.start(t); s.stop(t + 0.75);
      const nz = this._noiseSource(); const ng = c.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.08, t + 0.2); ng.gain.linearRampToValueAtTime(0.0001, t + 0.7);
      nz.connect(ng); ng.connect(this.master); nz.start(t); nz.stop(t + 0.75);
      // settle into idle
      const idleT = t + 0.75;
      this.setEngineRpm(0.16);
      setTimeout(() => { this.setEngineRpm(0.16); }, 850);
      setTimeout(() => onDone && onDone(), 800);
    }
    stopEngineSequence(onDone) {
      if (!this.ctx || !this.engine) { onDone && onDone(); return; }
      const c = this.ctx, t = c.currentTime;
      this.setEngineRpm(0.04);
      setTimeout(() => {
        try {
          this.engine.gain.gain.setTargetAtTime(0, c.currentTime, 0.3);
          const e = this.engine;
          setTimeout(() => { try { e.osc.stop(); e.sub.stop(); } catch (er) {} }, 700);
        } catch (e) {}
        this.engineOn = false;
        onDone && onDone();
      }, 350);
    }
    _blip(freq, dur, when, vol) {
      const c = this.ctx, o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(vol, when + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g); g.connect(this.master); o.start(when); o.stop(when + dur + 0.05);
    }
    horn(on) {
      if (!this._unlock() || !this.ctx) return;
      if (this._hornNodes) { this._hornStop(); if (!on) return; }
      if (!on) return;
      const c = this.ctx, t = c.currentTime;
      const o1 = c.createOscillator(); o1.type = 'square'; o1.frequency.value = 420;
      const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 530;
      const g = c.createGain(); g.gain.value = 0.07;
      o1.connect(g); o2.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      this._hornNodes = { o1, o2, g };
    }
    _hornStop() {
      if (!this._hornNodes) return;
      try { this._hornNodes.o1.stop(); this._hornNodes.o2.stop(); } catch (e) {}
      this._hornNodes = null;
    }
    brake(on) {
      if (!this._unlock() || !this.ctx) return;
      if (on && this._brakeNodes) return;
      if (!on) { this._brakeStop(); return; }
      const c = this.ctx;
      const nz = this._noiseSource(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.8;
      const g = c.createGain(); g.gain.value = 0.05;
      nz.connect(f); f.connect(g); g.connect(this.master); nz.start();
      this._brakeNodes = { nz, g };
    }
    _brakeStop() { if (this._brakeNodes) { try { this._brakeNodes.nz.stop(); } catch (e) {} this._brakeNodes = null; } }
    reverseBeep(on) {
      if (!this._unlock() || !this.ctx) return;
      if (this._revNodes) { this._revStop(); if (!on) return; }
      if (!on) return;
      const c = this.ctx;
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1000;
      const g = c.createGain(); g.gain.value = 0.0001;
      o.connect(g); g.connect(this.master); o.start();
      // pulsing
      const pulse = () => { const t = c.currentTime; g.gain.setValueAtTime(0.06, t); g.gain.setValueAtTime(0.0001, t + 0.18); };
      pulse(); this._revTimer = setInterval(pulse, 380);
      this._revNodes = { o, g };
    }
    _revStop() { if (this._revTimer) clearInterval(this._revTimer); this._revTimer = null; if (this._revNodes) { try { this._revNodes.o.stop(); } catch (e) {} this._revNodes = null; } }
    collision(intensity) {
      if (!this._unlock() || !this.ctx) return;
      const c = this.ctx, t = c.currentTime;
      const nz = this._noiseSource(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = c.createGain(); g.gain.setValueAtTime(Math.min(0.7, 0.15 + intensity * 0.4), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      nz.connect(f); f.connect(g); g.connect(this.master); nz.start(t); nz.stop(t + 0.35);
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
      const og = c.createGain(); og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.32);
    }
    skid(on) {
      if (!this._unlock() || !this.ctx) return;
      if (on && this._skidNodes) return;
      if (!on) { this._skidStop(); return; }
      const c = this.ctx;
      const nz = this._noiseSource(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 2;
      const g = c.createGain(); g.gain.value = 0.04;
      nz.connect(f); f.connect(g); g.connect(this.master); nz.start();
      this._skidNodes = { nz, g };
    }
    _skidStop() { if (this._skidNodes) { try { this._skidNodes.nz.stop(); } catch (e) {} this._skidNodes = null; } }
    // Door sequence: unlock click -> door open -> door close thud. Synthesized.
    doorSequence(onDone) {
      if (!this._unlock() || !this.ctx) { onDone && onDone(); return; }
      const t = this.ctx.currentTime;
      this._blip(1400, 0.05, t, 0.08);        // unlock click
      this._blip(120, 0.16, t + 0.22, 0.3);   // door open
      this._blip(95, 0.2, t + 0.75, 0.38);    // door close thud
      setTimeout(() => onDone && onDone(), 1000);
    }
    checkpoint() { if (!this._unlock() || !this.ctx) return; const t = this.ctx.currentTime; this._blip(880, 0.14, t, 0.12); this._blip(1320, 0.2, t + 0.13, 0.12); }
    countdownBeep(final) { if (!this._unlock() || !this.ctx) return; const t = this.ctx.currentTime; this._blip(final ? 988 : 494, final ? 0.5 : 0.18, t, 0.16); }
    winJingle() { if (!this._unlock() || !this.ctx) return; const t = this.ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => this._blip(f, 0.3, t + i * 0.14, 0.14)); }
    loseJingle() { if (!this._unlock() || !this.ctx) return; const t = this.ctx.currentTime; [400, 340, 280].forEach((f, i) => this._blip(f, 0.3, t + i * 0.16, 0.13)); }
    // Terrain rolling noise loop (surface changes the filter character)
    startTerrain(surface) {
      if (!this._unlock() || !this.ctx) return;
      this.terrainType = surface || 'asphalt';
      if (!this.terrain) {
        const c = this.ctx;
        this.terrain = {};
        this.terrain.src = this._noiseSource();
        this.terrain.filter = c.createBiquadFilter(); this.terrain.filter.type = 'lowpass';
        this.terrain.gain = c.createGain(); this.terrain.gain.value = 0.0;
        this.terrain.src.connect(this.terrain.filter); this.terrain.filter.connect(this.terrain.gain); this.terrain.gain.connect(this.master);
        this.terrain.src.start();
      }
      const f = { asphalt: 900, dirt: 500, grass: 350, gravel: 1500, mud: 260, metal: 2200 }[this.terrainType] || 900;
      this.terrain.filter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.3);
    }
    setTerrainVolume(v) { if (this.terrain) this.terrain.gain.gain.setTargetAtTime(Math.max(0, Math.min(0.12, v)), this.ctx.currentTime, 0.1); }
    stopAll() {
      this._hornStop(); this._brakeStop(); this._revStop(); this._skidStop();
      if (this.engine) { try { this.engine.osc.stop(); this.engine.sub.stop(); } catch (e) {} this.engine = null; this.engineOn = false; }
      if (this.terrain) { try { this.terrain.src.stop(); } catch (e) {} this.terrain = null; }
    }
  }

  /* =====================================================================
   * 6. DRIVING SIMULATION
   * =================================================================== */

  class DrivingSim {
    constructor(opts) {
      this.mode = opts.mode || 'practice'; // 'practice' | 'race'
      this.trackId = opts.trackId || null;
      this.difficulty = opts.difficulty || 'normal';
      this.carId = ensureState().selectedCarId || 'starter_falcon';
      this.stats = computeStats(this.carId);
      this.physics = physicsFrom(this.stats);

      this.track = null;
      if (this.mode === 'race' && this.trackId) {
        this.track = buildTrackPoints(this.trackId);
      } else {
        // practice: a big open loop
        this.track = buildTrackPoints('car_track_1');
        this.track.cfg.surface = 'asphalt';
      }

      // player state
      this.px = this.track.points[0].x;
      this.py = this.track.points[0].y;
      this.heading = Math.atan2(this.track.points[1].y - this.track.points[0].y, this.track.points[1].x - this.track.points[0].x);
      this.speed = 0; // m/s along heading (signed: + forward, - reverse)
      this.steer = 0; this.throttle = 0; this.brakeOn = false; this.clutch = false; this.handbrake = false;
      this.gear = 1;
      this.rpm = 0;
      this.engineOn = false;
      this.condition = this.stats.condition;
      this.disabled = false;

      // race progress
      this.lap = 0;
      this.nextCp = 0;
      this.progress = 0;   // distance along track
      this.lastProgress = 0;
      this.wrongWayTimer = 0;
      this.correctWayTimer = 0;
      this.finished = false;
      this.position = 1;
      this.ai = [];

      // announcement throttles
      this._lastTurnAnnounce = '';
      this._lastTurnAnnounceAt = 0;
      this._lastSpeedAnnounce = 0;
      this._lastOpponentAnnounce = 0;
      this._lastDamageAnnounce = 0;
      this._lastCollisionAnnounce = 0;
      this._lastCpAnnounced = -1;
      this._paused = false;
      this._t = 0;

      // controls input snapshot
      this.input = { forward: false, back: false, left: false, right: false, brake: false, handbrake: false, clutch: false };

      this.audio = new RacingAudio();
      this.raf = null;
      this.lastTs = 0;
      this.lapsTotal = this.track.cfg.laps;
      this._setupAI();
    }

    _setupAI() {
      if (this.mode !== 'race') return;
      const diff = DIFFICULTY[this.difficulty] || DIFFICULTY.normal;
      const count = 3;
      const colors = ['#ef476f', '#06d6a0', '#ffd166'];
      const carPool = ['street_runner', 'rally_beast', 'thunder_gt'];
      for (let i = 0; i < count; i++) {
        const baseId = carPool[i % carPool.length];
        const base = CAR_CATALOG.find(c => c.id === baseId) || CAR_CATALOG[0];
        const start = this.track.points[(i + 1) * 8 % this.track.points.length];
        this.ai.push({
          name: base.name,
          color: colors[i],
          px: start.x + (i - 1) * 6, py: start.y,
          heading: 0, speed: 0,
          progress: this._progressAt(start.x, start.y) + (i + 1) * 14,
          lap: 0, nextCp: 0,
          maxSpeed: this.physics.maxSpeed * diff.topSpeed * (0.82 + i * 0.06),
          accel: this.physics.accel * (0.9 + i * 0.05),
          skill: diff.skill,
          finished: false, finishOrder: 0
        });
      }
    }

    // nearest point on track + progress
    nearestIndex(x, y) {
      const pts = this.track.points; let best = 0, bd = Infinity;
      for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i].x - x, pts[i].y - y); if (d < bd) { bd = d; best = i; } }
      return best;
    }
    _progressAt(x, y) {
      const pts = this.track.points, n = pts.length;
      let best = 0, bd = Infinity, bestSeg = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        // distance to segment
        const ax = pts[i].x, ay = pts[i].y, bx = pts[j].x, by = pts[j].y;
        const abx = bx - ax, aby = by - ay;
        const len2 = abx * abx + aby * aby || 1;
        let t = ((x - ax) * abx + (y - ay) * aby) / len2; t = Math.max(0, Math.min(1, t));
        const cx = ax + abx * t, cy = ay + aby * t;
        const d = Math.hypot(cx - x, cy - y);
        if (d < bd) { bd = d; best = i; bestSeg = t; }
      }
      const j = (best + 1) % n;
      return pts[best].cum + bestSeg * (pts[j].cum >= pts[best].cum ? (pts[j].cum - pts[best].cum) : (this.track.total - pts[best].cum + pts[j].cum));
    }
    distanceOffTrack(x, y) {
      const i = this.nearestIndex(x, y);
      return Math.hypot(this.track.points[i].x - x, this.track.points[i].y - y);
    }

    start() {
      this.audio.startTerrain(this.track.cfg.surface);
      this.lastTs = performance.now();
      const loop = (ts) => {
        const dt = Math.min(0.05, (ts - this.lastTs) / 1000); this.lastTs = ts;
        if (!this._paused && !this.disabled) this.update(dt);
        this.render();
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.audio.stopAll();
    }

    setInput(kind, on) { if (kind in this.input) this.input[kind] = on; }

    // One physics step.
    update(dt) {
      this._t += dt;
      const p = this.physics;
      const inp = this.input;

      // --- steering (flips when reversing) ---
      let steerDir = 0;
      if (inp.left) steerDir -= 1;
      if (inp.right) steerDir += 1;
      this.steer += (steerDir - this.steer) * Math.min(1, dt * 10); // smoothing

      // --- assist steering (accessible mode): gently pull toward track centerline ---
      let assist = 0;
      if (this.mode === 'race' && ensureState().settings.assistSteering && this.speed > 1) {
        const i = this.nearestIndex(this.px, this.py);
        const j = (i + 1) % this.track.points.length;
        const ax = this.track.points[i].x, ay = this.track.points[i].y, bx = this.track.points[j].x, by = this.track.points[j].y;
        // signed offset from the segment
        const abx = bx - ax, aby = by - ay, len = Math.hypot(abx, aby) || 1;
        const nx = -aby / len, ny = abx / len;
        const off = (this.px - ax) * nx + (this.py - ay) * ny;
        assist = Math.max(-0.6, Math.min(0.6, -off * 0.02));
      }

      // --- longitudinal ---
      let accelInput = 0;
      if (this.engineOn && !this.clutch) {
        if (inp.forward) accelInput = 1;
        else if (inp.back) accelInput = -1;
      }
      if (inp.brake) {
        if (this.speed > 0.2) { this.speed = Math.max(0, this.speed - p.braking * dt); this.audio.brake(true); }
        else if (this.speed < -0.2) { this.speed = Math.min(0, this.speed + p.braking * dt); this.audio.brake(true); }
        else this.speed = 0;
      } else {
        this.audio.brake(false);
      }
      if (this.handbrake) { this.speed = Math.max(0, this.speed - p.braking * 1.4 * dt); }

      if (accelInput > 0) this.speed = Math.min(p.maxSpeed, this.speed + p.accel * accelInput * dt);
      else if (accelInput < 0) this.speed = Math.max(-p.reverseMax, this.speed - p.accel * 0.6 * dt);
      else {
        // coast with drag
        if (this.speed > 0) this.speed = Math.max(0, this.speed - p.drag * dt);
        else if (this.speed < 0) this.speed = Math.min(0, this.speed + p.drag * dt);
      }

      // --- gear & rpm ---
      const absSpeed = Math.abs(this.speed);
      this.gear = Math.max(1, Math.min(5, Math.floor(absSpeed / (p.maxSpeed / 5)) + 1));
      if (this.engineOn) {
        const speedRpm = (absSpeed / p.maxSpeed);
        const clutchRpm = this.clutch || accelInput > 0 ? 0.85 : speedRpm * 0.9 + 0.12;
        this.rpm = Math.max(0.12, Math.min(1, clutchRpm));
        this.audio.setEngineRpm(this.rpm);
      } else {
        this.rpm = Math.max(0, this.rpm - dt * 1.5);
        if (this.rpm > 0) this.audio.setEngineRpm(this.rpm);
      }

      // --- turn ---
      const speedFactor = Math.max(0.25, 1 - (absSpeed / p.maxSpeed) * 0.75);
      const directionSign = this.speed < -0.5 ? -1 : 1;
      const gripLimit = p.grip * (absSpeed > 14 ? 0.7 : 1);
      let turn = (this.steer + assist) * p.turnRate * speedFactor * directionSign * dt;
      // grip-limited understeer
      const maxTurn = gripLimit * dt * 2.2;
      const skidding = Math.abs(turn) > maxTurn;
      if (skidding) { turn = Math.sign(turn) * maxTurn; this.audio.skid(true); if (absSpeed > 8) this.speed *= (1 - 0.4 * dt); }
      else this.audio.skid(false);
      this.heading += turn;

      // --- integrate position ---
      this.px += Math.cos(this.heading) * this.speed * dt;
      this.py += Math.sin(this.heading) * this.speed * dt;

      // --- terrain / off-track ---
      const offDist = this.distanceOffTrack(this.px, this.py);
      const halfWidth = 26;
      let surface = this.track.cfg.surface;
      if (offDist > halfWidth) {
        surface = this.track.cfg.surface === 'asphalt' ? 'grass' : 'mud';
        // slow down off-road
        if (this.speed > 6) this.speed *= (1 - 1.6 * dt);
        if (offDist > halfWidth + 40) {
          // pushed back onto track edge (soft wall)
          const i = this.nearestIndex(this.px, this.py);
          const wp = this.track.points[i];
          const ang = Math.atan2(this.py - wp.y, this.px - wp.x);
          this.px = wp.x + Math.cos(ang) * (halfWidth + 40);
          this.py = wp.y + Math.sin(ang) * (halfWidth + 40);
          this.speed *= 0.6;
          if (absSpeed > 6) { this._damage(1); this.audio.collision(0.25); say('Off track. Wall.'); }
        }
      }
      if (surface !== this.audio.terrainType) this.audio.startTerrain(surface);
      this.audio.setTerrainVolume(Math.min(0.12, absSpeed / 20 * 0.12 + 0.005));

      // --- progress / checkpoints / laps (race mode) ---
      if (this.mode === 'race' && !this.finished) {
        const total = this.track.total;
        const raw = this._progressAt(this.px, this.py);
        // determine wrap direction (forward vs backward)
        let delta = raw - this.lastProgress;
        if (delta > total / 2) delta -= total;
        else if (delta < -total / 2) delta += total;
        const movingForward = delta >= 0;
        this.progress += delta;
        this.lastProgress = raw;

        // wrong-way detection
        if (this.speed > 2 && delta < -0.2) { this.wrongWayTimer += dt; this.correctWayTimer = 0; }
        else if (this.speed > 2 && delta >= 0) { this.correctWayTimer += dt; if (this.wrongWayTimer > 0) this.wrongWayTimer = Math.max(0, this.wrongWayTimer - dt * 3); }
        if (this.wrongWayTimer > 1.2) { say('Wrong direction. Turn around.', { critical: true }); this.wrongWayTimer = 0; }
        else if (this.wrongWayTimer > 0.5 && this._lastWrongNote !== 'w') { say('You are going the wrong way.', { critical: true }); this._lastWrongNote = 'w'; this.wrongWayTimer = 0.5; }
        if (this.correctWayTimer > 1.5 && this._lastWrongNote === 'w') { say('Correct direction.'); this._lastWrongNote = ''; this.correctWayTimer = 0; }

        // checkpoints
        const cps = this.track.checkpoints;
        if (this.nextCp < cps.length) {
          const target = cps[this.nextCp];
          const wrappedProgress = ((this.progress % total) + total) % total;
          // detect crossing the checkpoint going forward
          const prevWrapped = ((this.progress - delta) % total + total) % total;
          if (prevWrapped < target && wrappedProgress >= target && delta >= 0) {
            this.nextCp++;
            this._lastCpAnnounced = this.nextCp;
            this.audio.checkpoint();
            say(`Checkpoint ${this.nextCp} of ${cps.length}.`);
          }
        } else if (this.progress >= total) {
          this.lap++;
          this.progress -= total;
          this.nextCp = 0;
          if (this.lap >= this.lapsTotal) {
            this._finishPlayer();
          } else {
            this.audio.checkpoint();
            say(`Lap ${this.lap} of ${this.lapsTotal}.`);
          }
        }

        // AI update
        this._updateAI(dt);

        // car-to-car collisions (player vs AI, and AI separation)
        this._checkCarCollisions(dt);

        // position
        this._updatePosition();

        // guidance + status announcements
        this._guidance(dt);
      }
    }

    _updateAI(dt) {
      const diff = DIFFICULTY[this.difficulty] || DIFFICULTY.normal;
      for (const a of this.ai) {
        if (a.finished) continue;
        // lookahead target
        const look = 40 + a.speed * 0.5;
        const target = this._pointAhead(a.px, a.py, look);
        const want = Math.atan2(target.y - a.py, target.x - a.px);
        let dh = want - a.heading;
        while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
        const turnCap = 2.4 * diff.cornering * dt;
        a.heading += Math.max(-turnCap, Math.min(turnCap, dh));
        // corner-aware speed: measure upcoming curvature
        const ahead2 = this._pointAhead(a.px, a.py, look + 30);
        const ahead1 = this._pointAhead(a.px, a.py, look);
        const curvature = Math.abs(Math.atan2(ahead2.y - ahead1.y, ahead2.x - ahead1.x) - Math.atan2(ahead1.y - a.py, ahead1.x - a.px));
        const slowFactor = Math.max(0.5, 1 - curvature * 1.6);
        const targetSpeed = a.maxSpeed * slowFactor;
        a.speed += (targetSpeed - a.speed) * Math.min(1, dt * (a.skill * 1.4));
        a.px += Math.cos(a.heading) * a.speed * dt;
        a.py += Math.sin(a.heading) * a.speed * dt;
        // progress & laps
        const total = this.track.total;
        const raw = this._progressAt(a.px, a.py);
        let d = raw - a.progress; if (d > total / 2) d -= total; if (d < -total / 2) d += total;
        a.progress += d;
        if (a.progress >= total * this.lapsTotal) {
          a.finished = true;
          a.finishOrder = this._finishOrderCounter = (this._finishOrderCounter || 0) + 1;
        }
      }
    }

    _checkCarCollisions() {
      const threshold = 15; // combined half-lengths of two cars
      const now = performance.now();
      // player vs AI
      for (const a of this.ai) {
        if (a.finished) continue;
        const dx = a.px - this.px, dy = a.py - this.py;
        const d = Math.hypot(dx, dy);
        if (d >= threshold) continue;
        // closing speed along the line between the two cars
        const rvx = Math.cos(a.heading) * a.speed - Math.cos(this.heading) * this.speed;
        const rvy = Math.sin(a.heading) * a.speed - Math.sin(this.heading) * this.speed;
        const closing = Math.hypot(rvx, rvy);
        const impact = Math.min(1, closing / 18);
        if (impact < 0.05) continue;
        // separate the two cars so they do not overlap
        if (d > 0.01) {
          const nx = dx / d, ny = dy / d, push = (threshold - d) * 0.5;
          this.px -= nx * push; this.py -= ny * push;
          a.px += nx * push; a.py += ny * push;
        }
        this.speed *= (1 - 0.35 * impact);
        a.speed *= (1 - 0.35 * impact);
        this.audio.collision(impact);
        this._damage(impact * 2.5);
        if (impact > 0.15 && now - this._lastCollisionAnnounce > 3000) {
          this._lastCollisionAnnounce = now;
          if (impact > 0.6) say('Heavy collision. Vehicle damaged.', { critical: true });
          else say('Collision.');
        }
      }
      // light separation between AI cars so they do not stack
      for (let i = 0; i < this.ai.length; i++) {
        for (let j = i + 1; j < this.ai.length; j++) {
          const A = this.ai[i], B = this.ai[j];
          if (A.finished || B.finished) continue;
          const dx = B.px - A.px, dy = B.py - A.py, d = Math.hypot(dx, dy);
          if (d < 12 && d > 0.01) {
            const nx = dx / d, ny = dy / d, push = (12 - d) * 0.5;
            A.px -= nx * push; A.py -= ny * push;
            B.px += nx * push; B.py += ny * push;
          }
        }
      }
    }

    _pointAhead(x, y, dist) {
      const pts = this.track.points, n = pts.length;
      const base = this._progressAt(x, y);
      const target = (base + dist) % this.track.total;
      // find the point at cumulative >= target
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const c0 = pts[i].cum, c1 = pts[j].cum;
        const segLen = (c1 >= c0) ? (c1 - c0) : (this.track.total - c0 + c1);
        let tt = target - c0; if (tt < 0) tt += this.track.total;
        if (tt >= 0 && tt <= segLen) {
          const f = segLen ? tt / segLen : 0;
          return { x: pts[i].x + (pts[j].x - pts[i].x) * f, y: pts[i].y + (pts[j].y - pts[i].y) * f };
        }
      }
      return pts[0];
    }

    _updatePosition() {
      // Count AI ahead: those already finished, plus those with more progress.
      let ahead = 0;
      for (const a of this.ai) {
        if (a.finished) { ahead++; continue; }
        if (a.progress > this.progress) ahead++;
      }
      this.position = ahead + 1;
      // opponent proximity announcements
      this._opponentAwareness();
    }

    _opponentAwareness() {
      const rs = ensureState();
      if (!rs.settings.announceOpponents) return;
      const now = performance.now();
      if (now - this._lastOpponentAnnounce < 4000) return;
      for (const a of this.ai) {
        if (a.finished) continue;
        const d = Math.hypot(a.px - this.px, a.py - this.py);
        if (d < 60) {
          // behind or ahead?
          const aheadOfMe = a.progress > this.progress;
          const side = (a.px - this.px) > 0 ? 'right' : 'left';
          let msg;
          if (d < 18) msg = aheadOfMe ? 'Opponent very close ahead.' : 'Opponent very close behind you.';
          else if (aheadOfMe) msg = 'Opponent ahead.';
          else msg = `Opponent approaching from behind on your ${side}.`;
          say(msg);
          this._lastOpponentAnnounce = now;
          return;
        }
      }
    }

    _guidance(dt) {
      const rs = ensureState();
      if (!rs.settings.voiceGuidance) return;
      const now = performance.now();
      // speed announcement
      const interval = rs.settings.speedAnnounce === 'often' ? 6000 : rs.settings.speedAnnounce === 'off' ? Infinity : 12000;
      if (interval !== Infinity && now - this._lastSpeedAnnounce > interval && this.speed > 3) {
        const kmh = Math.round(this.speed * 3.6);
        say(`Speed ${kmh} kilometers per hour.`);
        this._lastSpeedAnnounce = now;
      }
      // upcoming turn guidance
      const look = 45 + this.speed * 1.2;
      const cur = this._pointAhead(this.px, this.py, 8);
      const ahead = this._pointAhead(this.px, this.py, look);
      const far = this._pointAhead(this.px, this.py, look + 25);
      const d1 = Math.atan2(ahead.y - cur.y, ahead.x - cur.x);
      const d2 = Math.atan2(far.y - ahead.y, far.x - ahead.x);
      let dh = d2 - d1;
      while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      const deg = dh * 180 / Math.PI;
      let kind;
      const adeg = Math.abs(deg);
      if (adeg < 10) kind = 'straight';
      else if (adeg < 22) kind = 'slight ' + (deg > 0 ? 'left' : 'right');
      else if (adeg < 50) kind = (deg > 0 ? 'left' : 'right');
      else if (adeg < 90) kind = 'sharp ' + (deg > 0 ? 'left' : 'right');
      else kind = 'u-turn ahead';
      if (kind !== this._lastTurnAnnounce || now - this._lastTurnAnnounceAt > 9000) {
        const distM = Math.round(look);
        let msg;
        if (kind === 'straight') msg = 'Continue forward.';
        else if (kind === 'u-turn ahead') msg = 'U-turn ahead.';
        else msg = `${kind[0].toUpperCase() + kind.slice(1)} in ${distM} meters.`;
        say(msg);
        this._lastTurnAnnounce = kind;
        this._lastTurnAnnounceAt = now;
      }
    }

    _finishPlayer() {
      this.finished = true;
      this._finishOrderCounter = (this._finishOrderCounter || 0) + 1;
      this.playerFinishOrder = this._finishOrderCounter;
      this.position = this.playerFinishOrder;
    }

    _damage(amount) {
      if (this.disabled) return;
      this.condition = Math.max(0, this.condition - amount);
      this.stats.condition = this.condition;
      this.physics = physicsFrom({ ...this.stats, condition: this.condition });
      const now = performance.now();
      if (now - this._lastDamageAnnounce > 6000) {
        this._lastDamageAnnounce = now;
        if (this.condition <= 0) { this.disabled = true; say('Vehicle disabled. Press R to restart the race.', { critical: true }); this.audio.stopEngineSequence(); }
        else if (this.condition <= 25) say('Critical damage. Vehicle barely running.', { critical: true });
        else if (this.condition <= 50) say('Vehicle damaged.');
      }
    }

    statusReport() {
      const kmh = Math.round(this.speed * 3.6);
      if (this.mode === 'race') {
        say(`Race status. Lap ${Math.min(this.lap + 1, this.lapsTotal)} of ${this.lapsTotal}. Position ${this.position}. Speed ${kmh} kilometers per hour. Checkpoint ${Math.min(this.nextCp + 1, this.track.checkpoints.length)} of ${this.track.checkpoints.length}.`);
      } else {
        say(`Practice status. Speed ${kmh} kilometers per hour. Gear ${this.gear}. Engine ${this.engineOn ? 'on' : 'off'}. Condition ${Math.round(this.condition)} percent.`);
      }
    }

    restart() {
      const i = 0;
      this.px = this.track.points[i].x; this.py = this.track.points[i].y;
      this.heading = Math.atan2(this.track.points[i + 1].y - this.track.points[i].y, this.track.points[i + 1].x - this.track.points[i].x);
      this.speed = 0; this.progress = 0; this.lastProgress = 0; this.lap = 0; this.nextCp = 0;
      this.finished = false; this.disabled = false; this.condition = 100; this.stats.condition = 100; this.physics = physicsFrom(this.stats);
      this.position = 1; this._finishOrderCounter = 0;
      this.ai.forEach(a => { a.finished = false; a.progress = 0; a.speed = 0; });
      say('Race restarted.');
    }

    render() {
      if (!CarRacing.renderCtx) return;
      const ctx = CarRacing.renderCtx, cw = CarRacing.renderW, ch = CarRacing.renderH;
      ctx.clearRect(0, 0, cw, ch);
      const scale = CarRacing.renderScale;
      const cx = cw / 2, cy = ch / 2;
      const worldToScreen = (x, y) => ({ x: cx + (x - this.px) * scale, y: cy + (y - this.py) * scale });
      // background
      const bg = this.track.cfg.surface === 'asphalt' ? '#10161f' : this.track.cfg.surface === 'dirt' ? '#1c2015' : '#171512';
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
      // track
      const pts = this.track.points;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const surfaceColor = { asphalt: '#3a4352', dirt: '#6b5438', gravel: '#5c5a54', grass: '#3a5a3a', mud: '#4c4232' }[this.track.cfg.surface] || '#3a4352';
      ctx.strokeStyle = surfaceColor; ctx.lineWidth = 52 * scale;
      ctx.beginPath();
      const p0 = worldToScreen(pts[0].x, pts[0].y); ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < pts.length; i++) { const p = worldToScreen(pts[i].x, pts[i].y); ctx.lineTo(p.x, p.y); }
      ctx.closePath(); ctx.stroke();
      // center dashed line
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([10, 14]);
      ctx.beginPath(); const c0 = worldToScreen(pts[0].x, pts[0].y); ctx.moveTo(c0.x, c0.y);
      for (let i = 1; i < pts.length; i++) { const p = worldToScreen(pts[i].x, pts[i].y); ctx.lineTo(p.x, p.y); }
      ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      // checkpoints
      for (const cpDist of this.track.checkpoints) {
        const wp = this._pointAhead(this.track.points[0].x, this.track.points[0].y, cpDist);
        const s = worldToScreen(wp.x, wp.y);
        ctx.fillStyle = '#ffd166'; ctx.fillRect(s.x - 2, s.y - 12, 4, 24);
      }
      // AI cars
      for (const a of this.ai) {
        const s = worldToScreen(a.px, a.py);
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(a.heading);
        ctx.fillStyle = a.color; ctx.fillRect(-7, -4, 14, 8);
        ctx.restore();
      }
      // player car
      const s = worldToScreen(this.px, this.py);
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(this.heading);
      ctx.fillStyle = this.stats.color || '#d8a23a'; ctx.fillRect(-8, -5, 16, 10);
      ctx.fillStyle = '#fff'; ctx.fillRect(3, -3, 4, 6);
      ctx.restore();
      // heading indicator line
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(this.heading) * 20, s.y + Math.sin(this.heading) * 20); ctx.stroke();

      // HUD
      CarRacing.updateHUD(this);
    }
  }

  /* =====================================================================
   * 7. UI — OVERLAY, MENUS, GARAGE, DEALERSHIP, UPGRADES
   * =================================================================== */

  const UI = {
    overlay: null, canvas: null, ctx: null, panel: null,
    _styleInjected: false,
    _bound: false,

    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

    injectStyle() {
      if (this._styleInjected || !document.head) return;
      this._styleInjected = true;
      const style = document.createElement('style');
      style.textContent = `
        .bsu-car-overlay{position:fixed;inset:0;z-index:9999;background:#0b0f16;color:#fff;font-family:system-ui,sans-serif;display:flex;flex-direction:column}
        .bsu-car-overlay .bsu-car-top{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#141a24;border-bottom:1px solid #2a3342}
        .bsu-car-overlay .bsu-car-hud{font-size:15px;font-weight:600;letter-spacing:.3px}
        .bsu-car-canvas{flex:1;min-height:0;width:100%;display:block;touch-action:none}
        .bsu-car-controls{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px;background:#141a24;border-top:1px solid #2a3342}
        .bsu-car-btn{min-height:56px;font-size:17px;font-weight:700;border-radius:10px;border:1px solid #3b4657;background:#1f2937;color:#fff;cursor:pointer}
        .bsu-car-btn:active,.bsu-car-btn.pressed{background:#3b82f6}
        .bsu-car-btn.ghost{background:transparent;border-color:#334155;font-size:14px;font-weight:600}
        .bsu-car-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
        .bsu-car-panel{position:fixed;inset:0;z-index:9998;background:rgba(8,10,15,.96);color:#fff;overflow:auto;padding:16px;font-family:system-ui,sans-serif}
        .bsu-car-panel h2{margin:0 0 4px;font-size:22px}
        .bsu-car-panel h3{margin:16px 0 6px;font-size:18px;color:#8fb3ff}
        .bsu-car-panel p{margin:6px 0;font-size:16px;line-height:1.5}
        .bsu-car-panel button{display:block;width:100%;min-height:52px;margin:6px 0;font-size:17px;font-weight:600;border-radius:10px;border:1px solid #3b4657;background:#1f2937;color:#fff;cursor:pointer;text-align:left;padding:0 14px}
        .bsu-car-panel button:hover{background:#2a3648}
        .bsu-car-panel button.row{min-height:44px;font-size:15px}
        .bsu-car-panel .muted{color:#9aa7b8;font-size:14px}
        .bsu-car-panel .close{position:sticky;top:0;background:#b91c1c}
        .bsu-car-panel label{display:block;font-size:16px;margin:10px 0 4px}
        .bsu-car-panel input[type=text],.bsu-car-panel select{width:100%;min-height:48px;font-size:17px;padding:0 10px;border-radius:8px;border:1px solid #3b4657;background:#0f1520;color:#fff}
      `;
      document.head.appendChild(style);
    },

    _ensureOverlay() {
      if (this.overlay) return;
      this.injectStyle();
      this.overlay = document.createElement('div');
      this.overlay.className = 'bsu-car-overlay';
      this.overlay.innerHTML = `
        <div class="bsu-car-top">
          <button class="bsu-car-btn ghost" id="bsu-car-exit" style="width:auto;min-height:44px;padding:0 12px">Exit</button>
          <div class="bsu-car-hud" id="bsu-car-hud" aria-live="polite">Not started</div>
        </div>
        <canvas class="bsu-car-canvas" id="bsu-car-canvas"></canvas>
        <div class="bsu-car-controls">
          <button class="bsu-car-btn" id="bsu-car-left" aria-label="Turn left (A)">Left</button>
          <button class="bsu-car-btn" id="bsu-car-forward" aria-label="Forward (W)">Forward</button>
          <button class="bsu-car-btn" id="bsu-car-right" aria-label="Turn right (D)">Right</button>
          <button class="bsu-car-btn" id="bsu-car-reverse" aria-label="Reverse (S)">Reverse</button>
          <button class="bsu-car-btn" id="bsu-car-brake" aria-label="Brake (Space)">Brake</button>
          <button class="bsu-car-btn" id="bsu-car-horn" aria-label="Horn">Horn</button>
          <button class="bsu-car-btn ghost" id="bsu-car-engine" aria-label="Toggle engine (E)">Engine</button>
          <button class="bsu-car-btn ghost" id="bsu-car-status" aria-label="Race status (I)">Status</button>
          <button class="bsu-car-btn ghost" id="bsu-car-restart" aria-label="Restart (R)">Restart</button>
        </div>
        <div class="bsu-car-sr" id="bsu-car-announcer" role="status" aria-live="assertive"></div>
      `;
      document.body.appendChild(this.overlay);
      this.canvas = document.getElementById('bsu-car-canvas');
      this.ctx = null;
      try { this.ctx = this.canvas && this.canvas.getContext ? this.canvas.getContext('2d') : null; } catch (e) { this.ctx = null; }
      this._bindOverlayControls();
    },

    _bindOverlayControls() {
      const press = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        const on = () => { el.classList.add('pressed'); if (CarRacing.activeSim) CarRacing.activeSim.setInput(key, true); };
        const off = () => { el.classList.remove('pressed'); if (CarRacing.activeSim) CarRacing.activeSim.setInput(key, false); };
        el.addEventListener('pointerdown', e => { e.preventDefault(); on(); });
        el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
      };
      press('bsu-car-forward', 'forward');
      press('bsu-car-reverse', 'back');
      press('bsu-car-left', 'left');
      press('bsu-car-right', 'right');
      press('bsu-car-brake', 'brake');
      document.getElementById('bsu-car-horn').addEventListener('pointerdown', () => CarRacing.activeSim && CarRacing.activeSim.audio.horn(true));
      document.getElementById('bsu-car-horn').addEventListener('pointerup', () => CarRacing.activeSim && CarRacing.activeSim.audio.horn(false));
      document.getElementById('bsu-car-engine').addEventListener('click', () => CarRacing.toggleEngine());
      document.getElementById('bsu-car-status').addEventListener('click', () => CarRacing.activeSim && CarRacing.activeSim.statusReport());
      document.getElementById('bsu-car-restart').addEventListener('click', () => CarRacing.restartSim());
      document.getElementById('bsu-car-exit').addEventListener('click', () => CarRacing.exitDriving());
    },

    _sizeCanvas() {
      if (!this.canvas) return;
      this.canvas.width = this.canvas.clientWidth || 320;
      this.canvas.height = this.canvas.clientHeight || 240;
    },

    showOverlay() { this._ensureOverlay(); this.overlay.style.display = 'flex'; this._sizeCanvas(); },
    hideOverlay() { if (this.overlay) this.overlay.style.display = 'none'; },

    updateHUD(sim) {
      const el = document.getElementById('bsu-car-hud');
      if (!el) return;
      const kmh = Math.round(Math.abs(sim.speed) * 3.6);
      if (sim.mode === 'race') {
        el.textContent = `Lap ${Math.min(sim.lap + 1, sim.lapsTotal)}/${sim.lapsTotal} · Pos ${sim.position} · ${kmh} km/h · Gear ${sim.gear} · ${Math.round(sim.condition)}%`;
      } else {
        el.textContent = `Practice · ${kmh} km/h · Gear ${sim.gear} · Engine ${sim.engineOn ? 'ON' : 'OFF'} · ${Math.round(sim.condition)}%`;
      }
    },

    _panel(title, bodyHTML, { onMount } = {}) {
      this._ensureOverlay();
      this.closePanel();
      this.panel = document.createElement('div');
      this.panel.className = 'bsu-car-panel';
      this.panel.setAttribute('role', 'dialog');
      this.panel.setAttribute('aria-modal', 'true');
      this.panel.innerHTML = `<h2>${this.esc(title)}</h2>${bodyHTML}<button class="close" id="bsu-car-panel-close">Close</button>`;
      document.body.appendChild(this.panel);
      document.getElementById('bsu-car-panel-close').addEventListener('click', () => this.closePanel());
      if (onMount) onMount(this.panel);
    },
    closePanel() { if (this.panel) { this.panel.remove(); this.panel = null; } }
  };

  /* =====================================================================
   * 8. PUBLIC API — window.CarRacing
   * =================================================================== */

  window.CarRacing = {
    activeSim: null,
    renderCtx: null, renderW: 0, renderH: 0, renderScale: 6,
    _countdownTimer: null,

    // ---- entry points ----
    openMenu() {
      const rs = ensureState();
      const car = computeStats(rs.selectedCarId);
      UI._panel('Car Racing District', `
        <p>Welcome to the Car Racing District. Current car: <strong>${UI.esc(car.name)}</strong> (condition ${Math.round(car.condition)}%).</p>
        <button id="bsu-race-practice">Practice Driving</button>
        <button id="bsu-race-race">Race</button>
        <button id="bsu-race-garage">Garage</button>
        <button id="bsu-race-dealership">Car Dealership</button>
        <button id="bsu-race-upgrades">Upgrades</button>
        <button id="bsu-race-results">Race Results</button>
        <button id="bsu-race-settings">Racing Settings & Accessibility</button>
        <button id="bsu-race-help">How to Drive</button>
      `, { onMount: () => {
        const bind = (id, fn) => document.getElementById(id).addEventListener('click', fn);
        bind('bsu-race-practice', () => { UI.closePanel(); this.startDriving('practice'); });
        bind('bsu-race-race', () => this.openRaceSelect());
        bind('bsu-race-garage', () => this.openGarage());
        bind('bsu-race-dealership', () => this.openDealership());
        bind('bsu-race-upgrades', () => this.openUpgrades());
        bind('bsu-race-results', () => this.openResults());
        bind('bsu-race-settings', () => this.openSettings());
        bind('bsu-race-help', () => this.openHelp());
      }});
    },

    openRaceSelect() {
      const rs = ensureState();
      const rows = Object.keys(TRACK_CONFIGS).map(tid => {
        const cfg = TRACK_CONFIGS[tid];
        const unlocked = rs.unlockedTracks[tid];
        return `<button class="row" data-track="${tid}" ${unlocked ? '' : 'aria-disabled="true"'}>${cfg.unlock}. ${UI.esc(cfg.name)} — ${cfg.laps} laps — ${unlocked ? cfg.reward + ' gold' : 'Locked (level ' + cfg.unlock + ')'}</button>`;
      }).join('');
      UI._panel('Choose a Race', `<p>Select a track. Difficulty affects the speed of your opponents.</p>${rows}`, { onMount: () => {
        UI.panel.querySelectorAll('[data-track]').forEach(b => b.addEventListener('click', () => {
          const tid = b.getAttribute('data-track');
          if (!rs.unlockedTracks[tid]) { say('This track is locked. Complete earlier races to unlock it.'); return; }
          this.openDifficulty(tid);
        }));
      }});
    },

    openDifficulty(trackId) {
      UI._panel('Difficulty', `
        <p>Race: ${UI.esc(TRACK_CONFIGS[trackId].name)}</p>
        <button data-diff="easy">Easy</button>
        <button data-diff="normal">Normal</button>
        <button data-diff="hard">Hard</button>
        <button data-diff="expert">Expert</button>
      `, { onMount: () => {
        UI.panel.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => {
          const diff = b.getAttribute('data-diff');
          UI.closePanel();
          this.startDriving('race', trackId, diff);
        }));
      }});
    },

    openGarage() {
      const rs = ensureState();
      const rows = Object.keys(rs.ownedCars).map(id => {
        const inst = rs.ownedCars[id];
        const stats = computeStats(id);
        const sel = id === rs.selectedCarId;
        return `<button class="row" data-car="${id}">${sel ? '★ ' : ''}${UI.esc(inst.name)} — condition ${Math.round(inst.condition)}% — speed ${Math.round(stats.speed)} · handling ${Math.round(stats.handling)}${sel ? ' (current)' : ''}</button>`;
      }).join('');
      UI._panel('Garage', `
        <p>Current vehicle: <strong>${UI.esc((rs.ownedCars[rs.selectedCarId] || {}).name || 'None')}</strong>.</p>
        ${rows || '<p>No cars yet.</p>'}
        <button id="bsu-garage-repair">Repair selected car</button>
        <button id="bsu-garage-rename">Rename selected car</button>
      `, { onMount: () => {
        UI.panel.querySelectorAll('[data-car]').forEach(b => b.addEventListener('click', () => {
          rs.selectedCarId = b.getAttribute('data-car'); persist();
          say(`Selected ${rs.ownedCars[rs.selectedCarId].name}.`);
          this.openGarage();
        }));
        document.getElementById('bsu-garage-repair').addEventListener('click', () => {
          const car = rs.ownedCars[rs.selectedCarId];
          if (!car) return;
          const need = 100 - (car.condition || 100);
          if (need <= 0) { say('Your car is already in excellent condition.'); return; }
          const cost = Math.max(10, Math.round(need * 0.6));
          const G = window.Game;
          if ((G.state.player.gold || 0) < cost) { say(`Repair costs ${cost} gold. You have ${G.state.player.gold || 0}.`); return; }
          G.state.player.gold -= cost;
          car.condition = 100;
          persist();
          MusicSystem && MusicSystem.playSFX('heal');
          say(`Repaired for ${cost} gold. Condition is now 100 percent.`);
          this.openGarage();
        });
        document.getElementById('bsu-garage-rename').addEventListener('click', () => {
          const car = rs.ownedCars[rs.selectedCarId];
          if (!car) return;
          const name = window.prompt('New name for your car:', car.name);
          if (name && name.trim()) { car.name = name.trim().slice(0, 24); persist(); say(`Car renamed to ${car.name}.`); this.openGarage(); }
        });
      }});
    },

    openDealership() {
      const rs = ensureState();
      const G = window.Game;
      const rows = CAR_CATALOG.map(c => {
        const owned = rs.ownedCars[c.id];
        const canAfford = (G.state.player.gold || 0) >= c.price;
        return `<button class="row" data-car="${c.id}" ${owned ? 'disabled' : ''}>${UI.esc(c.name)} — ${c.free ? 'FREE' : c.price + ' gold'} — speed ${c.speed} · accel ${c.accel} · handling ${c.handling} · braking ${c.braking} · durability ${c.durability}${owned ? ' (owned)' : ''}</button>`;
      }).join('');
      UI._panel('Car Dealership', `<p>You have ${G.state.player.gold || 0} gold. Select a car to hear more and buy it.</p>${rows}`, { onMount: () => {
        UI.panel.querySelectorAll('[data-car]').forEach(b => b.addEventListener('click', () => {
          const id = b.getAttribute('data-car');
          if (rs.ownedCars[id]) { say('You already own this car.'); return; }
          const c = CAR_CATALOG.find(x => x.id === id);
          say(`${c.name}. Price ${c.free ? 'free' : c.price + ' gold'}. ${c.blurb} Speed ${c.speed}, acceleration ${c.accel}, handling ${c.handling}, braking ${c.braking}, durability ${c.durability}. Press Enter to purchase.`);
          this._confirmPurchase(c);
        }));
      }});
    },

    _confirmPurchase(car) {
      const rs = ensureState();
      const G = window.Game;
      UI._panel('Purchase ' + car.name, `
        <p>${UI.esc(car.blurb)}</p>
        <p>Speed ${car.speed} · Acceleration ${car.accel} · Handling ${car.handling} · Braking ${car.braking} · Durability ${car.durability}</p>
        <p>Price: ${car.free ? 'FREE' : car.price + ' gold'}. You have ${G.state.player.gold || 0} gold.</p>
        <button id="bsu-buy-confirm">Purchase</button>
      `, { onMount: () => {
        document.getElementById('bsu-buy-confirm').addEventListener('click', () => {
          if (rs.ownedCars[car.id]) { say('You already own this car.'); return; }
          if (!car.free && (G.state.player.gold || 0) < car.price) { say(`You need ${car.price} gold. You have ${G.state.player.gold || 0}.`); return; }
          if (!car.free) G.state.player.gold -= car.price;
          rs.ownedCars[car.id] = { name: car.name, condition: 100, upgrades: {} };
          persist();
          MusicSystem && MusicSystem.playSFX('coin');
          if (car.free) say(`Congratulations. Your first car is free. Your ${car.name} has been added to your garage.`, { critical: true });
          else say(`You purchased the ${car.name}. It has been added to your garage.`);
          UI.closePanel();
          this.openGarage();
        });
      }});
    },

    openUpgrades() {
      const rs = ensureState();
      const id = rs.selectedCarId;
      const car = rs.ownedCars[id];
      if (!car) { say('You have no car selected. Visit the garage.'); return; }
      const stats = computeStats(id);
      const G = window.Game;
      const rows = UPGRADE_DEFS.map(u => {
        const lvl = Math.min(MAX_UPGRADE_LEVEL, Number(car.upgrades[u.key] || 0));
        const maxed = lvl >= MAX_UPGRADE_LEVEL;
        return `<button class="row" data-up="${u.key}" ${maxed ? 'disabled' : ''}>${UI.esc(u.name)} — level ${lvl}/${MAX_UPGRADE_LEVEL} — ${maxed ? 'MAX' : u.cost + ' gold'}</button>`;
      }).join('');
      UI._panel('Upgrades — ' + car.name, `<p>You have ${G.state.player.gold || 0} gold. Upgrades improve how your car drives.</p>${rows}`, { onMount: () => {
        UI.panel.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => {
          const key = b.getAttribute('data-up');
          const u = UPGRADE_DEFS.find(x => x.key === key);
          const lvl = Math.min(MAX_UPGRADE_LEVEL, Number(car.upgrades[key] || 0));
          if (lvl >= MAX_UPGRADE_LEVEL) return;
          if ((G.state.player.gold || 0) < u.cost) { say(`This upgrade costs ${u.cost} gold. You have ${G.state.player.gold || 0}.`); return; }
          G.state.player.gold -= u.cost;
          car.upgrades[key] = lvl + 1;
          persist();
          MusicSystem && MusicSystem.playSFX('levelup');
          say(`${u.name} upgraded to level ${lvl + 1}. ${u.desc}`, { eventId: 'up' + key + (lvl + 1) });
          this.openUpgrades();
        }));
      }});
    },

    openResults() {
      const rs = ensureState();
      const rows = (rs.results || []).slice(-15).reverse().map(r => `<p>${UI.esc(r.trackName)} (${UI.esc(r.difficulty)}) — ${r.position === 1 ? 'WIN' : 'P' + r.position} — ${r.time}s — +${r.reward} gold</p>`).join('');
      const best = Object.entries(rs.bestTimes || {}).map(([tid, t]) => `<p>${UI.esc(TRACK_CONFIGS[tid]?.name || tid)} — best ${t}s</p>`).join('');
      UI._panel('Race Results', `<h3>Recent results</h3>${rows || '<p>No races yet.</p>'}<h3>Best times</h3>${best || '<p>No best times yet.</p>'}`);
    },

    openSettings() {
      const rs = ensureState();
      const s = rs.settings;
      UI._panel('Racing Settings & Accessibility', `
        <p>These settings make driving accessible for blind players using TalkBack or a screen reader.</p>
        <label><input type="checkbox" id="bsu-set-voice" ${s.voiceGuidance ? 'checked' : ''}> Voice guidance (turns, speed, direction)</label>
        <label><input type="checkbox" id="bsu-set-assist" ${s.assistSteering ? 'checked' : ''}> Steering assist (keeps you near the track)</label>
        <label><input type="checkbox" id="bsu-set-opp" ${s.announceOpponents ? 'checked' : ''}> Announce nearby opponents</label>
        <label for="bsu-set-speed">Speed announcements</label>
        <select id="bsu-set-speed">
          <option value="off" ${s.speedAnnounce === 'off' ? 'selected' : ''}>Off</option>
          <option value="normal" ${s.speedAnnounce === 'normal' ? 'selected' : ''}>Normal (every 12s)</option>
          <option value="often" ${s.speedAnnounce === 'often' ? 'selected' : ''}>Often (every 6s)</option>
        </select>
      `, { onMount: () => {
        const save = () => {
          s.voiceGuidance = document.getElementById('bsu-set-voice').checked;
          s.assistSteering = document.getElementById('bsu-set-assist').checked;
          s.announceOpponents = document.getElementById('bsu-set-opp').checked;
          s.speedAnnounce = document.getElementById('bsu-set-speed').value;
          persist();
        };
        UI.panel.querySelectorAll('input[type=checkbox],select').forEach(el => el.addEventListener('change', save));
      }});
    },

    openHelp() {
      UI._panel('How to Drive', `
        <h3>Controls</h3>
        <p>W / Up = Forward · S / Down = Reverse · A / Left = steer left · D / Right = steer right</p>
        <p>Space = Brake · C = Clutch · H = Handbrake · E = Engine on/off · R = Restart · P = Pause · I = Race status · Escape = Exit</p>
        <h3>Getting started</h3>
        <p>1. Enter the car. 2. Press E to start the engine. 3. Hold W to accelerate. 4. Steer with A and D. 5. Brake with Space. 6. Press R at any time to restart.</p>
        <h3>Accessible driving</h3>
        <p>Voice guidance announces turns ahead, your speed, checkpoints and nearby opponents. In a race, follow the checkpoints to the finish. If you hear "wrong direction", turn around. Your car's condition drops when you hit walls or other cars — repair it in the garage.</p>
      `);
    },

    // ---- driving lifecycle ----
    startDriving(mode, trackId, difficulty) {
      const rs = ensureState();
      const carId = rs.selectedCarId || 'starter_falcon';
      if (!rs.ownedCars[carId]) { say('You have no car. Visit the garage to get your free starter car.'); return; }
      if (mode === 'race' && !trackId) { this.openRaceSelect(); return; }

      UI.showOverlay();
      this.activeSim = new DrivingSim({ mode, trackId, difficulty });
      this.renderCtx = UI.ctx; this.renderW = UI.canvas.width; this.renderH = UI.canvas.height;
      this.renderScale = Math.min(UI.canvas.width, UI.canvas.height) / 900;

      this._bindKeys();
      this.activeSim.audio._unlock();

      // engine auto-start (with door sequence feel)
      const car = computeStats(carId);
      say(`${car.name}. Engine off. Press E to start the engine.`);

      if (mode === 'race') this._startCountdown(trackId, difficulty);
      else say('Practice mode. No penalties. Start the engine and drive.');

      this.activeSim.start();
    },

    _startCountdown(trackId, difficulty) {
      const sim = this.activeSim;
      if (!sim) return;
      say(`Race: ${TRACK_CONFIGS[trackId].name}. Difficulty ${DIFFICULTY[difficulty].label}. Three laps... get ready.`);
      let n = 3;
      const step = () => {
        if (!this.activeSim) return;
        if (n > 0) {
          say(String(n), { critical: true });
          sim.audio.countdownBeep(false);
          n--;
          this._countdownTimer = setTimeout(step, 1000);
        } else {
          say('GO!', { critical: true });
          sim.audio.countdownBeep(true);
          sim._raceStarted = true;
        }
      };
      this._countdownTimer = setTimeout(step, 1200);
    },

    toggleEngine() {
      const sim = this.activeSim;
      if (!sim) return;
      if (sim.engineOn) {
        sim.engineOn = false;
        sim.audio.stopEngineSequence(() => say('Engine stopped.'));
      } else {
        sim.audio.doorSequence(() => {
          sim.audio.startEngineSequence(() => {
            sim.engineOn = true;
            say('Engine started.');
          });
        });
      }
    },

    restartSim() {
      if (this.activeSim) { this.activeSim.restart(); if (this.activeSim.mode === 'race') this._startCountdown(this.activeSim.trackId, this.activeSim.difficulty); }
    },

    exitDriving() {
      const sim = this.activeSim;
      if (sim) {
        sim.stop();
        // persist condition of the car used
        const rs = ensureState();
        if (rs.ownedCars[sim.carId]) rs.ownedCars[sim.carId].condition = Math.max(0, Math.round(sim.condition));
        persist();
        sim.audio.doorSequence(); // door close as the player steps out
      }
      this.activeSim = null;
      if (this._countdownTimer) clearTimeout(this._countdownTimer);
      this._unbindKeys();
      UI.hideOverlay();
      say('You step out of the car. Vehicle secured.');
    },

    _keyState: {},
    _bindKeys() {
      if (this._bound) return;
      this._bound = true;
      this._keyHandler = (e) => {
        const sim = this.activeSim;
        if (!sim) return;
        const k = e.key.toLowerCase();
        const map = { w: 'forward', arrowup: 'forward', s: 'back', arrowdown: 'back', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' };
        if (e.type === 'keydown') {
          if (map[k]) { sim.setInput(map[k], true); e.preventDefault(); }
          else if (k === ' ') { sim.input.brake = true; e.preventDefault(); }
          else if (k === 'c') sim.input.clutch = true;
          else if (k === 'h') { sim.input.handbrake = true; sim.audio.skid(true); }
          else if (k === 'e') this.toggleEngine();
          else if (k === 'r') this.restartSim();
          else if (k === 'p') sim._paused = !sim._paused, say(sim._paused ? 'Paused.' : 'Resumed.');
          else if (k === 'i') sim.statusReport();
          else if (k === 'escape') this.exitDriving();
        } else if (e.type === 'keyup') {
          if (map[k]) sim.setInput(map[k], false);
          else if (k === ' ') sim.input.brake = false;
          else if (k === 'c') sim.input.clutch = false;
          else if (k === 'h') { sim.input.handbrake = false; sim.audio.skid(false); }
        }
      };
      window.addEventListener('keydown', this._keyHandler);
      window.addEventListener('keyup', this._keyHandler);
    },
    _unbindKeys() {
      if (!this._bound) return;
      this._bound = false;
      if (this._keyHandler) { window.removeEventListener('keydown', this._keyHandler); window.removeEventListener('keyup', this._keyHandler); this._keyHandler = null; }
    },

    // ---- race finish & rewards (called from sim) ----
    onRaceFinished(sim) {
      const rs = ensureState();
      const G = window.Game;
      const cfg = TRACK_CONFIGS[sim.trackId] || {};
      const diff = DIFFICULTY[sim.difficulty] || DIFFICULTY.normal;
      const place = sim.playerFinishOrder || sim.position;
      const reward = place === 1 ? Math.round(cfg.reward * diff.rewardMult) : place === 2 ? Math.round(cfg.reward * diff.rewardMult * 0.5) : Math.round(cfg.reward * diff.rewardMult * 0.25);
      const elapsed = Math.round(sim._t);
      const won = place === 1;
      if (won) { sim.audio.winJingle(); MusicSystem && MusicSystem.playSFX('victory'); }
      else sim.audio.loseJingle();

      G.state.player.gold = (G.state.player.gold || 0) + reward;
      rs.xp = (rs.xp || 0) + (won ? 30 : 10);
      const newLevel = Math.floor(rs.xp / 100) + 1;
      const leveled = newLevel > (rs.level || 1);
      rs.level = newLevel;
      // unlock next track
      const order = Object.keys(TRACK_CONFIGS);
      const idx = order.indexOf(sim.trackId);
      if (won && idx >= 0 && idx + 1 < order.length) {
        const next = order[idx + 1];
        if (!rs.unlockedTracks[next]) {
          rs.unlockedTracks[next] = true;
          say(`Level ${TRACK_CONFIGS[next].unlock} unlocked: ${TRACK_CONFIGS[next].name}.`, { critical: true, eventId: 'unlock' + next });
        }
      }
      // best time
      const key = sim.trackId + ':' + sim.difficulty;
      if (!rs.bestTimes[key] || elapsed < rs.bestTimes[key]) {
        rs.bestTimes[key] = elapsed;
        say(`New best time: ${elapsed} seconds.`);
      }
      rs.results = rs.results || [];
      rs.results.push({ trackName: cfg.name, trackId: sim.trackId, difficulty: sim.difficulty, position: place, time: elapsed, reward });
      if (rs.results.length > 50) rs.results = rs.results.slice(-50);
      persist();

      const placeWord = place === 1 ? 'first' : place === 2 ? 'second' : place === 3 ? 'third' : place + 'th';
      say(`Race finished. You placed ${placeWord}. You earned ${reward} gold and ${won ? 30 : 10} racing XP.${leveled ? ' Racing level ' + newLevel + ' reached!' : ''}`, { critical: true });
    }
  };

  /* =====================================================================
   * 9. COMMAND + BUTTON + ARRIVAL INTEGRATION
   * =================================================================== */

  function boot() {
    const G = window.Game;
    if (!G || typeof G.processCommand !== 'function') { setTimeout(boot, 300); return; }
    if (window.CarRacing && window.CarRacing._wrapped) return;
    window.CarRacing._wrapped = true;

    // Intercept racing commands.
    const prev = G.processCommand.bind(G);
    G.processCommand = function (raw) {
      const c = String(raw || '').trim().toLowerCase();
      const inDistrict = (G.state.location || '').startsWith('car_');
      const R = window.CarRacing;
      const menuWords = ['racing', 'car racing', 'race district', 'racing district', 'cars', 'car'];
      const driveWords = ['drive', 'driving', 'practice', 'practice driving', 'get in the car', 'get in car'];
      const garageWords = ['garage', 'my garage', 'car garage'];
      const dealerWords = ['dealership', 'car dealership', 'car dealer', 'buy a car', 'buy car'];
      const upgradeWords = ['upgrade', 'upgrades', 'upgrade car'];

      if (c === 'race' && inDistrict) { R.openRaceSelect(); return; }
      if (driveWords.includes(c)) { if (inDistrict) R.startDriving('practice'); else R.openMenu(); return; }
      if (menuWords.includes(c)) { R.openMenu(); return; }
      if (garageWords.includes(c)) { R.openGarage(); return; }
      if (dealerWords.includes(c)) { R.openDealership(); return; }
      if (upgradeWords.includes(c)) { R.openUpgrades(); return; }
      if (c === 'racing help' || c === 'how to drive') { R.openHelp(); return; }
      if (c === 'race results') { R.openResults(); return; }
      if (c === 'car status' || c === 'vehicle status') { const s = R.activeSim; if (s) s.statusReport(); else { const rs = ensureState(); const car = computeStats(rs.selectedCarId); say(`${car.name}. Condition ${Math.round(car.condition)} percent. Speed rating ${Math.round(car.speed)}. Handling rating ${Math.round(car.handling)}.`); } return; }
      return prev(raw);
    };

    // Inject the "Car Racing" action button.
    try {
      const bar = document.querySelector('.action-btns');
      if (bar && !document.getElementById('btn-car-racing')) {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.id = 'btn-car-racing';
        btn.textContent = '🏎️ Racing';
        btn.addEventListener('click', () => { window.CarRacing.openMenu(); });
        bar.appendChild(btn);
      }
    } catch (e) {}

    // Arrival announcement when entering a racing location.
    const prevEnter = G.enterLocation.bind(G);
    G.enterLocation = function (locId) {
      prevEnter(locId);
      if (String(locId || '').startsWith('car_') && window.CarRacing) {
        const loc = window.WorldData.locations[locId];
        if (loc) {
          say(loc.description);
          if (locId === 'car_racing_gate') {
            setTimeout(() => say('You have entered the Car Racing District. Large racing ground ahead. Garage to the north, dealership to the northeast, practice track to the west, main race track to the south.'), 900);
          }
        }
      }
    };

    // Hook race finish into the sim loop: wrap the sim's update tick once.
    const origStart = window.CarRacing.startDriving.bind(window.CarRacing);
    window.CarRacing.startDriving = function (mode, trackId, difficulty) {
      origStart(mode, trackId, difficulty);
      const sim = this.activeSim;
      if (sim && mode === 'race') {
        const origUpdate = sim.update.bind(sim);
        sim.update = function (dt) {
          origUpdate(dt);
          if (this.finished && !this._finishedReported) {
            this._finishedReported = true;
            window.CarRacing.onRaceFinished(this);
          }
        };
      }
    };

    console.log('🏎️ v28 Car Racing District loaded: 13 locations, 6 cars, 6 tracks, AI opponents, garage, dealership, upgrades, accessible driving.');
  }

  /* =====================================================================
   * 10. INIT
   * =================================================================== */

  registerWorld();
  boot();
})();
