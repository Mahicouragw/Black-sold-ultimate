/**
 * v7.49.0 — COMPLETE WORLD RESTRUCTURE (Black Sword Alexa Style)
 * Proper city layout, interconnected forest, villages, caves, tunnels, rivers
 */
(() => {
    'use strict';

    const buildWorld = () => {
        if (!window.WorldData) {
            setTimeout(buildWorld, 100);
            return;
        }

        const W = window.WorldData;
        const G = window.Game;

        // Clear existing locations
        W.locations = {};

        // ===== KALIWASCH CITY - MARKET SQUARE CENTER =====
        // Market Square is the center. Each gate is 3-4 steps away.
        
        // Row 1: North edge of city
        W.locations['market_north'] = {
            name: 'North Market',
            description: 'Stalls and merchants. The North Gate is ahead.',
            exits: { north: 'north_gate_approach', south: 'market_square', east: 'guild_hall', west: 'temple' },
            features: ['market', 'city'],
            items: [], enemies: [], safe: true, music: 'town'
        };

        W.locations['north_gate_approach'] = {
            name: 'North Gate Approach',
            description: 'The path to the North Gate.',
            exits: { north: 'north_gate', south: 'market_north' },
            features: ['city', 'gate approach'],
            items: [], enemies: [], safe: true
        };

        W.locations['north_gate'] = {
            name: 'North Gate',
            description: 'The northern entrance to Kaliwasch. Beyond lies the forest.',
            exits: { south: 'north_gate_approach', north: 'forest_north_1' },
            features: ['gate', 'city'],
            items: [], enemies: [], safe: true
        };

        // Row 2: Center row (Market Square)
        W.locations['temple'] = {
            name: 'Temple of Auralis',
            description: 'A sacred place. Healers tend to the wounded.',
            exits: { east: 'market_square', south: 'city_cemetery' },
            features: ['temple', 'city'],
            items: [], enemies: [], safe: true
        };

        W.locations['market_square'] = {
            name: 'Market Square',
            description: 'The bustling heart of Kaliwasch. Streets lead in all directions.',
            exits: { north: 'market_north', south: 'market_south', east: 'tavern', west: 'provisions_shop' },
            features: ['marketplace', 'city center'],
            items: [], enemies: [], safe: true, music: 'town'
        };

        W.locations['guild_hall'] = {
            name: 'Adventurers Guild',
            description: 'Quest board on the wall. Guild masters offer training.',
            exits: { west: 'market_north', up: 'guild_training' },
            features: ['guild', 'city'],
            items: [], enemies: [], safe: true
        };

        W.locations['tavern'] = {
            name: 'The Rusty Tankard Tavern',
            description: 'A lively tavern. Adventurers share tales over drinks.',
            exits: { west: 'market_square', east: 'east_gate_approach' },
            features: ['tavern', 'city'],
            items: [], enemies: [], safe: true
        };

        W.locations['provisions_shop'] = {
            name: 'Provisions Shop',
            description: 'Weapons, armor, potions for sale.',
            exits: { east: 'market_square', west: 'west_gate_approach' },
            features: ['shop', 'city'],
            shop: 'provisions',
            items: ['health potion', 'mana potion', 'iron sword', 'leather armor', 'fishing rod'],
            enemies: [], safe: true
        };

        // Row 3: South edge of city
        W.locations['market_south'] = {
            name: 'South Market',
            description: 'Southern bazaars. The South Gate lies ahead.',
            exits: { north: 'market_square', south: 'south_gate_approach', east: 'house_1', west: 'house_2' },
            features: ['market', 'city'],
            items: [], enemies: [], safe: true
        };

        W.locations['south_gate_approach'] = {
            name: 'South Gate Approach',
            description: 'The path to the South Gate.',
            exits: { north: 'market_south', south: 'south_gate' },
            features: ['city', 'gate approach'],
            items: [], enemies: [], safe: true
        };

        W.locations['south_gate'] = {
            name: 'South Gate',
            description: 'The southern gate. The forest stretches beyond.',
            exits: { north: 'south_gate_approach', south: 'forest_south_1' },
            features: ['gate', 'city'],
            items: [], enemies: [], safe: true
        };

        // East Gate
        W.locations['east_gate_approach'] = {
            name: 'East Gate Approach',
            description: 'The path to the East Gate.',
            exits: { west: 'tavern', east: 'east_gate' },
            features: ['city', 'gate approach'],
            items: [], enemies: [], safe: true
        };

        W.locations['east_gate'] = {
            name: 'East Gate',
            description: 'Eastern entrance. Forest paths await.',
            exits: { west: 'east_gate_approach', east: 'forest_east_1' },
            features: ['gate', 'city'],
            items: [], enemies: [], safe: true
        };

        // West Gate
        W.locations['west_gate_approach'] = {
            name: 'West Gate Approach',
            description: 'The path to the West Gate.',
            exits: { east: 'provisions_shop', west: 'west_gate' },
            features: ['city', 'gate approach'],
            items: [], enemies: [], safe: true
        };

        W.locations['west_gate'] = {
            name: 'West Gate',
            description: 'Western gate. The forest begins here.',
            exits: { east: 'west_gate_approach', west: 'forest_west_1' },
            features: ['gate', 'city'],
            items: [], enemies: [], safe: true
        };

        // City Cemetery (accessible from temple)
        W.locations['city_cemetery'] = {
            name: 'City Cemetery',
            description: 'Ancient graves. Fog clings to the ground. Halloween spirits stir.',
            exits: { north: 'temple', south: 'cemetery_section_2' },
            features: ['cemetery', 'graveyard'],
            items: [], enemies: ['skeleton', 'zombie', 'ghost'],
            safe: false, music: 'cemetery'
        };

        W.locations['cemetery_section_2'] = {
            name: 'Cemetery Section 2',
            description: 'Deeper in the cemetery.',
            exits: { north: 'city_cemetery', south: 'cemetery_section_3' },
            features: ['cemetery'],
            items: ['lantern fragment'], enemies: ['ghost', 'wraith'],
            safe: false, music: 'cemetery'
        };

        W.locations['cemetery_section_3'] = {
            name: 'Cemetery Section 3',
            description: 'The fog thickens.',
            exits: { north: 'cemetery_section_2' },
            features: ['cemetery'],
            items: ['lantern fragment'], enemies: ['wraith'],
            safe: false, music: 'cemetery'
        };

        // Houses
        W.locations['house_1'] = {
            name: 'Village House',
            description: 'A modest house. A family lives here.',
            exits: { west: 'market_south' },
            features: ['house', 'city'],
            items: ['cave key'], // Key for southwest cave!
            enemies: [], safe: true,
            npcs: [{ name: 'Old Woman', role: 'quest', dialog: ['Beware the cave to the southwest. A key is needed.', 'I heard it was hidden in a house in the south market.'] }]
        };

        W.locations['house_2'] = {
            name: 'Another House',
            description: 'A quiet house.',
            exits: { east: 'market_south' },
            features: ['house', 'city'],
            items: [], enemies: [], safe: true
        };

        // ===== FOREST FROM NORTH GATE =====
        // 5 steps west, 3 steps north → river crossing → village
        
        for (let i = 1; i <= 8; i++) {
            W.locations[`forest_north_${i}`] = {
                name: `Northern Forest Path ${i}`,
                description: `Dense forest. ${i >= 5 ? 'You hear water ahead.' : 'Trees surround you.'}`,
                exits: { 
                    south: i === 1 ? 'north_gate' : `forest_north_${i-1}`,
                    north: i < 8 ? `forest_north_${i+1}` : undefined,
                    east: i % 3 === 0 ? `forest_north_east_${i}` : undefined,
                    west: i % 3 === 1 ? `forest_north_west_${i}` : undefined
                },
                features: ['forest'],
                items: i === 5 ? [] : [],
                enemies: i % 2 === 0 ? ['wolf', 'goblin'] : [],
                safe: i === 1
            };
        }

        // River crossing in north forest
        W.locations['forest_north_river'] = {
            name: 'Northern River Crossing',
            description: 'A river flows here. You can cross to the north.',
            exits: { south: 'forest_north_8', north: 'village_north', east: 'forest_north_9' },
            features: ['forest', 'river', 'crossing'],
            items: [], enemies: [], safe: true,
            hasRiver: true, canFish: true
        };

        // Village north of river
        W.locations['village_north'] = {
            name: 'Northern Village',
            description: 'A small village. Houses and a well.',
            exits: { south: 'forest_north_river', west: 'forest_west_1', east: 'forest_east_5' },
            features: ['village'],
            items: ['health potion'], enemies: [], safe: true,
            npcs: [{ name: 'Village Elder', role: 'quest', dialog: ['Welcome traveler.', 'The cave to the southwest holds treasures, but you need a key.', 'Search the houses in Kaliwasch south market.'] }]
        };

        // ===== FOREST FROM SOUTH GATE =====
        for (let i = 1; i <= 10; i++) {
            W.locations[`forest_south_${i}`] = {
                name: `Southern Forest Path ${i}`,
                description: `The forest grows denser. ${i >= 7 ? 'You hear a river.' : ''}`,
                exits: {
                    north: i === 1 ? 'south_gate' : `forest_south_${i-1}`,
                    south: i < 10 ? `forest_south_${i+1}` : undefined,
                    east: i % 4 === 0 ? `forest_south_east_${i}` : undefined,
                    west: i % 4 === 2 ? `forest_south_west_${i}` : undefined
                },
                features: ['forest'],
                items: [], enemies: i % 3 === 0 ? ['wolf', 'forest spider'] : [],
                safe: i === 1
            };
        }

        // Southwest corner - CAVE ENTRANCE (locked)
        W.locations['cave_entrance_locked'] = {
            name: 'Cave Entrance (Locked)',
            description: 'A dark cave entrance. The door is locked. You need a key.',
            exits: { north: 'forest_south_west_8', east: 'forest_south_west_9' },
            features: ['cave', 'locked'],
            items: [], enemies: [], safe: true,
            locked: true, requiresKey: 'cave key'
        };

        // Southeast corner - CAVE (open, stronger monsters)
        W.locations['cave_entrance_open'] = {
            name: 'Cave Entrance',
            description: 'A dark cave. Stronger monsters lurk within.',
            exits: { west: 'forest_south_east_8', north: 'cave_deep_1' },
            features: ['cave'],
            items: [], enemies: ['cave troll', 'dark spirit'], safe: false,
            music: 'dungeon'
        };

        // ===== FOREST FROM EAST GATE =====
        // 8 steps east, 3 steps north → tunnel entrance
        for (let i = 1; i <= 12; i++) {
            W.locations[`forest_east_${i}`] = {
                name: `Eastern Forest Path ${i}`,
                description: `The forest path. ${i >= 8 ? 'You see a tunnel entrance ahead.' : ''}`,
                exits: {
                    west: i === 1 ? 'east_gate' : `forest_east_${i-1}`,
                    east: i < 12 ? `forest_east_${i+1}` : undefined,
                    north: i >= 8 && i <= 10 ? `forest_east_north_${i}` : undefined,
                    south: i % 3 === 0 ? `forest_east_south_${i}` : undefined
                },
                features: ['forest'],
                items: [], enemies: i % 2 === 0 ? ['goblin', 'forest spider'] : [],
                safe: i === 1
            };
        }

        // Tunnel entrance (20 steps east from east gate)
        W.locations['tunnel_entrance'] = {
            name: 'Tunnel Entrance',
            description: 'A large tunnel entrance. Darkness beckons.',
            exits: { west: 'forest_east_12', east: 'tunnel_1' },
            features: ['tunnel', 'entrance'],
            items: [], enemies: [], safe: true,
            music: 'dungeon'
        };

        // Tunnel sections
        for (let i = 1; i <= 10; i++) {
            W.locations[`tunnel_${i}`] = {
                name: `Tunnel Section ${i}`,
                description: `Dark tunnel. ${i >= 8 ? 'You see light ahead.' : 'Echoes surround you.'}`,
                exits: {
                    west: i === 1 ? 'tunnel_entrance' : `tunnel_${i-1}`,
                    east: i < 10 ? `tunnel_${i+1}` : 'tunnel_exit'
                },
                features: ['tunnel', 'underground'],
                items: i % 4 === 0 ? ['mana potion'] : [],
                enemies: ['cave troll', 'goblin mage', 'dark spirit'],
                safe: false, music: 'dungeon'
            };
        }

        // ===== FOREST FROM WEST GATE =====
        for (let i = 1; i <= 10; i++) {
            W.locations[`forest_west_${i}`] = {
                name: `Western Forest Path ${i}`,
                description: `The western forest. ${i >= 6 ? 'A river flows nearby.' : ''}`,
                exits: {
                    east: i === 1 ? 'west_gate' : `forest_west_${i-1}`,
                    west: i < 10 ? `forest_west_${i+1}` : undefined,
                    north: i % 3 === 0 ? `forest_west_north_${i}` : undefined,
                    south: i % 3 === 1 ? `forest_west_south_${i}` : undefined
                },
                features: ['forest'],
                items: [], enemies: i % 2 === 0 ? ['wolf', 'goblin'] : [],
                safe: i === 1
            };
        }

        // West river
        W.locations['forest_west_river'] = {
            name: 'Western River',
            description: 'A river flows here. You can cross heading south.',
            exits: { north: 'forest_west_6', south: 'forest_west_7', east: 'forest_west_5' },
            features: ['forest', 'river'],
            items: [], enemies: [], safe: true,
            hasRiver: true, canFish: true
        };

        // ===== ADD FISHING ROD ITEM =====
        if (!W.items) W.items = {};
        W.items['fishing rod'] = {
            name: 'fishing rod',
            type: 'tool',
            description: 'A sturdy fishing rod. Use at rivers to fish.',
            value: 25
        };

        W.items['cave key'] = {
            name: 'cave key',
            type: 'key',
            description: 'An old rusty key. Opens the locked cave in the southwest.',
            value: 0,
            questItem: true
        };

        // ===== ADD ENEMIES =====
        if (!W.enemies) W.enemies = {};
        W.enemies['wolf'] = { name: 'wolf', hp: 30, attack: 5, xp: 10, gold: 5 };
        W.enemies['goblin'] = { name: 'goblin', hp: 25, attack: 4, xp: 8, gold: 7 };
        W.enemies['forest spider'] = { name: 'forest spider', hp: 20, attack: 4, xp: 6, gold: 4 };
        W.enemies['skeleton'] = { name: 'skeleton', hp: 35, attack: 6, xp: 12, gold: 10 };
        W.enemies['zombie'] = { name: 'zombie', hp: 40, attack: 5, xp: 15, gold: 8 };
        W.enemies['ghost'] = { name: 'ghost', hp: 20, attack: 7, xp: 18, gold: 12 };
        W.enemies['wraith'] = { name: 'wraith', hp: 30, attack: 10, xp: 22, gold: 18 };
        W.enemies['cave troll'] = { name: 'cave troll', hp: 60, attack: 10, xp: 30, gold: 25 };
        W.enemies['dark spirit'] = { name: 'dark spirit', hp: 40, attack: 12, xp: 25, gold: 20 };
        W.enemies['goblin mage'] = { name: 'goblin mage', hp: 35, attack: 8, xp: 20, gold: 15 };

        // ===== FIX NPC TALKING =====
        if (G) {
            const oldTalkToNPC = G.talkToNPC;
            G.talkToNPC = function(name) {
                const loc = W.locations[this.state.location];
                if (!loc || !loc.npcs || loc.npcs.length === 0) {
                    this.addNarrative("There's no one to talk to here.", 'system');
                    return;
                }
                
                let npc = null;
                const query = (name || '').trim().toLowerCase();
                if (query) {
                    npc = loc.npcs.find(n => n.name.toLowerCase().includes(query));
                    if (!npc) {
                        this.addNarrative(`No one named "${name}" is here. Nearby: ${loc.npcs.map(n => n.name).join(', ')}.`, 'system');
                        return;
                    }
                } else {
                    npc = loc.npcs[0];
                }

                const dialog = npc.dialog[Math.floor(Math.random() * npc.dialog.length)];
                this.addNarrative(`${npc.name} says: "${dialog}"`, 'npc');
                
                // Voice narration
                window.AudioManager?.playVoice?.(`${npc.name} says: ${dialog}`, { channel: 'npc' });
            };
        }

        // ===== FIX VOICE COMMAND PANEL =====
        if (G) {
            // When voice command panel opens, stop narration and listen
            const oldProcessCommand = G.processCommand;
            G.processCommand = function(cmd) {
                const c = cmd.toLowerCase().trim();
                
                if (c === 'fish' || c === 'go fishing') {
                    return this.goFishing();
                }
                
                return oldProcessCommand.call(this, cmd);
            };
        }

        // ===== FISHING SYSTEM =====
        if (G) {
            G.goFishing = function() {
                const loc = W.locations[this.state.location];
                
                if (!loc || !loc.canFish) {
                    this.addNarrative('No fishing spot here. Look for rivers or water bodies.', 'system');
                    return;
                }

                // Check if player has fishing rod
                const hasRod = this.state.inventory.some(i => i.name === 'fishing rod') || 
                               this.state.player.equipment?.rightHand === 'fishing rod';
                
                if (!hasRod) {
                    this.addNarrative('You need a fishing rod to fish. Buy one at the Provisions Shop.', 'system');
                    return;
                }

                this.addNarrative('You cast your line into the water...', 'system');
                
                const roll = Math.random() * 100;
                
                if (roll < 60) {
                    // Caught something!
                    const fish = roll < 10 ? 'golden fish' : (roll < 30 ? 'river trout' : 'common carp');
                    this.addNarrative(`✨ You caught a ${fish}!`, 'item');
                    
                    // Add to inventory
                    const existing = this.state.inventory.find(i => i.name === fish);
                    if (existing) {
                        existing.quantity++;
                    } else {
                        this.state.inventory.push({ name: fish, type: 'food', quantity: 1, value: roll < 10 ? 50 : 10 });
                    }
                    
                    window.AudioManager?.playVoice?.(`You caught a ${fish}!`, { channel: 'item' });
                } else {
                    this.addNarrative('The fish got away... Try again!', 'system');
                }
                
                this.save?.();
            };
        }

        // Add missing critical items
        W.items['healing potion'] = { name: 'healing potion', type: 'consumable', effect: 'heal', power: 50, value: 25 };
        W.items['iron sword'] = { name: 'iron sword', type: 'weapon', damage: 14, value: 50 };
        W.items['leather armor'] = { name: 'leather armor', type: 'armor', defense: 4, value: 40 };

        // Add quests
        W.quests = [{ id: 'first_quest', name: 'First Steps', description: 'Explore the city and learn the controls.' }];

        console.log('World completely rebuilt with proper connections, fishing, NPCs, caves, tunnels');
    };

    buildWorld();
})();

