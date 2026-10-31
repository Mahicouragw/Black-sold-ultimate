/**
 * v7.50.0 - CLEAN WORLD REBUILD
 * Large forest world with Palace starting hub, proper connections, no undefined values
 */
(() => {
    'use strict';
    
    const buildCleanWorld = () => {
        if (!window.WorldData) {
            setTimeout(buildCleanWorld, 100);
            return;
        }
        
        const W = window.WorldData;
        
        // ===== CLEAN WORLD STRUCTURE =====
        // Start fresh - clear old corrupted data
        W.locations = {};
        W.items = {};
        W.enemies = {};
        W.quests = [];
        
        // ===== ITEMS DATABASE =====
        W.items['basic_dagger'] = {
            item_id: 'basic_dagger',
            item_name: 'Basic Dagger',
            description: 'A simple but reliable starting weapon.',
            item_type: 'weapon',
            rarity: 'common',
            damage: 10,
            strength_bonus: 3,
            armor: 4,
            equipment_slot: 'right_hand',
            required_level: 1,
            value: 0
        };
        
        W.items['health_potion'] = {
            item_id: 'health_potion',
            item_name: 'Health Potion',
            description: 'Restores 50 Health Points.',
            item_type: 'consumable',
            rarity: 'common',
            healing_power: 50,
            value: 25
        };
        
        W.items['mana_potion'] = {
            item_id: 'mana_potion',
            item_name: 'Mana Potion',
            description: 'Restores 30 Magic Points.',
            item_type: 'consumable',
            rarity: 'common',
            magic_power: 30,
            value: 30
        };
        
        W.items['bread'] = {
            item_id: 'bread',
            item_name: 'Bread',
            description: 'Simple food that restores a small amount of health.',
            item_type: 'food',
            rarity: 'common',
            healing_power: 15,
            value: 5
        };
        
        W.items['iron_sword'] = {
            item_id: 'iron_sword',
            item_name: 'Iron Sword',
            description: 'A sturdy iron blade.',
            item_type: 'weapon',
            rarity: 'common',
            damage: 18,
            strength_bonus: 5,
            value: 100
        };
        
        W.items['leather_armor'] = {
            item_id: 'leather_armor',
            item_name: 'Leather Armor',
            description: 'Basic protection.',
            item_type: 'armor',
            rarity: 'common',
            armor: 8,
            value: 80
        };
        
        W.items['fishing_rod'] = {
            item_id: 'fishing_rod',
            item_name: 'Fishing Rod',
            description: 'Used for fishing at rivers.',
            item_type: 'tool',
            rarity: 'common',
            value: 25
        };
        
        W.items['cave_key'] = {
            item_id: 'cave_key',
            item_name: 'Cave Key',
            description: 'Opens the locked cave in the southwest.',
            item_type: 'key',
            rarity: 'quest',
            value: 0,
            quest_item: true
        };
        
        // ===== ENEMIES DATABASE =====
        W.enemies['wolf'] = { name: 'wolf', hp: 30, attack: 5, xp: 10, gold: 5 };
        W.enemies['goblin'] = { name: 'goblin', hp: 25, attack: 4, xp: 8, gold: 7 };
        W.enemies['forest_spider'] = { name: 'forest spider', hp: 20, attack: 4, xp: 6, gold: 4 };
        W.enemies['skeleton'] = { name: 'skeleton', hp: 35, attack: 6, xp: 12, gold: 10 };
        W.enemies['zombie'] = { name: 'zombie', hp: 40, attack: 5, xp: 15, gold: 8 };
        W.enemies['ghost'] = { name: 'ghost', hp: 20, attack: 7, xp: 18, gold: 12 };
        W.enemies['wraith'] = { name: 'wraith', hp: 30, attack: 10, xp: 22, gold: 18 };
        W.enemies['cave_troll'] = { name: 'cave troll', hp: 60, attack: 10, xp: 30, gold: 25 };
        W.enemies['dark_spirit'] = { name: 'dark spirit', hp: 40, attack: 12, xp: 25, gold: 20 };
        W.enemies['goblin_mage'] = { name: 'goblin mage', hp: 35, attack: 8, xp: 20, gold: 15 };
        W.enemies['bandit'] = { name: 'bandit', hp: 35, attack: 7, xp: 15, gold: 20 };
        W.enemies['orc'] = { name: 'orc', hp: 50, attack: 9, xp: 25, gold: 18 };
        W.enemies['orc_magician'] = { name: 'orc magician', hp: 40, attack: 11, xp: 28, gold: 22 };
        W.enemies['wild_boar'] = { name: 'wild boar', hp: 35, attack: 6, xp: 12, gold: 8 };
        W.enemies['legionary'] = { name: 'legionary', hp: 55, attack: 10, xp: 28, gold: 20 };
        
        // ===== QUESTS DATABASE =====
        W.quests = [
            {
                quest_id: 'first_quest',
                name: 'The Palace Summons',
                description: 'Speak with the Palace Guard Captain and learn about your first mission.',
                location: 'palace_throne_room',
                reward_gold: 100,
                reward_xp: 50,
                steps: [
                    { id: 'talk_captain', description: 'Talk to the Palace Guard Captain', completed: false },
                    { id: 'explore_forest', description: 'Explore the eastern forest', completed: false },
                    { id: 'return_palace', description: 'Return to the Palace', completed: false }
                ]
            },
            {
                quest_id: 'north_gate_companion',
                name: 'The North Gate Rescue',
                description: 'Help the NPC at the North Gate who is under attack.',
                location: 'north_gate',
                reward_gold: 150,
                reward_xp: 75,
                steps: [
                    { id: 'find_npc', description: 'Find the NPC at North Gate', completed: false },
                    { id: 'defeat_enemies', description: 'Defeat 3 enemies threatening the NPC', completed: false, count: 0, required: 3 },
                    { id: 'talk_npc_after', description: 'Talk to the NPC after the battle', completed: false }
                ],
                companion_reward: 'forest_ranger'
            },
            {
                quest_id: 'third_quest_guild',
                name: 'The Guild Challenge',
                description: 'Prove your worth at the Guild to unlock class selection.',
                location: 'guild_hall',
                reward_gold: 200,
                reward_xp: 100,
                steps: [
                    { id: 'enter_guild', description: 'Enter the Guild Hall', completed: false },
                    { id: 'defeat_champion', description: 'Defeat the Guild Champion in battle', completed: false },
                    { id: 'choose_class', description: 'Choose your character class', completed: false }
                ],
                unlocks_class_selection: true
            }
        ];
        
        // ===== PALACE (STARTING HUB) =====
        W.locations['palace_throne_room'] = {
            location_id: 'palace_throne_room',
            location_name: 'Palace Throne Room',
            description: 'The grand throne room of the Palace. Marble columns rise to a vaulted ceiling. The King sits upon his throne. Guards stand at attention. This is where your adventure begins.',
            biome: 'palace',
            region: 'Capital City',
            position_x: 0,
            position_y: 0,
            exits: { north: 'palace_great_hall', east: 'palace_armory', west: 'palace_library', down: 'palace_courtyard' },
            features: ['throne', 'guards', 'npcs'],
            items: [],
            enemies: [],
            npcs: [
                { name: 'King Aldric', role: 'quest_giver', dialog: ['Welcome, young hero. Our realm faces grave dangers.', 'Speak with Captain Marcus about your first mission.', 'The eastern forest grows dark with evil.'] },
                { name: 'Captain Marcus', role: 'quest_giver', dialog: ['The King has summoned you for a reason.', 'Bandits threaten the eastern forest.', 'Clear the forest path and return with news.', 'Type "quests" to see your mission.'] }
            ],
            safe: true,
            music: 'palace',
            actions: ['talk', 'quests', 'inventory', 'equipment', 'companions', 'explore']
        };
        
        W.locations['palace_great_hall'] = {
            location_id: 'palace_great_hall',
            location_name: 'Palace Great Hall',
            description: 'A vast hall where nobles gather. Banners of the realm hang from the walls.',
            biome: 'palace',
            region: 'Capital City',
            position_x: 0,
            position_y: 1,
            exits: { south: 'palace_throne_room', east: 'palace_banquet', west: 'palace_chapel' },
            features: ['banners', 'nobles'],
            items: [],
            enemies: [],
            safe: true
        };
        
        W.locations['palace_armory'] = {
            location_id: 'palace_armory',
            location_name: 'Palace Armory',
            description: 'Weapons and armor line the walls. The quartermaster offers supplies.',
            biome: 'palace',
            region: 'Capital City',
            position_x: 1,
            position_y: 0,
            exits: { west: 'palace_throne_room' },
            features: ['weapons', 'armor', 'shop'],
            shop: 'armory',
            items: ['iron_sword', 'leather_armor', 'health_potion'],
            enemies: [],
            safe: true
        };
        
        W.locations['palace_library'] = {
            location_id: 'palace_library',
            location_name: 'Palace Library',
            description: 'Ancient tomes and scrolls fill the shelves. Knowledge is power here.',
            biome: 'palace',
            region: 'Capital City',
            position_x: -1,
            position_y: 0,
            exits: { east: 'palace_throne_room' },
            features: ['books', 'scrolls'],
            items: [],
            enemies: [],
            safe: true
        };
        
        W.locations['palace_courtyard'] = {
            location_id: 'palace_courtyard',
            location_name: 'Palace Courtyard',
            description: 'An open courtyard with a fountain. Guards train here. The city gates are accessible.',
            biome: 'palace',
            region: 'Capital City',
            position_x: 0,
            position_y: -1,
            exits: { up: 'palace_throne_room', north: 'city_north_gate', south: 'city_south_gate', east: 'city_east_gate', west: 'city_west_gate' },
            features: ['fountain', 'training'],
            items: [],
            enemies: [],
            safe: true
        };
        
        W.locations['palace_chapel'] = {
            location_id: 'palace_chapel',
            location_name: 'Palace Chapel',
            description: 'A sacred place of prayer. Divine energy fills the air. You can pray here for blessings.',
            biome: 'palace',
            region: 'Capital City',
            position_x: -1,
            position_y: 1,
            exits: { east: 'palace_great_hall' },
            features: ['altar', 'prayer'],
            items: [],
            enemies: [],
            safe: true,
            isTemple: true,
            canPray: true,
            music: 'temple'
        };
        
        // ===== CITY GATES =====
        W.locations['city_north_gate'] = {
            location_id: 'city_north_gate',
            location_name: 'North Gate',
            description: 'The northern gate of the city. Beyond lies the northern forest.',
            biome: 'city',
            region: 'Capital City',
            position_x: 0,
            position_y: 2,
            exits: { south: 'palace_courtyard', north: 'forest_north_1' },
            features: ['gate'],
            items: [],
            enemies: [],
            safe: true,
            npcs: [
                { name: 'Elara the Ranger', role: 'companion_npc', dialog: ['Help! Bandits are attacking!', 'Please defend me!', 'If you save me, I will join you as a companion.'] }
            ]
        };
        
        W.locations['city_south_gate'] = {
            location_id: 'city_south_gate',
            location_name: 'South Gate',
            description: 'The southern gate. The southern plains stretch beyond.',
            biome: 'city',
            region: 'Capital City',
            position_x: 0,
            position_y: -2,
            exits: { north: 'palace_courtyard', south: 'plains_south_1' },
            features: ['gate'],
            items: [],
            enemies: [],
            safe: true
        };
        
        W.locations['city_east_gate'] = {
            location_id: 'city_east_gate',
            location_name: 'East Gate',
            description: 'The eastern gate. The great forest begins here.',
            biome: 'city',
            region: 'Capital City',
            position_x: 2,
            position_y: -1,
            exits: { west: 'palace_courtyard', east: 'forest_east_1' },
            features: ['gate'],
            items: [],
            enemies: [],
            safe: true
        };
        
        W.locations['city_west_gate'] = {
            location_id: 'city_west_gate',
            location_name: 'West Gate',
            description: 'The western gate. The western highlands lie beyond.',
            biome: 'city',
            region: 'Capital City',
            position_x: -2,
            position_y: -1,
            exits: { east: 'palace_courtyard', west: 'highlands_west_1' },
            features: ['gate'],
            items: [],
            enemies: [],
            safe: true
        };
        
        // ===== GUILD HALL =====
        W.locations['guild_hall'] = {
            location_id: 'guild_hall',
            location_name: 'Adventurers Guild',
            description: 'The guild hall where adventurers gather. Quest boards line the walls. The Guild Master can help you choose your class after proving your worth.',
            biome: 'city',
            region: 'Capital City',
            position_x: 1,
            position_y: 2,
            exits: { south: 'city_north_gate', west: 'guild_training' },
            features: ['guild', 'quests', 'class_selection'],
            items: [],
            enemies: ['guild_champion'],
            npcs: [
                { name: 'Guild Master Theron', role: 'class_master', dialog: ['You have proven yourself worthy.', 'It is time to choose your path.', 'Warrior, Mage, or Summoner - which calls to you?'] }
            ],
            safe: true,
            unlocks_class: true
        };
        
        W.locations['guild_training'] = {
            location_id: 'guild_training',
            location_name: 'Guild Training Room',
            description: 'A training area where guild members practice combat.',
            biome: 'city',
            region: 'Capital City',
            position_x: 0,
            position_y: 2,
            exits: { east: 'guild_hall' },
            features: ['training'],
            items: [],
            enemies: [],
            safe: true
        };
        
        // ===== EASTERN FOREST (Large explorable area) =====
        // Creating a proper grid-based forest with river crossing
        for (let y = 1; y <= 8; y++) {
            for (let x = 1; x <= 6; x++) {
                const id = `forest_east_${x}_${y}`;
                const isRiver = (y === 5);
                const isBridge = (x === 3 && y === 5);
                
                const exits = {};
                if (y > 1) exits.north = `forest_east_${x}_${y-1}`;
                if (y < 8) exits.south = `forest_east_${x}_${y+1}`;
                if (x > 1) exits.west = `forest_east_${x-1}_${y}`;
                if (x < 6) exits.east = `forest_east_${x+1}_${y}`;
                
                // River blocks north-south except at bridge
                if (isRiver && !isBridge) {
                    if (y === 5) {
                        delete exits.north;
                        delete exits.south;
                    }
                }
                
                let description = 'A dense forest with tall trees.';
                if (y === 1) description = 'The edge of the eastern forest. The city gate is behind you.';
                else if (y === 3) description = 'Deep forest. Sunlight filters through the canopy.';
                else if (isBridge) description = 'A sturdy wooden bridge crosses the river here. You can cross to the southern side.';
                else if (isRiver) description = 'A wide river flows here. The current is too strong to swim. Find a bridge to cross.';
                else if (y === 8) description = 'The northern edge of the forest. Mountains rise ahead.';
                
                W.locations[id] = {
                    location_id: id,
                    location_name: isBridge ? 'Forest Bridge' : (isRiver ? 'Forest River' : `Eastern Forest`),
                    description: description,
                    biome: isRiver ? 'river' : 'forest',
                    region: 'Eastern Forest',
                    position_x: x,
                    position_y: y,
                    exits: exits,
                    features: isRiver ? ['forest', 'river'] : ['forest'],
                    items: (x + y) % 7 === 0 ? ['health_potion'] : [],
                    enemies: (x + y) % 3 === 0 ? ['wolf', 'goblin', 'forest_spider'] : [],
                    safe: y === 1,
                    hasRiver: isRiver,
                    isBridge: isBridge,
                    canFish: isRiver
                };
            }
        }
        
        // Connect forest to city gate
        W.locations['forest_east_3_1'].exits.west = 'city_east_gate';
        
        // ===== NORTHERN FOREST =====
        for (let i = 1; i <= 6; i++) {
            W.locations[`forest_north_${i}`] = {
                location_id: `forest_north_${i}`,
                location_name: 'Northern Forest',
                description: `The northern forest. ${i >= 4 ? 'Mountains are visible ahead.' : 'Dense trees surround you.'}`,
                biome: 'forest',
                region: 'Northern Forest',
                position_x: 0,
                position_y: 3 + i,
                exits: {
                    south: i === 1 ? 'city_north_gate' : `forest_north_${i-1}`,
                    north: i < 6 ? `forest_north_${i+1}` : undefined,
                    east: i % 2 === 0 ? `forest_north_east_${i}` : undefined,
                    west: i % 2 === 1 ? `forest_north_west_${i}` : undefined
                },
                features: ['forest'],
                items: [],
                enemies: ['wolf', 'goblin', 'bear'],
                safe: i === 1
            };
        }
        
        // Northern corner
        W.locations['northeast_corner'] = {
            location_id: 'northeast_corner',
            location_name: 'Northeast Corner - Mountain Pass',
            description: 'The northeastern corner of the realm. A mountain pass leads to distant lands.',
            biome: 'mountain',
            region: 'Northern Mountains',
            position_x: 6,
            position_y: 9,
            exits: { south: 'forest_north_east_6', west: 'northwest_corner' },
            features: ['mountain', 'corner'],
            items: [],
            enemies: ['mountain_lion', 'rock_golem'],
            safe: false,
            isCorner: true,
            corner: 'northeast'
        };
        
        W.locations['northwest_corner'] = {
            location_id: 'northwest_corner',
            location_name: 'Northwest Corner - Ancient Ruins',
            description: 'The northwestern corner. Ancient ruins of a forgotten civilization.',
            biome: 'ruins',
            region: 'Northern Highlands',
            position_x: -6,
            position_y: 9,
            exits: { south: 'forest_north_west_6', east: 'northeast_corner' },
            features: ['ruins', 'corner'],
            items: ['ancient_scroll'],
            enemies: ['undead', 'skeleton'],
            safe: false,
            isCorner: true,
            corner: 'northwest'
        };
        
        // ===== SOUTHERN PLAINS =====
        for (let i = 1; i <= 5; i++) {
            W.locations[`plains_south_${i}`] = {
                location_id: `plains_south_${i}`,
                location_name: 'Southern Plains',
                description: `Open grasslands. ${i >= 3 ? 'A river is visible ahead.' : 'Wind blows through the grass.'}`,
                biome: 'plains',
                region: 'Southern Plains',
                position_x: 0,
                position_y: -2 - i,
                exits: {
                    north: i === 1 ? 'city_south_gate' : `plains_south_${i-1}`,
                    south: i < 5 ? `plains_south_${i+1}` : 'river_south',
                    east: i % 2 === 0 ? `plains_south_east_${i}` : undefined,
                    west: i % 2 === 1 ? `plains_south_west_${i}` : undefined
                },
                features: ['plains', 'grassland'],
                items: [],
                enemies: ['wild_boar', 'bandit'],
                safe: i === 1
            };
        }
        
        // River crossing in south
        W.locations['river_south'] = {
            location_id: 'river_south',
            location_name: 'Southern River',
            description: 'A wide river flows east to west. A bridge crosses to the north.',
            biome: 'river',
            region: 'Southern River',
            position_x: 0,
            position_y: -8,
            exits: { north: 'plains_south_5', east: 'river_south_east', west: 'river_south_west' },
            features: ['river', 'bridge'],
            items: [],
            enemies: [],
            safe: true,
            hasRiver: true,
            isBridge: true,
            canFish: true
        };
        
        // Southwest corner - locked cave
        W.locations['southwest_corner'] = {
            location_id: 'southwest_corner',
            location_name: 'Southwest Corner - Locked Cave',
            description: 'The southwestern corner. A cave entrance is sealed with a magical lock. You need a key.',
            biome: 'cave',
            region: 'Southwest Highlands',
            position_x: -6,
            position_y: -9,
            exits: { north: 'plains_south_west_5', east: 'southeast_corner' },
            features: ['cave', 'locked', 'corner'],
            items: [],
            enemies: [],
            safe: true,
            isCorner: true,
            corner: 'southwest',
            locked: true,
            requires_key: 'cave_key'
        };
        
        // Southeast corner - open cave with strong monsters
        W.locations['southeast_corner'] = {
            location_id: 'southeast_corner',
            location_name: 'Southeast Corner - Dark Cave',
            description: 'The southeastern corner. A dark cave entrance. Strong monsters lurk within.',
            biome: 'cave',
            region: 'Southeast Forest',
            position_x: 6,
            position_y: -9,
            exits: { north: 'plains_south_east_5', west: 'southwest_corner', down: 'cave_deep_1' },
            features: ['cave', 'corner'],
            items: [],
            enemies: ['cave_troll', 'dark_spirit', 'dragon'],
            safe: false,
            isCorner: true,
            corner: 'southeast',
            music: 'dungeon'
        };
        
        // ===== WESTERN HIGHLANDS =====
        for (let i = 1; i <= 5; i++) {
            W.locations[`highlands_west_${i}`] = {
                location_id: `highlands_west_${i}`,
                location_name: 'Western Highlands',
                description: `Rocky highlands. ${i >= 3 ? 'The terrain grows rugged.' : 'Rolling hills stretch west.'}`,
                biome: 'highlands',
                region: 'Western Highlands',
                position_x: -2 - i,
                position_y: -1,
                exits: {
                    east: i === 1 ? 'city_west_gate' : `highlands_west_${i-1}`,
                    west: i < 5 ? `highlands_west_${i+1}` : 'highlands_west_end',
                    north: i % 2 === 0 ? `highlands_west_north_${i}` : undefined,
                    south: i % 2 === 1 ? `highlands_west_south_${i}` : undefined
                },
                features: ['highlands'],
                items: [],
                enemies: ['bandit', 'mountain_lion'],
                safe: i === 1
            };
        }
        
        // ===== TUNNEL (East side, 20 steps) =====
        for (let i = 1; i <= 10; i++) {
            W.locations[`tunnel_${i}`] = {
                location_id: `tunnel_${i}`,
                location_name: `Tunnel Section ${i}`,
                description: `Dark tunnel. ${i >= 8 ? 'Light visible ahead.' : 'Echoes surround you.'}`,
                biome: 'underground',
                region: 'Eastern Tunnels',
                position_x: 8 + i,
                position_y: 0,
                exits: {
                    west: i === 1 ? 'tunnel_entrance' : `tunnel_${i-1}`,
                    east: i < 10 ? `tunnel_${i+1}` : 'tunnel_exit'
                },
                features: ['tunnel', 'underground'],
                items: i % 4 === 0 ? ['mana_potion'] : [],
                enemies: ['cave_troll', 'goblin_mage', 'dark_spirit'],
                safe: false,
                music: 'dungeon'
            };
        }
        
        W.locations['tunnel_entrance'] = {
            location_id: 'tunnel_entrance',
            location_name: 'Tunnel Entrance',
            description: 'A large tunnel entrance carved into the mountainside.',
            biome: 'mountain',
            region: 'Eastern Mountains',
            position_x: 8,
            position_y: 0,
            exits: { west: 'forest_east_6_4', east: 'tunnel_1' },
            features: ['tunnel', 'entrance'],
            items: [],
            enemies: [],
            safe: true
        };
        
        W.locations['tunnel_exit'] = {
            location_id: 'tunnel_exit',
            location_name: 'Tunnel Exit',
            description: 'The tunnel opens to a hidden valley.',
            biome: 'valley',
            region: 'Hidden Valley',
            position_x: 18,
            position_y: 0,
            exits: { west: 'tunnel_10' },
            features: ['valley'],
            items: ['treasure_chest'],
            enemies: [],
            safe: true
        };
        
        console.log('✓ Clean world built:', Object.keys(W.locations).length, 'locations,', Object.keys(W.items).length, 'items,', Object.keys(W.enemies).length, 'enemies,', W.quests.length, 'quests');
    };
    
    buildCleanWorld();
})();
