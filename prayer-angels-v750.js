/**
 * v7.50.0 - PRAYER AND FOUR ANGELS SYSTEM
 * Emergency prayer at 15% HP or below summons four angels
 */
(() => {
    'use strict';
    
    const initPrayerSystem = () => {
        if (!window.Game) {
            setTimeout(initPrayerSystem, 100);
            return;
        }
        
        const G = window.Game;
        
        // ===== ANGELS DATABASE =====
        const Angels = {
            angel_of_light: {
                name: 'Angel of Light',
                hp: 100,
                max_hp: 100,
                attack: 15,
                healing: 20,
                duration: 5, // turns
                description: 'A radiant angel wielding a sword of light.',
                color: 'gold'
            },
            angel_of_grace: {
                name: 'Angel of Grace',
                hp: 80,
                max_hp: 80,
                attack: 10,
                healing: 30,
                duration: 5,
                description: 'A gentle angel focused on healing.',
                color: 'white'
            },
            angel_of_strength: {
                name: 'Angel of Strength',
                hp: 120,
                max_hp: 120,
                attack: 20,
                healing: 10,
                duration: 5,
                description: 'A powerful angel with mighty strikes.',
                color: 'red'
            },
            angel_of_wisdom: {
                name: 'Angel of Wisdom',
                hp: 90,
                max_hp: 90,
                attack: 12,
                healing: 25,
                duration: 5,
                description: 'A wise angel with magical attacks.',
                color: 'blue'
            }
        };
        
        // ===== PRAYER SYSTEM =====
        G.pray = function() {
            const p = this.state.player;
            if (!p) {
                this.addNarrative('No active hero.', 'system');
                return;
            }
            
            const hpPercent = (p.health_points / p.max_health_points) * 100;
            
            // Check if in temple
            const loc = window.WorldData?.locations?.[this.state.location];
            const inTemple = loc && (loc.isTemple || loc.canPray || /chapel|temple|shrine|altar/i.test(this.state.location || ''));
            
            // Emergency prayer - 15% HP or below
            if (hpPercent <= 15) {
                this.summonFourAngels();
                return;
            }
            
            // Normal prayer in temple
            if (inTemple) {
                // Full heal
                p.health_points = p.max_health_points;
                p.magic_points = p.max_magic_points;
                this.addNarrative('🙏 You pray at the temple. Divine energy restores you completely. Health Points and Magic Points fully restored.', 'magic');
                
                // Check if first prayer - give blessing choice
                if (!p.has_received_blessing) {
                    this.offerBlessing();
                } else {
                    this.addNarrative('You feel at peace. The temple welcomes your devotion.', 'system');
                }
            } else {
                this.addNarrative('Your Health Points are stable. You do not need emergency assistance right now. Find a temple to pray for blessings.', 'system');
            }
        };
        
        // ===== SUMMON FOUR ANGELS =====
        G.summonFourAngels = function() {
            const p = this.state.player;
            if (!p) return;
            
            // Initialize angels if not exists
            if (!this.state.active_angels) {
                this.state.active_angels = [];
            }
            
            // Summon all four angels
            const angelTypes = ['angel_of_light', 'angel_of_grace', 'angel_of_strength', 'angel_of_wisdom'];
            this.state.active_angels = angelTypes.map(type => {
                const angel = Angels[type];
                return {
                    type: type,
                    name: angel.name,
                    hp: angel.hp,
                    max_hp: angel.max_hp,
                    attack: angel.attack,
                    healing: angel.healing,
                    duration: angel.duration,
                    color: angel.color
                };
            });
            
            // Full heal through divine intervention
            p.health_points = p.max_health_points;
            p.magic_points = p.max_magic_points;
            
            this.addNarrative('✨✨✨ EMERGENCY PRAYER ACTIVATED ✨✨✨', 'magic');
            this.addNarrative('Four Angels descend from the heavens!', 'magic');
            this.addNarrative('• Angel of Light - Sword of radiance', 'magic');
            this.addNarrative('• Angel of Grace - Healing light', 'magic');
            this.addNarrative('• Angel of Strength - Mighty strikes', 'magic');
            this.addNarrative('• Angel of Wisdom - Magical power', 'magic');
            this.addNarrative('Your Health Points and Magic Points are fully restored!', 'magic');
            this.addNarrative('The Angels will fight alongside you for 5 turns.', 'magic');
            
            // Voice announcement
            if (window.AudioManager) {
                window.AudioManager.playVoice('Four Angels have appeared! Your health is fully restored.', { channel: 'prayer' });
            }
        };
        
        // ===== OFFER BLESSING (First prayer only) =====
        G.offerBlessing = function() {
            this.addNarrative('✨ A divine voice speaks: "Choose your blessing."', 'system');
            this.addNarrative('Type "blessing strength" for Strength Blessing (+3 permanent)', 'system');
            this.addNarrative('Type "blessing dexterity" for Dexterity Blessing (+3 permanent)', 'system');
        };
        
        G.blessing = function(type) {
            const p = this.state.player;
            if (!p) return;
            
            if (p.has_received_blessing) {
                this.addNarrative('You have already received a blessing.', 'system');
                return;
            }
            
            if (type === 'strength') {
                p.strength = (p.strength || 8) + 3;
                this.addNarrative('✨ Strength Blessing received! Strength +3 (permanent)', 'treasure');
            } else if (type === 'dexterity') {
                p.dexterity = (p.dexterity || 6) + 3;
                this.addNarrative('✨ Dexterity Blessing received! Dexterity +3 (permanent)', 'treasure');
            } else {
                this.addNarrative('Invalid blessing. Choose strength or dexterity.', 'system');
                return;
            }
            
            p.has_received_blessing = true;
            this.save?.();
        };
        
        // ===== ANGELS IN COMBAT =====
        const oldProcessCombatTurn = G.processCombatTurn;
        G.processCombatTurn = function() {
            // Angels act before player
            if (this.state.active_angels && this.state.active_angels.length > 0) {
                this.addNarrative('--- Angel Turn ---', 'system');
                
                const enemy = this.state.enemy;
                
                this.state.active_angels.forEach((angel, index) => {
                    if (angel.hp <= 0) return;
                    
                    // Angel attacks enemy
                    const damage = angel.attack + Math.floor(Math.random() * 5);
                    enemy.hp -= damage;
                    this.addNarrative(`${angel.name} attacks for ${damage} damage!`, 'combat');
                    
                    // Angel heals player occasionally
                    if (Math.random() < 0.3 && this.state.player.health_points < this.state.player.max_health_points) {
                        const heal = angel.healing;
                        this.state.player.health_points = Math.min(this.state.player.max_health_points, this.state.player.health_points + heal);
                        this.addNarrative(`${angel.name} heals you for ${heal} Health Points!`, 'heal');
                    }
                    
                    // Decrease duration
                    angel.duration--;
                });
                
                // Remove expired angels
                this.state.active_angels = this.state.active_angels.filter(a => {
                    if (a.duration <= 0) {
                        this.addNarrative(`${a.name} ascends back to the heavens.`, 'system');
                        return false;
                    }
                    return true;
                });
                
                if (this.state.active_angels.length === 0) {
                    this.addNarrative('All Angels have departed.', 'system');
                    this.state.active_angels = null;
                }
                
                // Check if enemy defeated by angels
                if (enemy.hp <= 0) {
                    this.addNarrative('The enemy has been defeated by the Angels!', 'combat');
                    this.endCombat(true);
                    return;
                }
            }
            
            // Continue with normal combat
            if (oldProcessCombatTurn) {
                return oldProcessCombatTurn.call(this);
            }
        };
        
        // ===== BLESSING COMMAND =====
        const oldProcessCommand = G.processCommand;
        G.processCommand = function(cmd) {
            const c = cmd.toLowerCase().trim();
            
            // Blessing command
            if (c.startsWith('blessing ')) {
                const type = c.slice(9).trim();
                this.blessing(type);
                return;
            }
            
            return oldProcessCommand.call(this, cmd);
        };
        
        console.log('✓ Prayer and Four Angels system initialized');
    };
    
    initPrayerSystem();
})();
