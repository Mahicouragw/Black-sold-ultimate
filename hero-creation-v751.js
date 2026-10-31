/**
 * v7.51.0 - HERO CREATION & BEGIN ADVENTURE FIX
 * Proper validation, account association, real database save
 */
(() => {
    'use strict';
    
    const fixHeroCreation = () => {
        if (!window.Game) {
            setTimeout(fixHeroCreation, 100);
            return;
        }
        
        const G = window.Game;
        
        // ===== VALIDATE HERO NAME =====
        G.validateHeroName = function(name) {
            if (!name || typeof name !== 'string') {
                return { valid: false, error: 'Name is required' };
            }
            
            const trimmed = name.trim();
            
            if (trimmed.length < 2) {
                return { valid: false, error: 'Name must be at least 2 characters' };
            }
            
            if (trimmed.length > 30) {
                return { valid: false, error: 'Name must be 30 characters or less' };
            }
            
            // Only allow letters, numbers, spaces, hyphens, apostrophes
            if (!/^[a-zA-Z0-9\s\-']+$/.test(trimmed)) {
                return { valid: false, error: 'Name can only contain letters, numbers, spaces, hyphens, and apostrophes' };
            }
            
            return { valid: true, name: trimmed };
        };
        
        // ===== CREATE HERO WITH VALIDATION =====
        G.createHeroWithValidation = function(heroName, options = {}) {
            // Validate name
            const validation = G.validateHeroName(heroName);
            if (!validation.valid) {
                return { success: false, error: validation.error };
            }
            
            // Check if player already has a hero
            const roster = G.getRoster();
            const existingHeroCount = Object.keys(roster.heroes || {}).length;
            
            if (existingHeroCount > 0 && !options.allowMultiple) {
                return { 
                    success: false, 
                    error: 'You already have a hero. Please continue your adventure or delete your existing hero first.' 
                };
            }
            
            // Create hero ID
            const heroId = `hero_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Get authenticated user ID if available
            const userId = window.OnlineManager?.user?.id || 'guest';
            
            // Create hero data
            const heroData = {
                hero_id: heroId,
                hero_name: validation.name,
                owner_user_id: userId,
                level: 1,
                xp: 0,
                xp_to_next: 100,
                health_points: 80,
                max_health_points: 80,
                magic_points: 30,
                max_magic_points: 30,
                strength: 8,
                intelligence: 5,
                dexterity: 6,
                armor: 4,
                gold: 50,
                location: 'palace_throne_room',
                inventory: [
                    { item_id: 'basic_dagger', quantity: 1 },
                    { item_id: 'health_potion', quantity: 3 },
                    { item_id: 'mana_potion', quantity: 2 },
                    { item_id: 'bread', quantity: 5 }
                ],
                equipment: {
                    right_hand: 'basic_dagger',
                    left_hand: null,
                    head: null,
                    body: null,
                    hands: null,
                    feet: null,
                    accessory: null
                },
                spells: ['healing_spell', 'alohomora', 'phantom_blade_dance'],
                created_at: new Date().toISOString(),
                last_played: new Date().toISOString()
            };
            
            // Store in roster
            roster.heroes[heroId] = heroData;
            roster.activeHeroId = heroId;
            G.storeRoster(roster);
            
            return { success: true, heroId, hero: heroData };
        };
        
        // ===== BEGIN ADVENTURE =====
        G.beginAdventure = function(heroId) {
            const roster = G.getRoster();
            
            if (!heroId) {
                heroId = roster.activeHeroId;
            }
            
            if (!heroId || !roster.heroes[heroId]) {
                return { success: false, error: 'No hero selected or hero not found' };
            }
            
            const hero = roster.heroes[heroId];
            
            // Set active hero
            G.state.activeHeroId = heroId;
            G.state.player = hero;
            G.state.location = hero.location || 'palace_throne_room';
            
            // Update last played
            hero.last_played = new Date().toISOString();
            G.storeRoster(roster);
            
            // Start game
            G.showScreen('game-screen');
            G.enterLocation(G.state.location);
            
            return { success: true, hero };
        };
        
        // ===== DELETE HERO =====
        G.deleteHero = function(heroId) {
            const roster = G.getRoster();
            
            if (!roster.heroes[heroId]) {
                return { success: false, error: 'Hero not found' };
            }
            
            delete roster.heroes[heroId];
            
            if (roster.activeHeroId === heroId) {
                roster.activeHeroId = Object.keys(roster.heroes)[0] || null;
            }
            
            G.storeRoster(roster);
            
            return { success: true };
        };
        
        // ===== LIST HEROS =====
        G.listHeroes = function() {
            const roster = G.getRoster();
            return Object.values(roster.heroes || []).map(h => ({
                hero_id: h.hero_id,
                hero_name: h.hero_name,
                level: h.level,
                location: h.location
            }));
        };
        
        console.log('✓ Hero creation system initialized with validation');
    };
    
    fixHeroCreation();
})();
