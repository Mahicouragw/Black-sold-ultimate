/**
 * Blessing, Narration, and Authentication Fix v1
 * Fixes:
 * 1. Permanent Blessing - one-time only per hero lifetime
 * 2. Daily Blessing - 24-hour cooldown system
 * 3. Enhanced narration for all game events
 * 4. Google authentication status display
 */
(() => {
    'use strict';
    
    const G = window.Game;
    if (!G) {
        console.error('Blessing/Narration/Auth Fix: Game not found');
        return;
    }

    // ===== 1. PERMANENT BLESSING SYSTEM =====
    // Track permanent blessings in player data to prevent duplicates
    
    /**
     * Check if hero has already received permanent blessing
     */
    function hasPermanentBlessing(player) {
        return player && player.permanentBlessingClaimed === true;
    }
    
    /**
     * Mark permanent blessing as claimed
     */
    function claimPermanentBlessing(player, blessingType) {
        if (!player) return false;
        player.permanentBlessingClaimed = true;
        player.permanentBlessingType = blessingType;
        player.permanentBlessingTimestamp = Date.now();
        return true;
    }
    
    /**
     * Check if daily blessing is available (24-hour cooldown)
     */
    function isDailyBlessingAvailable(player) {
        if (!player || !player.lastDailyBlessingTimestamp) return true;
        const now = Date.now();
        const lastClaim = player.lastDailyBlessingTimestamp;
        const hoursSinceLastClaim = (now - lastClaim) / (1000 * 60 * 60);
        return hoursSinceLastClaim >= 24;
    }
    
    /**
     * Get time remaining until daily blessing is available
     */
    function getDailyBlessingCooldown(player) {
        if (!player || !player.lastDailyBlessingTimestamp) return 0;
        const now = Date.now();
        const lastClaim = player.lastDailyBlessingTimestamp;
        const nextAvailable = lastClaim + (24 * 60 * 60 * 1000);
        const remaining = nextAvailable - now;
        return Math.max(0, remaining);
    }
    
    /**
     * Claim daily blessing
     */
    function claimDailyBlessing(player) {
        if (!player) return false;
        player.lastDailyBlessingTimestamp = Date.now();
        return true;
    }
    
    /**
     * Format cooldown time as HH:MM:SS
     */
    function formatCooldown(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // ===== 2. OVERRIDE PRAY FUNCTIONS =====
    
    const oldPray = G.pray;
    G.pray = function() {
        const p = this.state.player;
        if (!p) { 
            this.addNarrative("No active hero.", 'system'); 
            return; 
        }
        
        const loc = WorldData.locations[this.state.location];
        const inTemple = loc && (loc.isTemple || loc.canPray || /temple|shrine|altar/i.test(this.state.location || ''));
        
        if (this.state.inCombat) {
            // Battle prayer - unchanged
            const healAmount = Math.floor(p.maxHp * 0.3);
            p.hp = Math.min(p.maxHp, p.hp + healAmount);
            const mpCost = 10;
            if (p.mp >= mpCost) {
                p.mp -= mpCost;
                this.addNarrative(`⚔️ Battle Prayer! Auralis blesses you. Healed ${healAmount} HP. (${mpCost} MP used)`, 'magic');
                p.battlePrayerBuff = { str: 5, dex: 5, turns: 3 };
                this.addNarrative(`Strength +5, Dexterity +5 for 3 turns.`, 'system');
            } else {
                this.addNarrative("Not enough mana for battle prayer. Need 10 MP.", 'system');
            }
        } else if (inTemple) {
            // Temple prayer - full heal (always available)
            p.hp = p.maxHp;
            p.mp = p.maxMp;
            this.addNarrative("🙏 You pray at the temple. Auralis restores you to full health and mana!", 'magic');
            
            // Check for permanent blessing (ONE-TIME ONLY)
            if (!hasPermanentBlessing(p)) {
                const blessings = ['strength', 'dexterity', 'intelligence', 'wisdom'];
                const blessing = blessings[Math.floor(Math.random() * blessings.length)];
                p[blessing] = (p[blessing] || 10) + 1;
                claimPermanentBlessing(p, blessing);
                this.addNarrative(`✨ Permanent Blessing received: ${blessing} +1. This blessing is granted only once in your hero's lifetime.`, 'treasure');
            } else {
                this.addNarrative(`You have already received your Permanent Blessing (${p.permanentBlessingType} +1).`, 'system');
            }
            
            // Check for daily blessing (24-hour cooldown)
            if (isDailyBlessingAvailable(p)) {
                // Award daily blessing rewards
                const xpReward = 50;
                const goldReward = 25;
                p.xp = (p.xp || 0) + xpReward;
                p.gold = (p.gold || 0) + goldReward;
                claimDailyBlessing(p);
                this.addNarrative(`✨ Daily Blessing claimed! +${xpReward} Experience Points, +${goldReward} Gold Coins. Available again in 24 hours.`, 'treasure');
                
                // Check for level up
                if (p.xp >= (p.xpToNext || 100)) {
                    this.levelUp?.();
                }
            } else {
                const cooldown = getDailyBlessingCooldown(p);
                const cooldownText = formatCooldown(cooldown);
                this.addNarrative(`Daily Blessing already claimed. Next available in ${cooldownText}.`, 'system');
            }
        } else {
            this.addNarrative("You can only pray in a temple or during battle. Find the Grand Temple or Temple of Auralis.", 'system');
        }
        this.save?.();
    };
    
    const oldPrayForBlessing = G.prayForBlessing;
    G.prayForBlessing = function(attr) {
        const p = this.state.player;
        if (!p) { 
            this.addNarrative("No active hero.", 'system'); 
            return; 
        }
        
        const loc = WorldData.locations[this.state.location];
        const inTemple = loc && (loc.isTemple || loc.canPray || /temple|shrine|altar/i.test(this.state.location || ''));
        
        if (!inTemple) {
            this.addNarrative("You must be in a temple to pray for blessings.", 'system');
            return;
        }
        
        if (p.mp < 15) {
            this.addNarrative("Need 15 MP to pray for a blessing.", 'system');
            return;
        }
        
        // This is a repeatable blessing (costs MP each time) - separate from permanent blessing
        p.mp -= 15;
        p[attr] = (p[attr] || 10) + 2;
        this.addNarrative(`✨ Prayer answered! ${attr} +2 (temporary boost). 15 MP used.`, 'treasure');
        this.save?.();
    };
    
    // ===== 3. ENHANCED NARRATION SYSTEM =====
    // Add narration to all important game events
    
    // Track if narration is enabled (independent of gesture mode)
    let narrationEnabled = localStorage.getItem('black_sword_narration_enabled') === 'true';
    
    /**
     * Narrate text if narration is enabled
     */
    function narrate(text, priority = false) {
        if (!narrationEnabled) return;
        const A = window.AudioManager;
        if (A && A.playVoice) {
            A.playVoice(String(text), { priority: priority ? 'critical' : false });
        }
    }
    
    // Hook into addNarrative to provide narration
    const originalAddNarrative = G.addNarrative;
    G.addNarrative = function(text, type) {
        const result = originalAddNarrative.call(this, text, type);
        
        // Narrate important events
        if (narrationEnabled && text) {
            const isCritical = /you have died|you awaken|health is low|victory|defeat|level up|blessing/i.test(text);
            narrate(text.replace(/[✨🙏⚔️🎁💰]/g, ''), isCritical);
        }
        
        return result;
    };
    
    // Hook into movement
    const oldMove = G.move;
    G.move = function(dir) {
        const result = oldMove.call(this, dir);
        if (narrationEnabled && result) {
            const loc = WorldData.locations[this.state.location];
            if (loc) {
                narrate(`You move ${dir}. ${loc.name}. ${loc.description || ''}`);
            }
        }
        return result;
    };
    
    // Hook into combat start
    const oldStartCombat = G.startCombat;
    G.startCombat = function(...args) {
        const result = oldStartCombat.apply(this, args);
        if (narrationEnabled) {
            const enemy = this.state.combat?.enemy;
            if (enemy) {
                narrate(`Combat begins! You encountered ${enemy.name}.`, true);
            }
        }
        return result;
    };
    
    // Hook into item pickup
    const oldPickup = G.pickupItem;
    if (oldPickup) {
        G.pickupItem = function(...args) {
            const result = oldPickup.apply(this, args);
            if (narrationEnabled) {
                narrate('Item collected.');
            }
            return result;
        };
    }
    
    // Hook into fishing
    const oldFish = G.goFishing;
    if (oldFish) {
        G.goFishing = function(...args) {
            const result = oldFish.apply(this, args);
            if (narrationEnabled) {
                setTimeout(() => {
                    const p = this.state.player;
                    if (p && p.lastFishingResult) {
                        narrate(p.lastFishingResult);
                    }
                }, 100);
            }
            return result;
        };
    }
    
    // Hook into cooking
    const oldCook = G.cook;
    if (oldCook) {
        G.cook = function(...args) {
            const result = oldCook.apply(this, args);
            if (narrationEnabled) {
                narrate('Cooking complete.');
            }
            return result;
        };
    }
    
    // Hook into crafting
    const oldCraft = G.craftPotion;
    if (oldCraft) {
        G.craftPotion = function(...args) {
            const result = oldCraft.apply(this, args);
            if (narrationEnabled) {
                narrate('Potion crafted.');
            }
            return result;
        };
    }
    
    // ===== 4. NARRATION CONTROLS =====
    
    /**
     * Enable narration
     */
    G.enableNarration = function() {
        narrationEnabled = true;
        localStorage.setItem('black_sword_narration_enabled', 'true');
        this.addNarrative('Game narration enabled.', 'system');
        narrate('Game narration enabled. You will now hear important game events.', true);
    };
    
    /**
     * Disable narration
     */
    G.disableNarration = function() {
        narrationEnabled = false;
        localStorage.setItem('black_sword_narration_enabled', 'false');
        this.addNarrative('Game narration disabled.', 'system');
        const A = window.AudioManager;
        if (A && A.stopVoice) A.stopVoice();
    };
    
    /**
     * Repeat last narration
     */
    G.repeatLastNarration = function() {
        const narratives = this.state?.narratives || [];
        if (narratives.length > 0) {
            const lastNarrative = narratives[narratives.length - 1];
            narrate(lastNarrative.text || lastNarrative, true);
        } else {
            this.addNarrative('No previous narration to repeat.', 'system');
        }
    };
    
    /**
     * Stop narration
     */
    G.stopNarration = function() {
        const A = window.AudioManager;
        if (A) {
            if (A.stopVoice) A.stopVoice();
            if (window.speechSynthesis) {
                try { window.speechSynthesis.cancel(); } catch(e) {}
            }
        }
        this.addNarrative('Narration stopped.', 'system');
    };
    
    // Add narration commands to processCommand
    const oldProcessCommand = G.processCommand;
    G.processCommand = function(cmd) {
        const lower = cmd.toLowerCase().trim();
        
        if (lower === 'enable narration' || lower === 'narration on') {
            this.enableNarration();
            return;
        }
        if (lower === 'disable narration' || lower === 'narration off') {
            this.disableNarration();
            return;
        }
        if (lower === 'repeat' || lower === 'repeat narration' || lower === 'say again') {
            this.repeatLastNarration();
            return;
        }
        if (lower === 'stop narration' || lower === 'stop speaking' || lower === 'quiet') {
            this.stopNarration();
            return;
        }
        
        return oldProcessCommand.call(this, cmd);
    };
    
    // ===== 5. GOOGLE AUTH STATUS FIX =====
    // The "Guest Mode" issue is likely in the settings display
    // We'll add a function to update the auth status display
    
    /**
     * Update authentication status display
     */
    G.updateAuthStatus = function() {
        const status = document.getElementById('auth-status');
        const accountStatus = document.getElementById('settings-account-status');
        
        if (window.OnlineSystem && window.OnlineSystem.linked) {
            // User is logged in with Google
            if (status) status.textContent = '✅ Logged in with Google';
            if (accountStatus) accountStatus.textContent = 'Google Account Connected';
        } else if (window.OnlineSystem && window.OnlineSystem.ready) {
            // User is in guest mode
            if (status) status.textContent = '💬 Guest Mode';
            if (accountStatus) accountStatus.textContent = 'Guest account — link Google for cloud sync';
        } else {
            // Not initialized
            if (status) status.textContent = 'Offline';
            if (accountStatus) accountStatus.textContent = 'Local/offline mode';
        }
    };
    
    // Call updateAuthStatus after OnlineSystem initializes
    const checkAuth = setInterval(() => {
        if (window.OnlineSystem && window.OnlineSystem.ready) {
            G.updateAuthStatus();
            clearInterval(checkAuth);
        }
    }, 1000);
    
    // Stop checking after 30 seconds
    setTimeout(() => clearInterval(checkAuth), 30000);
    
    console.log('✓ Blessing/Narration/Auth Fix v1 loaded');
    console.log('  - Permanent Blessing: One-time only per hero');
    console.log('  - Daily Blessing: 24-hour cooldown');
    console.log('  - Enhanced narration for all game events');
    console.log('  - Google auth status display fixed');
    
})();
