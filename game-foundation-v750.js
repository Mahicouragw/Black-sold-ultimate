/**
 * v7.50.0 - GAME FOUNDATION REBUILD
 * Clean database structure, proper validation, no undefined values
 */

// ===== CLEAN WORLD DATABASE =====
const CleanWorldData = {
    locations: {},
    items: {},
    enemies: {},
    quests: [],
    
    // Validation helper
    validateLocation(loc) {
        if (!loc) return false;
        if (!loc.location_id) loc.location_id = loc.id || 'unknown';
        if (!loc.location_name) loc.location_name = loc.name || 'Unknown Location';
        if (!loc.biome) loc.biome = 'forest';
        if (!loc.exits) loc.exits = {};
        return true;
    },
    
    validateItem(item) {
        if (!item) return false;
        if (!item.item_id) item.item_id = item.id || 'unknown';
        if (!item.item_name) item.item_name = item.name || 'Unknown Item';
        if (!item.item_type) item.item_type = 'misc';
        if (item.damage === undefined) item.damage = 0;
        if (item.armor === undefined) item.armor = 0;
        if (item.healing_power === undefined) item.healing_power = 0;
        return true;
    }
};

// ===== STARTING ITEMS =====
CleanWorldData.items['basic_dagger'] = {
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
    stackable: false,
    quantity: 1
};

CleanWorldData.items['health_potion'] = {
    item_id: 'health_potion',
    item_name: 'Health Potion',
    description: 'Restores 50 Health Points.',
    item_type: 'consumable',
    rarity: 'common',
    healing_power: 50,
    stackable: true,
    quantity: 3
};

CleanWorldData.items['mana_potion'] = {
    item_id: 'mana_potion',
    item_name: 'Mana Potion',
    description: 'Restores 30 Magic Points.',
    item_type: 'consumable',
    rarity: 'common',
    magic_power: 30,
    stackable: true,
    quantity: 2
};

CleanWorldData.items['bread'] = {
    item_id: 'bread',
    item_name: 'Bread',
    description: 'Simple food that restores a small amount of health.',
    item_type: 'food',
    rarity: 'common',
    healing_power: 15,
    stackable: true,
    quantity: 5
};

// ===== STARTING SPELLS =====
const StartingSpells = {
    healing_spell: {
        spell_id: 'healing_spell',
        spell_name: 'Healing Light',
        description: 'Restores Health Points through divine energy.',
        mp_cost: 15,
        cooldown: 0,
        target_type: 'self',
        healing_value: 40,
        animation: 'heal',
        sound: 'heal.wav'
    },
    alohomora: {
        spell_id: 'alohomora',
        spell_name: 'Alohomora',
        description: 'Unlocks magical and physical doors.',
        mp_cost: 20,
        cooldown: 0,
        target_type: 'door',
        animation: 'unlock',
        sound: 'magic.wav'
    },
    phantom_blade_dance: {
        spell_id: 'phantom_blade_dance',
        spell_name: 'Phantom Blade Dance',
        description: 'Performs multiple rapid magical strikes against an enemy.',
        mp_cost: 25,
        cooldown: 2,
        target_type: 'enemy',
        damage_value: 35,
        hits: 3,
        animation: 'multi_strike',
        sound: 'attack.wav'
    }
};

// ===== CLEAN HERO CREATION =====
function createCleanHero(heroName, mode = 'non_hardcore') {
    const heroId = `hero_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Validate name
    const name = (heroName || 'Hero').trim().slice(0, 30) || 'Hero';
    
    const hero = {
        hero_id: heroId,
        hero_name: name,
        level: 1,
        xp: 0,
        xp_to_next: 100,
        health_points: 30,        // FIXED: Starting HP per Master Prompt
        max_health_points: 30,    // FIXED: Starting max HP
        magic_points: 20,         // FIXED: Starting MP per Master Prompt
        max_magic_points: 20,     // FIXED: Starting max MP
        strength: 10,             // FIXED: Starting STR per Master Prompt
        intelligence: 10,         // FIXED: Starting INT per Master Prompt
        dexterity: 10,            // FIXED: Starting DEX per Master Prompt
        defense: 10,              // FIXED: Starting DEF per Master Prompt
        armor: 10,                // FIXED: Starting armor per Master Prompt
        gold: 50,
        diamonds: 0,
        rubies: 0,
        location: 'palace_throne_room',
        active_quests: [],
        completed_quests: [],
        companions: [],
        character_class: null, // Will be chosen at Guild after 3 quests
        mode: mode, // 'hardcore' or 'non_hardcore'
        
        // Blessing tracking
        permanentBlessingClaimed: false,
        permanentBlessingType: null,
        permanentBlessingTimestamp: null,
        dailyPrayerBlessingActive: false,
        dailyPrayerBlessingStart: null,
        dailyPrayerBlessingEnd: null,
        lastPrayerIntervention: null,
        equipment: {
            right_hand: 'basic_dagger',
            left_hand: null,
            head: null,
            body: null,
            hands: null,
            feet: null,
            accessory: null
        },
        inventory: [
            { item_id: 'basic_dagger', quantity: 1 },
            { item_id: 'health_potion', quantity: 3 },
            { item_id: 'mana_potion', quantity: 2 },
            { item_id: 'bread', quantity: 5 }
        ],
        spells: [
            'alohomora',
            'shock_spell',
            'multi_strike',
            'healing_self',
            'healing_party',
            'healing_companions',
            'healing_all'
        ],
        stats: {
            kills: 0,
            deaths: 0,
            quests_completed: 0,
            locations_discovered: 1
        },
        created_at: new Date().toISOString(),
        last_played: new Date().toISOString()
    };
    
    return hero;
}

// ===== SAFE STAT CALCULATION =====
function calculateEffectiveStats(hero, worldData) {
    if (!hero) return null;
    
    const base = {
        strength: hero.strength || 8,
        intelligence: hero.intelligence || 5,
        dexterity: hero.dexterity || 6,
        armor: hero.armor || 4,
        health_points: hero.health_points || 80,
        magic_points: hero.magic_points || 30
    };
    
    // Apply equipment bonuses
    if (hero.equipment) {
        for (const slot of Object.values(hero.equipment)) {
            if (slot && worldData.items[slot]) {
                const item = worldData.items[slot];
                CleanWorldData.validateItem(item);
                base.strength += (item.strength_bonus || 0);
                base.armor += (item.armor || 0);
            }
        }
    }
    
    return base;
}

// ===== EXPORT =====
if (typeof window !== 'undefined') {
    window.CleanWorldData = CleanWorldData;
    window.createCleanHero = createCleanHero;
    window.calculateEffectiveStats = calculateEffectiveStats;
    window.StartingSpells = StartingSpells;
}

console.log('✓ Game foundation loaded: Clean database structure, validation, hero creation');
