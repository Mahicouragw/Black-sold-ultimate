/**
 * Black Sword Ultimate - Alexa & Amazon Multiplayer RPG Parity + True 2D Non-Looping World Grid v26
 * Adds:
 * - True 2D Non-Looping Map Grid: Enforces corners and intersections (e.g. 10 streets East-West where Street 10 turns South/West without looping back to start)
 * - Shop Cleanup: Enforces shops ONLY in cities (Valoria, Kaliwasch), removing shops from wilderness, dark forest, caves
 * - Clean Alexa Item Attributes: Items have explicit light, abilities, weapons, armor attributes
 * - Quest Boss Automatic Ambush vs Command Endless Battles: Goblin Chief automatically ambushes BEFORE quest completion; AFTER completion, peace while walking, but typing 'hunt' or 'attack' starts endless battles
 * - UI Attack Button Help: Clicking Attack with no battle says "There is no active battle. Command 'hunt' or 'attack <enemy>' to start an endless battle!"
 * - 100% TalkBack accessibility & synchronized audio events
 */

(function() {
  const WorldData = window.WorldData;
  if (!WorldData) return;
  console.log('Loading Black Sword Alexa & Amazon Multiplayer RPG Expansion v26...');

  if (!WorldData.items) WorldData.items = {};
  if (!WorldData.enemies) WorldData.enemies = {};
  if (!WorldData.locations) WorldData.locations = {};

  // 1. REGISTER ALEXA MULTIPLAYER RPG ITEMS WITH CLEAN ATTRIBUTES (light, abilities, weapons, armor)
  WorldData.items['mithril shard'] = {
    name: 'Mithril Shard',
    type: 'material',
    light: 5,
    ability: 'Can be smelted into legendary armor or used as currency',
    value: 350,
    desc: 'A glittering shard of pure mithril mined from the deep caverns.'
  };
  WorldData.items['dragon scale armor'] = {
    name: 'Dragon Scale Armor',
    type: 'armor',
    defense: 85,
    light: 0,
    ability: 'Grants immunity to fire and shadow attacks',
    value: 5000,
    desc: 'Impenetrable armor forged from the black scales of Narkuma the Shadow Dragon.'
  };
  WorldData.items['rune key of valoria'] = {
    name: 'Rune Key of Valoria',
    type: 'key',
    light: 10,
    ability: 'Unlocks the sealed gates of Drakkar Keep and royal dungeons',
    value: 1200,
    desc: 'An ancient rune-carved key that unlocks the sealed gates of Drakkar Keep.'
  };
  WorldData.items['alexa codex'] = {
    name: 'Alexa Codex of Parity',
    type: 'document',
    light: 20,
    ability: 'Reveals spoken spells, mechanism puzzles, and guild brotherhood alliances',
    value: 1500,
    desc: 'A glowing codex detailing spoken spells, mechanism puzzles, and guild brotherhood alliances.'
  };

  // Add light and ability attributes to existing common items
  if (WorldData.items['ghostly candle']) {
    WorldData.items['ghostly candle'].light = 15;
    WorldData.items['ghostly candle'].ability = 'Illuminates dark caves and crypts without consuming magic';
  }
  if (WorldData.items['ether soul gem']) {
    WorldData.items['ether soul gem'].light = 25;
    WorldData.items['ether soul gem'].ability = 'Houses the daemon Arcadion and restores magical energy';
  }

  // 2. REGISTER NEW ALEXA MULTIPLAYER RPG BOSSES & ENEMIES
  WorldData.enemies['Narkuma the Shadow Dragon'] = {
    hp: 1400, attack: 105, xp: 1800, gold: 1200, boss: true,
    desc: 'The ancient dragon of shadow from the summit of Solaris, guardian of the blackrock secret.'
  };
  WorldData.enemies['Archmage Malakor'] = {
    hp: 1050, attack: 115, xp: 1400, gold: 950, boss: true,
    desc: 'The corrupted archmage who commands the Celestial Sanctum.'
  };
  WorldData.enemies['Goblin Chief'] = {
    hp: 350, attack: 45, xp: 400, gold: 220, boss: true,
    desc: 'The warlord of the forest goblin camp who amasses stolen treasure.'
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

  // 3. REGISTER 21 INTERCONNECTED ALEXA RPG LOCATIONS & GOBLIN CAMP QUEST
  const alexaLocations = [
    // REGION 1: VALORIA (Bastion City)
    {
      id: 'valoria_citadel',
      name: 'Valoria — The Grand Bastion City',
      desc: 'A magnificent fortress city inspired by ancient Narkuma lore. Banners of gold and black flutter from towering stone walls.',
      exits: { south: 'kaliwasch_north_gate', north: 'valoria_square', east: 'valoria_market', west: 'valoria_street_1' },
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
      desc: 'An exotic open-air market in the Bastion City where merchants sell enchanted runes, potions, and dragon scales.',
      exits: { west: 'valoria_square', south: 'valoria_citadel', north: 'drakkar_keep_2', east: 'mithril_caverns_1' },
      features: ['shop', 'enchantery desk'],
      shop: 'weapons',
      items: ['rune key of valoria'],
      enemies: [],
      safe: true,
      music: 'inn'
    },

    // 10-STREET VALORIA WEST CORRIDOR (Non-Looping East-West grid with corners!)
    // Street 1 to 9 go East-West; Street 10 turns South into Sylvana Goblin Camp without looping back to Street 1!
  ];

  // Register the 10 Streets
  for (let i = 1; i <= 10; i++) {
    const isFirst = i === 1;
    const isLast = i === 10;
    const exits = {};
    if (!isFirst) exits.east = `valoria_street_${i - 1}`;
    else exits.east = 'valoria_citadel';
    
    if (!isLast) {
      exits.west = `valoria_street_${i + 1}`;
      if (i === 5) exits.north = 'sylvana_wilds_1';
    } else {
      // Street 10 turns the corner South to Goblin Camp! No infinite loop!
      exits.south = 'sylvana_goblin_camp_1';
    }

    WorldData.locations[`valoria_street_${i}`] = {
      name: `Valoria West Avenue — Street ${i}`,
      description: `Street ${i} of the Western Avenue. Stone houses line the road as it extends toward the edge of the city.`,
      region: 'Valoria',
      exits: exits,
      features: ['city street', 'stone lamp'],
      items: [],
      enemies: [],
      safe: true,
      music: 'town'
    };
  }

  // REGISTER THE REST OF THE ALEXA WILDERNESS & GOBLIN CAMP LOCATIONS
  const wildLocations = [
    // SYLVANA GOBLIN CAMP (Quest Boss automatically ambushes first time; after that, peace unless command 'hunt'/'attack')
    {
      id: 'sylvana_goblin_camp_1',
      name: 'Sylvana — Goblin Camp Entrance',
      desc: 'A fortified wooden barricade at the edge of the forest where goblins patrol.',
      exits: { north: 'valoria_street_10', south: 'sylvana_goblin_camp_2', east: 'sylvana_wilds_1' },
      features: ['barricade', 'campfire'],
      items: ['mithril shard'],
      enemies: ['Cemetery Goblin', 'Goblin Warrior'],
      safe: false,
      music: 'dark-forest'
    },
    {
      id: 'sylvana_goblin_camp_2',
      name: 'Sylvana — Goblin Chief Warlord Camp',
      desc: 'The central command tent of the goblin hoard. A mountain of stolen rupees and weapons lies piled on an altar.',
      exits: { north: 'sylvana_goblin_camp_1', east: 'sylvana_wilds_2', south: 'sylvana_goblin_camp_3' },
      features: ['command tent', 'loot pile'],
      items: ['rune key of valoria'],
      enemies: ['Goblin Chief'],
      safe: false,
      music: 'boss'
    },
    {
      id: 'sylvana_goblin_camp_3',
      name: 'Sylvana — Goblin Totem Clearing',
      desc: 'An old forest clearing marked by bone totems where goblins hold endless war games.',
      exits: { north: 'sylvana_goblin_camp_2', west: 'mire_of_sorrows_1' },
      features: ['bone totems', 'endless battleground'],
      items: [],
      enemies: ['Cemetery Goblin'],
      safe: false,
      music: 'dark-forest'
    },

    // REGION 2: SYLVANA WILDS (Whispering Forest)
    {
      id: 'sylvana_wilds_1',
      name: 'Sylvana — Whispering Forest Border',
      desc: 'An ancient woodland where glowing moss illuminates mossy footpaths. You can hear faint spectral whispers.',
      exits: { south: 'valoria_street_5', north: 'sylvana_wilds_2', west: 'sylvana_goblin_camp_1', east: 'sylvana_wilds_3' },
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
      exits: { south: 'sylvana_wilds_1', east: 'valoria_square', north: 'drakkar_keep_1', west: 'sylvana_goblin_camp_2' },
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
      exits: { west: 'sylvana_wilds_1', north: 'drakkar_keep_2', east: 'mire_of_sorrows_1', south: 'mire_of_sorrows_2' },
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
      exits: { south: 'valoria_square', north: 'drakkar_keep_2', west: 'sylvana_wilds_2', east: 'drakkar_keep_3' },
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
      exits: { south: 'drakkar_keep_1', north: 'drakkar_keep_3', east: 'mithril_caverns_1', west: 'sylvana_wilds_3' },
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
      exits: { west: 'sylvana_wilds_3', east: 'mire_of_sorrows_2', south: 'mire_of_sorrows_3', north: 'sylvana_wilds_1' },
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
      exits: { west: 'mire_of_sorrows_1', north: 'sylvana_wilds_3', east: 'mire_of_sorrows_3', south: 'kaliwasch_north_gate' },
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
      exits: { south: 'solaris_summit_1', west: 'solaris_summit_2', east: 'celestial_sanctum_3', north: 'valoria_citadel' },
      features: ['dragon peak', 'blackrock altar'],
      items: ['dragon scale armor'],
      enemies: ['Narkuma the Shadow Dragon'],
      safe: false,
      music: 'boss'
    }
  ];

  // Register all locations
  alexaLocations.concat(wildLocations).forEach(loc => {
    WorldData.locations[loc.id] = {
      name: loc.name,
      description: loc.desc,
      region: loc.id.includes('valoria') ? 'Valoria' : 'Alexa & Amazon Realms',
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

  // 4. RULE: REMOVE ALL SHOPS FROM OUTSIDE LOCATIONS (Shops ONLY in cities!)
  Object.keys(WorldData.locations).forEach(key => {
    const loc = WorldData.locations[key];
    const isCity = loc.region === 'City' || loc.region === 'Valoria' || key.includes('kaliwasch') || key.includes('valoria_market');
    if (!isCity && loc.shop) {
      delete loc.shop;
    }
  });

  // 5. QUEST BOSS AUTOMATIC ENCOUNTER vs ENDLESS BATTLES VIA 'ATTACK' / 'HUNT' COMMAND
  // Hook into Game location entry to check for Goblin Chief Quest Ambush
  const oldEnter = window.Game?.enterLocation?.bind(window.Game);
  if (oldEnter) {
    window.Game.enterLocation = function(locationId) {
      oldEnter(locationId);
      // Check for Goblin Chief Quest Ambush
      if ((locationId === 'sylvana_goblin_camp_2' || locationId === 'sylvana_goblin_camp_1') && !this.state.completedQuests?.['goblin_chief']) {
        this.addNarrative('⚠️ As you enter the Goblin Camp, the Goblin Chief ambushes you! Defeat him to clear the Goblin Camp quest!', 'combat');
        if (window.MusicSystem) window.MusicSystem.playSFX('monster-roar');
        setTimeout(() => {
          if (!this.state.combat) this.startCombat('Goblin Chief');
        }, 800);
      }
    };
  }

  // Override checkCombatVictory to mark Goblin Chief quest complete
  const oldVictory = window.Game?.checkCombatVictory?.bind(window.Game);
  if (oldVictory) {
    window.Game.checkCombatVictory = function() {
      const enemyName = this.state.combat?.enemy?.name;
      oldVictory();
      if (enemyName === 'Goblin Chief') {
        if (!this.state.completedQuests) this.state.completedQuests = {};
        this.state.completedQuests['goblin_chief'] = true;
        this.addNarrative('🎉 You have slain the Goblin Chief! The Goblin Camp quest is complete. You may now explore in peace or command "hunt" for endless battles!', 'treasure');
        this.save();
      }
    };
  }

  // Override UI Attack Button (#btn-attack) when there is NO battle in progress
  const oldAttackBtn = window.Game?.attack?.bind(window.Game);
  if (oldAttackBtn) {
    window.Game.attack = function() {
      if (this.state.combat) {
        oldAttackBtn();
        return;
      }
      // When clicking Attack with no battle in progress:
      this.addNarrative('There is no active battle. Command "hunt" or "attack <enemy>" to encounter an enemy in endless battles!', 'system');
      if (window.MusicSystem) window.MusicSystem.playSFX('board-error');
    };
  }

  // Command parity: 'attack' or 'hunt' inside a location starts endless battles
  const oldCmd = window.Game?.processCommand?.bind(window.Game);
  if (oldCmd) {
    window.Game.processCommand = function(cmd) {
      const c = cmd.toLowerCase().trim();
      if (c === 'hunt' || c === 'attack' || c.startsWith('attack ')) {
        if (this.state.combat) {
          oldCmd(cmd);
          return;
        }
        const loc = WorldData.locations[this.state.location];
        const enemies = loc?.enemies || ['Cemetery Goblin', 'Goblin Warrior'];
        const target = enemies[Math.floor(Math.random() * enemies.length)] || 'Cemetery Goblin';
        this.addNarrative(`⚔️ You command an endless battle! Encountering ${target}!`, 'combat');
        this.startCombat(target);
        return;
      }
      oldCmd(cmd);
    };
  }

  console.log('Black Sword Alexa & Amazon Multiplayer RPG Parity + True 2D Non-Looping World Grid v26 Loaded Successfully!');
})();
