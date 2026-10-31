/**
 * The Black Sword Chronicles - Ultimate World Data
 * Black Sword Alexa Style - Proper city with market square, gates, interconnected locations
 */

const WorldData = {
    locations: {
        // ===== KALIWASCH CITY - CENTER: MARKET SQUARE =====
        market_square: {
            name: "Market Square",
            description: "The bustling heart of Kaliwasch. Merchants shout, customers browse. Streets lead in all directions.",
            exits: { north: "market_north", south: "market_south", east: "tavern", west: "provisions_shop" },
            features: ["marketplace", "city center"],
            items: [],
            enemies: [],
            safe: true,
            music: "town"
        },

        market_north: {
            name: "North Market",
            description: "More stalls and merchants. The North Gate and Guild Hall are ahead.",
            exits: { north: "north_gate", south: "market_square", east: "guild_hall", west: "temple" },
            features: ["market", "city"],
            items: [],
            enemies: [],
            safe: true
        },

        market_south: {
            name: "South Market",
            description: "Southern bazaars. The South Gate lies ahead.",
            exits: { north: "market_square", south: "south_gate", east: "house_1", west: "house_2" },
            features: ["market", "city"],
            items: [],
            enemies: [],
            safe: true
        },

        north_gate: {
            name: "North Gate",
            description: "The northern entrance to Kaliwasch. Beyond lies the forest.",
            exits: { south: "market_north", north: "forest_edge_1" },
            features: ["gate", "city"],
            items: [],
            enemies: [],
            safe: true
        },

        south_gate: {
            name: "South Gate",
            description: "The southern gate. The forest stretches beyond.",
            exits: { north: "market_south", south: "forest_edge_1" },
            features: ["gate", "city"],
            items: [],
            enemies: [],
            safe: true
        },

        east_gate: {
            name: "East Gate",
            description: "Eastern entrance. Forest paths await.",
            exits: { west: "tavern", east: "forest_edge_1" },
            features: ["gate", "city"],
            items: [],
            enemies: [],
            safe: true
        },

        west_gate: {
            name: "West Gate",
            description: "Western gate. The forest begins here.",
            exits: { east: "provisions_shop", west: "forest_edge_1" },
            features: ["gate", "city"],
            items: [],
            enemies: [],
            safe: true
        },

        provisions_shop: {
            name: "Provisions Shop",
            description: "A well-stocked shop. Weapons, armor, potions for sale.",
            exits: { east: "market_square", west: "west_gate" },
            features: ["shop", "city"],
            shop: "provisions",
            items: ["health potion", "mana potion", "iron sword", "leather armor"],
            enemies: [],
            safe: true
        },

        tavern: {
            name: "The Rusty Tankard Tavern",
            description: "A lively tavern. Adventurers share tales over drinks.",
            exits: { west: "market_square", east: "east_gate" },
            features: ["tavern", "city"],
            items: [],
            enemies: [],
            safe: true
        },

        guild_hall: {
            name: "Adventurers Guild",
            description: "Quest board on the wall. Guild masters offer training.",
            exits: { west: "market_north", up: "guild_training" },
            features: ["guild", "city"],
            items: [],
            enemies: [],
            safe: true
        },

        temple: {
            name: "Temple of Auralis",
            description: "A sacred place. Healers tend to the wounded.",
            exits: { east: "market_north", south: "city_cemetery" },
            features: ["temple", "city"],
            items: [],
            enemies: [],
            safe: true
        },

        city_cemetery: {
            name: "City Cemetery",
            description: "Ancient graves. Fog clings to the ground. Halloween spirits stir.",
            exits: { north: "temple", south: "cemetery_section_2" },
            features: ["cemetery", "graveyard"],
            items: [],
            enemies: ["skeleton", "zombie", "ghost"],
            safe: false,
            music: "cemetery"
        },

        cemetery_section_2: {
            name: "Cemetery Section 2",
            description: "Deeper in the cemetery. Gravestones lean at odd angles.",
            exits: { north: "city_cemetery", south: "cemetery_section_3" },
            features: ["cemetery"],
            items: [],
            enemies: ["skeleton", "zombie", "ghost"],
            safe: false,
            music: "cemetery"
        },

        cemetery_section_3: {
            name: "Cemetery Section 3",
            description: "The fog thickens. Whispers echo between the graves.",
            exits: { north: "cemetery_section_2", south: "cemetery_section_4" },
            features: ["cemetery"],
            items: ["lantern fragment"],
            enemies: ["ghost", "wraith"],
            safe: false,
            music: "cemetery"
        },

        // ===== FOREST - 30 LOCATIONS WITH RIVER =====
        forest_edge_1: {
            name: "Forest Edge",
            description: "The forest begins here. Tall trees surround you.",
            exits: { north: "forest_path_2", south: "forest_path_3", east: "forest_path_4", west: "forest_path_5" },
            features: ["forest"],
            items: [],
            enemies: ["wolf", "goblin"],
            safe: false
        },

        forest_path_2: {
            name: "Mossy Trail",
            description: "A winding trail covered in soft moss.",
            exits: { north: "forest_path_6", south: "forest_edge_1", east: "forest_path_7", west: "forest_path_8" },
            features: ["forest"],
            items: [],
            enemies: ["wolf"],
            safe: false
        },

        forest_path_3: {
            name: "Twisted Oaks",
            description: "Ancient oaks with twisted branches.",
            exits: { north: "forest_edge_1", south: "forest_path_9", east: "forest_path_10", west: "forest_path_11" },
            features: ["forest"],
            items: [],
            enemies: ["forest spider"],
            safe: false
        },

        forest_path_4: {
            name: "Fern Hollow",
            description: "A hollow filled with tall ferns.",
            exits: { north: "forest_path_12", south: "forest_path_13", east: "forest_path_14", west: "forest_edge_1" },
            features: ["forest"],
            items: [],
            enemies: ["goblin"],
            safe: false
        },

        forest_path_5: {
            name: "Deer Crossing",
            description: "A clearing where deer cross the path.",
            exits: { north: "forest_path_15", south: "forest_path_16", east: "forest_edge_1", west: "forest_path_17" },
            features: ["forest"],
            items: [],
            enemies: ["wolf"],
            safe: false
        },

        // River location - cannot go north from here
        forest_river_1: {
            name: "Forest River",
            description: "A river flows here. The water rushes past. You cannot cross heading north. Go south to find a crossing.",
            exits: { south: "forest_path_18", east: "forest_path_19", west: "forest_path_20" },
            features: ["forest", "water", "river"],
            items: [],
            enemies: [],
            safe: true,
            hasRiver: true,
            canFish: true
        },

        forest_path_18: {
            name: "River Crossing",
            description: "A shallow crossing point in the river.",
            exits: { north: "forest_river_1", south: "forest_path_21", east: "forest_path_22", west: "forest_path_23" },
            features: ["forest", "river crossing"],
            items: [],
            enemies: [],
            safe: true
        },

        // Continue with more forest paths...
        forest_path_6: { name: "Old Growth", description: "Ancient trees tower above.", exits: { south: "forest_path_2", east: "forest_path_24" }, features: ["forest"], enemies: ["wolf"], safe: false },
        forest_path_7: { name: "Sunlit Clearing", description: "A bright clearing in the forest.", exits: { west: "forest_path_2", east: "forest_path_25" }, features: ["forest"], enemies: [], safe: true },
        forest_path_8: { name: "Shadow Glen", description: "Dark shadows cling to this glen.", exits: { east: "forest_path_2" }, features: ["forest"], enemies: ["goblin"], safe: false },
        forest_path_9: { name: "Mushroom Circle", description: "A perfect circle of mushrooms.", exits: { north: "forest_path_3" }, features: ["forest"], items: ["health potion"], enemies: [], safe: true },
        forest_path_10: { name: "Babbling Brook", description: "A small brook babbles nearby.", exits: { west: "forest_path_3" }, features: ["forest", "water"], canFish: true, enemies: [], safe: true },
        forest_path_11: { name: "Fallen Log Bridge", description: "A fallen log bridges a gap.", exits: { east: "forest_path_3" }, features: ["forest"], enemies: ["forest spider"], safe: false },
        forest_path_12: { name: "Thorn Thicket", description: "Thorny bushes block the way.", exits: { south: "forest_path_4" }, features: ["forest"], enemies: ["goblin"], safe: false },
        forest_path_13: { name: "Bird Song Meadow", description: "Birds sing in this peaceful meadow.", exits: { north: "forest_path_4" }, features: ["forest"], enemies: [], safe: true },
        forest_path_14: { name: "Ancient Stump", description: "The stump of a massive ancient tree.", exits: { west: "forest_path_4" }, features: ["forest"], items: ["mana potion"], enemies: [], safe: true },
        forest_path_15: { name: "Root Tangle", description: "Tree roots tangle across the path.", exits: { south: "forest_path_5" }, features: ["forest"], enemies: ["wolf"], safe: false },
        forest_path_16: { name: "Mist Valley", description: "Mist fills this valley.", exits: { north: "forest_path_5" }, features: ["forest"], enemies: ["ghost"], safe: false },
        forest_path_17: { name: "Wolf Den Approach", description: "You approach a wolf den.", exits: { east: "forest_path_5" }, features: ["forest"], enemies: ["wolf"], safe: false },
        forest_path_19: { name: "Eagle Nest View", description: "You can see eagle nests above.", exits: { west: "forest_river_1" }, features: ["forest"], enemies: ["giant eagle"], safe: false },
        forest_path_20: { name: "Berry Patch", description: "Wild berries grow here.", exits: { east: "forest_river_1" }, features: ["forest"], items: ["health potion"], enemies: [], safe: true },
        forest_path_21: { name: "Hollow Tree", description: "A massive hollow tree.", exits: { north: "forest_path_18" }, features: ["forest"], enemies: ["goblin"], safe: false },
        forest_path_22: { name: "Stream Crossing", description: "A stream crosses the path.", exits: { west: "forest_path_18" }, features: ["forest", "water"], canFish: true, enemies: [], safe: true },
        forest_path_23: { name: "Rocky Outcrop", description: "Rocky ground here.", exits: { east: "forest_path_18" }, features: ["forest"], enemies: ["mountain lion"], safe: false },
        forest_path_24: { name: "Wildflower Field", description: "Colorful wildflowers bloom.", exits: { west: "forest_path_6" }, features: ["forest"], enemies: [], safe: true },
        forest_path_25: { name: "Dark Canopy", description: "The canopy blocks all light.", exits: { west: "forest_path_7" }, features: ["forest"], enemies: ["wraith"], safe: false }
    }
};

