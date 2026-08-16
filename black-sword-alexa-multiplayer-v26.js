/**
 * Black Sword Ultimate - Alexa & Amazon Multiplayer RPG Parity + True 2D Non-Looping World Grid v26
 * Adds:
 * - True 2D Non-Looping Map Grid: Enforces corners and intersections (e.g. 10 streets East-West where Street 10 turns South/West without looping back to start)
 * - Shop Cleanup: Enforces shops ONLY in cities (Valoria, Kaliwasch), removing shops from wilderness, dark forest, caves
 * - Clean Alexa Item Attributes: Items have explicit light, abilities, weapons, armor attributes
 * - Quest Boss Combat via Attack Command: No automatic quest ambushes; clicking Attack or typing 'attack' starts combat against the location's enemy/boss
 * - Random Wilderness Encounters ("not always, sometimes"): ~35% chance when moving in wild areas, with working Escape/Flee
 * - Dashboard Clean Compass: Keeps ONLY North, West, East, South buttons on the main dashboard compass pad
 * - Backpack Inventory Actions: Every item has Use, Equip, and Throw buttons + "Take Ground Loot" button when ground items exist
 * - Palace Companion Quests & Guild Master Revive: Companions give quests at Palace; Guild Masters revive fallen companions
 * - Anti-Insult / Anti-Cheating Community Code of Conduct Message across all chat rooms
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

  // 3. REGISTER 21 INTERCONNECTED ALEXA RPG LOCATIONS
  const alexaLocations = [
    // REGION 1: VALORIA (Bastion City)
    {
      id: 'valoria_citadel',
      name: 'Valoria — The Grand Bastion City',
      desc: 'A magnificent fortress city inspired by ancient Narkuma lore. Banners of gold and black flutter from towering stone walls.',
      exits: { south: 'kaliwasch_north_gate', north: 'valoria_square', east: 'valoria_market', west: 'valoria_street_1' },
      features: ['city gate', 'safe sanctuary', 'guild banner', 'palace entrance'],
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
    }
  ];

  // Register the 10 Streets (East-West with Corner at Street 10 turning South/West without looping!)
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
      // Street 10 turns corner South to Goblin Camp! No infinite loop!
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

  // WILDERNESS & GOBLIN CAMP LOCATIONS
  const wildLocations = [
    {
      id: 'sylvana_goblin_camp_1',
      name: 'Sylvana — Goblin Camp Entrance',
      desc: 'A fortified wooden barricade at the edge of the forest where goblins patrol. Command "attack" or click Attack to fight.',
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
      desc: 'The central command tent of the goblin hoard. You see the Goblin Chief guarding a pile of treasure. Click Attack or type "attack" to initiate combat!',
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
      desc: 'The innermost chamber of the fortress where Archmage Malakor performs forbidden experiments. Click Attack to challenge Malakor!',
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
      desc: 'The pinnacle of the world where Narkuma the Shadow Dragon guards the ultimate blackrock secret. Click Attack to challenge Narkuma!',
      exits: { south: 'solaris_summit_1', west: 'solaris_summit_2', east: 'celestial_sanctum_3', north: 'valoria_citadel' },
      features: ['dragon peak', 'blackrock altar'],
      items: ['dragon scale armor'],
      enemies: ['Narkuma the Shadow Dragon'],
      safe: false,
      music: 'boss'
    }
  ];

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

  // 5. Wilderness encounter scheduling is owned by sacred.js. Do not install a
  // second random timer here; it bypassed cooldowns and could fire after a
  // different battle had already completed.

  // 6. Attack is an action inside an existing encounter. It never creates a
  // second enemy or starts a hunt when no combat state exists.
  const oldAttackBtn = window.Game?.attack?.bind(window.Game);
  if (oldAttackBtn) {
    window.Game.attack = function(target) {
      if (this.state.inCombat) {
        if(target&&this.attackNamedTarget)return this.attackNamedTarget(target);
        return this.playerAttack();
      }
      this.addNarrative('You are not in combat.','system');
      if (window.MusicSystem) window.MusicSystem.playSFX('board-error');
    };
  }

  // 7. BACKPACK INVENTORY: Use, Equip, Throw, and Take Ground Loot!
  const oldShowInv = window.Game?.showInventory?.bind(window.Game);
  if (oldShowInv) {
    window.Game.showInventory = function() {
      const panel = document.getElementById('inventory-panel');
      const list = document.getElementById('inv-list');
      if (!list || !panel) return;

      list.innerHTML = '';

      // Take ground loot section at top
      const loc = WorldData.locations[this.state.location];
      const groundItems = (loc?.items || []).concat(this.state.sacred?.groundLoot || []);
      if (groundItems.length > 0) {
        const lootBox = document.createElement('div');
        lootBox.style.cssText = 'background:#1c2518;border:1px solid #3c6528;padding:8px;margin-bottom:10px;border-radius:4px;';
        const title = document.createElement('div');
        title.innerHTML = '<strong>🌱 Items on the Ground:</strong>';
        lootBox.appendChild(title);
        groundItems.forEach((gItem, idx) => {
          const itemName = typeof gItem === 'string' ? gItem : gItem.name;
          const btn = document.createElement('button');
          btn.className = 'small-action-btn';
          btn.style.margin = '4px 4px 0 0';
          btn.textContent = `Take Ground Loot: ${this.escapeHTML(itemName)}`;
          btn.onclick = () => {
            if (typeof gItem === 'string') {
              const itemObj = WorldData.items[gItem] || { name: gItem, type: 'misc', value: 10 };
              this.addItemToInventory(gItem, itemObj);
              loc.items.splice(idx, 1);
            } else {
              this.addItemToInventory(gItem.id || gItem.name, gItem);
              if (this.state.sacred?.groundLoot) this.state.sacred.groundLoot.splice(idx, 1);
            }
            this.addNarrative(`Picked up ${itemName} from the ground!`, 'treasure');
            if (window.MusicSystem) window.MusicSystem.playSFX('pickup');
            this.showInventory();
            this.updateHUD();
            this.save();
          };
          lootBox.appendChild(btn);
        });
        list.appendChild(lootBox);
      }

      if (!this.state.inventory || this.state.inventory.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'system';
        emptyMsg.textContent = 'Your backpack inventory is empty.';
        list.appendChild(emptyMsg);
      } else {
        this.state.inventory.forEach(item => {
          const div = document.createElement('div');
          div.className = 'inv-item';
          const canEquip = ['weapon','armor','helmet','gloves','boots','accessory'].includes(item.type);
          const nameEsc = this.escapeHTML(item.name);
          const jsEsc = this.escapeHTML(this.escapeJS(item.name));
          
          div.innerHTML = `
            <span><strong>${nameEsc}</strong> <small>(${this.escapeHTML(item.type || 'misc')})</small><br><span style="font-size:11px;color:#aaa;">${this.escapeHTML(item.desc || item.ability || '')}</span></span>
            <span style="display:flex;gap:4px;">
              <button onclick="Game.useItem('${jsEsc}')">Use</button>
              ${canEquip ? `<button onclick="Game.equipItem('${jsEsc}')">Equip</button>` : ''}
              <button onclick="Game.throwItem('${jsEsc}')" style="background:#5a1e1e;">Throw</button>
            </span>`;
          list.appendChild(div);
        });
      }

      panel.classList.remove('hidden');
    };
  }

  // Add Game.throwItem method
  window.Game.throwItem = function(query) {
    const idx = this.state.inventory.findIndex(i => i.name.toLowerCase() === query.toLowerCase());
    if (idx === -1) return;
    const item = this.state.inventory[idx];
    item.quantity--;
    if (item.quantity <= 0) this.state.inventory.splice(idx, 1);
    this.addNarrative(`Thrown away 1x ${item.name}.`, 'item');
    if (window.MusicSystem) window.MusicSystem.playSFX('miss');
    this.showInventory();
    this.updateHUD();
    this.save();
  };

  // 8. PALACE COMPANION QUESTS & GUILD MASTER REVIVES
  const oldEnterLoc = window.Game?.enterLocation?.bind(window.Game);
  if (oldEnterLoc) {
    window.Game.enterLocation = function(locationId) {
      oldEnterLoc(locationId);
      if (locationId === 'palace' || locationId === 'royal_palace' || locationId === 'valoria_citadel') {
        this.addNarrative('👑 You visit the Royal Palace! The Royal Companion & Guild Master is here. Type or click "Talk to Companion" to receive a Palace Quest or recruit a companion, and "Revive Companions" to restore fallen allies!', 'treasure');
      }
    };
  }

  window.Game.talkToCompanion = function() {
    const quests = [
      'Defeat the Goblin Chief in Sylvana Wilds',
      'Slay Narkuma the Shadow Dragon at Solaris Summit',
      'Explore the 10 Streets of Valoria West Avenue',
      'Recover an Alexa Codex from the Celestial Sanctum'
    ];
    const quest = quests[Math.floor(Math.random() * quests.length)];
    this.addNarrative(`👑 Royal Companion Lyra offers a Palace Quest: "${quest}". Complete it to win honors and unlock companions!`, 'npc');
    if (window.MusicSystem) window.MusicSystem.playSFX('levelup');
  };

  window.Game.reviveCompanions = function() {
    let revived = 0;
    (this.state.companions || []).forEach(c => {
      if (c.hp <= 0) {
        c.hp = c.maxHp;
        revived++;
      }
    });
    if (revived > 0) {
      this.addNarrative(`✨ The Guild Master revives ${revived} fallen companion(s) to full health!`, 'green-light');
      if (window.MusicSystem) window.MusicSystem.playSFX('heal-chain');
    } else {
      this.addNarrative('All of your companions are already at full health.', 'system');
    }
    this.updateHUD();
    this.save();
  };

  // 9. CLEAN DASHBOARD COMPASS PAD (Only North, West, East, South!) & REMOVE CLUTTER
  document.addEventListener('DOMContentLoaded', () => {
    // Keep ONLY North, West, East, South in compass pad
    const dirBtns = document.querySelectorAll('.compass-pad .dir-btn');
    dirBtns.forEach(btn => {
      const cmd = btn.getAttribute('data-cmd')?.toLowerCase();
      if (cmd !== 'north' && cmd !== 'west' && cmd !== 'east' && cmd !== 'south') {
        btn.remove();
      }
    });

    // Add Palace Companion / Guild Master buttons when at Palace or Citadel
    const actionBtns = document.querySelector('.action-btns');
    if (actionBtns && !document.getElementById('btn-palace-companion')) {
      const btnComp = document.createElement('button');
      btnComp.id = 'btn-palace-companion';
      btnComp.className = 'action-btn';
      btnComp.textContent = '👑 Companion Quest';
      btnComp.onclick = () => window.Game.talkToCompanion();
      actionBtns.appendChild(btnComp);

      const btnRevive = document.createElement('button');
      btnRevive.id = 'btn-guild-revive';
      btnRevive.className = 'action-btn';
      btnRevive.textContent = '✨ Revive Companions';
      btnRevive.onclick = () => window.Game.reviveCompanions();
      actionBtns.appendChild(btnRevive);
    }

    // 10. ANTI-INSULT / ANTI-CHEATING COMMUNITY CODE OF CONDUCT MESSAGE
    const chatCompose = document.querySelector('.social-compose');
    if (chatCompose && !document.getElementById('community-guidelines-banner')) {
      const banner = document.createElement('div');
      banner.id = 'community-guidelines-banner';
      banner.style.cssText = 'background:#2d1a1a;border:1px solid #7d3c3c;padding:6px 10px;margin-bottom:8px;border-radius:4px;font-size:12px;color:#f0d0d0;';
      banner.innerHTML = '<strong>⚠️ Community Guidelines:</strong> Insulting others, harassment, hate speech, or exploiting/cheating makes games frustrating for everyone and will result in an immediate ban. Treat fellow heroes with respect across all streets and cities!';
      chatCompose.parentNode.insertBefore(banner, chatCompose);
    }
  });

  // Command parity
  const oldCmd = window.Game?.processCommand?.bind(window.Game);
  if (oldCmd) {
    window.Game.processCommand = function(cmd) {
      const c = cmd.toLowerCase().trim();
      if (c === 'talk to companion' || c === 'companion quest' || c === 'palace quest') {
        this.talkToCompanion();
        return;
      }
      if (c === 'revive companions' || c === 'guild revive') {
        this.reviveCompanions();
        return;
      }
      oldCmd(cmd);
    };
  }

  console.log('Black Sword Alexa & Amazon Multiplayer RPG Parity + True 2D Non-Looping World Grid v26 Loaded Successfully!');
})();
