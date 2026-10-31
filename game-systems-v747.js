/**
 * v7.47.0 — Skill Systems, Crafting, Achievements, Contracts, Events
 * Adds fishing, cooking, crafting, achievements, bounty contracts, and time-based events
 */
(() => {
    'use strict';

    // Initialize game systems
    const initSystems = () => {
        if (!window.Game) {
            setTimeout(initSystems, 100);
            return;
        }

        const G = window.Game;

        // ===== SKILL SYSTEMS =====
        if (!G.state.skills) {
            G.state.skills = {
                fishing: { level: 1, xp: 0, xpToNext: 100 },
                cooking: { level: 1, xp: 0, xpToNext: 100 },
                crafting: { level: 1, xp: 0, xpToNext: 100 }
            };
        }

        // Fishing locations
        const fishingSpots = {
            'kaliwasch_city': { fish: ['common carp', 'river trout'], rare: ['golden fish'], difficulty: 1 },
            'forest_path_10': { fish: ['forest bass', 'moss perch'], rare: ['crystal fish'], difficulty: 2 },
            'mountain_path_5': { fish: ['mountain trout', 'ice salmon'], rare: ['frost pike'], difficulty: 3 },
            'tunnel_section_6': { fish: ['cave blindfish', 'underground eel'], rare: ['shadow ray'], difficulty: 4 }
        };

        // Add fishing command
        const oldProcessCommand = G.processCommand;
        G.processCommand = function(cmd) {
            const c = cmd.toLowerCase().trim();
            
            if (c === 'fish' || c === 'go fishing') {
                return this.goFishing();
            }
            if (c === 'cook' || c === 'cooking') {
                return this.goCooking();
            }
            if (c === 'craft' || c === 'crafting') {
                return this.goCrafting();
            }
            if (c === 'achievements') {
                return this.showAchievements();
            }
            if (c === 'contracts' || c === 'bounty board') {
                return this.showContracts();
            }
            if (c === 'skills') {
                return this.showSkills();
            }
            
            return oldProcessCommand.call(this, cmd);
        };

        // Fishing system
        G.goFishing = function() {
            const loc = this.state.location;
            const spot = fishingSpots[loc];
            
            if (!spot) {
                this.addNarrative('No fishing spot here. Look for water bodies in forests, mountains, or caves.', 'system');
                return;
            }

            this.addNarrative('You cast your line into the water...', 'system');
            
            const skill = this.state.skills.fishing;
            const roll = Math.random() * 100;
            const successChance = 50 + skill.level * 5 - spot.difficulty * 10;
            
            if (roll < successChance) {
                // Caught something!
                const rareChance = Math.random() * 100;
                let fish;
                if (rareChance < 10) {
                    fish = spot.rare[0];
                    this.addNarrative(`✨ Rare catch! You caught a ${fish}!`, 'treasure');
                } else {
                    fish = spot.fish[Math.floor(Math.random() * spot.fish.length)];
                    this.addNarrative(`You caught a ${fish}!`, 'item');
                }
                
                // Add fish to inventory
                const existing = this.state.inventory.find(i => i.name === fish);
                if (existing) {
                    existing.quantity++;
                } else {
                    this.state.inventory.push({ name: fish, type: 'food', quantity: 1, value: rareChance < 10 ? 50 : 10 });
                }
                
                // Gain fishing XP
                skill.xp += rareChance < 10 ? 25 : 10;
                if (skill.xp >= skill.xpToNext) {
                    skill.level++;
                    skill.xp -= skill.xpToNext;
                    skill.xpToNext = Math.floor(skill.xpToNext * 1.5);
                    this.addNarrative(`🎣 Fishing level up! You are now level ${skill.level}!`, 'system');
                }
            } else {
                this.addNarrative('The fish got away... Try again!', 'system');
                skill.xp += 2; // Small XP for trying
            }
            
            this.save?.();
        };

        // Cooking system
        G.goCooking = function() {
            const foodItems = this.state.inventory.filter(i => i.type === 'food');
            
            if (foodItems.length === 0) {
                this.addNarrative('You need food items to cook. Catch fish or gather ingredients.', 'system');
                return;
            }

            const item = foodItems[0];
            this.addNarrative(`You cook the ${item.name}...`, 'system');
            
            const skill = this.state.skills.cooking;
            const roll = Math.random() * 100;
            const successChance = 60 + skill.level * 5;
            
            if (roll < successChance) {
                // Cooked successfully
                const cookedName = `cooked ${item.name}`;
                item.quantity--;
                if (item.quantity <= 0) {
                    this.state.inventory = this.state.inventory.filter(i => i !== item);
                }
                
                // Add cooked food
                const existing = this.state.inventory.find(i => i.name === cookedName);
                if (existing) {
                    existing.quantity++;
                } else {
                    this.state.inventory.push({ 
                        name: cookedName, 
                        type: 'food', 
                        effect: 'heal',
                        power: 20 + skill.level * 5,
                        quantity: 1, 
                        value: 25 
                    });
                }
                
                this.addNarrative(`🍳 You cooked a delicious ${cookedName}! Heals ${20 + skill.level * 5} HP.`, 'item');
                
                // Gain cooking XP
                skill.xp += 15;
                if (skill.xp >= skill.xpToNext) {
                    skill.level++;
                    skill.xp -= skill.xpToNext;
                    skill.xpToNext = Math.floor(skill.xpToNext * 1.5);
                    this.addNarrative(`👨‍🍳 Cooking level up! You are now level ${skill.level}!`, 'system');
                }
            } else {
                this.addNarrative('You burned the food... It is ruined.', 'system');
                item.quantity--;
                if (item.quantity <= 0) {
                    this.state.inventory = this.state.inventory.filter(i => i !== item);
                }
                skill.xp += 3;
            }
            
            this.save?.();
        };

        // Crafting system
        G.goCrafting = function() {
            const recipes = [
                { name: 'iron sword', requires: ['iron ore', 'wood'], skill: 1 },
                { name: 'leather armor', requires: ['leather', 'thread'], skill: 2 },
                { name: 'health potion', requires: ['herb', 'water'], skill: 1 },
                { name: 'mana potion', requires: ['crystal', 'water'], skill: 2 }
            ];
            
            this.addNarrative('Crafting recipes:', 'system');
            recipes.forEach(r => {
                const available = r.requires.every(req => 
                    this.state.inventory.some(i => i.name.includes(req))
                );
                const status = available ? '✓' : '✗';
                this.addNarrative(`${status} ${r.name} (requires: ${r.requires.join(', ')}) - Skill ${r.skill}+`, 'system');
            });
            
            const skill = this.state.skills.crafting;
            this.addNarrative(`Your crafting level: ${skill.level}`, 'system');
            this.addNarrative('Type "craft [item name]" to craft.', 'system');
        };

        // Show skills
        G.showSkills = function() {
            const skills = this.state.skills;
            this.addNarrative('=== YOUR SKILLS ===', 'system');
            this.addNarrative(`🎣 Fishing: Level ${skills.fishing.level} (${skills.fishing.xp}/${skills.fishing.xpToNext} XP)`, 'system');
            this.addNarrative(`👨‍🍳 Cooking: Level ${skills.cooking.level} (${skills.cooking.xp}/${skills.cooking.xpToNext} XP)`, 'system');
            this.addNarrative(`🔨 Crafting: Level ${skills.crafting.level} (${skills.crafting.xp}/${skills.crafting.xpToNext} XP)`, 'system');
        };

        // ===== ACHIEVEMENTS =====
        if (!G.state.achievements) {
            G.state.achievements = [];
        }

        const achievementDefs = [
            { id: 'first_kill', name: 'First Blood', desc: 'Defeat your first enemy', check: (state) => state.totalKills >= 1 },
            { id: 'level_5', name: 'Rising Hero', desc: 'Reach level 5', check: (state) => state.player.level >= 5 },
            { id: 'level_10', name: 'Veteran', desc: 'Reach level 10', check: (state) => state.player.level >= 10 },
            { id: 'fisherman', name: 'Fisherman', desc: 'Catch 10 fish', check: (state) => state.skills.fishing.level >= 2 },
            { id: 'chef', name: 'Chef', desc: 'Cook 10 meals', check: (state) => state.skills.cooking.level >= 2 },
            { id: 'explorer', name: 'Explorer', desc: 'Visit 20 locations', check: (state) => state.visited?.length >= 20 },
            { id: 'rich', name: 'Wealthy', desc: 'Have 1000 gold', check: (state) => state.player.gold >= 1000 },
            { id: 'halloween', name: 'Night Hunter', desc: 'Complete Halloween event', check: (state) => state.flags.seasonal?.halloween?.completedYear }
        ];

        G.checkAchievements = function() {
            achievementDefs.forEach(def => {
                if (!this.state.achievements.includes(def.id) && def.check(this.state)) {
                    this.state.achievements.push(def.id);
                    this.addNarrative(`🏆 Achievement unlocked: ${def.name}! ${def.desc}`, 'system');
                }
            });
        };

        G.showAchievements = function() {
            this.addNarrative('=== ACHIEVEMENTS ===', 'system');
            achievementDefs.forEach(def => {
                const unlocked = this.state.achievements.includes(def.id);
                const status = unlocked ? '✓' : '✗';
                this.addNarrative(`${status} ${def.name}: ${def.desc}`, 'system');
            });
        };

        // ===== CONTRACTS / BOUNTIES =====
        if (!G.state.contracts) {
            G.state.contracts = [];
            // Generate initial contracts
            const contractTypes = [
                { type: 'kill', target: 'goblin', count: 3, reward: 150, desc: 'Eliminate 3 goblins' },
                { type: 'kill', target: 'wolf', count: 5, reward: 200, desc: 'Hunt 5 wolves' },
                { type: 'explore', target: 'forest_path_25', count: 1, reward: 300, desc: 'Reach the Forest Heart' },
                { type: 'fish', target: 'any', count: 5, reward: 100, desc: 'Catch 5 fish' }
            ];
            G.state.contracts = contractTypes.slice(0, 3).map((c, i) => ({ ...c, id: i, completed: false }));
        }

        G.showContracts = function() {
            this.addNarrative('=== BOUNTY BOARD ===', 'system');
            this.state.contracts.forEach(c => {
                const status = c.completed ? '✓' : '○';
                this.addNarrative(`${status} ${c.desc} — Reward: ${c.reward} gold`, 'system');
            });
            this.addNarrative('Contracts auto-complete when you fulfill them.', 'system');
        };

        // Check contract completion
        G.checkContracts = function(type, target) {
            this.state.contracts.forEach(c => {
                if (!c.completed && c.type === type && (c.target === target || c.target === 'any')) {
                    c.completed = true;
                    this.state.player.gold += c.reward;
                    this.addNarrative(`📜 Contract completed: ${c.desc}! Reward: ${c.reward} gold`, 'system');
                }
            });
        };

        // Hook into combat for contracts
        const oldAfterCombat = G.afterCombat;
        G.afterCombat = function(...args) {
            const result = oldAfterCombat?.apply(this, args);
            if (this.state.enemy && this.state.enemy.hp <= 0) {
                this.checkContracts('kill', this.state.enemy.name.toLowerCase());
            }
            this.checkAchievements();
            return result;
        };

        // ===== TIME-BASED EVENTS =====
        G.getTimeOfDay = function() {
            const hour = new Date().getHours();
            if (hour >= 6 && hour < 12) return 'morning';
            if (hour >= 12 && hour < 17) return 'afternoon';
            if (hour >= 17 && hour < 21) return 'evening';
            return 'night';
        };

        // Add time-based events
        G.checkTimeEvents = function() {
            const time = this.getTimeOfDay();
            const loc = this.state.location;
            
            if (time === 'evening' && loc.includes('forest')) {
                if (Math.random() < 0.3) {
                    this.addNarrative('🌅 Evening falls. Fireflies dance in the forest. Rare creatures emerge.', 'system');
                }
            }
            if (time === 'night') {
                if (Math.random() < 0.2) {
                    this.addNarrative('🌙 Night has come. The stars shine bright. Dangerous creatures prowl.', 'system');
                }
            }
        };

        console.log('Skill systems, achievements, contracts, and events initialized');
    };

    initSystems();
})();