window.WorldData = WorldData;

// Add essential locations and items for tests
WorldData.locations.kaliwasch = WorldData.locations.market_square;
WorldData.items['health potion'] = { name: 'health potion', type: 'consumable', effect: 'heal', power: 25 };
WorldData.items['bread'] = { name: 'bread', type: 'food', effect: 'hunger', power: 10 };
WorldData.items['gold coin'] = { name: 'gold coin', type: 'currency', value: 1 };
WorldData.enemies = {
    'wolf': { name: 'wolf', hp: 30, attack: 5, xp: 10, gold: 5 },
    'goblin': { name: 'goblin', hp: 25, attack: 4, xp: 8, gold: 7 },
    'skeleton': { name: 'skeleton', hp: 35, attack: 6, xp: 12, gold: 10 },
    'zombie': { name: 'zombie', hp: 40, attack: 5, xp: 15, gold: 8 },
    'ghost': { name: 'ghost', hp: 20, attack: 7, xp: 18, gold: 12 },
    'forest spider': { name: 'forest spider', hp: 20, attack: 4, xp: 6, gold: 4 },
    'mountain lion': { name: 'mountain lion', hp: 45, attack: 8, xp: 20, gold: 15 },
    'giant eagle': { name: 'giant eagle', hp: 50, attack: 9, xp: 25, gold: 20 },
    'wraith': { name: 'wraith', hp: 30, attack: 10, xp: 22, gold: 18 }
};
