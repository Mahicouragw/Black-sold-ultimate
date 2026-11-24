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
 *   - Recorded racing audio (engine RPM, doors, horn, brakes, reverse cue,
 *     collisions, countdown, checkpoints and terrain), owned by AudioManager
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
    // Each circuit keeps its own seeded irregularity, but it is smoothed so the
    // road has real curves instead of a zigzag between neighbouring points.
    // A road that changes direction every 30 metres cannot be driven by ear,
    // and spoken turn calls would be meaningless on it.
    let wobble = [];
    for (let i = 0; i < n; i++) wobble.push((rnd() - 0.5) * cfg.jitter * 2);
    for (let pass = 0; pass < 3; pass++) wobble = wobble.map((_, i) => { let sum = 0; for (let k = -3; k <= 3; k++) sum += wobble[(i + k + n) % n]; return sum / 7; });
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const r = cfg.baseRadius * (1 + cfg.sharpness * Math.sin(cfg.lobes * t + cfg.seed * 0.37) + wobble[i] * 3);
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
      settings: { voiceGuidance: true, speedAnnounce: 'normal', assistSteering: true, announceOpponents: true, rubberBand: false },
      tutorialSeen: false,
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

  /* Racing lines that have Telugu and Hindi text. Everything goes through the
   * shared narration layer, so the log and the narrator stay in one language. */
  const RACE_TEXT = {
    'race.turn.left': ['left turn', 'ఎడమ మలుపు', 'बायाँ मोड़'], 'race.turn.right': ['right turn', 'కుడి మలుపు', 'दायाँ मोड़'],
    'race.turn.sharpLeft': ['sharp left turn', 'తీవ్రమైన ఎడమ మలుపు', 'तीखा बायाँ मोड़'], 'race.turn.sharpRight': ['sharp right turn', 'తీవ్రమైన కుడి మలుపు', 'तीखा दायाँ मोड़'],
    'race.turn.slightLeft': ['gentle left bend', 'స్వల్ప ఎడమ వంపు', 'हल्का बायाँ घुमाव'], 'race.turn.slightRight': ['gentle right bend', 'స్వల్ప కుడి వంపు', 'हल्का दायाँ घुमाव'],
    'race.turn.far': ['In {m} meters, {turn}.', '{m} మీటర్లలో {turn}.', '{m} मीटर में {turn}।'],
    'race.turn.near': ['{Turn} in {m} meters.', '{m} మీటర్లలో {turn}.', '{m} मीटर में {turn}।'],
    'race.turn.short': ['{m} meters.', '{m} మీటర్లు.', '{m} मीटर।'],
    'race.turn.nearSlow': ['{Turn} in {m} meters. Slow down.', '{m} మీటర్లలో {turn}. వేగం తగ్గించండి.', '{m} मीटर में {turn}। गति कम करें।'],
    'race.turn.now.left': ['Turn left now.', 'ఇప్పుడు ఎడమకు తిప్పండి.', 'अब बाएँ मुड़ें।'], 'race.turn.now.right': ['Turn right now.', 'ఇప్పుడు కుడికి తిప్పండి.', 'अब दाएँ मुड़ें।'],
    'race.turn.steady.left': ['Keep steering left.', 'ఎడమ వైపే తిప్పుతూ ఉండండి.', 'बाएँ मोड़ते रहें।'], 'race.turn.steady.right': ['Keep steering right.', 'కుడి వైపే తిప్పుతూ ఉండండి.', 'दाएँ मोड़ते रहें।'],
    'race.off.left': ['Off the road. Steer left.', 'రోడ్డు దాటి వెళ్లారు. ఎడమకు తిప్పండి.', 'सड़क से बाहर हैं। बाएँ मोड़ें।'],
    'race.off.right': ['Off the road. Steer right.', 'రోడ్డు దాటి వెళ్లారు. కుడికి తిప్పండి.', 'सड़क से बाहर हैं। दाएँ मोड़ें।'],
    'race.bend.hold': ['Long {turn}. The car is holding the road.', 'పొడవైన {turn}. కారు రోడ్డుపైనే ఉంది.', 'लंबा {turn}। कार सड़क पर बनी हुई है।'],
    'race.off.back': ['Back on the road.', 'మళ్లీ రోడ్డుపైకి వచ్చారు.', 'वापस सड़क पर आ गए।'],
    'race.turn.end': ['Straighten up.', 'స్టీరింగ్ నేరుగా ఉంచండి.', 'स्टीयरिंग सीधा करें।'],
    'race.straight': ['Straight ahead for {m} meters.', '{m} మీటర్ల వరకు నేరుగా వెళ్లండి.', '{m} मीटर तक सीधे चलें।'],
    'race.speed': ['Speed {kmh} kilometers per hour.', 'వేగం గంటకు {kmh} కిలోమీటర్లు.', 'गति {kmh} किलोमीटर प्रति घंटा।'],
    'race.throttle.on': ['Accelerating. The car keeps accelerating until you tap Forward again or brake.', 'వేగం పెంచుతున్నారు. మళ్లీ ఫార్వర్డ్ నొక్కే వరకు లేదా బ్రేక్ వేసే వరకు కారు వేగం పెరుగుతూనే ఉంటుంది.', 'गति बढ़ रही है। दोबारा फ़ॉरवर्ड दबाने या ब्रेक लगाने तक कार तेज़ होती रहेगी।'],
    'race.throttle.off': ['Throttle released. Coasting.', 'యాక్సిలరేటర్ వదిలేశారు. కారు నెమ్మదిస్తోంది.', 'एक्सेलरेटर छोड़ा। कार धीमी हो रही है।'],
    'race.reverse.on': ['Reversing. Tap Reverse again to stop.', 'వెనక్కి వెళ్తున్నారు. ఆపడానికి మళ్లీ రివర్స్ నొక్కండి.', 'पीछे जा रहे हैं। रोकने के लिए फिर रिवर्स दबाएँ।'],
    'race.braking': ['Braking.', 'బ్రేక్ వేస్తున్నారు.', 'ब्रेक लग रहा है।'],
    'race.stopped': ['The car has stopped.', 'కారు ఆగింది.', 'कार रुक गई है।'],
    'race.steer.left': ['Steering left.', 'ఎడమకు తిప్పుతున్నారు.', 'बाएँ मोड़ रहे हैं।'], 'race.steer.right': ['Steering right.', 'కుడికి తిప్పుతున్నారు.', 'दाएँ मोड़ रहे हैं।'],
    'race.steer.through.left': ['Steering left through the turn.', 'మలుపు పూర్తయ్యే వరకు ఎడమకు తిప్పుతున్నారు.', 'मोड़ पूरा होने तक बाएँ मोड़ रहे हैं।'],
    'race.steer.through.right': ['Steering right through the turn.', 'మలుపు పూర్తయ్యే వరకు కుడికి తిప్పుతున్నారు.', 'मोड़ पूरा होने तक दाएँ मोड़ रहे हैं।'],
    'race.engineFirst': ['The engine is off. Starting the engine first.', 'ఇంజిన్ ఆఫ్‌లో ఉంది. ముందుగా ఇంజిన్ స్టార్ట్ చేస్తున్నాం.', 'इंजन बंद है। पहले इंजन चालू कर रहे हैं।'],
    'race.fuel.status': ['Fuel {pct} percent.', 'ఇంధనం {pct} శాతం.', 'ईंधन {pct} प्रतिशत।'],
    'race.fuel.low': ['Fuel low: {pct} percent. Use Pit to refuel.', 'ఇంధనం తక్కువగా ఉంది: {pct} శాతం. ఇంధనం నింపడానికి పిట్ వాడండి.', 'ईंधन कम है: {pct} प्रतिशत। ईंधन भरने के लिए पिट का उपयोग करें।'],
    'race.fuel.critical': ['Fuel critical: {pct} percent. Refuel now.', 'ఇంధనం చాలా తక్కువ: {pct} శాతం. వెంటనే నింపండి.', 'ईंधन बहुत कम है: {pct} प्रतिशत। अभी भरें।'],
    'race.fuel.empty': ['Out of fuel. The engine has stopped. Use Pit to refuel.', 'ఇంధనం అయిపోయింది. ఇంజిన్ ఆగిపోయింది. ఇంధనం నింపడానికి పిట్ వాడండి.', 'ईंधन खत्म हो गया। इंजन बंद हो गया है। ईंधन भरने के लिए पिट का उपयोग करें।'],
    'race.fuel.full': ['The tank is already full.', 'ట్యాంక్ ఇప్పటికే నిండుగా ఉంది.', 'टंकी पहले से भरी है।'],
    'race.fuel.filling': ['Refuelling.', 'ఇంధనం నింపుతున్నారు.', 'ईंधन भरा जा रहा है।'],
    'race.fuel.done': ['Tank filled to {pct} percent. {cost} rupees paid.', 'ట్యాంక్ {pct} శాతం వరకు నిండింది. {cost} రూపాయలు చెల్లించారు.', 'टंकी {pct} प्रतिशत तक भर गई। {cost} रुपये चुकाए।'],
    'race.fuel.free': ['You cannot afford fuel, so the pit crew gives you an emergency can. Fuel {pct} percent.', 'ఇంధనానికి డబ్బు సరిపోదు, కాబట్టి పిట్ సిబ్బంది అత్యవసర డబ్బా ఇచ్చారు. ఇంధనం {pct} శాతం.', 'ईंधन के पैसे नहीं हैं, इसलिए पिट दल ने आपातकालीन कैन दी। ईंधन {pct} प्रतिशत।'],
    'race.fuel.slow': ['Slow down to refuel. Braking for the pit.', 'ఇంధనం నింపడానికి వేగం తగ్గించండి. పిట్ కోసం బ్రేక్ వేస్తున్నాం.', 'ईंधन भरने के लिए धीमे हों। पिट के लिए ब्रेक लगा रहे हैं।']
  };
  /* Turn zones of a track. A zone is a stretch of road that bends one way:
   * { start, end (vertex indexes), startCum, length, deg, side, kind, loop }.
   * Positive heading change is a turn to the driver's right: the track view has
   * y pointing down, and the Right control increases the heading. */
  const zoneCache = new WeakMap();
  function trackZones(track) {
    if (zoneCache.has(track)) return zoneCache.get(track);
    const pts = track.points, n = pts.length, sign = [], deg = [], curve = [];
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      let d = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      d = d * 180 / Math.PI;
      const k = d / Math.max(1, (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y)) / 2);   // degrees per metre
      deg.push(d); curve.push(Math.abs(k)); sign.push(Math.abs(k) < 0.12 ? 0 : Math.sign(k));
    }
    const zones = [];
    const make = (start, count) => {
      let total = 0, peak = 0;
      for (let k = 0; k < count; k++) { const i = (start + k) % n; total += deg[i]; peak = Math.max(peak, curve[i]); }
      const end = (start + count - 1) % n;
      let length = pts[end].cum - pts[start].cum; if (length < 0) length += track.total;
      zones.push({ start, end, startCum: pts[start].cum, length, deg: total, side: total > 0 ? 'right' : 'left', kind: peak >= 0.8 ? 'sharp' : peak >= 0.35 ? 'normal' : 'slight', loop: count >= n });
    };
    let first = -1;
    for (let i = 0; i < n; i++) if (sign[i] !== sign[(i - 1 + n) % n]) { first = i; break; }
    if (first < 0) { if (sign[0]) make(0, n); }
    else {
      for (let step = 0; step < n;) {
        const i = (first + step) % n;
        let count = 1;
        while (step + count < n && sign[(i + count) % n] === sign[i]) count++;
        if (sign[i]) make(i, count);
        step += count;
      }
    }
    zoneCache.set(track, zones);
    return zones;
  }

  let raceTextReady = false;
  function rt(key, params = {}) {
    const N = window.Narration;
    if (N && !raceTextReady) { N.add(RACE_TEXT); raceTextReady = true; }
    let text = N ? N.t(key, params) : RACE_TEXT[key][0].replace(/\{(\w+)\}/g, (w, k) => params[k] === undefined ? '' : String(params[k]));
    return text;
  }

  function say(text, opts = {}) {
    const G = window.Game;
    if (G && typeof G.emitGameEvent === 'function') {
      return G.emitGameEvent(text, 'system', { critical: !!opts.critical, eventId: opts.eventId || '' });
    }
    if (G && typeof G.announceForBlind === 'function') { G.announceForBlind(text); return Promise.resolve(true); }
    return Promise.resolve(false);
  }

  let racingAudioSequence = 0;

  /* Recorded racing audio. AudioManager owns every media element and event;
   * this adapter only maps driving state to licensed recordings and loop handles. */
  class RacingAudio {
    constructor() {
      this.channel = `racing-${++racingAudioSequence}`;
      this.engine = null;
      this.engineOn = false;
      this.terrain = null;
      this.terrainType = 'asphalt';
      this.terrainVolume = 0;
      this._enabled = true;
      this._loops = new Map();
      this._engineToken = 0;
      this._doorToken = 0;
      this._braking = false;
      this._skidding = false;
      this._onPageHide = () => this.stopAll();
      this._onVisibility = () => { if (window.document?.hidden) this.stopAll(); };
      this._onSfxChange = event => {
        if (!event.detail?.enabled) {
          this._stopLoops();
          window.MusicSystem?.cancelAudioChannel?.(this.channel);
        } else {
          if (this.engineOn) this._startEngineLoops();
          this.startTerrain(this.terrainType);
          this._syncSkid();
        }
      };
      window.addEventListener('pagehide', this._onPageHide);
      document.addEventListener('visibilitychange', this._onVisibility);
      window.addEventListener('black-sword-sfx-change', this._onSfxChange);
    }

    _unlock() {
      const manager = window.MusicSystem;
      if (!manager || this._enabled === false) return false;
      manager.init();
      const doc = window.document;
      return manager.sfxEnabled && !manager.pageSuspended && Boolean(doc) && !doc.hidden;
    }

    _effect(type, wait = false) {
      const manager = window.MusicSystem;
      if (!manager || !this._unlock()) return Promise.resolve(false);
      if (wait) return manager.playSFXAndWait(type, 2200, { channel: this.channel });
      manager.playSFX(type, { channel: this.channel });
      return Promise.resolve(true);
    }

    _playLoop(key, type, volume = 0.2, playbackRate = 1) {
      if (this._loops.has(key)) return this._loops.get(key);
      if (!this._unlock()) return null;
      const handle = window.MusicSystem.startSFXLoop(`${this.channel}:${key}`, type, { volume, playbackRate });
      if (handle) this._loops.set(key, handle);
      return handle;
    }

    _stopLoop(key) {
      const handle = this._loops.get(key);
      this._loops.delete(key);
      if (handle) handle.stop();
      else window.MusicSystem?.stopSFXLoop?.(`${this.channel}:${key}`);
    }

    _stopLoops() {
      for (const key of [...this._loops.keys()]) this._stopLoop(key);
      this.engine = null;
      this.terrain = null;
    }

    _startEngineLoops() {
      if (!this.engineOn || !this._unlock()) return;
      this._playLoop('engine-low', 'engine-low', 0.2, 0.9);
      this._playLoop('engine-high', 'engine-high', 0, 1);
      this.engine = { recorded: true };
      this.setEngineRpm(this._rpm || 0.16);
    }

    setEngineRpm(rpm) {
      this._rpm = Math.max(0, Math.min(1, Number(rpm) || 0));
      const low = this._loops.get('engine-low'), high = this._loops.get('engine-high');
      // Two real engine recordings, cross-faded: the idle recording carries low
      // revs and the high-rev recording takes over as the engine works harder.
      low?.setVolume(0.10 + (1 - this._rpm) * 0.18);
      low?.setPlaybackRate(0.82 + this._rpm * 0.48);
      high?.setVolume(this._rpm * 0.24);
      high?.setPlaybackRate(0.88 + this._rpm * 0.68);
    }

    async startEngineSequence(onDone) {
      if (this.engineOn) { onDone?.(); return; }
      this.engineOn = true;
      const token = ++this._engineToken;
      await this._effect('car-start', true);
      if (token === this._engineToken && this.engineOn) this._startEngineLoops();
      onDone?.();
    }

    stopEngineSequence(onDone) {
      this.engineOn = false;
      ++this._engineToken;
      const wasRunning = this._loops.has('engine-low') || this._loops.has('engine-high');
      this._stopLoop('engine-low'); this._stopLoop('engine-high');
      this.engine = null;
      if (wasRunning) this._effect('car-stop');          // recorded engine shutdown
      queueMicrotask(() => onDone?.());
    }

    horn(on) {
      if (on) this._playLoop('horn', 'car-horn', 0.38, 1);
      else this._hornStop();
    }
    _hornStop() { this._stopLoop('horn'); }

    brake(on) {
      this._braking = Boolean(on);
      this._syncSkid();
    }
    _brakeStop() { this._braking = false; this._syncSkid(); }

    reverseBeep(on) {
      if (on) this._playLoop('reverse', 'race-beep', 0.14, 1);
      else this._revStop();
    }
    _revStop() { this._stopLoop('reverse'); }

    collision(intensity) {
      // The recording is a real metal impact; gameplay still applies intensity
      // to damage. The queue serializes it with the matching collision speech.
      this._effect(Number(intensity) >= 0.6 ? 'car-crash' : 'car-collision');
    }

    gearShift() { this._effect('gear-shift'); }

    /** Fuel cap, then fuel pouring. Resolves when the pour has finished. */
    async refuelSequence() {
      await this._effect('fuel-cap', true);
      await this._effect('fuel-pour', true);
    }

    skid(on) {
      this._skidding = Boolean(on);
      this._syncSkid();
    }
    _skidStop() { this._skidding = false; this._syncSkid(); }
    _syncSkid() {
      if (this._braking || this._skidding) {
        const handle = this._playLoop('skid', 'car-skid', this._skidding ? 0.24 : 0.12, this._skidding ? 1 : 0.82);
        handle?.setVolume(this._skidding ? 0.24 : 0.12);
        handle?.setPlaybackRate(this._skidding ? 1 : 0.82);
      } else this._stopLoop('skid');
    }

    async doorSequence(onDone) {
      const token = ++this._doorToken;
      await this._effect('car-door-open', true);
      if (token === this._doorToken) await this._effect('car-door-close', true);
      onDone?.();
    }

    checkpoint() { this._effect('race-checkpoint'); }
    countdownBeep(final) { this._effect('race-beep'); }
    winJingle() { this._effect('victory'); }
    loseJingle() { this._effect('death'); }

    startTerrain(surface) {
      this.terrainType = surface || 'asphalt';
      this._stopLoop('terrain');
      const sample = {
        asphalt: 'car-skid', dirt: 'step-gravel', grass: 'step-leaves-1',
        gravel: 'step-gravel', mud: 'step-mud', metal: 'step-stone', stone: 'step-stone'
      }[this.terrainType] || 'car-skid';
      const rate = this.terrainType === 'asphalt' ? 0.65 : 0.75;
      this.terrain = this._playLoop('terrain', sample, this.terrainVolume, rate);
    }

    setTerrainVolume(value) {
      this.terrainVolume = Math.max(0, Math.min(0.12, Number(value) || 0));
      this.terrain?.setVolume(this.terrainVolume);
    }

    stopAll() {
      ++this._engineToken; ++this._doorToken;
      this.engineOn = false;
      this._braking = this._skidding = false;
      window.MusicSystem?.cancelAudioChannel?.(this.channel);
      this._stopLoops();
    }

    destroy() {
      this.stopAll();
      window.removeEventListener('pagehide', this._onPageHide);
      document.removeEventListener('visibilitychange', this._onVisibility);
      window.removeEventListener('black-sword-sfx-change', this._onSfxChange);
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
      this.boostOn = false; this.boostFuel = 1;
      // Fuel is kept per car, in percent of a full tank, and is saved with the car.
      const savedFuel = Number(ensureState().ownedCars?.[this.carId]?.fuel);
      this.fuel = Number.isFinite(savedFuel) ? Math.max(0, Math.min(100, savedFuel)) : 100;
      this._fuelWarned = this.fuel <= 10 ? 2 : this.fuel <= 25 ? 1 : 0;
      this._refuelling = false;
      this.swipeSteer = 0;                 // -1..1 from dragging on the track view
      this.latch = { forward: false, back: false };
      this.turnIntent = null;              // { side, id, at, entered }: steering held for one called turn
      this._turnCalls = new Map();
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
    /** Closest point of the road's centre line: { x, y, distance, side }.
     *  side is +1 when the car is right of centre, -1 when left of it. */
    closestOnTrack(x, y) {
      const pts = this.track.points, n = pts.length;
      let best = null;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n], abx = b.x - a.x, aby = b.y - a.y, len2 = abx * abx + aby * aby || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / len2));
        const cx = a.x + abx * t, cy = a.y + aby * t, d = Math.hypot(cx - x, cy - y);
        if (!best || d < best.distance) best = { x: cx, y: cy, distance: d, side: ((x - a.x) * -aby + (y - a.y) * abx) >= 0 ? 1 : -1 };
      }
      return best;
    }
    /** Distance from the centre of the road (measured to the road itself, not to its corner points). */
    distanceOffTrack(x, y) { return this.closestOnTrack(x, y).distance; }

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
      this.audio.destroy();
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
      if (!steerDir && this.swipeSteer) steerDir = Math.max(-1, Math.min(1, this.swipeSteer));
      // --- steering assist (accessible driving) ---
      // Without sight a driver cannot judge how far to turn the wheel, so with
      // the assist on the car works out the amount and the driver supplies the
      // decision: which way, and when.
      //   straight or gentle bend, no input   -> the car holds the road
      //   real turn, steering the called way  -> the car follows the turn
      //   real turn, not steering             -> the car runs wide
      //   steering the wrong way              -> the car goes the wrong way
      // Taking a turn too fast still skids and understeers.
      let assist = 0, steerCmd = steerDir;
      if (ensureState().settings.assistSteering && this.speed > 1) {
        const look = Math.max(14, Math.min(45, 12 + this.speed * 0.9));
        const target = this._pointAhead(this.px, this.py, look);
        let dh = Math.atan2(target.y - this.py, target.x - this.px) - this.heading;
        while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
        const lowSpeedFactor = Math.max(0.25, 1 - (Math.abs(this.speed) / p.maxSpeed) * 0.75);
        const ideal = Math.max(-1, Math.min(1, dh * 2.6 / (p.turnRate * lowSpeedFactor)));
        const zone = this.currentTurn();
        const realTurn = zone && zone.kind !== 'slight' ? zone : null;
        // A tap on Left or Right for a called turn holds that steering through the
        // turn, so a screen-reader user never has to keep a button held down.
        if (this.turnIntent) {
          const it = this.turnIntent;
          if (realTurn && realTurn.start === it.id) it.entered = true;
          else if (it.entered || this._t - it.at > 8) this.turnIntent = null;
          if (this.turnIntent && !steerDir) steerDir = it.side === 'right' ? 1 : -1;
        }
        const way = Math.sign(steerDir);
        const next = realTurn ? null : this.upcomingTurn(40);
        const called = realTurn || (next && next.kind !== 'slight' ? next : null);
        if (!way) steerCmd = realTurn ? 0 : ideal;                    // nobody steering through a real turn: the car goes straight on
        else if (called && way === (called.side === 'right' ? 1 : -1)) steerCmd = Math.max(-1, Math.min(1, ideal + (realTurn ? steerDir * 0.1 : 0)));
        else steerCmd = Math.max(-1, Math.min(1, ideal * 0.5 + steerDir * 0.6));
      } else this.turnIntent = null;
      this.steer += (steerCmd - this.steer) * Math.min(1, dt * 10); // smoothing

      // --- longitudinal ---
      let accelInput = 0;
      if (this.engineOn && !this.clutch && !this._refuelling && this.fuel > 0) {
        if (inp.forward || this.latch.forward) accelInput = 1;
        else if (inp.back || this.latch.back) accelInput = -1;
      }
      if (inp.brake && (this.latch.forward || this.latch.back)) this.latch.forward = this.latch.back = false;
      this._burnFuel(dt, accelInput);
      if (inp.brake) {
        if (this.speed > 0.2) { this.speed = Math.max(0, this.speed - p.braking * dt); this.audio.brake(true); }
        else if (this.speed < -0.2) { this.speed = Math.min(0, this.speed + p.braking * dt); this.audio.brake(true); }
        else this.speed = 0;
      } else {
        this.audio.brake(false);
      }
      if (this.handbrake) { this.speed = Math.max(0, this.speed - p.braking * 1.4 * dt); }

      if (this.boostOn && this.boostFuel > 0 && accelInput > 0) {
        this.boostFuel = Math.max(0, this.boostFuel - dt * 0.28);
        if (this.boostFuel <= 0) { this.boostOn = false; say('Boost empty.'); }
      } else if (!this.boostOn && this.boostFuel < 1) {
        this.boostFuel = Math.min(1, this.boostFuel + dt * 0.08);
      }
      const boostMul = (this.boostOn && this.boostFuel > 0) ? 1.35 : 1;
      if (accelInput > 0) this.speed = Math.min(p.maxSpeed * (this.boostOn ? 1.18 : 1), this.speed + p.accel * accelInput * boostMul * dt);
      else if (accelInput < 0) this.speed = Math.max(-p.reverseMax, this.speed - p.accel * 0.6 * dt);
      else {
        // coast with drag
        if (this.speed > 0) this.speed = Math.max(0, this.speed - p.drag * dt);
        else if (this.speed < 0) this.speed = Math.min(0, this.speed + p.drag * dt);
      }

      // --- gear & rpm ---
      const absSpeed = Math.abs(this.speed);
      const previousGear = this.gear;
      this.gear = Math.max(1, Math.min(5, Math.floor(absSpeed / (p.maxSpeed / 5)) + 1));
      if (this.gear !== previousGear && this.engineOn && this._t - (this._lastShiftAt || 0) > 0.8) { this._lastShiftAt = this._t; this.audio.gearShift(); }
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
      const nearest = this.closestOnTrack(this.px, this.py);
      const offDist = nearest.distance;
      const halfWidth = 26;
      if (offDist > halfWidth && absSpeed > 2 && this._t - (this._offRoadSaidAt ?? -99) > 4) {
        this._offRoadSaidAt = this._t; this._offRoad = true;
        say(rt(nearest.side > 0 ? 'race.off.left' : 'race.off.right'), { critical: true });
      } else if (this._offRoad && offDist < halfWidth - 6) {
        this._offRoad = false; this._offRoadSaidAt = -99;
        const zone = this.currentTurn();
        say(rt('race.off.back') + ' ' + rt(zone && zone.kind !== 'slight' ? 'race.turn.steady.' + zone.side : 'race.turn.end'));
        if (this._g) { this._g.turnAt = this._t * 1000; this._g.steadyAt = this._t * 1000; this._g.inside = zone; }
      }
      let surface = this.track.cfg.surface;
      if (offDist > halfWidth) {
        surface = this.track.cfg.surface === 'asphalt' ? 'grass' : 'mud';
        // slow down off-road
        if (this.speed > 6) this.speed *= (1 - 1.6 * dt);
        if (offDist > halfWidth + 40) {
          // pushed back onto track edge (soft wall)
          const ang = Math.atan2(this.py - nearest.y, this.px - nearest.x);
          this.px = nearest.x + Math.cos(ang) * (halfWidth + 40);
          this.py = nearest.y + Math.sin(ang) * (halfWidth + 40);
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
      } else if (this.mode !== 'race') {
        // Practice gets the same spoken turn calls, so a blind driver can learn them without pressure.
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
        let targetSpeed = a.maxSpeed * slowFactor;
        const rsBand = ensureState();
        if (rsBand.settings && rsBand.settings.rubberBand && !this.finished) {
          const gap = this.progress - a.progress;
          if (gap > 80) targetSpeed *= 1.12;
        }
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

    /** Fuel use: a little at idle, more under throttle, most with boost. */
    _burnFuel(dt, accelInput) {
      if (!this.engineOn || this.fuel <= 0) return;
      const rate = 0.02 + (accelInput ? 0.26 : 0) + (this.boostOn && accelInput > 0 ? 0.30 : 0);   // percent per second
      this.fuel = Math.max(0, this.fuel - rate * dt);
      if (this.fuel <= 0) {
        this.latch.forward = this.latch.back = false;
        this.engineOn = false;
        this.audio.stopEngineSequence();
        say(rt('race.fuel.empty'), { critical: true });
      } else if (this.fuel <= 10 && this._fuelWarned < 2) { this._fuelWarned = 2; say(rt('race.fuel.critical', { pct: Math.ceil(this.fuel) }), { critical: true }); }
      else if (this.fuel <= 25 && this._fuelWarned < 1) { this._fuelWarned = 1; say(rt('race.fuel.low', { pct: Math.ceil(this.fuel) })); }
    }

    /** Fill the tank. Costs one rupee per percent; a player with no money still
     *  gets an emergency can so a blind driver is never stranded mid-track. */
    refuel() {
      if (this._refuelling) return false;
      if (this.fuel >= 99.5) { say(rt('race.fuel.full')); return false; }
      this.latch.forward = this.latch.back = false;
      if (Math.abs(this.speed) > 4) { say(rt('race.fuel.slow')); this.speed = Math.sign(this.speed) * 4; }
      const G = window.Game, player = G?.state?.player;
      const gold = Math.max(0, Math.floor(Number(player?.gold) || 0));
      const wanted = Math.ceil(100 - this.fuel);
      const paid = Math.min(wanted, gold);
      const target = paid >= 1 ? Math.min(100, this.fuel + paid) : Math.max(this.fuel, 15);
      this._refuelling = true;
      say(rt('race.fuel.filling'));
      const finish = () => {
        if (!this._refuelling) return;
        this._refuelling = false;
        if (paid >= 1 && player) { player.gold = gold - paid; G.updateHUD?.(); }
        this.fuel = target;
        this._fuelWarned = this.fuel <= 10 ? 2 : this.fuel <= 25 ? 1 : 0;
        const car = ensureState().ownedCars?.[this.carId];
        if (car) car.fuel = Math.round(this.fuel);
        persist();
        say(paid >= 1 ? rt('race.fuel.done', { pct: Math.round(this.fuel), cost: paid }) : rt('race.fuel.free', { pct: Math.round(this.fuel) }));
      };
      // Never wait on audio that cannot play (sound off, hidden page).
      const timer = setTimeout(finish, 3200);
      Promise.resolve(this.audio.refuelSequence()).then(() => { clearTimeout(timer); finish(); }, () => { clearTimeout(timer); finish(); });
      return true;
    }

    /** The next turn ahead of the car: { id, distance, deg, side, kind, length }. */
    upcomingTurn(maxDistance = 700) {
      const here = this._progressAt(this.px, this.py), total = this.track.total;
      let best = null;
      for (const zone of trackZones(this.track)) {
        if (zone.loop) continue;
        let distance = zone.startCum - here; if (distance < 0) distance += total;
        if (distance <= maxDistance && (!best || distance < best.distance)) best = { id: zone.start, distance, deg: zone.deg, side: zone.side, kind: zone.kind, length: zone.length };
      }
      return best;
    }
    /** The turn the car is inside right now, or null on a straight. */
    currentTurn() {
      const here = this._progressAt(this.px, this.py), total = this.track.total;
      for (const zone of trackZones(this.track)) {
        if (zone.loop) return zone;
        let into = here - zone.startCum; if (into < 0) into += total;
        if (zone.length > 0 && into <= zone.length) return zone;
      }
      return null;
    }
    _turnName(turn) {
      const key = turn.kind === 'sharp' ? (turn.side === 'left' ? 'sharpLeft' : 'sharpRight') : turn.kind === 'slight' ? (turn.side === 'left' ? 'slightLeft' : 'slightRight') : turn.side;
      return rt('race.turn.' + key);
    }

    /** Spoken guidance. Every turn is called at about 500 metres, at 50 metres
     *  and at 30 metres, then "turn now" at the turn itself. Each call is made
     *  once per turn, so the narrator never repeats or talks over itself.
     *  Inside a long turn the driver is reminded to keep steering, and told to
     *  straighten up when the turn ends. Time is race time, so a pause never
     *  swallows a call. */
    _guidance(dt) {
      const rs = ensureState();
      if (!rs.settings.voiceGuidance) return;
      const now = this._t * 1000;
      const g = this._g || (this._g = { turnAt: -1e9, speedAt: 0, steadyAt: 0, inside: null });
      const interval = rs.settings.speedAnnounce === 'often' ? 6000 : rs.settings.speedAnnounce === 'off' ? Infinity : 12000;
      const moving = this.speed > 1;
      const turn = moving ? this.upcomingTurn() : null;
      const inside = moving ? this.currentTurn() : null;

      // Leaving a turn: always tell the driver to centre the wheel, even when the
      // next turn is close, unless that turn starts within a car length or two.
      if (g.inside && g.inside !== inside && !g.inside.loop) {
        const wasReal = g.inside.kind !== 'slight';
        g.inside = inside;
        if (wasReal && !inside && !(turn && turn.distance <= 12)) { g.turnAt = now; g.steadyAt = now; say(rt('race.turn.end')); return; }
      }

      if (turn) {
        let calls = this._turnCalls.get(turn.id);
        if (!calls || now - calls.seen > 20000 && turn.distance > 100) {            // a new lap: call the turn again
          if (this._turnCalls.size > 24) this._turnCalls.delete(this._turnCalls.keys().next().value);
          calls = { far: false, m50: false, m30: false, now: false, at: -1e9, seen: now };
          this._turnCalls.set(turn.id, calls);
        }
        calls.seen = now;
        const name = this._turnName(turn), Name = name.charAt(0).toUpperCase() + name.slice(1);
        const quiet = now - calls.at > 1100;         // let the previous call finish
        const fast = this.speed > (turn.kind === 'sharp' ? 14 : turn.kind === 'slight' ? 40 : 22);
        let line = '', critical = false;
        // With the assist on, a gentle bend needs nothing from the driver, so it
        // gets one short notice instead of the full set of calls.
        if (turn.kind === 'slight' && rs.settings.assistSteering) { calls.far = calls.m30 = calls.now = true; }
        const nowAt = Math.max(9, this.speed * 0.45);       // leave the driver time to react
        if (turn.distance <= nowAt && !calls.now) { calls.now = calls.m30 = calls.m50 = calls.far = true; critical = true; line = rt('race.turn.now.' + turn.side); g.steadyAt = now; }
        else if (turn.distance <= 30 && turn.distance > nowAt && !calls.m30) {
          // At speed the 50 and 30 metre calls are under two seconds apart, so the
          // second one is shortened to fit: it must be finished before the turn.
          const soon = now - calls.at < 1500;
          calls.m30 = calls.m50 = calls.far = true; critical = !soon;
          line = soon ? rt('race.turn.short', { m: 30 }) : rt('race.turn.near', { m: 30, turn: name, Turn: Name });
        }
        else if (turn.distance <= 50 && turn.distance > 30 && !calls.m50 && quiet) { calls.m50 = calls.far = true; critical = true; line = rt(fast ? 'race.turn.nearSlow' : 'race.turn.near', { m: 50, turn: name, Turn: Name }); }
        else if (turn.distance <= 520 && turn.distance > 60 && !calls.far && (now - g.turnAt > 2500 || turn.distance < 130)) {
          calls.far = true;
          const m = turn.distance >= 450 ? 500 : Math.max(100, Math.round(turn.distance / 50) * 50);
          line = rt('race.turn.far', { m, turn: name, Turn: Name });
        }
        if (line) { calls.at = now; g.turnAt = now; this._lastTurnAnnounce = turn.side; this._lastTurnAnnounceAt = now; say(line, { critical }); g.inside = inside; return; }
      }

      const turnDue = Boolean(turn && turn.distance < 70);
      g.inside = inside;
      // Reminders, only when no turn call is due and the narrator has been quiet.
      if (moving && this.speed > 3 && !turnDue && now - g.turnAt > 2500) {
        if (inside && inside.kind !== 'slight' && now - g.steadyAt > 7000) { g.steadyAt = now; g.turnAt = now; say(rt('race.turn.steady.' + inside.side)); return; }
        if ((!inside || inside.kind === 'slight') && now - g.steadyAt > 15000) {
          if (inside && rs.settings.assistSteering) { g.steadyAt = now; g.turnAt = now; say(rt('race.bend.hold', { turn: this._turnName(inside) })); return; }
          if (inside) { g.steadyAt = now; g.turnAt = now; say(rt('race.turn.steady.' + inside.side)); return; }
          const next = this.upcomingTurn(this.track.total);
          g.steadyAt = now; g.turnAt = now;
          say(rt('race.straight', { m: Math.max(50, Math.round((next ? next.distance : 700) / 50) * 50) }));
          return;
        }
        if (interval !== Infinity && now - g.speedAt > interval) { g.speedAt = now; g.turnAt = now - 1500; say(rt('race.speed', { kmh: Math.round(this.speed * 3.6) })); }
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

    mapReport() {
      const sections = 12;
      const total = this.track.total || 1;
      const wrapped = ((this.lastProgress % total) + total) % total;
      const section = Math.min(sections, Math.floor((wrapped / total) * sections) + 1);
      const look = 40 + Math.abs(this.speed) * 1.1;
      const cur = this._pointAhead(this.px, this.py, 8);
      const ahead = this._pointAhead(this.px, this.py, look);
      const far = this._pointAhead(this.px, this.py, look + 25);
      let dh = Math.atan2(far.y - ahead.y, far.x - ahead.x) - Math.atan2(ahead.y - cur.y, ahead.x - cur.x);
      while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      const deg = dh * 180 / Math.PI;
      let next = 'straight';
      if (Math.abs(deg) >= 10 && Math.abs(deg) < 22) next = 'slight ' + (deg > 0 ? 'left' : 'right');
      else if (Math.abs(deg) < 50) next = deg > 0 ? 'left turn' : 'right turn';
      else if (Math.abs(deg) < 90) next = 'sharp ' + (deg > 0 ? 'left' : 'right') + ' turn';
      else if (Math.abs(deg) >= 90) next = 'hairpin';
      const surface = this.track.cfg.surface || 'asphalt';
      const hazard = surface === 'dirt' || surface === 'gravel' ? 'loose surface' : surface === 'asphalt' ? 'none' : surface;
      let opp = 'none nearby';
      let best = Infinity;
      for (const a of this.ai) {
        if (a.finished) continue;
        const d = Math.hypot(a.px - this.px, a.py - this.py);
        if (d < best) { best = d; opp = a.progress > this.progress ? `opponent ahead, ${Math.round(d)} meters` : `opponent behind, ${Math.round(d)} meters`; }
      }
      say(`Track: ${this.track.cfg.name || 'circuit'}. You are on section ${section} of ${sections}. Next: ${next}. Hazard: ${hazard}. ${opp}.`);
    }

    positionReport() {
      say(`You are in ${this.position}${this.position === 1 ? 'st' : this.position === 2 ? 'nd' : this.position === 3 ? 'rd' : 'th'} place. Lap ${Math.min(this.lap + 1, this.lapsTotal)} of ${this.lapsTotal}.`);
    }

    enterPit() {
      if (this.mode !== 'race') { say('Pit is only available during a race.'); return; }
      this.speed = Math.min(this.speed, 4);
      this.condition = Math.min(100, this.condition + 18);
      this.boostFuel = 1;
      this.stats.condition = this.condition;
      this.physics = physicsFrom({ ...this.stats, condition: this.condition });
      say('Pit stop. Condition restored a little. Boost refilled. You lost some time.');
      if (this.fuel < 99.5) this.refuel();
    }

    statusReport() {
      const kmh = Math.round(this.speed * 3.6);
      if (this.mode === 'race') {
        say(`Race status. Lap ${Math.min(this.lap + 1, this.lapsTotal)} of ${this.lapsTotal}. Position ${this.position}. Speed ${kmh} kilometers per hour. Checkpoint ${Math.min(this.nextCp + 1, this.track.checkpoints.length)} of ${this.track.checkpoints.length}.`);
      } else {
        say(`Practice status. Speed ${kmh} kilometers per hour. Gear ${this.gear}. Engine ${this.engineOn ? 'on' : 'off'}. Condition ${Math.round(this.condition)} percent.`);
      }
      say(rt('race.fuel.status', { pct: Math.round(this.fuel) }));
    }

    restart() {
      const i = 0;
      this.px = this.track.points[i].x; this.py = this.track.points[i].y;
      this.heading = Math.atan2(this.track.points[i + 1].y - this.track.points[i].y, this.track.points[i + 1].x - this.track.points[i].x);
      this.speed = 0; this.progress = 0; this.lastProgress = 0; this.lap = 0; this.nextCp = 0;
      this.finished = false; this.disabled = false; this.condition = 100; this.stats.condition = 100; this.physics = physicsFrom(this.stats);
      this.position = 1; this._finishOrderCounter = 0;
      this.latch.forward = this.latch.back = false; this.swipeSteer = 0; this._turnCalls.clear(); this._g = null; this.turnIntent = null; this._offRoad = false;
      if (this.fuel <= 0) this.fuel = 15;          // a restart never leaves the driver stranded
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
        .bsu-car-btn.latched{background:#15803d;border-color:#22c55e}
        .bsu-car-btn{touch-action:none;user-select:none;-webkit-user-select:none}
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
        <canvas class="bsu-car-canvas" id="bsu-car-canvas" role="img" aria-label="Track view. Drag left or right here to steer, swipe up to accelerate, swipe down to brake."></canvas>
        <div class="bsu-car-controls">
          <button class="bsu-car-btn" id="bsu-car-left" aria-label="Steer left. Tap once when a left turn is called to steer through it, or hold. Key A.">Left</button>
          <button class="bsu-car-btn" id="bsu-car-forward" aria-pressed="false" aria-label="Accelerate. Hold to accelerate, or tap once to keep accelerating and tap again to coast. Key W.">Forward</button>
          <button class="bsu-car-btn" id="bsu-car-right" aria-label="Steer right. Tap once when a right turn is called to steer through it, or hold. Key D.">Right</button>
          <button class="bsu-car-btn" id="bsu-car-reverse" aria-pressed="false" aria-label="Reverse. Hold, or tap once to keep reversing. Key S.">Reverse</button>
          <button class="bsu-car-btn" id="bsu-car-brake" aria-label="Brake. Hold to brake, or tap to brake for a moment. Releases the accelerator. Key Space.">Brake</button>
          <button class="bsu-car-btn" id="bsu-car-horn" aria-label="Horn">Horn</button>
          <button class="bsu-car-btn ghost" id="bsu-car-engine" aria-label="Toggle engine (E)">Engine</button>
          <button class="bsu-car-btn" id="bsu-car-boost" aria-label="Boost">Boost</button>
          <button class="bsu-car-btn ghost" id="bsu-car-status" aria-label="Race status (I)">Status</button>
          <button class="bsu-car-btn ghost" id="bsu-car-map" aria-label="Track map">Map</button>
          <button class="bsu-car-btn ghost" id="bsu-car-pit" aria-label="Pit stop and refuel">Pit / Refuel</button>
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

    /* Driving controls work three ways, so they work with a finger, a mouse, a
     * keyboard and a screen reader:
     *   hold  - the control is active for as long as it is held;
     *   tap   - Forward/Reverse stay on until tapped again (or until Brake);
     *           Left/Right/Brake act for a moment;
     *   click - what a screen reader or the Enter key sends: treated as a tap.
     * A hold never "sticks": losing the pointer for any reason releases it. */
    _bindOverlayControls() {
      const TAP_MS = 280;
      const sim = () => CarRacing.activeSim;
      const mark = (id, on) => { const el = document.getElementById(id); if (!el) return; el.classList.toggle('latched', on); el.setAttribute('aria-pressed', on ? 'true' : 'false'); };
      this._markLatches = () => { const s = sim(); mark('bsu-car-forward', Boolean(s?.latch.forward)); mark('bsu-car-reverse', Boolean(s?.latch.back)); };
      const tap = key => CarRacing.tapControl(key);
      const press = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        let downAt = 0, pointerId = null, handledAt = -Infinity;
        const release = () => { el.classList.remove('pressed'); sim()?.setInput(key, false); pointerId = null; };
        el.addEventListener('pointerdown', e => {
          e.preventDefault();
          downAt = performance.now(); pointerId = e.pointerId;
          try { el.setPointerCapture(e.pointerId); } catch (error) { /* not capturable */ }
          el.classList.add('pressed');
          const s = sim();
          if (!s) return;
          if ((key === 'forward' || key === 'back') && !s.engineOn) return;      // the tap handler explains and starts the engine
          s.setInput(key, true);
        });
        const up = e => {
          if (pointerId === null || (e.pointerId !== undefined && e.pointerId !== pointerId)) return;
          const held = performance.now() - downAt;
          release();
          handledAt = performance.now();
          if (held < TAP_MS) tap(key);
          else if (key === 'forward' || key === 'back') { const s = sim(); if (s) { s.latch.forward = s.latch.back = false; this._markLatches(); } }
        };
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', () => { if (pointerId !== null) { release(); handledAt = performance.now(); } });
        el.addEventListener('lostpointercapture', () => { if (pointerId !== null) { release(); handledAt = performance.now(); } });
        // Screen readers and the keyboard activate a button with "click" and no pointer events.
        el.addEventListener('click', e => { e.preventDefault(); if (performance.now() - handledAt < 500) return; tap(key); });
        el.addEventListener('contextmenu', e => e.preventDefault());
      };
      press('bsu-car-forward', 'forward');
      press('bsu-car-reverse', 'back');
      press('bsu-car-left', 'left');
      press('bsu-car-right', 'right');
      press('bsu-car-brake', 'brake');

      const horn = document.getElementById('bsu-car-horn');
      let hornTimer = null;
      const hornOff = () => { clearTimeout(hornTimer); sim()?.audio.horn(false); };
      horn.addEventListener('pointerdown', e => { try { horn.setPointerCapture(e.pointerId); } catch (error) { /* ignore */ } sim()?.audio.horn(true); horn._at = performance.now(); });
      horn.addEventListener('pointerup', hornOff); horn.addEventListener('pointercancel', hornOff); horn.addEventListener('lostpointercapture', hornOff);
      horn.addEventListener('click', () => { if (performance.now() - (horn._at ?? -Infinity) < 500) return; sim()?.audio.horn(true); clearTimeout(hornTimer); hornTimer = setTimeout(hornOff, 700); });

      // Steering by dragging on the track view. Drag sideways to steer (the
      // further the drag, the harder the turn), swipe up to accelerate, swipe
      // down to brake. Lifting the finger centres the wheel.
      const canvas = this.canvas;
      if (canvas) {
        let drag = null;
        const end = () => {
          const s = sim();
          if (drag && s) { s.swipeSteer = 0; if (drag.braking) s.setInput('brake', false); }
          drag = null;
        };
        canvas.addEventListener('pointerdown', e => { e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (error) { /* ignore */ } drag = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), vertical: false, braking: false, side: 0 }; });
        canvas.addEventListener('pointermove', e => {
          const s = sim();
          if (!drag || !s || e.pointerId !== drag.id) return;
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
          if (!drag.vertical && Math.abs(dx) >= 12 && Math.abs(dx) >= Math.abs(dy)) {
            s.swipeSteer = Math.max(-1, Math.min(1, dx / 90));
            const side = dx < 0 ? -1 : 1;
            if (side !== drag.side) { drag.side = side; say(rt(side < 0 ? 'race.steer.left' : 'race.steer.right')); }
          } else if (!drag.side && Math.abs(dy) >= 40 && Math.abs(dy) > Math.abs(dx) * 1.3 && !drag.vertical) {
            drag.vertical = true;
            if (dy < 0) CarRacing.setThrottle(true);
            else { drag.braking = true; CarRacing.setThrottle(false, { quiet: true }); s.setInput('brake', true); say(rt('race.braking')); }
          }
        });
        canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
      }

      document.getElementById('bsu-car-engine').addEventListener('click', () => CarRacing.toggleEngine());
      document.getElementById('bsu-car-boost').addEventListener('click', () => CarRacing.handleCommand('boost'));
      document.getElementById('bsu-car-status').addEventListener('click', () => CarRacing.activeSim && CarRacing.activeSim.statusReport());
      document.getElementById('bsu-car-map').addEventListener('click', () => CarRacing.handleCommand('map'));
      document.getElementById('bsu-car-pit').addEventListener('click', () => CarRacing.handleCommand('pit'));
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
        el.textContent = `Lap ${Math.min(sim.lap + 1, sim.lapsTotal)}/${sim.lapsTotal} · Pos ${sim.position} · ${kmh} km/h · Gear ${sim.gear} · Fuel ${Math.round(sim.fuel)}% · Car ${Math.round(sim.condition)}%`;
      } else {
        el.textContent = `Practice · ${kmh} km/h · Gear ${sim.gear} · Engine ${sim.engineOn ? 'ON' : 'OFF'} · Fuel ${Math.round(sim.fuel)}% · Car ${Math.round(sim.condition)}%`;
      }
      // A visual HUD only: it changes many times a second, so it must not be a
      // live region. Speech comes from the guidance calls instead.
      if (el.getAttribute('aria-live') !== 'off') el.setAttribute('aria-live', 'off');
      this._markLatches?.();
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
    trackZones, buildTrack: buildTrackPoints,
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
        <button id="bsu-race-race">New Race</button>
        <button id="bsu-race-continue">Continue Race</button>
        <button id="bsu-race-garage">Choose Car / Garage</button>
        <button id="bsu-race-dealership">Car Dealership</button>
        <button id="bsu-race-upgrades">Upgrades</button>
        <button id="bsu-race-results">Race Results</button>
        <button id="bsu-race-settings">Racing Settings & Accessibility</button>
        <button id="bsu-race-help">How to Drive</button>
      `, { onMount: () => {
        const bind = (id, fn) => document.getElementById(id).addEventListener('click', fn);
        bind('bsu-race-practice', () => { UI.closePanel(); this.startDriving('practice'); });
        bind('bsu-race-race', () => this.openRaceSelect());
        bind('bsu-race-continue', () => {
          if (this.activeSim && !this.activeSim.finished) { UI.closePanel(); UI.showOverlay(); say('Race resumed.'); this.activeSim._paused = false; }
          else say('No race in progress. Choose New Race.');
        });
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
        <label><input type="checkbox" id="bsu-set-assist" ${s.assistSteering ? 'checked' : ''}> Steering assist (the car works out how far to turn; you choose which way and when)</label>
        <label><input type="checkbox" id="bsu-set-opp" ${s.announceOpponents ? 'checked' : ''}> Announce nearby opponents</label>
        <label><input type="checkbox" id="bsu-set-rubber" ${s.rubberBand ? 'checked' : ''}> Rubber-banding (optional: opponents catch up if far ahead)</label>
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
          s.rubberBand = document.getElementById('bsu-set-rubber').checked;
          s.speedAnnounce = document.getElementById('bsu-set-speed').value;
          persist();
        };
        UI.panel.querySelectorAll('input[type=checkbox],select').forEach(el => el.addEventListener('change', save));
      }});
    },

    playTutorial() {
      say('Welcome to racing. Tap Forward once and the car keeps accelerating; tap it again to coast. When a turn is called, tap Left or Right once to steer through it, or hold the button, or drag sideways on the track view. Brake releases the accelerator. Turns are called at about 500, 50 and 30 meters. Watch your fuel and use Pit to refuel. Commands: accelerate, coast, brake, stop, left, right, boost, fuel, refuel, status, position, map, pause, quit race. Type tutorial any time to hear this again.', { critical: true });
    },

    handleCommand(raw) {
      const c = String(raw || '').trim().toLowerCase();
      const sim = this.activeSim;
      const pulse = (key, ms = 420) => {
        if (!sim) return false;
        if (!sim.engineOn && (key === 'forward' || key === 'boost')) this.toggleEngine();
        sim.setInput(key, true);
        setTimeout(() => { if (this.activeSim) this.activeSim.setInput(key, false); }, ms);
        return true;
      };
      if (c === 'tutorial' || c === 'racing tutorial') { this.playTutorial(); return true; }
      if (c === 'help' || c === 'racing help' || c === 'race rules' || c === 'controls') { this.openHelp(); return true; }
      if (c === 'quit race' || c === 'exit race' || c === 'leave race') { if (sim) this.exitDriving(); else say('You are not in a race.'); return true; }
      if (!sim) return false;
      if (c === 'accelerate' || c === 'gas' || c === 'throttle' || c === 'forward' || c === 'go') { pulse('forward', 900); this.setThrottle(true); return true; }
      if (c === 'coast' || c === 'release' || c === 'ease off' || c === 'lift') { this.setThrottle(false); return true; }
      if (c === 'reverse' || c === 'back up') { this.tapControl('back'); return true; }
      if (c === 'brake') { this.tapControl('brake'); return true; }
      if (c === 'stop' || c === 'stop car' || c === 'full stop') { this.setThrottle(false, { quiet: true }); sim.setInput('brake', true); say(rt('race.braking')); const hold = setInterval(() => { const live = this.activeSim; if (!live || live !== sim || Math.abs(sim.speed) < 0.3) { clearInterval(hold); if (live === sim) { sim.setInput('brake', false); say(rt('race.stopped')); } } }, 150); return true; }
      if (c === 'left') { this.tapControl('left'); return true; }
      if (c === 'right') { this.tapControl('right'); return true; }
      if (c === 'hard left' || c === 'hard right') { const key = c.endsWith('left') ? 'left' : 'right'; pulse(key, 1100); say(rt('race.steer.' + key)); return true; }
      if (c === 'refuel' || c === 'fill up' || c === 'fill tank') { sim.refuel(); return true; }
      if (c === 'fuel' || c === 'fuel level') { say(rt('race.fuel.status', { pct: Math.round(sim.fuel) })); return true; }
      if (c === 'boost') {
        if (sim.boostFuel <= 0.05) { say('Boost not ready.'); return true; }
        sim.boostOn = !sim.boostOn;
        say(sim.boostOn ? 'Boost on.' : 'Boost off.');
        return true;
      }
      if (c === 'status') { sim.statusReport(); return true; }
      if (c === 'position') { sim.positionReport(); return true; }
      if (c === 'map') { sim.mapReport(); return true; }
      if (c === 'pit' || c === 'pit stop') { if (sim.mode === 'race') sim.enterPit(); else sim.refuel(); return true; }
      if (c === 'pause') { sim._paused = true; say('Paused.'); return true; }
      if (c === 'resume') { sim._paused = false; say('Resumed.'); return true; }
      return false;
    },

    openHelp() {
      UI._panel('How to Drive', `
        <h3>Touch and screen reader</h3>
        <p>Forward: hold to accelerate, or tap once to keep accelerating and tap again to coast. With TalkBack or VoiceOver, double-tap works the same as a tap.</p>
        <p>Left and Right: when a turn is called, tap the matching side once and the car steers through that turn for you; or hold the button and let go when you hear "Straighten up". With steering assist on, the car works out how far to turn, and it holds gentle bends by itself. If you do not steer for a real turn, the car runs wide and leaves the road. You can also drag sideways on the track view; the further you drag, the harder the turn. Swipe up on the track view to accelerate, swipe down to brake.</p>
        <p>Brake: hold to brake, or tap to brake for a moment. Braking always releases the accelerator.</p>
        <h3>Text and voice commands</h3>
        <p>accelerate · coast · brake · stop · left · right · hard left · hard right · reverse · boost · fuel · refuel · status · position · map · pit · pause · resume · quit race · tutorial</p>
        <h3>Fuel</h3>
        <p>Driving uses fuel. You are warned at 25 and 10 percent. Use Pit / Refuel to fill the tank: one rupee per percent. If you cannot pay, the pit crew gives you a free emergency can.</p>
        <h3>Turn calls</h3>
        <p>Each turn is announced about 500 meters ahead, again at 50 meters and at 30 meters, and then "turn now" at the turn.</p>
        <h3>Keyboard</h3>
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
      const laps = TRACK_CONFIGS[trackId]?.laps || this.activeSim?.lapsTotal || 2;
      say(`Race starting. ${TRACK_CONFIGS[trackId].name}. Difficulty ${DIFFICULTY[difficulty].label}. ${laps} laps. Get ready.`);
      const rsTut = ensureState();
      if (!rsTut.tutorialSeen) {
        rsTut.tutorialSeen = true;
        persist();
        this.playTutorial();
      }
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

    /** Keep accelerating (or stop) without holding anything down. */
    setThrottle(on, { quiet = false } = {}) {
      const sim = this.activeSim;
      if (!sim) return false;
      if (on && !sim.engineOn) {
        if (sim.fuel <= 0) { say(rt('race.fuel.empty'), { critical: true }); return false; }
        say(rt('race.engineFirst'));
        sim.latch.forward = true; sim.latch.back = false;
        this.toggleEngine();
        UI._markLatches?.();
        return true;
      }
      const was = sim.latch.forward;
      sim.latch.forward = Boolean(on); if (on) sim.latch.back = false;
      UI._markLatches?.();
      if (!quiet && was !== sim.latch.forward) say(rt(on ? 'race.throttle.on' : 'race.throttle.off'));
      return true;
    },

    /** A tap (or a screen-reader activation) of a driving control. */
    tapControl(key) {
      const sim = this.activeSim;
      if (!sim) return false;
      const pulse = (name, ms) => { sim.setInput(name, true); setTimeout(() => { if (this.activeSim === sim) sim.setInput(name, false); }, ms); };
      if (key === 'forward') return this.setThrottle(!sim.latch.forward);
      if (key === 'back') {
        if (!sim.engineOn) { say(rt('race.engineFirst')); this.toggleEngine(); }
        sim.latch.back = !sim.latch.back; sim.latch.forward = false;
        UI._markLatches?.();
        say(rt(sim.latch.back ? 'race.reverse.on' : 'race.throttle.off'));
        return true;
      }
      if (key === 'brake') { const had = sim.latch.forward || sim.latch.back; sim.latch.forward = sim.latch.back = false; UI._markLatches?.(); pulse('brake', 1200); say(rt('race.braking') + (had ? ' ' + rt('race.throttle.off') : '')); return true; }
      if (key === 'left' || key === 'right') {
        const inside = sim.currentTurn(), ahead = sim.upcomingTurn(80);
        const turn = inside && inside.kind !== 'slight' && inside.side === key ? inside : ahead && ahead.kind !== 'slight' && ahead.side === key ? ahead : null;
        if (turn && ensureState().settings.assistSteering) {
          sim.turnIntent = { side: key, id: turn.start ?? turn.id, at: sim._t, entered: turn === inside };
          say(rt('race.steer.through.' + key));
        } else {
          if (sim.turnIntent && sim.turnIntent.side !== key) sim.turnIntent = null;      // tapping the other way cancels a held turn
          pulse(key, 550); say(rt('race.steer.' + key));
        }
        return true;
      }
      return false;
    },

    toggleEngine() {
      const sim = this.activeSim;
      if (!sim) return;
      if (!sim.engineOn && sim.fuel <= 0) { say(rt('race.fuel.empty'), { critical: true }); return; }
      if (sim.engineOn) {
        sim.latch.forward = sim.latch.back = false;
        sim.engineOn = false;
        say('Engine stopped.');
        sim.audio.stopEngineSequence();
      } else {
        say('Starting engine.');
        sim.audio.doorSequence(() => {
          sim.audio.startEngineSequence(() => { sim.engineOn = true; });
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
        const rs = ensureState();
        if (rs.ownedCars[sim.carId]) { rs.ownedCars[sim.carId].condition = Math.max(0, Math.round(sim.condition)); rs.ownedCars[sim.carId].fuel = Math.max(0, Math.round(sim.fuel)); }
        persist();
        say('You step out of the car. Vehicle secured.');
        sim.audio.doorSequence();
      }
      this.activeSim = null;
      if (this._countdownTimer) clearTimeout(this._countdownTimer);
      this._unbindKeys();
      UI.hideOverlay();
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
      if (won) sim.audio.winJingle();
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
      say(`The flag falls. You placed ${placeWord}.${won ? ' The crowd is still shouting your name.' : ' The pit crew is already looking at the next race.'}${leveled ? ' The racing circuit knows you better now.' : ''}`, { critical: true });
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

      if (R.activeSim && R.handleCommand(c)) return;
      if (c === 'tutorial' || c === 'racing tutorial') { R.playTutorial(); return; }
      if (c === 'race' && inDistrict) { R.openRaceSelect(); return; }
      if (c === 'new race') { R.openRaceSelect(); return; }
      if (c === 'continue race') { if (R.activeSim) { R.activeSim._paused = false; say('Race resumed.'); } else say('No race in progress.'); return; }
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
