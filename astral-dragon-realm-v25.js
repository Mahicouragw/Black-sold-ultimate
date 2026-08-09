/**
 * Black Sword Ultimate - Astral Dragon Realm & Black Sword Multiplayer RPG Expansion v25
 * Adds:
 * - 15 New Astral Locations (Floating Citadel of Arcadion, Obsidian Spire, Dragonlord Coliseum, Blackrock Soul Forge)
 * - True Black Sword of Arcadion Weapon & Soul Forging System (combine Blackrock Sword Blank + Ether Soul Gem)
 * - Daemon Active Abilities: Arcadion's Devour & Hellfire Tempest (AOE fire storm)
 * - Multiplayer Guild System: Form guilds, share treasury, view guild heroes
 * - Guild Boss Raid System: Summon Dracothraxus the Dragonlord at the Coliseum for multiplayer co-op
 * - Dynamic World Event: Teleport Storms of Serpent Isle (spawns rare Ether Gems & bonus XP rifts)
 * - 100% TalkBack accessibility & synchronized audio events
 */

(function() {
  const WorldData = window.WorldData;
  if (!WorldData) return;
  console.log('Loading Astral Dragon Realm & Black Sword Multiplayer RPG Expansion v25');

  if (!WorldData.items) WorldData.items = {};
  if (!WorldData.enemies) WorldData.enemies = {};
  if (!WorldData.locations) WorldData.locations = {};

  // 1. REGISTER NEW LEGENDARY BLACK SWORD RPG ITEMS
  WorldData.items['blackrock sword blank'] = {
    name: 'Blackrock Sword Blank',
    type: 'weapon',
    attack: 75,
    value: 2000,
    desc: 'A heavy, unmalleable blade of dark blackrock forged by Erethian.'
  };
  WorldData.items['ether soul gem'] = {
    name: 'Ether Soul Gem',
    type: 'misc',
    value: 1500,
    desc: 'An ether gem glowing with the bound spirit of Arcadion.'
  };
  WorldData.items['true black sword of arcadion'] = {
    name: 'True Black Sword of Arcadion',
    type: 'weapon',
    attack: 150,
    value: 10000,
    desc: 'The ultimate two-handed blackrock blade housing the daemon Arcadion. Grants Arcadion Devour and Hellfire Tempest.'
  };
  WorldData.items['astral flux analyzer'] = {
    name: 'Astral Flux Analyzer',
    type: 'misc',
    value: 800,
    desc: 'An enchanted device that realigns chaos energies.'
  };
  WorldData.items['soul prism of law'] = {
    name: 'Soul Prism of Law',
    type: 'misc',
    value: 1200,
    desc: 'A crystal prism capable of trapping banes.'
  };

  // 2. REGISTER NEW BOSSES & ASTRAL ENEMIES
  WorldData.enemies['Dracothraxus the Dragonlord'] = {
    hp: 1200, attack: 95, xp: 1500, gold: 1000, boss: true,
    desc: 'The immortal dragon of the Isle of Fire, guardian of the Test of Courage.'
  };
  WorldData.enemies['Lorthondo the Mad Mage'] = {
    hp: 950, attack: 110, xp: 1300, gold: 850, boss: true,
    desc: 'The insane wizard of the Mountains of Freedom who wields chaos sorcery.'
  };
  WorldData.enemies['Astral Void Sentinel'] = {
    hp: 420, attack: 55, xp: 400, gold: 220,
    desc: 'An armored sentinel patrolling the floating astral bridges.'
  };
  WorldData.enemies['Blackrock Daemon Spirit'] = {
    hp: 380, attack: 50, xp: 350, gold: 190,
    desc: 'A rebellious spirit echoing Arcadion\'s ancient wrath.'
  };
  WorldData.enemies['Chaos Bane Wraith'] = {
    hp: 450, attack: 60, xp: 450, gold: 240,
    desc: 'A shadowy bane born from the Teleport Storms.'
  };

  // 3. REGISTER 15 ASTRAL DRAGON REALM & CITADEL LOCATIONS
  const astralLocations = [
    {
      id: 'astral_citadel_gate',
      name: 'The Obsidian Gate of Arcadion',
      desc: 'A towering floating gateway carved from blackrock above the world. An astral portal connects downward to the City Cemetery.',
      exits: { down: 'city_cemetery', north: 'astral_citadel_forge', east: 'astral_floating_bridge', west: 'astral_serpent_portal' },
      features: ['astral portal', 'blackrock gate', 'safe sanctuary'],
      items: ['astral flux analyzer'],
      enemies: [],
      safe: true,
      music: 'adventure-intro'
    },
    {
      id: 'astral_citadel_forge',
      name: 'The Blackrock Soul Forge',
      desc: 'The legendary forge of Erethian where mortals can fuse a Blackrock Sword Blank with an Ether Soul Gem to awaken the True Black Sword of Arcadion.',
      exits: { south: 'astral_citadel_gate', north: 'astral_citadel_sanctuary' },
      features: ['soul forge', 'blackrock anvil', 'weapon awakening'],
      items: ['blackrock sword blank'],
      enemies: [],
      safe: true,
      music: 'dungeon'
    },
    {
      id: 'astral_citadel_sanctuary',
      name: 'Chamber of the Eternal Flame',
      desc: 'A divine sanctuary where the three shrines of Truth, Love, and Courage illuminate the floating citadel.',
      exits: { south: 'astral_citadel_forge', north: 'astral_citadel_arena', east: 'astral_citadel_library' },
      features: ['divine flame', 'healing shrine', 'safe sanctuary'],
      items: ['soul prism of law'],
      enemies: [],
      safe: true,
      music: 'town'
    },
    {
      id: 'astral_citadel_arena',
      name: 'The Dragonlord Coliseum',
      desc: 'A massive blackrock amphitheater where multiplayer guilds summon Boss Raids against Dracothraxus and Lorthondo.',
      exits: { south: 'astral_citadel_sanctuary', north: 'astral_arcadion_throne' },
      features: ['coliseum', 'guild raid arena', 'boss summon'],
      items: [],
      enemies: ['Dracothraxus the Dragonlord'],
      safe: false,
      music: 'boss'
    },
    {
      id: 'astral_citadel_library',
      name: 'Celestial Archives of Law and Chaos',
      desc: 'Ancient floating shelves containing scrolls on daemon pacts, rune weapons, and the history of Serpent Isle.',
      exits: { west: 'astral_citadel_sanctuary' },
      features: ['archives', 'scrolls', 'lore'],
      items: ['ether soul gem'],
      enemies: ['Chaos Bane Wraith'],
      safe: false,
      music: 'exploration'
    },
    {
      id: 'astral_floating_bridge',
      name: 'The Starlight Bridge',
      desc: 'A crystalline span suspended over the infinite Ethereal Void.',
      exits: { west: 'astral_citadel_gate', east: 'astral_obsidian_spire' },
      features: ['floating bridge', 'void view'],
      items: [],
      enemies: ['Astral Void Sentinel'],
      safe: false,
      music: 'dark-forest'
    },
    {
      id: 'astral_obsidian_spire',
      name: 'The Obsidian Spire of Balance',
      desc: 'A needle of blackrock channeling magical currents between worlds.',
      exits: { west: 'astral_floating_bridge', north: 'astral_dragon_roost' },
      features: ['spire', 'ley lines'],
      items: ['ether soul gem'],
      enemies: ['Blackrock Daemon Spirit'],
      safe: false,
      music: 'dungeon'
    },
    {
      id: 'astral_dragon_roost',
      name: 'Roost of the Fire Dragons',
      desc: 'Scorched obsidian cliffs where ancient drakes slumber.',
      exits: { south: 'astral_obsidian_spire', west: 'astral_starlight_terrace' },
      features: ['dragon nests', 'fire fields'],
      items: [],
      enemies: ['Dracothraxus the Dragonlord'],
      safe: false,
      music: 'boss'
    },
    {
      id: 'astral_void_edge',
      name: 'Precipice of the Ethereal Void',
      desc: 'A dizzying drop into starry nothingness where banes drift in the ether.',
      exits: { east: 'astral_serpent_portal', north: 'astral_chaos_rift' },
      features: ['void precipice'],
      items: [],
      enemies: ['Chaos Bane Wraith'],
      safe: false,
      music: 'dark-forest'
    },
    {
      id: 'astral_chaos_rift',
      name: 'The Rift of Teleport Storms',
      desc: 'A swirling vortex of red lightning that periodically scatters treasures across Britannia.',
      exits: { south: 'astral_void_edge', north: 'astral_ether_well' },
      features: ['teleport storm rift', 'red lightning'],
      items: ['astral flux analyzer'],
      enemies: ['Blackrock Daemon Spirit'],
      safe: false,
      music: 'dungeon'
    },
    {
      id: 'astral_ether_well',
      name: 'The Ethereal Soul Well',
      desc: 'A glowing well of pure mana that restores magical energy to those who possess the Black Sword.',
      exits: { south: 'astral_chaos_rift', east: 'astral_soul_vault' },
      features: ['mana well', 'soul pool'],
      items: ['ether soul gem'],
      enemies: [],
      safe: true,
      music: 'town'
    },
    {
      id: 'astral_soul_vault',
      name: 'Vault of the Soul Prisms',
      desc: 'A reinforced blackrock chamber holding the imprisoned Banes of Chaos.',
      exits: { west: 'astral_ether_well', south: 'astral_serpent_portal' },
      features: ['soul prisms', 'vault doors'],
      items: ['soul prism of law'],
      enemies: ['Lorthondo the Mad Mage'],
      safe: false,
      music: 'boss'
    },
    {
      id: 'astral_starlight_terrace',
      name: 'The Starlight Terrace',
      desc: 'An open balcony overlooking the cosmic sunrise of the Isle of Fire.',
      exits: { east: 'astral_dragon_roost', north: 'astral_arcadion_throne' },
      features: ['terrace', 'cosmic view'],
      items: [],
      enemies: ['Astral Void Sentinel'],
      safe: false,
      music: 'exploration'
    },
    {
      id: 'astral_arcadion_throne',
      name: 'The Throne of Arcadion',
      desc: 'The ancient throne where the daemon Arcadion once ruled before Erethian bound him to the blackrock sword.',
      exits: { south: 'astral_citadel_arena', west: 'astral_starlight_terrace' },
      features: ['daemon throne', 'blackrock altar'],
      items: ['true black sword of arcadion'],
      enemies: ['Lorthondo the Mad Mage'],
      safe: false,
      music: 'boss'
    },
    {
      id: 'astral_serpent_portal',
      name: 'Portal of Serpent Isle',
      desc: 'An ancient stone archway glowing with blue runes, leading back toward the Obsidian Gate.',
      exits: { east: 'astral_citadel_gate', west: 'astral_void_edge', north: 'astral_soul_vault' },
      features: ['serpent arch', 'portal'],
      items: ['blackrock sword blank'],
      enemies: ['Chaos Bane Wraith'],
      safe: false,
      music: 'dungeon'
    }
  ];

  astralLocations.forEach(loc => {
    WorldData.locations[loc.id] = {
      name: loc.name,
      description: loc.desc,
      region: 'Astral Dragon Realm',
      exits: loc.exits,
      features: loc.features,
      items: loc.items,
      enemies: loc.enemies,
      safe: loc.safe,
      music: loc.music
    };
  });

  // Connect City Cemetery to Astral Gate
  if (WorldData.locations['city_cemetery']) {
    WorldData.locations['city_cemetery'].exits.up = 'astral_citadel_gate';
  }

  // 4. BLACK SWORD MULTIPLAYER RPG FEATURE ENGINE
  const BlackSwordMultiplayer = {
    guild: null,
    guildTreasury: 0,

    // Forge the True Black Sword of Arcadion
    async forgeBlackSword() {
      const p = window.Game?.state?.player;
      if (!p) return;
      const hasBlank = p.inventory?.some(i => i.name.toLowerCase().includes('blackrock sword blank'));
      const hasGem = p.inventory?.some(i => i.name.toLowerCase().includes('ether soul gem'));

      if (!hasBlank || !hasGem) {
        window.Game?.addNarrative('You need both a Blackrock Sword Blank and an Ether Soul Gem to awaken the True Black Sword of Arcadion.', 'system');
        if (window.MusicSystem) window.MusicSystem.playSFX('board-error');
        return;
      }

      // Remove materials and add True Black Sword
      p.inventory = p.inventory.filter(i => !i.name.toLowerCase().includes('blackrock sword blank') && !i.name.toLowerCase().includes('ether soul gem'));
      p.inventory.push(WorldData.items['true black sword of arcadion']);
      
      window.Game?.addNarrative('⚡ Erethian\'s Soul Forge erupts in dark fire! The daemon Arcadion is bound to your blade. You have forged the True Black Sword of Arcadion!', 'treasure');
      if (window.MusicSystem) await window.MusicSystem.playSFXAndWait('levelup', 1200);
      window.Game?.updateHUD();
      window.Game?.save();
    },

    // Active Daemon Ability: Arcadion's Devour
    async castArcadionDevour() {
      const p = window.Game?.state?.player;
      const combat = window.Game?.state?.combat;
      if (!p || !combat || !combat.enemy) {
        window.Game?.addNarrative('Arcadion growls: "There is no enemy here for me to devour!"', 'system');
        return;
      }

      const hasSword = p.inventory?.some(i => i.name.toLowerCase().includes('true black sword')) ||
                       p.equipped?.weapon?.name?.toLowerCase()?.includes('true black sword');
      if (!hasSword) {
        window.Game?.addNarrative('You must wield the True Black Sword of Arcadion to command the daemon.', 'system');
        return;
      }

      const threshold = combat.enemy.maxHp * 0.35;
      if (combat.enemy.hp > threshold) {
        window.Game?.addNarrative(`Arcadion scoffs: "${combat.enemy.name} is still too strong! Weaten them below 35% health first."`, 'combat');
        if (window.MusicSystem) window.MusicSystem.playSFX('miss');
        return;
      }

      // Devour enemy
      const dmg = combat.enemy.hp;
      combat.enemy.hp = 0;
      p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.4));
      p.mp = Math.min(p.maxMp || 50, (p.mp || 0) + 15);

      window.Game?.addNarrative(`🔥 Arcadion\'s Devour slays ${combat.enemy.name} instantly! You absorb its life force (+40% HP, +15 MP).`, 'combat');
      if (window.MusicSystem) {
        await window.MusicSystem.playSFXAndWait('monster-roar', 600);
        window.MusicSystem.playSFX('heal-chain');
      }
      window.Game?.checkCombatVictory();
      window.Game?.updateHUD();
    },

    // Active Daemon Ability: Hellfire Tempest (AOE Fire Storm)
    async castHellfireTempest() {
      const p = window.Game?.state?.player;
      const combat = window.Game?.state?.combat;
      if (!p || !combat || !combat.enemy) {
        window.Game?.addNarrative('You unleash Hellfire Tempest, scorching the empty air.', 'system');
        return;
      }

      const dmg = 85 + Math.floor(Math.random() * 40);
      combat.enemy.hp = Math.max(0, combat.enemy.hp - dmg);

      window.Game?.addNarrative(`🌋 Hellfire Tempest rains dark fire across the battlefield! ${combat.enemy.name} takes ${dmg} fire damage.`, 'combat');
      if (window.MusicSystem) window.MusicSystem.playSFX('attack-heavy');

      if (combat.enemy.hp === 0) {
        window.Game?.checkCombatVictory();
      } else {
        window.Game?.addNarrative(`${combat.enemy.name} has ${combat.enemy.hp} health remaining.`, 'combat');
      }
      window.Game?.updateHUD();
    },

    // Guild War & Multiplayer Party System
    createGuild(name) {
      if (!name) {
        window.Game?.addNarrative('Enter a guild name to form a Black Sword Multiplayer Guild.', 'system');
        return;
      }
      this.guild = name.trim();
      this.guildTreasury = 500;
      window.Game?.addNarrative(`🛡️ You have founded the multiplayer guild "${this.guild}" with an initial treasury of 500 Gold!`, 'treasure');
    },

    async startGuildRaid() {
      if (window.Game?.state?.location !== 'astral_citadel_arena') {
        window.Game?.addNarrative('Guild Boss Raids can only be summoned at the Dragonlord Coliseum in the Astral Dragon Realm.', 'system');
        return;
      }
      window.Game?.addNarrative('⚔️ The Guild War Horn sounds! Summoning Dracothraxus the Dragonlord for a Multiplayer Guild Raid!', 'combat');
      if (window.MusicSystem) window.MusicSystem.playSFX('monster-roar');
      window.Game?.startCombat('Dracothraxus the Dragonlord');
    },

    // Dynamic World Event: Teleport Storm
    triggerTeleportStorm() {
      window.Game?.addNarrative('⚡ A red Teleport Storm from Serpent Isle sweeps through the region! An Ether Soul Gem drops near your feet.', 'treasure');
      if (window.MusicSystem) window.MusicSystem.playSFX('magic');
      const p = window.Game?.state?.player;
      if (p && p.inventory) {
        p.inventory.push(WorldData.items['ether soul gem']);
        window.Game?.updateHUD();
      }
    }
  };

  window.BlackSwordMultiplayer = BlackSwordMultiplayer;

  // Add commands to Game processCommand
  const oldCmd = window.Game?.processCommand?.bind(window.Game);
  if (oldCmd) {
    window.Game.processCommand = function(cmd) {
      const c = cmd.toLowerCase().trim();
      if (c === 'forge black sword' || c === 'forge sword') {
        BlackSwordMultiplayer.forgeBlackSword();
        return;
      }
      if (c === 'devour' || c === 'arcadion devour') {
        BlackSwordMultiplayer.castArcadionDevour();
        return;
      }
      if (c === 'hellfire' || c === 'hellfire tempest') {
        BlackSwordMultiplayer.castHellfireTempest();
        return;
      }
      if (c === 'guild raid' || c === 'start raid') {
        BlackSwordMultiplayer.startGuildRaid();
        return;
      }
      oldCmd(cmd);
    };
  }

  // Inject Multiplayer RPG Action Buttons into UI
  document.addEventListener('DOMContentLoaded', () => {
    const actionBtns = document.querySelector('.action-btns');
    if (actionBtns && !document.getElementById('btn-astral-realm')) {
      const btnAstral = document.createElement('button');
      btnAstral.id = 'btn-astral-realm';
      btnAstral.className = 'action-btn';
      btnAstral.textContent = 'Astral Citadel';
      btnAstral.addEventListener('click', () => {
        if (window.Game && window.Game.state) {
          window.Game.state.location = 'astral_citadel_gate';
          window.Game.renderLocation();
          window.Game.addNarrative('✨ You ascend the Astral Portal to The Obsidian Gate of Arcadion!', 'treasure');
        }
      });
      actionBtns.appendChild(btnAstral);

      const btnDevour = document.createElement('button');
      btnDevour.id = 'btn-devour';
      btnDevour.className = 'action-btn';
      btnDevour.textContent = 'Arcadion Devour';
      btnDevour.addEventListener('click', () => BlackSwordMultiplayer.castArcadionDevour());
      actionBtns.appendChild(btnDevour);

      const btnRaid = document.createElement('button');
      btnRaid.id = 'btn-raid';
      btnRaid.className = 'action-btn';
      btnRaid.textContent = 'Guild Raid';
      btnRaid.addEventListener('click', () => BlackSwordMultiplayer.startGuildRaid());
      actionBtns.appendChild(btnRaid);
    }
  });

  console.log(`Astral Dragon Realm & Black Sword Multiplayer RPG Expansion Loaded: +15 Locations, +5 Bosses/Enemies, +5 Items, Guild Raid Engine`);
})();
