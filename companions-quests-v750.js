/**
 * v7.50.0 - COMPANION AND QUEST SYSTEMS
 * Proper companion management and quest progression
 */
(() => {
    'use strict';
    
    const initSystems = () => {
        if (!window.Game) {
            setTimeout(initSystems, 100);
            return;
        }
        
        const G = window.Game;
        
        // ===== COMPANION DATABASE =====
        const CompanionDB = {
            forest_ranger: {
                companion_id: 'forest_ranger',
                name: 'Elara the Ranger',
                level: 1,
                xp: 0,
                xp_to_next: 100,
                health_points: 60,
                max_health_points: 60,
                magic_points: 20,
                max_magic_points: 20,
                strength: 7,
                intelligence: 4,
                dexterity: 9,
                armor: 3,
                skills: ['archery', 'tracking', 'healing_herbs'],
                description: 'A skilled ranger who can track enemies and heal with herbs.',
                equipment: {
                    weapon: 'wooden_bow',
                    armor: 'leather_vest'
                }
            }
        };
        
        // ===== COMPANION COMMANDS =====
        G.showCompanions = function() {
            const companions = this.state.player.companions || [];
            
            if (companions.length === 0) {
                this.addNarrative('You have no companions yet. Complete quests to recruit companions.', 'system');
                return;
            }
            
            this.addNarrative('=== Your Companions ===', 'system');
            companions.forEach((comp, i) => {
                this.addNarrative(`${i + 1}. ${comp.name} - Level ${comp.level}`, 'system');
                this.addNarrative(`   Health Points: ${comp.health_points}/${comp.max_health_points}`, 'system');
                this.addNarrative(`   Magic Points: ${comp.magic_points}/${comp.max_magic_points}`, 'system');
                this.addNarrative(`   Strength: ${comp.strength}, Intelligence: ${comp.intelligence}, Dexterity: ${comp.dexterity}`, 'system');
            });
        };
        
        G.inspectCompanion = function(name) {
            const companions = this.state.player.companions || [];
            const comp = companions.find(c => c.name.toLowerCase().includes(name.toLowerCase()));
            
            if (!comp) {
                this.addNarrative(`No companion named "${name}" found.`, 'system');
                return;
            }
            
            this.addNarrative(`=== ${comp.name} ===`, 'system');
            this.addNarrative(`Level: ${comp.level}`, 'system');
            this.addNarrative(`Health Points: ${comp.health_points}/${comp.max_health_points}`, 'system');
            this.addNarrative(`Magic Points: ${comp.magic_points}/${comp.max_magic_points}`, 'system');
            this.addNarrative(`Strength: ${comp.strength}`, 'system');
            this.addNarrative(`Intelligence: ${comp.intelligence}`, 'system');
            this.addNarrative(`Dexterity: ${comp.dexterity}`, 'system');
            this.addNarrative(`Armor: ${comp.armor}`, 'system');
            this.addNarrative(`Skills: ${comp.skills.join(', ')}`, 'system');
            this.addNarrative(comp.description, 'system');
        };
        
        // ===== QUEST SYSTEM =====
        G.showQuests = function() {
            const activeQuests = this.state.player.active_quests || [];
            const completedQuests = this.state.player.completed_quests || [];
            
            this.addNarrative('=== Active Quests ===', 'system');
            if (activeQuests.length === 0) {
                this.addNarrative('No active quests. Visit the Palace or Guild to find quests.', 'system');
            } else {
                activeQuests.forEach((quest, i) => {
                    this.addNarrative(`${i + 1}. ${quest.name}`, 'system');
                    this.addNarrative(`   ${quest.description}`, 'system');
                    quest.steps.forEach(step => {
                        const status = step.completed ? '✓' : '○';
                        this.addNarrative(`   ${status} ${step.description}`, 'system');
                    });
                });
            }
            
            this.addNarrative('=== Completed Quests ===', 'system');
            if (completedQuests.length === 0) {
                this.addNarrative('No completed quests yet.', 'system');
            } else {
                completedQuests.forEach(quest => {
                    this.addNarrative(`✓ ${quest.name}`, 'system');
                });
            }
        };
        
        // ===== QUEST PROGRESSION =====
        G.updateQuestProgress = function(stepId) {
            const activeQuests = this.state.player.active_quests || [];
            
            activeQuests.forEach(quest => {
                quest.steps.forEach(step => {
                    if (step.id === stepId && !step.completed) {
                        if (step.count !== undefined) {
                            step.count++;
                            if (step.count >= step.required) {
                                step.completed = true;
                                this.addNarrative(`✓ Quest step completed: ${step.description}`, 'system');
                                this.checkQuestCompletion(quest);
                            } else {
                                this.addNarrative(`Progress: ${step.count}/${step.required} - ${step.description}`, 'system');
                            }
                        } else {
                            step.completed = true;
                            this.addNarrative(`✓ Quest step completed: ${step.description}`, 'system');
                            this.checkQuestCompletion(quest);
                        }
                    }
                });
            });
        };
        
        G.checkQuestCompletion = function(quest) {
            const allCompleted = quest.steps.every(s => s.completed);
            
            if (allCompleted) {
                this.addNarrative(`🎉 Quest Completed: ${quest.name}!`, 'system');
                this.addNarrative(`Reward: ${quest.reward_gold} Gold, ${quest.reward_xp} XP`, 'system');
                
                // Give rewards
                this.state.player.gold = (this.state.player.gold || 0) + quest.reward_gold;
                this.state.player.xp = (this.state.player.xp || 0) + quest.reward_xp;
                
                // Add companion if quest rewards one
                if (quest.companion_reward && CompanionDB[quest.companion_reward]) {
                    const companion = JSON.parse(JSON.stringify(CompanionDB[quest.companion_reward]));
                    this.state.player.companions = this.state.player.companions || [];
                    this.state.player.companions.push(companion);
                    this.addNarrative(`🎉 ${companion.name} has joined you as a companion!`, 'system');
                }
                
                // Unlock class selection if third quest
                if (quest.unlocks_class_selection) {
                    this.addNarrative('✨ You can now choose your class at the Guild!', 'system');
                    this.state.player.can_choose_class = true;
                }
                
                // Move quest to completed
                this.state.player.active_quests = this.state.player.active_quests.filter(q => q.quest_id !== quest.quest_id);
                this.state.player.completed_quests = this.state.player.completed_quests || [];
                this.state.player.completed_quests.push(quest);
                
                this.save?.();
                this.checkLevelUp();
            }
        };
        
        // ===== LEVEL UP SYSTEM =====
        G.checkLevelUp = function() {
            const p = this.state.player;
            if (!p) return;
            
            while (p.xp >= p.xp_to_next) {
                p.level++;
                p.xp -= p.xp_to_next;
                p.xp_to_next = Math.floor(p.xp_to_next * 1.5);
                
                // Stat increases
                p.max_health_points += 10;
                p.health_points = p.max_health_points;
                p.max_magic_points += 5;
                p.magic_points = p.max_magic_points;
                p.strength += 1;
                p.intelligence += 1;
                p.dexterity += 1;
                
                this.addNarrative(`🎉 Level Up! You are now level ${p.level}!`, 'system');
                this.addNarrative(`Health Points: ${p.max_health_points}, Magic Points: ${p.max_magic_points}`, 'system');
            }
        };
        
        // ===== COMPANION LEVEL UP =====
        G.levelUpCompanion = function(name) {
            const companions = this.state.player.companions || [];
            const comp = companions.find(c => c.name.toLowerCase().includes(name.toLowerCase()));
            
            if (!comp) {
                this.addNarrative(`No companion named "${name}" found.`, 'system');
                return;
            }
            
            if (comp.xp >= comp.xp_to_next) {
                comp.level++;
                comp.xp -= comp.xp_to_next;
                comp.xp_to_next = Math.floor(comp.xp_to_next * 1.5);
                comp.max_health_points += 8;
                comp.health_points = comp.max_health_points;
                comp.max_magic_points += 3;
                comp.magic_points = comp.max_magic_points;
                comp.strength += 1;
                comp.dexterity += 1;
                
                this.addNarrative(`${comp.name} reached level ${comp.level}!`, 'system');
            } else {
                this.addNarrative(`${comp.name} needs more experience to level up.`, 'system');
            }
        };
        
        // ===== QUEST GIVING =====
        G.giveQuest = function(questId) {
            const quest = window.WorldData.quests.find(q => q.quest_id === questId);
            if (!quest) {
                this.addNarrative('Quest not found.', 'system');
                return;
            }
            
            // Check if already active or completed
            const active = this.state.player.active_quests.find(q => q.quest_id === questId);
            const completed = this.state.player.completed_quests.find(q => q.quest_id === questId);
            
            if (active || completed) {
                this.addNarrative('You already have this quest or have completed it.', 'system');
                return;
            }
            
            // Add quest
            const questCopy = JSON.parse(JSON.stringify(quest));
            this.state.player.active_quests = this.state.player.active_quests || [];
            this.state.player.active_quests.push(questCopy);
            this.addNarrative(`Quest accepted: ${quest.name}`, 'system');
            this.addNarrative(quest.description, 'system');
        };
        
        console.log('✓ Companion and quest systems initialized');
    };
    
    initSystems();
})();
