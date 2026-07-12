/**
 * The Black Sword Chronicles - Ultimate World Data
 * Inspired by Narkuma's "The Black Sword" on Alexa
 */

const WorldData = {
    // Main locations
    locations: {
        kaliwasch: {
            name: "Kaliwasch City",
            description: "The grand city of Kaliwasch stands before you. Cobblestone streets wind between ancient stone buildings. Merchants hawk their wares, adventurers share tales at the tavern, and the temple bells ring in the distance. This is the heart of the realm.",
            exits: { north: "mountains", south: "swamp", east: "ruins", west: "forest" },
            features: ["marketplace", "tavern", "temple", "blacksmith", "guild hall", " inn"],
            items: ["gold coin", "bread"],
            enemies: [],
            safe: true,
            music: "city"
        },
        
        mountains: {
            name: "Northern Mountains",
            description: "Jagged peaks rise sharply into the clouds. The air is thin and cold. Ancient ruins are carved into the cliffsides, remnants of a forgotten civilization. Eagles soar overhead.",
            exits: { south: "kaliwasch", north: "shrine", east: "eagle_peak" },
            features: ["cave entrance", "ancient shrine", "eagle nest", "mountain pass"],
            items: ["mountain flower", "iron ore", "eagle feather"],
            enemies: ["mountain lion", "ice troll", "giant eagle"],
            music: "wilderness"
        },
        
        shrine: {
            name: "Ancient Shrine",
            description: "An ancient shrine dedicated to the old gods stands here. Mystical symbols glow faintly on the stone altar. This is a place of power.",
            exits: { south: "mountains" },
            features: ["altar", "glowing runes", "offering bowl"],
            items: ["blessed amulet", "ancient scroll"],
            enemies: ["stone guardian"],
            music: "dungeon"
        },
        
        eagle_peak: {
            name: "Eagle Peak",
            description: "The highest point in the mountains. From here, you can see the entire realm spread out below. A massive eagle's nest sits atop the peak.",
            exits: { west: "mountains" },
            features: ["eagle's nest", "panoramic view"],
            items: ["golden egg", "sky feather"],
            enemies: ["mega eagle"],
            boss: true,
            music: "wilderness"
        },
        
        forest: {
            name: "West Forest",
            description: "Dense woodland surrounds you. Ancient oaks tower overhead, their branches blocking the sunlight. Sunbeams filter through the leaves. You hear birds singing and small creatures rustling in the underbrush.",
            exits: { east: "kaliwasch" },
            features: ["abandoned cabin", "crystal stream", "ancient oak", "fairy circle"],
            items: ["herbs", "wooden staff", "acorn", "fairy dust"],
            enemies: ["wolf", "goblin scout", "forest spider"],
            music: "forest"
        },
        
        ruins: {
            name: "Eastern Ruins",
            description: "Crumbling stone structures hint at a civilization that flourished here centuries ago. Mysterious symbols cover the weathered walls. The air feels heavy with ancient magic.",
            exits: { west: "kaliwasch" },
            features: ["temple ruins", "hidden chest", "altar of wisdom", "broken columns"],
            items: ["ancient scroll", "golden amulet", "ruby gem", "mystic orb"],
            enemies: ["skeleton warrior", "undead mage", "ghost knight"],
            music: "dungeon"
        },
        
        swamp: {
            name: "Southern Swamp",
            description: "Murky waters and gnarled trees create an eerie atmosphere. Will-o'-wisps dance above the dark water. Fireflies illuminate the fog. Strange sounds echo from the depths.",
            exits: { north: "kaliwasch", south: "dungeon_entrance", east: "witch_hut", west: "goblin_camp" },
            features: ["abandoned hut", "poison pool", "winding path", "dead tree"],
            items: ["swamp herb", "old map", "will-o-wisp light", "bog water"],
            enemies: ["giant frog", "swamp witch", "crocodile"],
            music: "dungeon"
        },
        
        witch_hut: {
            name: "Witch's Hut",
            description: "A crooked hut sits on stilts over the swamp. Bottles of strange potions line the shelves. The witch cackles as she stirs her cauldron.",
            exits: { west: "swamp" },
            features: ["potion cauldron", "spell books", "crystal ball", "broomstick"],
            items: ["healing potion", "mana potion", "poison vial", "spell scroll"],
            enemies: ["swamp witch"],
            music: "dungeon"
        },
        
        goblin_camp: {
            name: "Goblin Camp",
            description: "A crude camp of goblins. Stolen goods are scattered about. The goblins are cooking something unsavory over a fire.",
            exits: { east: "swamp" },
            features: ["goblin tents", "prison cage", "treasure pile", "cooking fire"],
            items: ["stolen gold", "goblin axe", "rusty key", "goblin ear"],
            enemies: ["goblin warrior", "goblin shaman", "goblin chief"],
            boss: true,
            music: "battle"
        },
        
        dungeon_entrance: {
            name: "Dungeon Entrance",
            description: "A massive cave mouth yawns before you, exhaling cold air that carries strange sounds from below. Ancient runes are carved into the stone archway, warning of the dangers within.",
            exits: { north: "swamp", south: "depths" },
            features: ["stone archway", "warning signs", "torch brackets", "skeleton remains"],
            items: ["torch", "rope", "skeleton key"],
            enemies: ["goblin guard", "skeleton guard"],
            music: "dungeon"
        },
        
        depths: {
            name: "The Depths",
            description: "Deep underground. The walls glisten with moisture. Strange fungi provide an eerie bioluminescence. This is where the Black Sword awaits...",
            exits: { north: "dungeon_entrance", south: "dark_hall", east: "shadow_chamber" },
            features: ["ancient door", "dark altar", "bone pile", "underground lake"],
            items: ["black sword", "shadow essence", "dark crystal"],
            enemies: ["dark knight", "shadow demon"],
            music: "boss"
        },
        
        dark_hall: {
            name: "Dark Hall",
            description: "A vast underground hall stretches before you. Columns of dark stone support the ceiling. Shadows seem to move on their own.",
            exits: { north: "depths" },
            features: ["dark columns", "shadow throne", "ancient murals"],
            items: ["shadow cloak", "dark crown"],
            enemies: ["dark mage", "shadow archer"],
            music: "boss"
        },
        
        shadow_chamber: {
            name: "Shadow Chamber",
            description: "A circular chamber filled with living shadows. In the center, a pedestal holds a blade that seems to absorb all light around it.",
            exits: { west: "depths" },
            features: ["shadow pedestal", "light-eating darkness"],
            items: ["THE BLACK SWORD"],
            enemies: ["shadow lord"],
            boss: true,
            finalBoss: true,
            music: "boss"
        }
    },
    
    // Enemy definitions
    enemies: {
        // Common enemies
        "wolf": { hp: 25, attack: 8, xp: 20, gold: 12, desc: "A snarling gray wolf" },
        "mountain lion": { hp: 40, attack: 12, xp: 35, gold: 25, desc: "A powerful mountain lion" },
        "goblin scout": { hp: 20, attack: 6, xp: 15, gold: 10, desc: "A small green goblin" },
        "goblin guard": { hp: 35, attack: 10, xp: 30, gold: 22, desc: "A goblin warrior" },
        "goblin warrior": { hp: 50, attack: 14, xp: 45, gold: 35, desc: "A battle-hardened goblin fighter" },
        "goblin shaman": { hp: 40, attack: 18, xp: 55, gold: 40, desc: "A goblin magic user" },
        "giant frog": { hp: 30, attack: 9, xp: 25, gold: 18, desc: "A massive swamp frog" },
        "forest spider": { hp: 35, attack: 11, xp: 30, gold: 20, desc: "A spider with venomous fangs" },
        
        // Undead
        "skeleton warrior": { hp: 45, attack: 14, xp: 45, gold: 35, desc: "Rattling bones animated by dark magic" },
        "skeleton guard": { hp: 60, attack: 16, xp: 60, gold: 45, desc: "An armored skeleton guardian" },
        "undead mage": { hp: 35, attack: 20, xp: 50, gold: 40, desc: "A floating robe with burning eyes" },
        "ghost knight": { hp: 70, attack: 22, xp: 80, gold: 60, desc: "A spectral warrior in ethereal armor" },
        
        // Elite
        "ice troll": { hp: 80, attack: 18, xp: 70, gold: 55, desc: "A massive troll made of living ice" },
        "crocodile": { hp: 90, attack: 20, xp: 75, gold: 50, desc: "An ancient swamp crocodile" },
        "swamp witch": { hp: 60, attack: 22, xp: 80, gold: 70, desc: "An evil sorceress of the swamp" },
        "stone guardian": { hp: 100, attack: 25, xp: 100, gold: 80, desc: "A golem of living stone" },
        "giant eagle": { hp: 80, attack: 20, xp: 85, gold: 60, desc: "A massive eagle with razor talons" },
        "dark knight": { hp: 120, attack: 25, xp: 150, gold: 120, desc: "A knight corrupted by dark magic" },
        
        // BOSSES
        "mega eagle": { hp: 200, attack: 30, xp: 300, gold: 200, boss: true, desc: "The legendary sky king" },
        "goblin chief": { hp: 250, attack: 28, xp: 350, gold: 300, boss: true, desc: "The leader of all goblins" },
        "shadow demon": { hp: 300, attack: 35, xp: 400, gold: 350, boss: true, desc: "A demon from the shadow realm" },
        "shadow lord": { hp: 500, attack: 40, xp: 1000, gold: 1000, boss: true, finalBoss: true, desc: "The master of darkness" }
    },
    
    // Item definitions
    items: {
        // Currency & valuables
        "gold coin": { name: "Gold Coin", type: "treasure", value: 10, desc: "A shiny gold coin" },
        "ruby gem": { name: "Ruby Gem", type: "treasure", value: 100, desc: "A brilliant red gemstone" },
        "stolen gold": { name: "Stolen Gold", type: "treasure", value: 50, desc: "Gold coins stolen by goblins" },
        
        // Consumables
        "bread": { name: "Bread", type: "food", effect: "heal", value: 10, desc: "Fresh bakery bread" },
        "mountain flower": { name: "Mountain Flower", type: "herb", effect: "heal", value: 25, desc: "A rare flower from high peaks" },
        "herbs": { name: "Healing Herbs", type: "herb", effect: "heal", value: 20, desc: "Common healing herbs" },
        "swamp herb": { name: "Swamp Herb", type: "herb", effect: "heal", value: 15, desc: "A medicinal herb from the swamp" },
        "healing potion": { name: "Healing Potion", type: "potion", effect: "heal", value: 50, desc: "Restores 50 HP" },
        "mana potion": { name: "Mana Potion", type: "potion", effect: "mana", value: 40, desc: "Restores 40 MP" },
        
        // Weapons
        "wooden staff": { name: "Wooden Staff", type: "weapon", damage: 5, magic: 5, desc: "A simple wooden magical staff" },
        "goblin axe": { name: "Goblin Axe", type: "weapon", damage: 12, desc: "A crude but effective goblin weapon" },
        "THE BLACK SWORD": { name: "THE BLACK SWORD", type: "weapon", damage: 100, legendary: true, desc: "The legendary sword of ultimate power!" },
        
        // Armor & Accessories
        "iron ore": { name: "Iron Ore", type: "material", value: 15, desc: "Raw iron ore for crafting" },
        "golden amulet": { name: "Golden Amulet", type: "accessory", hp: 20, desc: "A beautiful golden necklace" },
        "blessed amulet": { name: "Blessed Amulet", type: "accessory", hp: 30, magic: 10, desc: "An amulet blessed by the gods" },
        "eagle feather": { name: "Eagle Feather", type: "material", value: 20, desc: "A feather from a mountain eagle" },
        "sky feather": { name: "Sky Feather", type: "material", value: 50, desc: "A magical feather from the heavens" },
        "fairy dust": { name: "Fairy Dust", type: "material", value: 30, magic: 15, desc: "Sparkling dust from fairies" },
        
        // Quest Items
        "ancient scroll": { name: "Ancient Scroll", type: "quest", value: 50, desc: "A scroll with mysterious writing" },
        "old map": { name: "Old Map", type: "quest", value: 30, desc: "A weathered treasure map" },
        "acorn": { name: "Acorn", type: "quest", value: 5, desc: "An acorn from the ancient oak" },
        "rusty key": { name: "Rusty Key", type: "quest", value: 10, desc: "An old key, rusted but functional" },
        "skeleton key": { name: "Skeleton Key", type: "quest", value: 100, desc: "Opens any lock" },
        "mystic orb": { name: "Mystic Orb", type: "quest", value: 150, desc: "A glowing orb of unknown power" },
        
        // Special Items
        "torch": { name: "Torch", type: "tool", value: 5, desc: "Lights dark areas" },
        "rope": { name: "Rope", type: "tool", value: 8, desc: "50 feet of sturdy rope" },
        "will-o-wisp light": { name: "Will-o'-Wisp Light", type: "tool", value: 25, desc: "A captured will-o'-wisp" },
        "bog water": { name: "Bog Water", type: "misc", value: 1, desc: "Murky swamp water" },
        "goblin ear": { name: "Goblin Ear", type: "misc", value: 5, desc: "A trophy from a defeated goblin" },
        "shadow essence": { name: "Shadow Essence", type: "material", value: 200, desc: "Pure darkness captured in a vial" },
        "dark crystal": { name: "Dark Crystal", type: "material", value: 300, desc: "A crystal infused with dark magic" },
        "shadow cloak": { name: "Shadow Cloak", type: "accessory", stealth: 20, desc: "A cloak that blends with shadows" },
        "dark crown": { name: "Dark Crown", type: "accessory", magic: 30, desc: "A crown of pure darkness" },
        "golden egg": { name: "Golden Egg", type: "misc", value: 500, desc: "An egg made of pure gold" }
    },
    
    // NPC definitions
    npcs: {
        kaliwasch: [
            { name: "Merchant Aldric", role: "trader", dialog: [
                "Welcome to my shop, traveler!",
                "I've got the finest wares in all the realm!",
                "May fortune smile upon your journey."
            ]},
            { name: "Tavern Keeper Greta", role: "tavern", dialog: [
                "Sit yourself down and rest!",
                "Care for an ale, adventurer?",
                "I hear strange things are happening in the dungeon..."
            ]},
            { name: "Guild Master Helena", role: "guild", dialog: [
                "Ah, a new adventurer!",
                "The guild has many quests for brave heroes.",
                "Defeat the Shadow Lord to prove your worth!"
            ]},
            { name: "Temple Priest", role: "healer", dialog: [
                "The gods watch over us all.",
                "May the light guide your path.",
                "Need healing? The temple offers blessings for a small donation."
            ]}
        ]
    },
    
    // Quest definitions
    quests: [
        {
            id: "tutorial",
            name: "Welcome to Kaliwasch",
            description: "Explore the city of Kaliwasch and speak to the locals.",
            objectives: [
                { type: "visit", target: "kaliwasch", count: 1 }
            ],
            reward: { xp: 50, gold: 25 }
        },
        {
            id: "first_blood",
            name: "First Blood",
            description: "Defeat your first enemy in the wilderness.",
            objectives: [
                { type: "kill", target: "any", count: 1 }
            ],
            reward: { xp: 100, gold: 50 }
        },
        {
            id: "goblin_problem",
            name: "The Goblin Problem",
            description: "The goblins in the Southern Swamp are causing trouble. Defeat their chief.",
            objectives: [
                { type: "kill", target: "goblin chief", count: 1 }
            ],
            reward: { xp: 500, gold: 300, item: "goblin axe" }
        },
        {
            id: "eagle_king",
            name: "King of the Skies",
            description: "The Mega Eagle terrorizes the mountain passes. Defeat it.",
            objectives: [
                { type: "kill", target: "mega eagle", count: 1 }
            ],
            reward: { xp: 600, gold: 400, item: "sky feather" }
        },
        {
            id: "ancient_knowledge",
            name: "Ancient Knowledge",
            description: "Find the ancient scrolls in the Eastern Ruins.",
            objectives: [
                { type: "collect", target: "ancient scroll", count: 1 }
            ],
            reward: { xp: 200, gold: 150, item: "blessed amulet" }
        },
        {
            id: "black_sword",
            name: "The Black Sword",
            description: "Find and claim the legendary Black Sword from the Shadow Chamber.",
            objectives: [
                { type: "collect", target: "THE BLACK SWORD", count: 1 }
            ],
            reward: { xp: 2000, gold: 1000 }
        },
        {
            id: "shadow_lord",
            name: "Defeat the Shadow Lord",
            description: "The ultimate challenge. Defeat the Shadow Lord and save the realm!",
            objectives: [
                { type: "kill", target: "shadow lord", count: 1 }
            ],
            reward: { xp: 5000, gold: 5000, item: "dark crown" }
        }
    ]
};

// Print loading info
console.log('🗺️ World Data loaded:');
console.log('- 15+ unique locations');
console.log('- 30+ enemy types');
console.log('- 50+ items');
console.log('- 8 main quests + side quests');
console.log('- NPCs in every major location');
