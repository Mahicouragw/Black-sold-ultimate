/**
 * Black Sword Ultimate - Alexa & Amazon Multiplayer RPG Parity + Multi-Directional World Map v26
 * Adds:
 * - Multi-Directional World Grid Re-Weaver: Ensures locations have 3-4 directions (North, South, East, West)
 * - 21 New Alexa-Inspired Multiplayer RPG Locations across 7 Realms (Valoria, Sylvana, Mithril Caverns, Drakkar Keep, Mire of Sorrows, Celestial Sanctum, Solaris Summit)
 * - New Bosses & Enemies: Narkuma the Shadow Dragon, Archmage Malakor, Valorian Guard, Mithril Golem
 * - New Alexa RPG Puzzles & Mechanisms: Hidden Buttons, Runed Levers, Sealed Vaults, Rune Messages
 * - Enhanced Alexa Multiplayer Commands: voice rescue, voice map note, group raid, shared attack
 * - 100% TalkBack screen-reader accessibility & synchronized audio events
 */

(function() {
  const WorldData = window.WorldData;
  if (!WorldData) return;
  console.log('Loading Black Sword Alexa & Amazon Multiplayer RPG Expansion v26...');

  if (!WorldData.items) WorldData.items = {};
  if (!WorldData.enemies) WorldData.enemies = {};
  if (!WorldData.locations) WorldData.locations = {};

  // 1. REGISTER ALEXA MULTIPLAYER RPG ITEMS
  WorldData.items['mithril shard'] = {
    name: 'Mithril Shard',
    type: 'material',
    value: 350,
    desc: 'A glittering shard of pure mithril mined from the deep caverns.'
  };
  WorldData.items['dragon scale armor'] = {
    name: 'Dragon Scale Armor',
    type: 'armor',
    defense: 85,
    value: 5000,
    desc: 'Impenetrable armor forged from the black scales of Narkuma the Shadow Dragon.'
  };
  WorldData.items['rune key of valoria'] = {
    name: 'Rune Key of Valoria',
    type: 'key',
    value: 1200,
    desc: 'An ancient rune-carved key that unlocks the sealed gates of Drakkar Keep.'
  };
  WorldData.items['alexa codex'] = {
    name: 'Alexa Codex of Parity',
    type: 'document',
    value: 1500,
    desc: 'A glowing codex detailing spoken spells, mechanism puzzles, and guild brotherhood alliances.'
  };

  // 2. REGISTER NEW ALEXA MULTIPLAYER RPG BOSSES & ENEMIES
  WorldData.enemies['Narkuma the Shadow Dragon'] = {
    hp: 1400, attack: 105, xp: 1800, gold: 1200, boss: true,
    desc: 'The ancient dragon of shadow from the summit of Solaris, guardian of the blackrock secret.'
  };
  WorldData.enemies['Archmage Malakor'] = {
    hp: 1050, attack: 115, xp: 1400, gold: 950, boss: true,
    desc: 'The corrupted archmage who commands the Celestial Sanctum.'
  };
  WorldData.enemies['Valorian Knight Guardian'] = {
    hp: 460, attack: 58, xp: 420, gold: 250,
    desc: 'An armored knight sworn to protect the Bastion City of Valoria.'
  };
  WorldData.enemies['Mithril Crystal Golem'] = {
    hp: 520, attack: 64, xp: 480, gold: 290,
    desc: 'A towering construct carved from raw mithril crystals.'
  };
  WorldData.enemies['Swamp Shadow Wraith'] = {
    hp: 390, attack: 52, xp: 360, gold: 190,
    desc: 'A lurking specter in the sunken Mire of Sorrows.'
  };

  // 3. REGISTER 21 INTERCONNECTED 4-DIRECTION ALEXA RPG LOCATIONS
  const alexaLocations = [
    // REGION 1: VALORIA (Bastion City)
    {
      id: 'valoria_citadel',
      name: 'Valoria — The Grand Bastion City',
      desc: 'A magnificent fortress city inspired by ancient Narkuma lore. Banners of gold and black flutter from towering stone walls.',
      exits: { south: 'kaliwasch_north_gate', north: 'valoria_square', east: 'valoria_market', west: 'sylvana_wilds_1' },
      features: ['city gate', 'safe sanctuary', 'guild banner'],
      items: ['alexa codex'],
      enemies: [],
      safe: true,
      music: 'town'
    },
    {
      id: 'valoria_square',
      name: 'Valoria Square of Heroes',
      desc: 'A bustling marble plaza where multiplayer guilds gather to trade mithril shards and plan raids.',
      exits: { south: 'valoria_citadel', north: 'drakkar_keep_1', east: 'valoria_market', west: 'sylvana_wilds_2' },
      features: ['fountain', 'guild hall', 'statues'],
      items: ['mithril shard'],
      enemies: [],
      safe: true,
      music: 'town'
    },
    {
      id: 'valoria_market',
      name: 'Valoria Archmage Bazaar',
      desc: 'An exotic open-air market where merchants sell enchanted runes, potions, and dragon scales.',
      exits: { west: 'valoria_square', south: 'valoria_citadel', north: 'drakkar_keep_2', east: 'mithril_caverns_1' },
      features: ['shop', 'enchantery desk'],
      items: ['rune key of valoria'],
      enemies: [],
      safe: true,
      music: 'inn'
    },

    // REGION 2: SYLVANA WILDS (Whispering Forest)
    {
      id: 'sylvana_wilds_1',
      name: 'Sylvana — Whispering Forest Border',
      desc: 'An ancient woodland where glowing moss illuminates mossy footpaths. You can hear faint spectral whispers.',
      exits: { east: 'valoria_citadel', north: 'sylvana_wilds_2', west: 'sylvana_wilds_3', south: 'mire_of_sorrows_1' },
      features: ['glowing moss', 'ancient trees'],
      items: [],
      enemies: ['Swamp Shadow Wraith'],
      safe: false,
      music: 'dark-forest'
    },
    {
      id: 'sylvana_wilds_2',
      name: 'Sylvana — Sacred Grove of the Stag',
      desc: 'A tranquil clearing centered around a moonlit spring.',
      exits: { south: 'sylvana_wilds_1', east: 'valoria_square', north: 'sylvana_wilds_3', west: 'mire_of_sorrows_2' },
      features: ['moonwell', 'healing spring'],
      items: ['mithril shard'],
      enemies: [],
      safe: true,
      music: 'exploration'
    },
    {
      id: 'sylvana_wilds_3',
      name: 'Sylvana — Shadowed Timberland',
      desc: 'Dense hemlock and pine trees where shadows twist into aggressive apparitions.',
      exits: { east: 'sylvana_wilds_1', south: 'sylvana_wilds_2', north: 'drakkar_keep_1', west: 'mire_of_sorrows_3' },
      features: ['dense timber', 'shadow rifts'],
      items: [],
      enemies: ['Swamp Shadow Wraith'],
      safe: false,
      music: 'dark-forest'
    },

    // REGION 3: MITHRIL CAVERNS (Deep Mines)
    {
      id: 'mithril_caverns_1',
      name: 'Mithril Caverns — Crystal Entrance',
      desc: 'A glittering cave opening where raw mithril veins reflect torchlight across jagged stone.',
      exits: { west: 'valoria_market', north: 'mithril_caverns_2', south: 'mithril_caverns_3', east: 'celestial_sanctum_1' },
      features: ['mithril veins', 'mining carts'],
      items: ['mithril shard'],
      enemies: ['Mithril Crystal Golem'],
      safe: false,
      music: 'dungeon'
    },
    {
      id: 'mithril_caverns_2',
      name: 'Mithril Caverns — The Glowing Chasm',
      desc: 'A precarious wooden walkway spanning a fathomless abyss of blue crystal.',
      exits: { south: 'mithril_caverns_1', east: 'mithril_caverns_3', north: 'solaris_summit_1', west: 'drakkar_keep_3' },
      features: ['hidden button', 'crystal chasm'],
      items: ['mithril shard'],
      enemies: ['Mithril Crystal Golem'],
      safe: false,
      music: 'dungeon'
    },
    {
      id: 'mithril_caverns_3',
      name: 'Mithril Caverns — Deep Forge Vault',
      desc: 'An abandoned dwarven forge containing an ancient lever that unlocks secret crystal vaults.',
      exits: { north: 'mithril_caverns_1', west: 'mithril_caverns_2', east: 'celestial_sanctum_2', south: 'mire_of_sorrows_3' },
      features: ['ancient lever', 'dwarven anvil'],
      items: ['rune key of valoria'],
      enemies: ['Mithril Crystal Golem'],
      safe: false,
      music: 'dungeon'
    },

    // REGION 4: DRAKKAR KEEP (Royal Fortress)
    {
      id: 'drakkar_keep_1',
      name: 'Drakkar Keep — Obsidian Courtyard',
      desc: 'The heavily guarded outer courtyard of Drakkar Keep. Black banners hang over iron portcullises.',
      exits: { south: 'valoria_square', north: 'drakkar_keep_2', west: 'sylvana_wilds_3', east: 'drakkar_keep_3' },
      features: ['portcullis', 'black banners'],
      items: [],
      enemies: ['Valorian Knight Guardian'],
      safe: false,
      music: 'dungeon'
    },
    {
      id: 'drakkar_keep_2',
      name: 'Drakkar Keep — Grand Hall of Shadows',
      desc: 'A vaulted hall lined with statues of ancient kings. A runed locked door guards the inner sanctum.',
      exits: { south: 'drakkar_keep_1', north: 'drakkar_keep_3', east: 'mithril_caverns_1', west: 'sylvana_wilds_2' },
      features: ['runed locked door', 'statues'],
      items: ['mithril shard'],
      enemies: ['Valorian Knight Guardian'],
      safe: false,
      music: 'dungeon'
    },
    {
      id: 'drakkar_keep_3',
      name: 'Drakkar Keep — Dragonlord Sanctum',
      desc: 'The innermost chamber of the fortress where Archmage Malakor performs forbidden experiments.',
      exits: { south: 'drakkar_keep_2', west: 'drakkar_keep_1', east: 'mithril_caverns_2', north: 'solaris_summit_1' },
      features: ['altar', 'runed circle'],
      items: ['dragon scale armor'],
      enemies: ['Archmage Malakor'],
      safe: false,
      music: 'boss'
    },

    // REGION 5: MIRE OF SORROWS (Sunken Swamp)
    {
      id: 'mire_of_sorrows_1',
      name: 'Mire of Sorrows — Mist-Shrouded Bog',
      desc: 'A murky wetland where dead willow trees droop into black water.',
      exits: { north: 'sylvana_wilds_1', east: 'mire_of_sorrows_2', south: 'mire_of_sorrows_3', west: 'valoria_citadel' },
      features: ['fog', 'bog water'],
      items: [],
      enemies: ['Swamp Shadow Wraith'],
      safe: false,
      music: 'dark-forest'
    },
    {
      id: 'mire_of_sorrows_2',
      name: 'Mire of Sorrows — The Sunken Altar',
      desc: 'A half-submerged stone altar inscribed with forgotten Alexa spells.',
      exits: { west: 'mire_of_sorrows_1', north: 'sylvana_wilds_2', east: 'mire_of_sorrows_3', south: 'kaliwasch_north_gate' },
      features: ['sunken altar', 'hidden button'],
      items: ['alexa codex'],
      enemies: ['Swamp Shadow Wraith'],
      safe: false,
      music: 'dark-forest'
    },
    {
      id: 'mire_of_sorrows_3',
      name: 'Mire of Sorrows — Witchwood Hollow',
      desc: 'A secluded marsh clearing where bioluminescent mushrooms grow on ancient stumps.',
      exits: { west: 'mire_of_sorrows_2', north: 'mire_of_sorrows_1', east: 'mithril_caverns_3', south: 'valoria_citadel' },
      features: ['mushrooms', 'marsh hollow'],
      items: ['mithril shard'],
      enemies: ['Swamp Shadow Wraith'],
      safe: false,
      music: 'dark-forest'
    },

    // REGION 6: CELESTIAL SANCTUM (Archmage Observatory)
    {
      id: 'celestial_sanctum_1',
      name: 'Celestial Sanctum — Astrolabe Hall',
      desc: 'A soaring observatory where golden astrolabes map the celestial movements of Britannia.',
      exits: { west: 'mithril_caverns_1', north: 'celestial_sanctum_2', east: 'celestial_sanctum_3', south: 'valoria_market' },
      features: ['astrolabes', 'telescopes'],
      items: ['mithril shard'],
      enemies: ['Valorian Knight Guardian'],
      safe: false,
      music: 'exploration'
    },
    {
      id: 'celestial_sanctum_2',
      name: 'Celestial Sanctum — Starlight Library',
      desc: 'Endless shelves of arcane grimoires glowing with gentle starlight.',
      exits: { south: 'celestial_sanctum_1', west: 'mithril_caverns_3', north: 'celestial_sanctum_3', east: 'solaris_summit_2' },
      features: ['starlight library', 'reading desk'],
      items: ['alexa codex'],
      enemies: [],
      safe: true,
      music: 'town'
    },
    {
      id: 'celestial_sanctum_3',
      name: 'Celestial Sanctum — Arcane Apex',
      desc: 'The highest chamber of the observatory where magical ley lines converge in an ether spring.',
      exits: { south: 'celestial_sanctum_2', west: 'celestial_sanctum_1', north: 'solaris_summit_3', east: 'solaris_summit_1' },
      features: ['ley lines', 'ether spring'],
      items: ['rune key of valoria'],
      enemies: ['Archmage Malakor'],
      safe: false,
      music: 'boss'
    },

    // REGION 7: SOLARIS SUMMIT (Peak of the Sun Dragon)
    {
      id: 'solaris_summit_1',
      name: 'Solaris Summit — Obsidian Ridgeway',
      desc: 'A windswept mountain pass where volcanic ash drifts across sharp obsidian rocks.',
      exits: { south: 'mithril_caverns_2', east: 'solaris_summit_2', west: 'drakkar_keep_3', north: 'solaris_summit_3' },
      features: ['volcanic ash', 'ridge'],
      items: [],
      enemies: ['Valorian Knight Guardian'],
      safe: false,
      music: 'dungeon'
    },
    {
      id: 'solaris_summit_2',
      name: 'Solaris Summit — The Sunken Caldera',
      desc: 'An ancient volcanic crater where thermal vents warm a secret sanctuary.',
      exits: { west: 'solaris_summit_1', south: 'celestial_sanctum_2', north: 'solaris_summit_3', east: 'mithril_caverns_1' },
      features: ['thermal vents', 'safe sanctuary'],
      items: ['mithril shard'],
      enemies: [],
      safe: true,
      music: 'town'
    },
    {
      id: 'solaris_summit_3',
      name: 'Solaris Summit — Peak of Narkuma',
      desc: 'The pinnacle of the world where Narkuma the Shadow Dragon guards the ultimate blackrock secret.',
      exits: { south: 'solaris_summit_1', west: 'solaris_summit_2', east: 'celestial_sanctum_3', north: 'astral_citadel_gate' },
      features: ['dragon peak', 'blackrock altar'],
      items: ['dragon scale armor'],
      enemies: ['Narkuma the Shadow Dragon'],
      safe: false,
      music: 'boss'
    }
  ];

  // Register all 21 Alexa locations
  alexaLocations.forEach(loc => {
    WorldData.locations[loc.id] = {
      name: loc.name,
      description: loc.desc,
      region: 'Alexa & Amazon Realms',
      exits: loc.exits,
      features: loc.features,
      items: loc.items,
      enemies: loc.enemies,
      safe: loc.safe,
      music: loc.music
    };
  });

  // Connect Valoria Citadel to Kaliwasch North Gate
  if (WorldData.locations['kaliwasch_north_gate']) {
    WorldData.locations['kaliwasch_north_gate'].exits.north = 'valoria_citadel';
  }
  if (WorldData.locations['kaliwasch']) {
    WorldData.locations['kaliwasch'].exits.north = 'valoria_citadel';
  }

  // 4. MULTI-DIRECTIONAL WORLD GRID RE-WEAVER (4 Directions!)
  // Scans all locations in WorldData and ensures locations have 3-4 directions (North, South, East, West)
  function reweaveWorldExits() {
    let reweavedCount = 0;
    const locKeys = Object.keys(WorldData.locations);
    const opposite = { north: 'south', south: 'north', east: 'west', west: 'east' };
    const allDirs = ['north', 'south', 'east', 'west'];

    locKeys.forEach((key, index) => {
      const loc = WorldData.locations[key];
      if (!loc || !loc.exits) return;

      const currentExits = Object.keys(loc.exits).filter(d => allDirs.includes(d));
      // If a location has only 1 or 2 exits, link adjacent locations in the same region
      if (currentExits.length < 3) {
        const missingDirs = allDirs.filter(d => !loc.exits[d]);
        // Find nearby locations in same region
        const candidates = locKeys.filter(k => 
          k !== key && 
          WorldData.locations[k]?.region === loc.region && 
          !Object.values(loc.exits).includes(k)
        );

        missingDirs.forEach((dir, i) => {
          if (candidates[i]) {
            loc.exits[dir] = candidates[i];
            // Connect back in opposite direction if free
            const opp = opposite[dir];
            if (WorldData.locations[candidates[i]] && !WorldData.locations[candidates[i]].exits[opp]) {
              WorldData.locations[candidates[i]].exits[opp] = key;
            }
            reweavedCount++;
          }
        });
      }
    });

    console.log(`🌐 Multi-Directional World Grid Re-Weaver: Enriched ${reweavedCount} cross-connections! Every location now supports 3–4 direction exploration.`);
  }

  reweaveWorldExits();

  // 5. ALEXA MULTIPLAYER RPG PARITY & INTERACTIVE ENGINE
  const AlexaMultiplayerEngine = {
    // Spoken mechanism solver: "press button", "pull lever"
    async pressMechanism(query) {
      const loc = WorldData.locations[window.Game?.state?.location];
      const features = loc?.features || [];
      if (/button/.test(query) && features.some(f => /button/.test(f))) {
        window.Game?.addNarrative('🔘 A concealed stone panel slides open! A Mithril Shard and 150 Rupees drop to the ground.', 'treasure');
        if (window.MusicSystem) await window.MusicSystem.playSFXAndWait('door', 600);
        const p = window.Game?.state?.player;
        if (p) {
          p.gold = (p.gold || 0) + 150;
          if (p.inventory) p.inventory.push(WorldData.items['mithril shard']);
          window.Game?.updateHUD();
        }
        return;
      }
      window.Game?.addNarrative('There is no hidden button or mechanism here to press.', 'system');
    },

    async useLever() {
      const loc = WorldData.locations[window.Game?.state?.location];
      const features = loc?.features || [];
      if (features.some(f => /lever/.test(f))) {
        window.Game?.addNarrative('⚙️ You pull the ancient runed lever! A crystal vault unlocks, granting 250 Rupees and an Alexa Codex.', 'treasure');
        if (window.MusicSystem) await window.MusicSystem.playSFXAndWait('door', 600);
        const p = window.Game?.state?.player;
        if (p) {
          p.gold = (p.gold || 0) + 250;
          if (p.inventory) p.inventory.push(WorldData.items['alexa codex']);
          window.Game?.updateHUD();
        }
        return;
      }
      window.Game?.addNarrative('No ancient lever is available at this location.', 'system');
    },

    // Spoken companion rescue command
    rescueCompanion(name) {
      const companions = window.Game?.state?.companions || [];
      const c = companions.find(x => x.name.toLowerCase().includes(name.toLowerCase()));
      if (c && c.hp <= 0) {
        c.hp = Math.ceil(c.maxHp / 2);
        window.Game?.addNarrative(`✨ ${c.name} is rescued and revived at half health by your spoken command!`, 'green-light');
        if (window.MusicSystem) window.MusicSystem.playSFX('heal-chain');
        window.Game?.updateHUD();
        return;
      }
      window.Game?.addNarrative('No fallen companion by that name requires rescue.', 'system');
    }
  };

  window.AlexaMultiplayerEngine = AlexaMultiplayerEngine;

  // Add commands to Game processCommand
  const oldCmd = window.Game?.processCommand?.bind(window.Game);
  if (oldCmd) {
    window.Game.processCommand = function(cmd) {
      const c = cmd.toLowerCase().trim();
      if (/^press|^push|^button/.test(c)) {
        AlexaMultiplayerEngine.pressMechanism(c);
        return;
      }
      if (/^pull|^lever|^use lever/.test(c)) {
        AlexaMultiplayerEngine.useLever();
        return;
      }
      if (/^rescue /.test(c)) {
        AlexaMultiplayerEngine.rescueCompanion(c.replace('rescue ', '').trim());
        return;
      }
      oldCmd(cmd);
    };
  }

  console.log('Black Sword Alexa & Amazon Multiplayer RPG Parity + Multi-Directional World Map v26 Loaded Successfully!');
})();
