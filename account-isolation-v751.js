/**
 * v7.51.0 - ACCOUNT ISOLATION & CLOUD SYNC FIX
 * Fixes: Account-specific storage, proper hero isolation, real cloud sync
 */
(() => {
    'use strict';
    
    const fixAccountIsolation = () => {
        if (!window.Game || !window.Game.state) {
            setTimeout(fixAccountIsolation, 100);
            return;
        }
        
        const G = window.Game;
        const originalState = G.state;
        
        // ===== ACCOUNT-SPECIFIC STORAGE KEYS =====
        // These will be updated when user logs in
        let currentUserId = null;
        
        function getAccountKey(baseKey) {
            return currentUserId ? `${baseKey}:${currentUserId}` : baseKey;
        }
        
        // Override localStorage access to use account-specific keys
        const originalGetRoster = G.getRoster;
        G.getRoster = function() {
            const key = getAccountKey('black_sword_hero_roster_v2');
            let roster;
            try { roster = JSON.parse(localStorage.getItem(key)); } catch { roster = null; }
            if (!roster || typeof roster !== 'object' || Array.isArray(roster)) roster = {};
            const source = roster.heroes && typeof roster.heroes === 'object' && !Array.isArray(roster.heroes) ? roster.heroes : {};
            const heroes = {};
            for (const [id, data] of Object.entries(source)) {
                if (id && data && typeof data === 'object' && !Array.isArray(data)) heroes[id] = data;
            }
            roster = {
                ...roster,
                version: 2,
                activeHeroId: typeof roster.activeHeroId === 'string' && heroes[roster.activeHeroId] ? roster.activeHeroId : null,
                heroes
            };
            return roster;
        };
        
        const originalStoreRoster = G.storeRoster;
        G.storeRoster = function(roster, { touch = true } = {}) {
            const key = getAccountKey('black_sword_hero_roster_v2');
            const stored = {
                ...roster,
                version: 2,
                activeHeroId: roster?.activeHeroId && roster?.heroes?.[roster.activeHeroId] ? roster.activeHeroId : null,
                heroes: roster?.heroes && typeof roster.heroes === 'object' ? roster.heroes : {}
            };
            if (touch) {
                stored.revision = Math.max(0, Number(roster?.revision) || 0) + 1;
                stored.updatedAt = new Date().toISOString();
            }
            localStorage.setItem(key, JSON.stringify(stored));
            return stored;
        };
        
        // ===== CLEAR ACCOUNT DATA ON LOGOUT =====
        G.clearAccountData = function() {
            if (!currentUserId) return;
            
            const keys = [
                `black_sword_hero_roster_v2:${currentUserId}`,
                `black_sword_ultimate_save:${currentUserId}`,
                `black_sword_settings:${currentUserId}`
            ];
            
            keys.forEach(key => localStorage.removeItem(key));
            console.log(`✓ Cleared account data for user: ${currentUserId}`);
            currentUserId = null;
        };
        
        // ===== SET ACCOUNT ID ON LOGIN =====
        G.setAccountUserId = function(userId) {
            if (currentUserId && currentUserId !== userId) {
                // Switching accounts - clear old account's runtime state
                G.resetHeroRuntime();
            }
            currentUserId = userId;
            console.log(`✓ Account set to: ${userId}`);
        };
        
        // ===== FIX ONLINE.JS INTEGRATION =====
        if (window.OnlineManager) {
            const online = window.OnlineManager;
            
            // Override saveGame to use account-specific logic
            const originalSaveGame = online.saveGame;
            online.saveGame = function(saveData) {
                if (!this.ready || !this.user || !saveData || !this.client) return Promise.resolve(false);
                
                // Ensure we're saving to the correct account
                const userId = this.user.id;
                G.setAccountUserId(userId);
                
                return originalSaveGame.call(this, saveData);
            };
            
            // Override loadCloudSave to verify account
            const originalLoadCloudSave = online.loadCloudSave;
            online.loadCloudSave = async function() {
                if (!this.ready || !this.user) return null;
                
                const userId = this.user.id;
                const { data, error } = await this.client
                    .from('game_saves')
                    .select('save_data,updated_at')
                    .eq('user_id', userId)
                    .maybeSingle();
                
                if (error) throw error;
                
                // Verify the data belongs to this user
                if (data && data.save_data) {
                    G.setAccountUserId(userId);
                }
                
                return data;
            };
            
            // Add logout handler
            const originalSignOut = online.signOut;
            online.signOut = async function() {
                // Clear account data before signing out
                if (currentUserId) {
                    G.clearAccountData();
                }
                if (originalSignOut) {
                    return await originalSignOut.call(this);
                }
            };
        }
        
        console.log('✓ Account isolation system initialized');
    };
    
    fixAccountIsolation();
})();
