/**
 * The Black Sword Chronicles - Ultimate Edition
 * Full Game Engine
 */

// ============================================
// GAME STATE
// ============================================

const Game = {
    state: {
        screen: 'title-screen',
        player: null,
        players: [],
        currentPlayer: 0,
        isMultiplayer: false,
        location: 'kaliwasch',
        inCombat: false,
        enemy: null,
        inventory: [],
        quests: [],
        completedQuests: [],
        visited: ['kaliwasch'],
        kills: 0,
        slainEnemies: {},
        musicEnabled: true,
        sfxEnabled: true,
        defending: false,
        friends: [],
        friendRequests: [
            { name: 'Arin Stormborn', status: 'pending' },
            { name: 'Mira Vale', status: 'pending' }
        ],
        companions: [],
        messages: [],
        guild: null,
        combatGroup: [],
        saveKey: 'black_sword_ultimate_save',
        rosterKey: 'black_sword_hero_roster_v2',
        activeHeroId: null,
        pendingHeroId: null,
        creatingHero: false,
        creationRequest: 0
    },

    // ============================================
    // INITIALIZATION
    // ============================================

    init() {
        this.loadState();
        this.bindEvents();
        this.updateUI();
        window.OnlineSystem?.init();
        // Auto-resume: if player had an active hero and was in-game, skip title screen
        this.autoResumeIfActive();
        console.log('⚔️ The Black Sword Chronicles - Ultimate Edition loaded!');
    },

    autoResumeIfActive() {
        const roster = this.getRoster();
        const activeId = roster.activeHeroId;
        const active = activeId && roster.heroes[activeId];
        if (!active) return; // No hero — show title screen as normal
        // If the player was in the middle of a game (has a location), resume directly
        const savedLoc = active.location || active.state?.location;
        if (savedLoc && WorldData.locations[savedLoc]) {
            // Restore the hero state and jump straight into gameplay
            try {
                this.state.player = active.player || active;
                this.state.location = savedLoc;
                this.state.inventory = active.inventory || [];
                this.state.companions = active.companions || [];
                this.state.visited = active.visited || [];
                this.state.kills = active.kills || 0;
                this.state.activeHeroId = activeId;
                this.showScreen('game-screen');
                this.enterLocation(savedLoc);
                this.look();
            } catch (e) {
                console.warn('Auto-resume failed, showing title:', e);
            }
        }
    },

    loadState() {
        const roster = this.getRoster();
        const active = roster.activeHeroId && roster.heroes[roster.activeHeroId];
        if (active) {
            this.state.activeHeroId = roster.activeHeroId;
            localStorage.setItem(this.state.saveKey, JSON.stringify(active));
            document.getElementById('btn-continue').disabled = false;
        }
    },

    getRoster() {
        let roster;
        try { roster = JSON.parse(localStorage.getItem(this.state.rosterKey)); } catch { roster = null; }
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
        // Migrate the original one-hero save without deleting it. An active ID is
        // never guessed here: after deleting a hero the player explicitly chooses
        // which remaining hero to play.
        const legacy = localStorage.getItem(this.state.saveKey);
        if (!Object.keys(roster.heroes).length && legacy) {
            try {
                const data = JSON.parse(legacy);
                if (data?.player) {
                    roster.activeHeroId = 'hero_legacy';
                    roster.heroes.hero_legacy = data;
                    localStorage.setItem(this.state.rosterKey, JSON.stringify(roster));
                }
            } catch {}
        }
        return roster;
    },

    storeRoster(roster, { touch = true } = {}) {
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
        localStorage.setItem(this.state.rosterKey, JSON.stringify(stored));
        return stored;
    },

    // Clear every per-hero runtime field before creating or loading another slot.
    // Global preferences (audio, interface and save keys) deliberately survive.
    resetHeroRuntime() {
        Object.assign(this.state, {
            player: null,
            players: [],
            currentPlayer: 0,
            isMultiplayer: false,
            location: 'kaliwasch',
            inCombat: false,
            enemy: null,
            encounterTargets: [],
            encounterGroupNames: [],
            combatTransition: false,
            randomEncounterPending: false,
            battleSummary: null,
            battlePrayerUsed: false,
            convertedFoe: null,
            arena: null,
            inventory: [],
            quests: [],
            completedQuests: [],
            visited: ['kaliwasch'],
            kills: 0,
            slainEnemies: {},
            defending: false,
            friends: [],
            friendRequests: [],
            companions: [],
            messages: [],
            guild: null,
            combatGroup: [],
            racing: null,
            sacred: null,
            parity: null,
            housing: null,
            fishing: null,
            artifacts: null,
            spellMastery: {},
            doors: null,
            spellCooldowns: {},
            specialDoors: {},
            economy: null,
            regeneration: null,
            achievements: [],
            achievementStats: { arenaWinsTotal: 0 }
        });
    },

    // Persist the outgoing hero under its own stable ID. Missing/deleted slots are
    // never recreated by a late save from an old screen.
    saveActiveHeroLocally() {
        const roster = this.getRoster();
        const id = this.state.activeHeroId;
        if (!id || !this.state.player || !roster.heroes[id]) return roster;
        const data = this.getSaveData();
        roster.activeHeroId = id;
        roster.heroes[id] = data;
        const stored = this.storeRoster(roster);
        localStorage.setItem(this.state.saveKey, JSON.stringify(data));
        return stored;
    },

    startNewHero() {
        // Leaving a loaded hero for the creation screen is a suspension, not a
        // switch. Save it first and prevent old combat/timers from writing back.
        const hadLoadedHero = Boolean(this.state.player && this.state.activeHeroId);
        const outgoing = this.saveActiveHeroLocally();
        if (hadLoadedHero) window.OnlineSystem?.saveGame?.(outgoing);
        window.OnlineSystem?.cancelHeroNameChecks?.();
        this.state.creationRequest++;
        this.resetHeroRuntime();
        this.state.activeHeroId = null;
        this.state.creatingHero = false;
        localStorage.removeItem(this.state.saveKey);
        // No application/UI roster cap. The backend still owns authentication,
        // payload, rate, and resource protections for cloud saves and names.
        this.state.pendingHeroId = `hero_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
        document.getElementById('char-name').value = '';
        OnlineSystem.heroNameAvailable=null;const nameStatus=document.getElementById('hero-name-status');if(nameStatus){nameStatus.textContent='Enter at least two characters.';nameStatus.className='name-status';}
        document.querySelectorAll('.race-btn,.class-btn').forEach(b => b.classList.remove('selected'));
        document.getElementById('btn-begin').disabled = true;
        document.getElementById('btn-begin').removeAttribute('aria-busy');
        this.updateCharacterPreview();
        this.showScreen('char-screen');
        // Pre-fill a suggested hero name for this New Adventure (does not trigger
        // the async name-check, so the user or test can override freely).
        this._prefillSuggestedName();
    },

    // Auto-create a hero without the creation screen (used after Google login).
    // Uses the given name, defaults to human warrior, and starts the adventure.
    autoCreateHero(heroName) {
        const name = (heroName || 'Hero').trim().slice(0, 30);
        const race = 'human';
        const cls = 'warrior';
        const background = 'soldier';
        const mode = 'single';

        this.resetHeroRuntime();
        this.state.activeHeroId = `hero_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
        this.state.pendingHeroId = this.state.activeHeroId;

        // Base stats
        const base = { hp: 130, mp: 30, str: 15, dex: 12, int: 8, wis: 10 };
        const bonus = { hp: 1, mp: 1, gold: 1.15 }; // human

        this.state.player = {
            name,
            race,
            class: cls,
            mode,
            permadead: false,
            level: 1,
            xp: 0,
            xpToNext: 100,
            hp: Math.floor(base.hp * bonus.hp),
            maxHp: Math.floor(base.hp * bonus.hp),
            mp: Math.floor(base.mp * bonus.mp),
            maxMp: Math.floor(base.mp * bonus.mp),
            str: base.str,
            dex: base.dex,
            int: base.int,
            wis: base.wis,
            gold: 50,
            diamonds: 0,
            rubies: 0,
            weapon: 'Iron Sword',
            weaponDamage: 14,
            armor: 'Leather Armor',
            defense: 4,
            extraSpells: 0,
            mapRevealed: false
        };

        // Initialize spells
        this.state.player.spells = this.getClassSpells ? this.getClassSpells(cls, 0) : ['Power Strike'];

        // Initialize inventory
        this.state.inventory = [
            { ...WorldData.items['gold coin'], id: 'gold coin', quantity: 5 },
            { ...WorldData.items['healing potion'], id: 'healing potion', quantity: 2 },
            { ...WorldData.items['bread'], id: 'bread', quantity: 3 },
            { ...WorldData.items['iron sword'], id: 'iron sword', quantity: 1 },
            { ...WorldData.items['leather armor'], id: 'leather armor', quantity: 1 }
        ];

        // Initialize quests
        this.state.quests = WorldData.quests ? [WorldData.quests[0]] : [];

        this.state.location = 'kaliwasch';
        this.state.visited = ['kaliwasch'];
        this.state.kills = 0;
        this.state.companions = [];
        this.state.combatGroup = [];

        // Save to roster
        const roster = this.getRoster();
        roster.heroes[this.state.activeHeroId] = { player: this.state.player, inventory: this.state.inventory, location: this.state.location, visited: this.state.visited, kills: 0, companions: [], combatGroup: [] };
        roster.activeHeroId = this.state.activeHeroId;
        this.storeRoster(roster);
        localStorage.setItem(this.state.saveKey, JSON.stringify(roster.heroes[this.state.activeHeroId]));

        // Start the game
        this.showScreen('game-screen');
        this.enterLocation('kaliwasch');
        this.look();
        this.save();

        return this.state.activeHeroId;
    },

    showHeroRoster() {
        const roster = this.getRoster();
        const container = document.getElementById('hero-roster');
        const entries = Object.entries(roster.heroes).sort(([idA,a],[idB,b]) => {
            if (idA === roster.activeHeroId) return -1;
            if (idB === roster.activeHeroId) return 1;
            return String(a.player?.name || idA).localeCompare(String(b.player?.name || idB));
        });
        container.replaceChildren();
        container.setAttribute('role', 'list');
        container.setAttribute('aria-label', `${entries.length} saved ${entries.length === 1 ? 'hero' : 'heroes'}`);
        if (!entries.length) {
            const empty=document.createElement('p');empty.className='system';empty.textContent='No heroes yet. Create your first hero.';container.appendChild(empty);
        }
        entries.forEach(([id,data]) => {
            const p=data.player||{},loc=WorldData.locations[data.location]?.name||data.location||'Unknown',name=p.name||'Unnamed Hero';
            const card=document.createElement('article');card.className=`hero-card ${id===roster.activeHeroId?'active':''}`;card.setAttribute('role','listitem');card.setAttribute('aria-label',`${name}, level ${p.level||1}, ${loc}, hero ID ${id}`);
            card.innerHTML=`<h3>${this.escapeHTML(name)}</h3>
                <p>${this.escapeHTML(p.race||'Unknown')} ${this.escapeHTML(p.class||'Adventurer')} • Level ${p.level||1}</p>
                <p>Mode: ${p.mode==='archo'?'Archo / Permanent Hero':p.mode==='hardcore'?'Hardcore / Temple Revival':'Standard / Temple Revival'}${p.pendingTempleRevival?' • Spirit awaiting Auralis':''}</p>
                <p>Health ${p.hp||0}/${p.maxHp||0} • Magic ${p.mp||0}/${p.maxMp||0}</p>
                <p>STR ${p.str||0} • DEX ${p.dex||0} • INT ${p.int||0} • WIS ${p.wis||0}</p>
                <p>Location: ${this.escapeHTML(loc)}</p><p class="hero-stable-id">Hero ID: <code>${this.escapeHTML(id)}</code></p>`;
            const play=document.createElement('button');play.className='menu-btn';play.textContent=p.pendingTempleRevival||p.permadead?'Walk Spirit to Temple':id===roster.activeHeroId?'Continue':'Play This Hero';play.setAttribute('aria-label',`${play.textContent}: ${name}, hero ID ${id}`);play.addEventListener('click',()=>this.playHero(id));
            const remove=document.createElement('button');remove.className='menu-btn danger-btn';remove.textContent='Delete Hero';remove.setAttribute('aria-label',`Permanently delete ${name}, hero ID ${id}`);remove.addEventListener('click',()=>this.deleteHero(id));
            card.append(play,remove);container.appendChild(card);
        });
        document.getElementById('btn-create-another-hero').disabled = false;
        this.showScreen('heroes-screen');
    },

    playHero(id) {
        let roster = this.getRoster();
        if (!roster.heroes[id]) return false;
        // Capture the outgoing slot before changing activeHeroId. This is local;
        // one final cloud snapshot below records both the progress and selection.
        if (this.state.player && this.state.activeHeroId) this.saveActiveHeroLocally();
        roster = this.getRoster();
        const data = roster.heroes[id];
        if (!data?.player) return false;
        // Migrate previously fallen Hardcore heroes into the new temple-revival system.
        if(data.player.permadead){data.player.permadead=false;data.player.pendingTempleRevival=true;data.player.hp=0;data.location='grand_temple';}
        roster.activeHeroId = id;
        this.storeRoster(roster);
        this.state.activeHeroId = id;
        this.state.pendingHeroId = null;
        localStorage.setItem(this.state.saveKey, JSON.stringify(data));
        const loaded = this.continueGame();
        if (loaded === false) return false;
        window.OnlineSystem?.saveGame?.(this.getRoster());
        return true;
    },

    async renameActiveHero(name) {
        name=name.trim().slice(0,20);if(name.length<2)return;
        const result=await OnlineSystem.reserveHeroName(name,this.state.activeHeroId);
        if(!result.ok){this.addNarrative(result.error.includes('already exists')?'The name already exists. Please choose another name.':result.error,'system');return;}
        this.state.player.name=name;this.addNarrative(`Your hero is now known as ${name}.`,'npc');this.save();OnlineSystem.syncActiveHero();
    },

    deleteHero(id) {
        const roster=this.getRoster(),hero=roster.heroes[id];
        if(!hero)return false;
        const name=hero.player?.name||'this hero';
        if(!confirm(`Permanently delete ${name} (hero ID ${id})? This cannot be undone.`))return false;
        return this.commitHeroDeletion(id);
    },

    renameHero(newName) {
        const p = this.state.player;
        if (!p) return;
        const oldName = p.name;
        p.name = newName;
        p.lastRenameAt = new Date().toISOString();
        // Update the roster copy too.
        const roster = this.getRoster();
        const id = this.state.activeHeroId || roster.activeHeroId;
        if (id && roster.heroes[id]) {
            roster.heroes[id].player = roster.heroes[id].player || {};
            roster.heroes[id].player.name = newName;
            roster.heroes[id].player.lastRenameAt = p.lastRenameAt;
            this.storeRoster(roster);
        }
        // Sync cloud if online.
        if (window.OnlineSystem?.ready) {
            window.OnlineSystem.saveGame(this.getCloudData()).catch(() => {});
            window.OnlineSystem.updatePresence?.().catch(() => {});
        }
        this.addNarrative(`Hero renamed from "${oldName}" to "${newName}". You can rename again in 7 days.`, 'system');
        this.save();
        window.OnlineSystem?.updateIndicators?.();
    },

    async commitHeroDeletion(id) {
        let roster=this.getRoster();
        if(!roster.heroes[id])return false;
        const deletingActive=roster.activeHeroId===id||this.state.activeHeroId===id;
        // Preserve unsaved progress when removing a different, inactive card.
        if(!deletingActive&&this.state.player&&this.state.activeHeroId)this.saveActiveHeroLocally();
        roster=this.getRoster();
        if(!roster.heroes[id])return false;
        delete roster.heroes[id];
        if(deletingActive)roster.activeHeroId=null;
        const stored=this.storeRoster(roster);
        if(deletingActive){
            this.resetHeroRuntime();
            this.state.activeHeroId=null;
            this.state.pendingHeroId=null;
            localStorage.removeItem(this.state.saveKey);
        }else{
            this.state.activeHeroId=stored.activeHeroId;
            if(stored.activeHeroId)localStorage.setItem(this.state.saveKey,JSON.stringify(stored.heroes[stored.activeHeroId]));
            else localStorage.removeItem(this.state.saveKey);
        }
        document.getElementById('btn-continue').disabled=!stored.activeHeroId;
        // Snapshot the exact post-deletion roster before any later hero action.
        const cloudTask=window.OnlineSystem?.saveGame?.(stored);
        try{await window.OnlineSystem?.releaseHeroName?.(id);}catch(error){console.warn('Hero-name release failed:',error?.message||error);}
        this.showHeroRoster();
        const saved=await cloudTask;
        if(saved===false){
            this.addNarrative('Hero deleted on this device, but the cloud delete could not be confirmed. Keep the game online and use Save to Cloud before signing in elsewhere.','system');
        }
        return true;
    },

    bindEvents() {
        // Navigation
        document.querySelectorAll('[data-screen]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.showScreen(e.currentTarget.dataset.screen);
            });
        });

        // Title screen buttons
        document.getElementById('btn-new').addEventListener('click', () => {
            MusicSystem.playTrack('intro');
            this.startNewHero();
        });
        document.getElementById('btn-heroes').addEventListener('click', () => this.showHeroRoster());
        document.getElementById('btn-create-another-hero').addEventListener('click', () => this.startNewHero());

        document.getElementById('btn-continue').addEventListener('click', () => {
            this.continueGame();
        });

        document.getElementById('btn-multi').addEventListener('click', () => {
            this.showScreen('multi-screen');
        });

        document.getElementById('btn-help').addEventListener('click', () => {
            this.showScreen('help-screen');
        });

        document.getElementById('btn-google-signin').addEventListener('click', () => {
            OnlineSystem.signInGoogle();
        });
        document.getElementById('btn-close-google-login').addEventListener('click', () => document.getElementById('google-login-panel').classList.add('hidden'));

        // Music controls
        document.getElementById('btn-music').addEventListener('click', () => {
            this.state.musicEnabled = MusicSystem.toggle();
            document.getElementById('btn-music').classList.toggle('active', this.state.musicEnabled);
        });

        document.getElementById('btn-sfx').addEventListener('click', () => {
            this.state.sfxEnabled = MusicSystem.toggleSFX();
            document.getElementById('btn-sfx').classList.toggle('active', this.state.sfxEnabled);
        });

        document.getElementById('btn-hud-music').addEventListener('click', () => {
            this.state.musicEnabled = MusicSystem.toggle();
            MusicSystem.play(this.getLocationMusic());
        });

        // Character creation
        document.getElementById('char-name').addEventListener('input', e => {
            this.updateCharButton();
            OnlineSystem.scheduleHeroNameCheck(e.target.value,this.state.pendingHeroId);
        });
        document.getElementById('btn-generate-name').addEventListener('click', () => this.generateHeroName());

        document.querySelectorAll('.race-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.race-btn').forEach(b => b.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                this.updateCharButton();
            });
        });

        document.querySelectorAll('.class-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                this.updateCharButton();
            });
        });

        document.getElementById('btn-begin').addEventListener('click', () => this.beginCharacterCreation(false));

        // Multiplayer
        document.getElementById('btn-start-mp').addEventListener('click', () => this.beginCharacterCreation(true));

        // Command input
        document.getElementById('cmd-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.processCommand(e.target.value);
                e.target.value = '';
            }
        });

        document.getElementById('btn-cmd').addEventListener('click', () => {
            const input = document.getElementById('cmd-input');
            this.processCommand(input.value);
            input.value = '';
        });

        // Direction buttons
        document.querySelectorAll('.dir-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.processCommand(e.currentTarget.dataset.cmd);
            });
        });

        // Action buttons
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.processCommand(e.currentTarget.dataset.cmd);
            });
        });

        // Combat buttons
        document.querySelectorAll('.combat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handleCombat(e.currentTarget.dataset.action);
            });
        });

        // Social and guild controls
        document.getElementById('btn-social-send').addEventListener('click', async event => {
            const button=event.currentTarget,name=document.getElementById('social-name').value.trim(),message=document.getElementById('social-message').value.trim();
            if(button.disabled)return;button.disabled=true;button.setAttribute('aria-busy','true');
            try{
                if(message&&name){await this.sendChat(name,message);document.getElementById('social-message').value='';}
                else if(message)this.addNarrative('Direct messages require a recipient hero name. Use Chat Rooms for public messages.','system');
                else if(name)await this.sendFriendRequest(name);
                else this.addNarrative('Enter an exact hero name for a direct message or friend request.','system');
            }finally{button.disabled=false;button.removeAttribute('aria-busy');document.getElementById('social-message').focus();}
        });
        document.getElementById('btn-create-guild').addEventListener('click', async () => {
            await this.createGuild('Dawn Guard');
            this.showGuild();
        });
        document.getElementById('btn-copy-player-id').addEventListener('click', () => OnlineSystem.copyPlayerCode());
        document.getElementById('btn-link-google').addEventListener('click', () => OnlineSystem.linkGoogle());
        document.getElementById('btn-set-pin')?.addEventListener('click', () => OnlineSystem.setRecoveryPin(document.getElementById('settings-pin-input').value));
        document.getElementById('btn-login-pin')?.addEventListener('click', () => OnlineSystem.loginWithPlayerPin(document.getElementById('settings-login-id').value, document.getElementById('settings-login-pin').value));
        document.getElementById('btn-google-merge').addEventListener('click', () => OnlineSystem.mergeWithGoogle());
        document.getElementById('btn-test-chat-voice').addEventListener('click', () => OnlineSystem.testSelectedVoice());
        document.getElementById('chat-voice').addEventListener('change', e => OnlineSystem.setVoiceProfile(e.target.value));
        document.getElementById('settings-chat-voice').addEventListener('change', e => OnlineSystem.setVoiceProfile(e.target.value));
        document.getElementById('chat-auto-speak').addEventListener('change', e => localStorage.setItem('black_sword_auto_speak', e.target.checked ? 'true' : 'false'));
        document.getElementById('btn-cloud-save').addEventListener('click', async () => {
            await OnlineSystem.saveGame(this.getCloudData());
            this.addNarrative('Cloud save requested.', 'system');
        });
        document.getElementById('btn-account-signout').addEventListener('click', () => OnlineSystem.signOut());
        document.getElementById('btn-settings-create-hero')?.addEventListener('click', () => {
            document.getElementById('settings-panel')?.classList.add('hidden');
            this.startNewHero();
        });
        document.getElementById('btn-settings-manage-heroes')?.addEventListener('click', () => {
            document.getElementById('settings-panel')?.classList.add('hidden');
            this.showHeroRoster();
        });
        document.getElementById('btn-settings-rename-hero')?.addEventListener('click', () => {
            const p = this.state.player;
            if (!p) { this.addNarrative('No hero is active.', 'system'); return; }
            // Check rename cooldown (7 days)
            const lastRename = p.lastRenameAt ? new Date(p.lastRenameAt).getTime() : 0;
            const daysSinceRename = (Date.now() - lastRename) / (1000 * 60 * 60 * 24);
            const cooldownDays = 7;
            if (lastRename > 0 && daysSinceRename < cooldownDays) {
                const remaining = Math.ceil(cooldownDays - daysSinceRename);
                this.addNarrative(`Hero name can only be changed once every ${cooldownDays} days. You can rename again in ${remaining} day${remaining === 1 ? '' : 's'}.`, 'system');
                return;
            }
            const newName = window.prompt(`Rename your hero (current: ${p.name}):\n\nNote: You can only rename once every ${cooldownDays} days.`, p.name);
            if (!newName || newName.trim() === '' || newName.trim() === p.name) return;
            this.renameHero(newName.trim());
        });
        document.getElementById('btn-settings-delete-hero')?.addEventListener('click', () => {
            const id = this.state.activeHeroId || this.getRoster().activeHeroId;
            if (!id) { this.addNarrative('No hero is selected to delete.', 'system'); return; }
            document.getElementById('settings-panel')?.classList.add('hidden');
            this.deleteHero(id);
        });

        // === Social Hub buttons ===
        document.getElementById('btn-hub-create-group')?.addEventListener('click', () => {
            document.getElementById('hub-panel')?.classList.add('hidden');
            document.getElementById('combat-group-create-dialog')?.classList.remove('hidden');
        });
        document.getElementById('btn-hub-manage-group')?.addEventListener('click', () => {
            if (!this.activeCombatGroup || !this.combatGroups[this.activeCombatGroup]) {
                this.addNarrative('You are not in a combat group.', 'system'); return;
            }
            const g = this.combatGroups[this.activeCombatGroup];
            this.addNarrative(`⚔️ "${g.name}" — Members: ${g.members.join(', ')}. Location: ${WorldData.locations[g.location]?.name || 'Unknown'}.`, 'system');
        });
        document.getElementById('btn-hub-invite-group')?.addEventListener('click', () => {
            this.showInviteCombatGroup();
        });
        document.getElementById('btn-hub-send-trade')?.addEventListener('click', () => {
            document.getElementById('hub-panel')?.classList.add('hidden');
            document.getElementById('trade-dialog')?.classList.remove('hidden');
        });
        document.getElementById('btn-hub-send-gift')?.addEventListener('click', () => {
            document.getElementById('hub-panel')?.classList.add('hidden');
            document.getElementById('gift-dialog')?.classList.remove('hidden');
        });
        document.getElementById('btn-hub-friends')?.addEventListener('click', () => {
            document.getElementById('hub-panel')?.classList.add('hidden');
            document.getElementById('social-panel')?.classList.remove('hidden');
        });
        document.getElementById('btn-hub-chat-rooms')?.addEventListener('click', () => {
            document.getElementById('hub-panel')?.classList.add('hidden');
            document.getElementById('chat-rooms-panel')?.classList.remove('hidden');
        });
        document.getElementById('btn-hub-players-online')?.addEventListener('click', () => {
            this.showInviteCombatGroup();
        });

        // Combat group create confirm
        document.getElementById('btn-cg-confirm')?.addEventListener('click', () => {
            const name = document.getElementById('cg-name')?.value || '';
            const desc = document.getElementById('cg-desc')?.value || '';
            this.createCombatGroup(name, desc);
        });

        // Trade send
        document.getElementById('btn-trade-send')?.addEventListener('click', () => {
            const target = document.getElementById('trade-target')?.value || '';
            const gold = parseInt(document.getElementById('trade-offer-gold')?.value) || 0;
            const item = document.getElementById('trade-offer-item')?.value || '';
            this.sendTradeRequest(target, gold, item);
        });

        // Gift send
        document.getElementById('btn-gift-send')?.addEventListener('click', () => {
            const target = document.getElementById('gift-target')?.value || '';
            const gold = parseInt(document.getElementById('gift-gold')?.value) || 0;
            const item = document.getElementById('gift-item')?.value || '';
            this.sendGift(target, gold, item);
        });

        // Voice command execute
        document.getElementById('btn-voice-execute')?.addEventListener('click', () => {
            const input = document.getElementById('voice-command-input');
            this.executeVoiceCommand(input?.value || '');
        });
        document.getElementById('voice-command-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.executeVoiceCommand(e.target.value || '');
            }
        });

        // Close buttons
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
                this.restoreGameplayControls();
            });
        });

        // Some panels (chat, storage, directory, wayfinder) close via inline
        // onclick handlers that bypass the listener above. A single delegated
        // capture-phase listener guarantees EVERY close path restores gameplay
        // state, so movement can never be left permanently disabled.
        document.addEventListener('click', event => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (!target.closest('.close-btn, [data-close-panel]')) return;
            setTimeout(() => this.restoreGameplayControls(), 0);
        }, true);

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.state.screen !== 'game-screen') return;
            if (e.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;

            const key = e.key.toLowerCase();

            if (this.state.inCombat) {
                switch(key) {
                    case 'a': this.handleCombat('attack'); break;
                    case 's': this.handleCombat('spell'); break;
                    case 'i': this.handleCombat('item'); break;
                    case 'd': this.handleCombat('defend'); break;
                    case 'f': this.handleCombat('flee'); break;
                }
            } else {
                switch(key) {
                    case 'w': case 'arrowup': this.processCommand('north'); break;
                    case 's': case 'arrowdown': this.processCommand('south'); break;
                    case 'a': case 'arrowleft': this.processCommand('west'); break;
                    case 'd': case 'arrowright': this.processCommand('east'); break;
                    case 'i': this.showInventory(); break;
                    case 'm': this.showMap(); break;
                    case 'q': this.showQuests(); break;
                    case 't': this.processCommand('northwest'); break;
                    case 'y': this.processCommand('northeast'); break;
                    case 'g': this.processCommand('southwest'); break;
                    case 'h': this.processCommand('southeast'); break;
                    case 'u': this.processCommand('up'); break;
                    case 'j': this.processCommand('down'); break;
                    case '1': this.processCommand('northwest'); break;
                    case '2': this.processCommand('north'); break;
                    case '3': this.processCommand('northeast'); break;
                    case '4': this.processCommand('west'); break;
                    case '6': this.processCommand('east'); break;
                    case '7': this.processCommand('southwest'); break;
                    case '8': this.processCommand('south'); break;
                    case '9': this.processCommand('southeast'); break;
                    case 'escape': this.closePanels(); break;
                }
            }
        });
    },

    // ============================================
    // SCREEN MANAGEMENT
    // ============================================

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        this.state.screen = screenId;
    },

    // ============================================
    // CHARACTER CREATION
    // ============================================

    // Pre-fill a suggested hero name without triggering the async name-check.
    // This avoids interfering with test timing or user-typed overrides.
    _prefillSuggestedName() {
        const nameField = document.getElementById('char-name');
        if (!nameField || nameField.value.trim()) return;
        const cls = document.querySelector('.class-btn.selected')?.dataset.class || 'adventurer';
        const race = document.querySelector('.race-btn.selected')?.dataset.race || 'human';
        const raceStarts = {
            human:['Alden','Mira','Rowan','Elara','Kael','Brenna','Corin','Lyra','Darian','Seraphina','Garrett','Vex'],
            elf:['Ael','Lyth','Syl','Eira','Thalion','Nimrodel','Caelynn','Faelar','Ilythi','Vaelan','Shivara','Aenor'],
            dwarf:['Brom','Dagna','Thorin','Kelda','Magni','Helga','Durin','Runa','Barik','Thora','Gundren','Hilda'],
            halfling:['Pip','Milo','Tilly','Nessa','Rosie','Finnan','Lidda','Cora','Merric','Vani','Shandar','Bree'],
            orc:['Grom','Urza','Thrak','Mogra','Drak','Shara','Vrog','Kira','Nazg','Bolga','Krull','Yenna'],
            gnome:['Nim','Fizz','Tink','Wren','Zana','Cog','Dina','Pik','Bobbie','Glim','Nissa','Spark']
        };
        const classEnds = {
            warrior:['Ironheart','Stormblade','Blackforge','Steelfist','Bloodaxe','Warborn','Shieldbreaker','Ironfury'],
            mage:['Starweaver','Brightmind','Spellfire','Frostweave','Shadowcast','Runemaster','Arcanis','Voidwalker'],
            rogue:['Nightstep','Quickhand','Silentblade','Shadowmere','Darkwhisper','Nightfall','Duskmantle','Swiftshade'],
            cleric:['Lightkeeper','Dawnvoice','Gracewind','Sunweaver','Holyforge','Mercyborn','Lifebinder','Praycaller'],
            paladin:['Oathhammer','Sunshield','Dawnguard','Lightsworn','Truthbearer','Justicar','Vindicator','Sacredblade'],
            ranger:['Wildpath','Greenarrow','Thornwalker','Beastfriend','Windrunner','Mossheart','Trailseeker','Hawkeye'],
            monk:['Stillwater','Swiftpalm','Ironfist','Zenblade','Serenity','Voidstep','Lotusstrike','Sagefoot'],
            druid:['Moonroot','Oakwhisper','Wildthorn','Stormleaf','Earthcaller','Thornbloom','Frostbark','Natureweave'],
            summoner:['Spiritcaller','Runebinder','Soulreaver','Phantomlord','Ghostweaver','Shadecaller','Eidolon','Voidpact'],
            hunter:['Wolfeye','Hawktrack','Beastbane','Preyseeker','Trapmaker','Bloodtrail','Predator','Stalker'],
            adventurer:['Wayfarer','Braveheart','Fortune','Destiny','Legend','Wanderer','Chronicle','Odyssey']
        };
        const used = new Set(Object.values(this.getRoster().heroes).map(h => h.player?.name?.toLowerCase()));
        let generated;
        for (let attempt = 0; attempt < 20; attempt++) {
            const first = raceStarts[race][Math.floor(Math.random() * raceStarts[race].length)];
            const last = classEnds[cls][Math.floor(Math.random() * classEnds[cls].length)];
            generated = `${first} ${last}`.slice(0, 20);
            if (!used.has(generated.toLowerCase())) break;
        }
        nameField.value = generated;
        // Dispatch an input event so the existing input listener handles
        // availability checking and button state naturally.
        nameField.dispatchEvent(new Event('input', { bubbles: true }));
    },

    generateHeroName() {
        const race = document.querySelector('.race-btn.selected')?.dataset.race || 'human';
        const cls = document.querySelector('.class-btn.selected')?.dataset.class || 'adventurer';
        const raceStarts = {
            human:['Alden','Mira','Rowan','Elara','Kael','Brenna','Corin','Lyra','Darian','Seraphina','Garrett','Vex'],
            elf:['Ael','Lyth','Syl','Eira','Thalion','Nimrodel','Caelynn','Faelar','Ilythi','Vaelan','Shivara','Aenor'],
            dwarf:['Brom','Dagna','Thorin','Kelda','Magni','Helga','Durin','Runa','Barik','Thora','Gundren','Hilda'],
            halfling:['Pip','Milo','Tilly','Nessa','Rosie','Finnan','Lidda','Cora','Merric','Vani','Shandar','Bree'],
            orc:['Grom','Urza','Thrak','Mogra','Drak','Shara','Vrog','Kira','Nazg','Bolga','Krull','Yenna'],
            gnome:['Nim','Fizz','Tink','Wren','Zana','Cog','Dina','Pik','Bobbie','Glim','Nissa','Spark']
        };
        const classEnds = {
            warrior:['Ironheart','Stormblade','Blackforge','Steelfist','Bloodaxe','Warborn','Shieldbreaker','Ironfury'],
            mage:['Starweaver','Brightmind','Spellfire','Frostweave','Shadowcast','Runemaster','Arcanis','Voidwalker'],
            rogue:['Nightstep','Quickhand','Silentblade','Shadowmere','Darkwhisper','Nightfall','Duskmantle','Swiftshade'],
            cleric:['Lightkeeper','Dawnvoice','Gracewind','Sunweaver','Holyforge','Mercyborn','Lifebinder','Praycaller'],
            paladin:['Oathhammer','Sunshield','Dawnguard','Lightsworn','Truthbearer','Justicar','Vindicator','Sacredblade'],
            ranger:['Wildpath','Greenarrow','Thornwalker','Beastfriend','Windrunner','Mossheart','Trailseeker','Hawkeye'],
            monk:['Stillwater','Swiftpalm','Ironfist','Zenblade','Serenity','Voidstep','Lotusstrike','Sagefoot'],
            druid:['Moonroot','Oakwhisper','Wildthorn','Stormleaf','Earthcaller','Thornbloom','Frostbark','Natureweave'],
            summoner:['Spiritcaller','Runebinder','Soulreaver','Phantomlord','Ghostweaver','Shadecaller','Eidolon','Voidpact'],
            hunter:['Wolfeye','Hawktrack','Beastbane','Preyseeker','Trapmaker','Bloodtrail','Predator','Stalker'],
            adventurer:['Wayfarer','Braveheart','Fortune','Destiny','Legend','Wanderer','Chronicle','Odyssey']
        };
        const used = new Set(Object.values(this.getRoster().heroes).map(h => h.player?.name?.toLowerCase()));
        let generated;
        for (let attempt=0; attempt<20; attempt++) {
            const first = raceStarts[race][Math.floor(Math.random()*raceStarts[race].length)];
            const last = classEnds[cls][Math.floor(Math.random()*classEnds[cls].length)];
            generated = `${first} ${last}`.slice(0,20);
            if (!used.has(generated.toLowerCase())) break;
        }
        document.getElementById('char-name').value = generated;
        OnlineSystem.scheduleHeroNameCheck(generated,this.state.pendingHeroId);
        this.updateCharButton();
    },

    updateCharButton() {
        const name = document.getElementById('char-name').value.trim();
        const race = document.querySelector('.race-btn.selected');
        const cls = document.querySelector('.class-btn.selected');
        document.getElementById('btn-begin').disabled = name.length < 2 || !race || !cls || OnlineSystem.heroNameAvailable !== true;
        this.updateCharacterPreview();
    },

    updateCharacterPreview() {
        const race = document.querySelector('.race-btn.selected')?.dataset.race;
        const cls = document.querySelector('.class-btn.selected')?.dataset.class;
        const box = document.getElementById('class-summary');
        if (!box || !race || !cls) {
            if (box) box.textContent = 'Choose a race and class to preview HP, MP, Strength, Dexterity, Intelligence and Wisdom.';
            return;
        }
        const bases = {
            warrior:[130,30,15,12,8,10], mage:[60,160,6,10,17,12], rogue:[85,55,10,17,12,8], cleric:[95,110,11,10,12,17],
            paladin:[125,80,15,9,10,15], ranger:[92,70,11,18,11,12], monk:[105,75,13,16,10,16], druid:[88,130,8,11,15,18], summoner:[78,150,7,10,18,17], hunter:[98,65,13,18,10,12]
        };
        const b = bases[cls];
        box.innerHTML = `<strong>${race.toUpperCase()} ${cls.toUpperCase()}</strong><br>❤️ HP ${b[0]} • ✨ MP ${b[1]} • 💪 STR ${b[2]} • 🏃 DEX ${b[3]} • 🧠 INT ${b[4]} • 📖 WIS ${b[5]}`;
    },

    async beginCharacterCreation(isMulti) {
        if(this.state.creatingHero)return false;
        const name=document.getElementById('char-name').value.trim();
        const race=document.querySelector('.race-btn.selected')?.dataset.race;
        const cls=document.querySelector('.class-btn.selected')?.dataset.class;
        const slot=this.state.pendingHeroId||`hero_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
        const status=document.getElementById('hero-name-status');
        if(name.length<2||!race||!cls){if(status){status.textContent='Enter a name with at least two characters and choose a race and class.';status.className='name-status unavailable';}return false;}
        const request=++this.state.creationRequest;
        this.state.creatingHero=true;
        const button=document.getElementById('btn-begin');button.disabled=true;button.setAttribute('aria-busy','true');
        try{
            const reserved=await OnlineSystem.reserveHeroName(name,slot);
            if(!reserved.ok){if(status){status.textContent=reserved.error.includes('already exists')?'The name already exists. Please choose another name.':reserved.error;status.className='name-status unavailable';}OnlineSystem.heroNameAvailable=false;return false;}
            // A delayed reservation from an abandoned/changed creation form must
            // not create a hero after Back, after Play Hero, or in a newer form.
            const sameForm=request===this.state.creationRequest
                &&this.state.screen==='char-screen'
                &&document.getElementById('char-name').value.trim()===name
                &&document.querySelector('.race-btn.selected')?.dataset.race===race
                &&document.querySelector('.class-btn.selected')?.dataset.class===cls
                &&(!this.state.pendingHeroId||this.state.pendingHeroId===slot);
            if(!sameForm){await OnlineSystem.releaseHeroName(slot).catch(()=>{});return false;}
            this.state.pendingHeroId=slot;
            const created=this.createCharacter(isMulti)!==false;
            if(!created)await OnlineSystem.releaseHeroName(slot).catch(()=>{});
            return created;
        }catch(error){
            if(status){status.textContent=`Hero creation could not finish: ${error?.message||'unknown error'}. Your other heroes are safe.`;status.className='name-status unavailable';}
            return false;
        }finally{
            if(request===this.state.creationRequest){
                this.state.creatingHero=false;button.removeAttribute('aria-busy');
                if(this.state.screen==='char-screen')this.updateCharButton();
            }
        }
    },

    createCharacter(isMulti) {
        const name = document.getElementById('char-name').value.trim();
        const race = document.querySelector('.race-btn.selected')?.dataset.race;
        const cls = document.querySelector('.class-btn.selected')?.dataset.class;
        if(name.length<2||!race||!cls)return false;
        const background = document.getElementById('char-background').value;
        const mode = document.getElementById('hero-mode').value;
        this.resetHeroRuntime();

        // Base stats by class
        const baseStats = {
            warrior: { hp: 130, mp: 30, str: 15, dex: 12, int: 8, wis: 10 },
            mage: { hp: 60, mp: 160, str: 6, dex: 10, int: 17, wis: 12 },
            rogue: { hp: 85, mp: 55, str: 10, dex: 17, int: 12, wis: 8 },
            cleric: { hp: 95, mp: 110, str: 11, dex: 10, int: 12, wis: 17 },
            paladin: { hp: 125, mp: 80, str: 15, dex: 9, int: 10, wis: 15 },
            ranger: { hp: 92, mp: 70, str: 11, dex: 18, int: 11, wis: 12 },
            monk: { hp: 105, mp: 75, str: 13, dex: 16, int: 10, wis: 16 },
            druid: { hp: 88, mp: 130, str: 8, dex: 11, int: 15, wis: 18 },
            summoner: { hp: 78, mp: 150, str: 7, dex: 10, int: 18, wis: 17 },
            hunter: { hp: 98, mp: 65, str: 13, dex: 18, int: 10, wis: 12 }
        };

        // Race bonuses
        const raceBonus = {
            human: { hp: 1, mp: 1, gold: 1.15 },
            elf: { hp: 1, mp: 1.15, gold: 1 },
            dwarf: { hp: 1.2, mp: 0.9, gold: 1, str: 1.1, dex: 1, int: 1 },
            halfling: { hp: 1, mp: 1.1, gold: 1.1, str: 1, dex: 1.2, int: 1 },
            orc: { hp: 1.15, mp: 0.8, gold: 1, str: 1.25, dex: 0.95, int: 0.85 },
            gnome: { hp: 0.9, mp: 1.25, gold: 1, str: 0.85, dex: 1.05, int: 1.25 }
        };

        const base = baseStats[cls];
        const bonus = raceBonus[race];

        // Background bonuses
        const bgBonus = {
            soldier: { weapon: 'Iron Sword', gold: 50 },
            scholar: { spells: 2, gold: 30 },
            merchant: { gold: 150 },
            wanderer: { map: true }
        };

        const bg = bgBonus[background];

        this.state.player = {
            name,
            race,
            class: cls,
            mode,
            permadead: false,
            level: 1,
            xp: 0,
            xpToNext: 100,
            hp: Math.floor(base.hp * bonus.hp),
            maxHp: Math.floor(base.hp * bonus.hp),
            mp: Math.floor(base.mp * bonus.mp),
            maxMp: Math.floor(base.mp * bonus.mp),
            str: Math.floor(base.str * (bonus.str || 1)),
            dex: Math.floor(base.dex * (bonus.dex || 1)),
            int: Math.floor(base.int * (bonus.int || 1)),
            wis: base.wis,
            gold: bg.gold || 50,
            diamonds: 0,
            rubies: 0,
            weapon: bg.weapon || (cls === 'mage' || cls === 'druid' ? 'Wooden Staff' : cls === 'paladin' ? 'Iron Mace' : cls === 'monk' ? 'Oak Club' : 'Rusty Sword'),
            weaponDamage: cls === 'mage' || cls === 'druid' ? 6 : cls === 'paladin' ? 16 : cls === 'monk' ? 9 : 10,
            armor: cls === 'paladin' ? 'Chainmail' : cls === 'mage' || cls === 'druid' ? 'Mage Robe' : 'Leather Armor',
            defense: cls === 'paladin' ? 8 : cls === 'mage' || cls === 'druid' ? 3 : 4,
            extraSpells: bg.spells || 0,
            mapRevealed: bg.map || false
        };

        const startingWeaponData = WorldData.items[this.state.player.weapon.toLowerCase()];
        if (startingWeaponData?.damage) this.state.player.weaponDamage = startingWeaponData.damage;

        // Initialize spells based on class
        this.state.player.spells = this.getClassSpells(cls, bg.spells);

        // Initialize inventory
        this.state.inventory = [
            { ...WorldData.items['gold coin'], id: 'gold coin', quantity: 5 },
            { ...WorldData.items['healing potion'], id: 'healing potion', quantity: 2 },
            { ...WorldData.items['bread'], id: 'bread', quantity: 3 },
            { ...WorldData.items['honey cake'], id: 'honey cake', quantity: 1 }
        ];
        const startingIds = [this.state.player.weapon, this.state.player.armor].map(name => name.toLowerCase());
        startingIds.forEach(id => { if (WorldData.items[id]) this.state.inventory.push({ ...WorldData.items[id], id, quantity: 1 }); });

        // Initialize quests
        this.state.quests = [WorldData.quests[0]]; // Tutorial quest

        // Multiplayer setup
        if (isMulti) {
            this.state.isMultiplayer = true;
            const count = parseInt(document.getElementById('mp-count').value);
            this.state.players = [this.state.player];
            // For now, just use single player with multiplayer label
        }

        this.state.location = 'kaliwasch';
        this.state.visited = ['kaliwasch'];
        this.state.kills = 0;
        this.state.friends = [];
        this.state.friendRequests = [
            { name: 'Arin Stormborn', status: 'pending' },
            { name: 'Mira Vale', status: 'pending' }
        ];
        this.state.companions = [];
        this.state.messages = [];
        this.state.guild = null;
        this.state.combatGroup = [];
        // Creation always allocates a new slot (or the explicit restart slot),
        // never the previously active hero's ID.
        this.state.activeHeroId = this.state.pendingHeroId || `hero_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
        this.state.pendingHeroId = null;

        this.showScreen('game-screen');
        this.enterLocation('kaliwasch');
        this.look(); // Show initial location description on game start
        this.save();
        window.OnlineSystem?.syncActiveHero();
    },

    getClassSpells(cls, extra = 0) {
        const spells = {
            warrior: ['Power Strike', 'Multi Strike', 'Minor Heal', 'Battle Cry'],
            mage: ['Fireball', 'Minor Heal', 'Ice Storm', 'Lightning Bolt'],
            rogue: ['Backstab', 'Minor Heal', 'Smoke Bomb', 'Multi Strike'],
            cleric: ['Heal', 'Mass Heal', 'Holy Light', 'Blessing'],
            paladin: ['Hammer Smite', 'Heal', 'Mass Heal', 'Holy Light'],
            ranger: ['Multi Strike', 'Minor Heal', 'Piercing Volley', 'Nature Mend'],
            monk: ['Multi Strike', 'Minor Heal', 'Chi Burst', 'Mass Heal'],
            druid: ['Nature Mend', 'Mass Heal', 'Thorn Storm', 'Lightning Bolt'],
            summoner: ['Minor Heal', 'Multi Strike'],
            hunter: ['Minor Heal', 'Multi Strike']
        };
        return (spells[cls] || ['Minor Heal']).slice(0, Math.min((spells[cls] || []).length, 2 + extra));
    },

    // ============================================
    // GAMEPLAY
    // ============================================

    enterLocation(locId, alreadyVisited = false) {
        const loc = WorldData.locations[locId];
        if (!loc) return;

        this.state.location = locId;

        if (!this.state.visited.includes(locId)) {
            this.state.visited.push(locId);
        }

        // Play location music
        MusicSystem.play(loc.music || 'tavern');

        // Never show description during movement. Description only shows via Look / Look Around.
        // (The initial game start still shows it via a separate flag.)

        // Show the actual finite-world exits in a stable compass order.
        const directionOrder = ['north','south','east','west','up','down'];
        const exits = directionOrder.filter(direction => loc.exits[direction]);
        this.addNarrative(`Exits: ${exits.length ? exits.map(d => d[0].toUpperCase() + d.slice(1)).join(', ') : 'None'}`, 'system');
        this.updateDirectionButtons(loc.exits);
        if (loc.shop) this.addNarrative(`🛒 A ${loc.shop} shop is open here. Type "shop" to browse.`, 'item');
        const localNpcs = WorldData.npcs[locId] || [];
        if (localNpcs.length) this.addNarrative(`Nearby: ${localNpcs.map(n => n.name).join(', ')}. Type "talk" or "invite [name]".`, 'npc');

        // Core fallback roll. The sacred encounter controller loaded below wraps
        // this with movement/time cooldowns; both use the independent roaming
        // pool rather than quest kill counts.
        const livingPack = this.getRandomEncounterPool(locId);
        if (!loc.safe && livingPack.length > 0 && Math.random() > 0.5) {
            setTimeout(() => {
                // Re-verify before striking: the hero may have moved away or a fight may already be running.
                if (this.state.location !== locId || this.state.inCombat) return;
                const stillHere = this.getRandomEncounterPool(locId);
                if (!stillHere.length) return;
                const enemyName = stillHere[Math.floor(Math.random() * stillHere.length)];
                this.startCombat(enemyName);
            }, 1500);
        }
        this.updateHUD();
        this.checkQuests('visit', locId);
    },

    showLocationArt(locId) {
        const arts = {
            kaliwasch: `
    ┌─────────────────────────────────────┐
    │      🏛️  K A L I W A S C H 🏛️        │
    │   ╔═══╗     ╔═══╗     ╔═══╗         │
    │   ║ T ║     ║ M ║     ║ G ║         │
    │   ╚═══╝     ╚═══╝     ╚═══╝         │
    │      ╔═══════════════════╗         │
    │      ║    ◆ MARKET ◆     ║         │
    │      ╚═══════════════════╝         │
    └─────────────────────────────────────┘`,
            mountains: `
    ⛰️═══════════════════════════════════════⛰️
        /\\    /\\    /\\    /\\    /\\
       /  \\  /  \\  /  \\  /  \\  /  \\
      /    \\/    \\/    \\/    \\/    \\
    ════════════════════════════════════════`,
            forest: `
    🌲═══════════════════════════════════════🌲
      \\  |  /  \\  |  /  \\  |  /  \\  |  /
       \\ | / \\ | / \\ | / \\ | / \\ | /
        \\|/   \\|/   \\|/   \\|/   \\|/
    🌲═══════════════════════════════════════🌲`,
            dungeon_entrance: `
    🚪═══════════════════════════════════════🚪
           ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
          ▓▓                  ▓▓
         ▓▓    ║          ║    ▓▓
        ▓▓     ║          ║     ▓▓
    🚪═══════════════════════════════════════🚪`,
            depths: `
    👹═══════════════════════════════════════👹
           ╔═══════════════════╗
           ║                   ║
           ║    ⚔️ THE DEPTHS ⚔️    ║
           ║                   ║
           ╚═══════════════════╝
    👹═══════════════════════════════════════👹`
        };

        document.getElementById('location-art').textContent = arts[locId] || arts.kaliwasch;
    },

    getLocationMusic() {
        const loc = WorldData.locations[this.state.location];
        return loc ? loc.music : 'tavern';
    },

    processCommand(cmd) {
        if (this.state.inCombat) {
            this.addNarrative("You're in combat! Use attack, spell, item, defend, or flee.", 'system');
            return;
        }

        let c = cmd.toLowerCase().trim();

        // Movement (N/S/E/W/Up/Down only — no diagonals)
        if (['north', 'n', 'south', 's', 'east', 'e', 'west', 'w', 'up', 'u', 'down', 'd'].includes(c)) {
            const dirMap = { n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down' };
            this.move(dirMap[c] || c);
            return;
        }

        // Look
        if (c === 'look' || c === 'l') {
            this.look();
            return;
        }

        // Look Around - shows location + directions
        if (c === 'look around' || c === 'lookaround') {
            this.lookAround();
            return;
        }

        // Where am I - shows distance to key landmarks
        if (c === 'where am i' || c === 'whereami' || c === 'distance') {
            this.whereAmI();
            return;
        }

        // Inventory
        if (c === 'inventory' || c === 'i' || c === 'items') {
            this.showInventory();
            return;
        }

        // Stats
        if (c === 'stats' || c === 'status') {
            this.showStats();
            return;
        }

        // Map
        if (c === 'map' || c === 'm') {
            this.showMap();
            return;
        }

        // Quests
        if (c === 'quests' || c === 'q') {
            this.showQuests();
            return;
        }

        // Attack — outside combat this hunts a living monster from this area only
        // Single-letter Alexa-style shortcuts: n s e w u d move, l look, i bag, a attack, f flee.
        const letterAlias = { n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down', l: 'look', i: 'inventory', q: 'quests', m: 'map', a: 'attack', f: 'flee' };
        if (letterAlias[c]) c = letterAlias[c];

        if (c === 'attack' || c === 'fight') {
            this.attack();
            return;
        }
        if (c.startsWith('attack ') || c.startsWith('fight ')) {
            this.attack(c.replace(/^(attack|fight) /, ''));
            return;
        }
        // Scout the monster pack in this area (blind-friendly)
        if (c === 'foes' || c === 'enemies' || c === 'monsters' || c === 'hunt') {
            this.showLivingEnemies();
            return;
        }

        // Quick heal from the dashboard / quick actions.
        // Per spec: healing must always be available from the player's dashboard
        // or quick actions when allowed by game rules. It plays a synchronized
        // healing sound and announces the restored HP via the a11y layer.
        if (c === 'heal' || c === 'use heal' || c === 'quick heal' || c === 'heal me') {
            this.quickHeal();
            return;
        }

        // Help
        if (c === 'help' || c === '?') {
            this.showHelp();
            return;
        }

        // Spell book / spell panel
        if (c === 'spells' || c === 'spellbook' || c === 'spell book' || c === 'magic') {
            this.showSpellBook();
            return;
        }

        // Alohomora shortcut
        if (c === 'alohomora' || c === 'unlock' || c === 'unlock door') {
            this.castSpell('alohomora');
            return;
        }

        // Take item
        if (c.startsWith('take ') || c.startsWith('get ')) {
            const item = c.replace(/^(take|get) /, '');
            this.takeItem(item);
            return;
        }

        // Use food, potions and equipment
        if (c.startsWith('use ') || c.startsWith('eat ')) {
            const item = c.replace(/^(use|eat) /, '');
            this.useItem(item);
            return;
        }
        if (c.startsWith('equip ')) {
            this.equipItem(c.replace('equip ', ''));
            return;
        }

        // Cast spell
        if (c.startsWith('cast ') || c.startsWith('spell ')) {
            const spell = c.replace(/^(cast|spell) /, '');
            this.castSpell(spell);
            return;
        }

        // Talk to NPC (v7.17.0: "talk" or "talk to <name>" — quest-aware dialog)
        if (c.startsWith('talk to ')) {
            this.talkToNPC(c.slice(8));
            return;
        }
        if (c.startsWith('talk ') || c === 'talk') {
            this.talkToNPC(c.startsWith('talk ') ? c.slice(5) : '');
            return;
        }

        // Social, companions, guilds, group combat and shops
        if (c === 'chat' || c === 'social' || c === 'friends' || c === 'companions') { this.showSocial(); return; }
        if (c === 'guild' || c === 'group') { this.showGuild(); return; }
        if (c === 'shop' || c === 'buy') { this.showShop(); return; }
        if (c === 'sell') { this.showInventory(); return; }
        if (c.startsWith('sell ')) { this.sellItem(c.slice(5)); return; }
        if (c === 'premium shop' || c === 'premium' || c === 'diamond shop') { this.showPremiumShop(); return; }
        if (c === 'settings' || c === 'account' || c === 'player id') { OnlineSystem.showSettings(); return; }
        if (c.startsWith('request ')) { this.sendFriendRequest(c.slice(8)); return; }
        if (c.startsWith('accept ')) { this.acceptFriendRequest(c.slice(7)); return; }
        if (c.startsWith('reject ')) { this.rejectFriendRequest(c.slice(7)); return; }
        if (c.startsWith('message ')) {
            const parts = c.slice(8).split(' ');
            this.sendChat(parts.shift(), parts.join(' '));
            return;
        }
        if (c.startsWith('invite ')) { this.inviteCompanion(c.slice(7)); return; }
        if (c.startsWith('heal ')) { this.healAlly(c.slice(5)); return; }
        if (c.startsWith('travel ')) { this.travelTo(c.slice(7)); return; }
        if (c === 'world') {
            this.addNarrative(`${ExpansionData.counts.locations} locations, ${ExpansionData.counts.monsters} monsters and ${ExpansionData.counts.shops} shops await. Go UP from Kaliwasch to enter the expanded realms.`, 'location');
            return;
        }

        // Where am I
        if (c === 'where am i' || c === 'location') {
            const loc = WorldData.locations[this.state.location];
            this.addNarrative(`You are in ${loc.name}.`, 'location');
            return;
        }

        this.addNarrative("I don't understand. Type 'help' for commands.", 'system');
    },

    getFootstepSFX(loc) {
        const text = [loc?.name, loc?.region, loc?.description, loc?.music, ...(loc?.features || [])].join(' ').toLowerCase();
        if (/wooden|floorboard|house|foyer|interior|inn|tavern|shop|guild|hall|ship/.test(text)) return 'step-wood';
        if (/swamp|marsh|bog|mud/.test(text)) return 'step-mud';
        if (/forest|grove|woodland|grass|pasture|meadow|leaves|canopy|thicket/.test(text)) return 'step-leaves';
        if (/gravel|mountain|rocky|quarry|trail|path|beach|sand/.test(text)) return 'step-gravel';
        return 'step-stone';
    },

    move(direction) {
        const loc = WorldData.locations[this.state.location];
        const dest = loc?.exits?.[direction];

        // In combat, movement is refused with a spoken explanation rather than a
        // dead control. Blind players get the reason and the way out.
        if (this.state.inCombat && this.state.enemy) {
            const message = dest
                ? `You are in combat. You cannot move ${direction} until the battle ends. Type flee to escape, or keep fighting.`
                : `You are in combat, and there is no path ${direction} from here. Type flee to escape, or keep fighting.`;
            if (this.emitGameEvent) this.emitGameEvent(message, 'system', { sfx: ['board-error'] });
            else { this.addNarrative(message, 'system'); MusicSystem.playSFX('board-error'); }
            return;
        }

        if (!dest || !WorldData.locations[dest]) {
            const text = `You cannot move ${direction} from here.`;
            if (this.emitGameEvent) this.emitGameEvent(text, 'system', { sfx: ['explore'] });
            else { this.addNarrative(text, 'system'); MusicSystem.playSFX('explore'); }
            return;
        }
        // Serialize movement so rapid keyboard/voice input cannot dispatch two
        // logical moves from the same origin or produce duplicate announcements.
        if (this._movementPending) return;
        this._movementPending = true;

        const origin = this.state.location;

        // Announce direction being taken
        const dirLabel = direction.charAt(0).toUpperCase() + direction.slice(1);
        this.addNarrative(`Going ${dirLabel}…`, 'system');

        this._movementTimer = setTimeout(() => {
            try {
                if (this.state.location !== origin || this.state.inCombat || document.hidden) return;
                const target = WorldData.locations[dest];
                if (!target) return;
                const alreadyVisited = this.state.visited.includes(dest);
                const text = `You moved ${direction} to ${target.name}.`;
                const footstep = this.getFootstepSFX(target);
                if (this.emitGameEvent) this.emitGameEvent(text, 'location', { sfx: [footstep] });
                else { this.addNarrative(text, 'location'); MusicSystem.playSFX(footstep); }
                this.enterLocation(dest, alreadyVisited);
            } finally {
                this._movementPending = false;
            }
        }, 320);
    },

    cancelPendingMovement() {
        clearTimeout(this._movementTimer);
        this._movementTimer = null;
        this._movementPending = false;
    },

    look() {
        this.showLocationArt(this.state.location);
        const loc = WorldData.locations[this.state.location];
        this.addNarrative(loc.description, 'location');
        const directionOrder = ['north','south','east','west','up','down'];
        const exits = directionOrder.filter(direction => loc.exits[direction]);
        this.addNarrative(`Available directions: ${exits.length ? exits.map(d => d[0].toUpperCase() + d.slice(1)).join(', ') : 'None'}`, 'system');
        this.updateDirectionButtons(loc.exits);

        if (loc.items && loc.items.length > 0) {
            const discovered=this.state.parity?.discoveredItems||[],visible=loc.items.filter(i=>!WorldData.items[i]?.hidden||discovered.includes(`${this.state.location}:${i}`));
            if(visible.length)this.addNarrative(`You see: ${visible.map(i => WorldData.items[i]?.name || i).join(', ')}`, 'item');
        }

        // Report the local monster pool (blind-friendly scouting). The pool is
        // the set of monster TYPES that can appear here; it is never a finite
        // remaining-kill count.
        const pack = this.getAreaMonsterPool(this.state.location);
        if (pack.length) {
            this.addNarrative(`🐾 Monsters roam here: ${pack.join(', ')}. Combat begins when an enemy encounters you, a quest requires it, or an NPC initiates it.`, 'system');
        }
    },

    lookAround() {
        const loc = WorldData.locations[this.state.location];
        if (!loc) { this.addNarrative("You're not sure where you are.", 'system'); return; }

        this.addNarrative(`📍 ${loc.name}`, 'location');
        this.addNarrative(loc.description, 'location');

        const directionOrder = ['north','south','east','west','up','down'];
        const exits = directionOrder.filter(d => loc.exits[d]);
        if (exits.length > 0) {
            this.addNarrative(`Directions: ${exits.map(d => d[0].toUpperCase() + d.slice(1)).join(', ')}`, 'system');
        } else {
            this.addNarrative('No exits from here.', 'system');
        }
    },

    whereAmI() {
        const loc = WorldData.locations[this.state.location];
        if (!loc) { this.addNarrative("You're not sure where you are.", 'system'); return; }

        // BFS to find nearest landmarks
        const bfs = (targetIds) => {
            if (!targetIds || targetIds.length === 0) return -1;
            if (targetIds.includes(this.state.location)) return 0;
            const visited = new Set([this.state.location]);
            let queue = [this.state.location];
            let depth = 0;
            while (queue.length > 0 && depth < 100) {
                const next = [];
                depth++;
                for (const locId of queue) {
                    const l = WorldData.locations[locId];
                    if (!l) continue;
                    for (const [dir, target] of Object.entries(l.exits)) {
                        if (!target || visited.has(target)) continue;
                        if (targetIds.includes(target)) return depth;
                        visited.add(target);
                        next.push(target);
                    }
                }
                queue = next;
            }
            return -1;
        };

        const dist = (ids) => bfs(Array.isArray(ids) ? ids : [ids]);

        // Each room ~= 0.1 miles
        const toMiles = (rooms) => rooms <= 0 ? 'here' : rooms <= 5 ? `${(rooms * 0.1).toFixed(1)} miles` : `${Math.round(rooms * 0.1)} miles`;

        this.addNarrative(`📍 You are at: ${loc.name}`, 'location');

        const market = dist(['market_square', 'town_market', 'black_market']);
        const forest = dist(['dark_forest_entrance', 'forest_entrance', 'forest_path', 'whispering_woods', 'dark_forest']);
        const cave = dist(['mystic_cave_entrance', 'cave_entrance', 'abandoned_mine_entrance', 'dragon_cave_entrance']);
        const village = dist(['peaceful_village', 'mountain_village', 'ancient_ruins', 'abandoned_village']);

        const dists = [];
        if (market >= 0) dists.push(`Market Square: ${toMiles(market)}`);
        if (forest >= 0) dists.push(`Forest: ${toMiles(forest)}`);
        if (cave >= 0) dists.push(`Cave: ${toMiles(cave)}`);
        if (village >= 0) dists.push(`Village: ${toMiles(village)}`);

        if (dists.length > 0) {
            this.addNarrative(`🧭 ${dists.join(' • ')}`, 'system');
        }
    },

    takeItem(itemName) {
        const loc = WorldData.locations[this.state.location];

        const found = loc.items?.find(i =>
            i.toLowerCase().includes(itemName.toLowerCase()) ||
            (WorldData.items[i]?.name.toLowerCase().includes(itemName.toLowerCase()))
        );

        if (!found) {
            this.addNarrative("There's no such visible item here.", 'system');
            return;
        }
        const hidden=WorldData.items[found]?.hidden,discovered=this.state.parity?.discoveredItems||[];
        if(hidden&&!discovered.includes(`${this.state.location}:${found}`)){this.addNarrative('That item has not been discovered. Search the location first.','system');return;}

        const itemData = WorldData.items[found];
        if (itemData) {
            this.addItemToInventory(found, itemData);
            const text = `You pick up ${itemData.name}!`;
            if (this.emitGameEvent) this.emitGameEvent(text, 'item', { sfx: ['pickup'] });
            else { this.addNarrative(text, 'item'); MusicSystem.playSFX('pickup'); }

            loc.items = loc.items.filter(i => i !== found);
            this.checkQuests('collect', found);
        }
    },

    addItemToInventory(itemId, itemData) {
        const existing = this.state.inventory.find(i => i.id === itemId);
        if (existing) {
            existing.quantity++;
        } else {
            this.state.inventory.push({ ...itemData, id: itemId, quantity: 1 });
        }
    },

    useItem(itemName) {
        // §14 double-tap guard: a second activation within 400 ms of the same
        // item is ignored so a screen-reader double tap cannot consume twice.
        const guardKey = String(itemName || '').toLowerCase();
        const now = Date.now();
        this._itemUseGuard = this._itemUseGuard || {};
        if (this._itemUseGuard[guardKey] && now - this._itemUseGuard[guardKey] < 400) return;
        this._itemUseGuard[guardKey] = now;

        const q = String(itemName || '').toLowerCase().trim();
        const item = (this.state.inventory || []).find(i => {
            const name = String(i?.name || '').toLowerCase();
            const id = String(i?.id || '').toLowerCase();
            return name === q || id === q || name.includes(q) || id.includes(q);
        });

        if (!item) {
            this.addNarrative(`You don't have ${q || 'that item'} in your bag.`, 'system');
            return;
        }

        // Validate the item against the CURRENT state before consuming anything.
        const player = this.state.player;
        if (item.type === 'quest' || item.questItem) {
            this.addNarrative(`${item.name} is a quest item and is not consumed here.`, 'system');
            return;
        }
        if (item.effect === 'heal' && player.hp >= player.maxHp) {
            this.addNarrative('Your health is already full.', 'system');
            return;
        }
        if (item.effect === 'mana' && player.mp >= player.maxMp) {
            this.addNarrative('Your magic is already full.', 'system');
            return;
        }
        if (item.effect === 'both' && player.hp >= player.maxHp && player.mp >= player.maxMp) {
            this.addNarrative('Your health and magic are already full.', 'system');
            return;
        }
        if (item.combatOnly && !this.state.inCombat) {
            this.addNarrative(`${item.name} can only be used during battle.`, 'system');
            return;
        }

        const isDrink = /potion|tonic|drink|water|elixir|ale|wine|juice|milk|flask/i.test(`${item.id || ''} ${item.name || ''}`);
        if (item.effect === 'heal') {
            const healAmount = item.value;
            this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + healAmount);
            const text = `${isDrink ? 'You drink' : 'You use'} ${item.name}. Healed ${healAmount} HP!`;
            const effects = isDrink ? ['drink', 'heal'] : ['heal'];
            if (this.emitGameEvent) this.emitGameEvent(text, 'item', { sfx: effects });
            else { this.addNarrative(text, 'item'); effects.forEach(effect => MusicSystem.playSFX(effect)); }
        } else if (item.effect === 'mana') {
            const manaAmount = item.value;
            this.state.player.mp = Math.min(this.state.player.maxMp, this.state.player.mp + manaAmount);
            const text = `${isDrink ? 'You drink' : 'You use'} ${item.name}. Restored ${manaAmount} MP!`;
            const effects = isDrink ? ['drink', 'heal'] : ['heal'];
            if (this.emitGameEvent) this.emitGameEvent(text, 'magic', { sfx: effects });
            else { this.addNarrative(text, 'magic'); effects.forEach(effect => MusicSystem.playSFX(effect)); }
        } else if (item.effect === 'both') {
            this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + item.value);
            this.state.player.mp = Math.min(this.state.player.maxMp, this.state.player.mp + item.value);
            const text = `${isDrink ? 'You drink' : 'You eat'} ${item.name}.`;
            if (this.emitGameEvent) this.emitGameEvent(text, 'item', { sfx: [isDrink ? 'drink' : 'eat'] });
            else { this.addNarrative(text, 'item'); MusicSystem.playSFX(isDrink ? 'drink' : 'eat'); }
        } else {
            this.addNarrative(`${item.name} cannot be consumed. Try "equip ${item.name}".`, 'system');
            return;
        }

        item.quantity--;
        if (item.quantity <= 0) {
            this.state.inventory = this.state.inventory.filter(i => i !== item);
        }

        this.updateHUD();
        this.save();
    },

    /** Human description of an inventory item (Examine). */
    examineInventoryItem(query) {
        const q = String(query || '').toLowerCase().trim();
        const item = (this.state.inventory || []).find(i => {
            const name = String(i?.name || '').toLowerCase();
            const id = String(i?.id || '').toLowerCase();
            return name === q || id === q || name.includes(q) || id.includes(q);
        });
        if (!item) { this.addNarrative(`You do not carry ${q || 'that item'}.`, 'system'); return null; }
        const description = item.desc || item.description || 'A useful traveller\'s possession.';
        this.addNarrative(`${item.name}: ${description}`, 'item');
        return item;
    },

    /** Mechanical summary of an inventory item (Details). */
    showInventoryItemDetails(query) {
        const item = this.state.inventory.find(i => i.name.toLowerCase().includes(String(query || '').toLowerCase()));
        if (!item) { this.addNarrative("You do not carry that item.", 'system'); return null; }
        const parts = [`${item.name}`, `type ${item.type || 'general'}`, `quantity ${item.quantity}`];
        if (item.damage) parts.push(`damage ${item.damage}`);
        if (item.minDamage !== undefined) parts.push(`min damage ${item.minDamage}`);
        if (item.maxDamage !== undefined) parts.push(`max damage ${item.maxDamage}`);
        if (item.strength) parts.push(`STR +${item.strength}`);
        if (item.fireDamage) parts.push(`🔥 fire damage ${item.fireDamage}`);
        if (item.airDamage) parts.push(`🌪️ air damage ${item.airDamage}`);
        if (item.waterDamage) parts.push(`💧 water damage ${item.waterDamage}`);
        if (item.earthDamage) parts.push(`🌍 earth damage ${item.earthDamage}`);
        if (item.defense) parts.push(`defense ${item.defense}`);
        if (item.value && ['heal', 'mana', 'both'].includes(item.effect)) parts.push(`restores ${item.value}`);
        else if (item.value) parts.push(`worth ${item.value} gold`);
        if (item.ability) parts.push(item.ability);
        this.addNarrative(`${parts.join('; ')}.`, 'item');
        return item;
    },

    equipItem(itemName) {
        const item = this.state.inventory.find(i => i.name.toLowerCase().includes(itemName.toLowerCase()));
        if (!item || !['weapon','armor','accessory'].includes(item.type)) {
            this.addNarrative('You do not have matching equipment.', 'system');
            return;
        }
        const p = this.state.player;
        if (item.type === 'weapon') {
            p.weapon = item.name;
            p.weaponDamage = item.damage || p.weaponDamage;
            const extras = [];
            if (item.minDamage !== undefined) extras.push(`min ${item.minDamage}`);
            if (item.maxDamage !== undefined) extras.push(`max ${item.maxDamage}`);
            if (item.strength) extras.push(`STR +${item.strength}`);
            if (item.fireDamage) extras.push(`🔥 fire ${item.fireDamage}`);
            if (item.airDamage) extras.push(`🌪️ air ${item.airDamage}`);
            if (item.waterDamage) extras.push(`💧 water ${item.waterDamage}`);
            if (item.earthDamage) extras.push(`🌍 earth ${item.earthDamage}`);
            const detail = extras.length ? `${p.weaponDamage} dmg, ${extras.join(', ')}` : `${p.weaponDamage} damage`;
            this.addNarrative(`Equipped ${item.name} (${detail}).`, 'item');
        } else if (item.type === 'armor') {
            p.armor = item.name;
            p.defense = item.defense || 0;
            this.addNarrative(`Equipped ${item.name} (${p.defense} defense).`, 'item');
        } else {
            p.accessory = item.name;
            this.addNarrative(`Equipped ${item.name}.`, 'item');
        }
        this.save();
    },

    /** Remove real equipment without consuming it. Clears aliases used by legacy
     * and body-slot equipment, then recalculates the existing set bonuses. */
    unequipItem(itemName) {
        const p = this.state.player;
        const item = this.state.inventory.find(i => i.name.toLowerCase() === String(itemName).toLowerCase());
        if (!p || !item) return this.addNarrative('You do not carry that equipment.', 'system');
        const slots = ['weapon','armor','helmet','gloves','boots','accessory','rightHand','leftHand','head','face','ears','neck','chest','back','waist','legs','fingers','eyes','leftEar','rightEar'];
        const worn = slots.filter(k => p[k] === item.name);
        const gear = Object.keys(p.gearSlots || {}).filter(k => p.gearSlots[k] === item.name);
        if (!worn.length && !gear.length) return this.addNarrative('That item is not equipped.', 'system');
        // Only remove bonuses recorded by the original equipment engine. Newer
        // body-slot gear does not record these, so no guessed bonuses are removed.
        for (const slot of ['weapon','armor','accessory']) {
            if (!worn.includes(slot) || !p.equipmentBonuses?.[slot]) continue;
            const b = p.equipmentBonuses[slot];
            for (const k of ['str','dex','int','wis']) p[k] -= b[k] || 0;
            p.maxHp -= b.hp || 0; p.maxMp -= b.mp || 0;
            delete p.equipmentBonuses[slot];
        }
        for (const k of worn) p[k] = null;
        for (const k of gear) delete p.gearSlots[k];
        if (worn.includes('rightHand') && p.leftHand === '(holding two-handed)') p.leftHand = null;
        if (worn.includes('weapon') || worn.includes('rightHand')) p.weaponDamage = 8;
        if (worn.includes('armor') || worn.includes('chest')) { p.baseDefense = 0; p.defense = 0; }
        window.BlackSwordFeatures?.applySetBonuses(this);
        p.hp = Math.min(p.hp, p.maxHp); p.mp = Math.min(p.mp, p.maxMp);
        this.addNarrative(`Unequipped ${item.name}. It remains in your inventory.`, 'item');
        this.updateHUD(); this.save();
    },

    attack(targetName) {
        // Per spec: combat should only happen when a battle has been started by
        //   (a) a quest, (b) an enemy encounter, or (c) an NPC.
        // Typing "attack" outside combat should respond "You are not currently in combat"
        // and must NOT start a new hunt.
        //
        // Backwards compatibility: the original "hunt a monster" command is
        // still available as "hunt <name>" so the rest of the game keeps working.

        // Already fighting? A typed "attack" means: strike the enemy in front of you.
        if (this.state.inCombat) {
            this.playerAttack();
            return;
        }

        // If a battle is pending (started by quest/encounter/NPC, awaiting player's
        // first attack), allow the attack to proceed.
        if (this.state.pendingCombat) {
            this.startCombat(this.state.pendingCombat);
            this.state.pendingCombat = null;
            return;
        }

        // Explicit "hunt" command: keep the legacy behaviour of starting a fight
        // with any living monster in the area. This preserves the existing gameplay
        // loop while making plain "attack" safe.
        const isHunt = (targetName || '').toLowerCase().startsWith('hunt');
        const huntTarget = isHunt ? (targetName || '').replace(/^hunt\s*/i, '').trim() : '';

        if (isHunt) {
            const locId = this.state.location;
            const loc = WorldData.locations[locId];
            // Hunting uses the unlimited area pool: monsters always return.
            const living = this.getAreaMonsterPool(locId);
            if (living.length === 0) {
                this.addNarrative("There are no monsters here to hunt.", 'system');
                MusicSystem.playSFX('button');
                return;
            }
            let enemyName = null;
            const query = huntTarget.replace(/^the\s+/, '').trim().toLowerCase();
            if (query) {
                enemyName = living.find(n => n.toLowerCase().includes(query)) || null;
                if (!enemyName) {
                    this.addNarrative(`No "${huntTarget}" roams here. Monsters in this area: ${living.join(', ')}.`, 'system');
                    return;
                }
            } else {
                enemyName = living[Math.floor(Math.random() * living.length)];
            }
            this.addNarrative(`You hunt the ${enemyName}!`, 'combat');
            this.startCombat(enemyName);
            return;
        }

        // Default: "attack" with no battle in progress. Per the spec, do NOT start
        // a new hunt. Tell the player they are not in combat.
        this.addNarrative("You are not currently in combat.", 'system');
        MusicSystem.playSFX('button');
    },

    // How many times a monster may legitimately appear in an area.
    // Quest-required kills are always guaranteed; bosses fall permanently after one true victory.
    getEnemyQuota(locId, enemyName) {
        const data = WorldData.enemies[enemyName] || {};
        let quota = (data.boss || data.finalBoss) ? 1 : 3;
        (WorldData.quests || []).forEach(quest => (quest.objectives || []).forEach(obj => {
            if (obj.type === 'kill' && obj.target === enemyName) quota = Math.max(quota, obj.count || 1);
        }));
        return quota;
    },

    // Monsters still needed for finite quest/area-clear progression.
    getLivingEnemies(locId) {
        const loc = WorldData.locations[locId];
        if (!loc || !Array.isArray(loc.enemies)) return [];
        const slain = (this.state.slainEnemies && this.state.slainEnemies[locId]) || {};
        return loc.enemies.filter(name => (slain[name] || 0) < this.getEnemyQuota(locId, name));
    },

    // Roaming wilderness encounters are UNLIMITED and completely independent of
    // the quest kill ledger. The area's configured monster list is a POOL of
    // possible monster TYPES, never a stock of remaining monsters. Only a truly
    // slain unique boss/final boss is excluded.
    getRandomEncounterPool(locId) {
        const loc = WorldData.locations[locId];
        if (!loc || loc.safe) return [];
        return this.getAreaMonsterPool(locId);
    },

    // The public, unlimited monster pool for an area: the monster TYPES that can
    // be encountered here. It never shrinks as monsters are defeated.
    getAreaMonsterPool(locId) {
        const loc = WorldData.locations[locId];
        if (!loc || !Array.isArray(loc.enemies)) return [];
        const slain = (this.state.slainEnemies && this.state.slainEnemies[locId]) || {};
        return [...new Set(loc.enemies.filter(name => {
            const data = WorldData.enemies[name] || {};
            // Only unique bosses stay finite once they have truly fallen.
            return !(data.boss || data.finalBoss) || !(slain[name] > 0);
        }))];
    },

    // true only for areas that once had monsters and are now fully cleared.
    areaClearedInfo(locId) {
        const loc = WorldData.locations[locId];
        if (!loc || !loc.enemies || !loc.enemies.length) return false;
        return this.getLivingEnemies(locId).length === 0;
    },

    showLivingEnemies() {
        const locId = this.state.location;
        const loc = WorldData.locations[locId];
        const pool = this.getAreaMonsterPool(locId);
        if (!pool.length) {
            this.addNarrative("No monsters roam this area. You are not in combat.", 'system');
            return;
        }
        // The monster pool describes which creatures CAN appear here. Encounters
        // are unlimited, so no remaining/kill counts are ever reported.
        this.addNarrative(`🐾 Monsters that roam ${loc?.name || 'this area'}: ${pool.join(', ')}. They can be encountered again at any time. Use "hunt" to seek a fight.`, 'system');
    },

    // v7.17.0 — smarter NPCs: talk to a named NPC, quest-aware hints, and role
    // actions (healer/trader/guild) so villages feel alive.
    talkToNPC(name) {
        const npcs = WorldData.npcs[this.state.location];
        if (!npcs || npcs.length === 0) {
            this.addNarrative("There's no one to talk to here.", 'system');
            return;
        }
        let npc = null;
        const query = (name || '').trim().toLowerCase();
        if (query) {
            npc = npcs.find(n => n.name.toLowerCase().includes(query));
            if (!npc) {
                this.addNarrative(`No one named "${name}" is here. Nearby: ${npcs.map(n => n.name).join(', ')}.`, 'system');
                return;
            }
        } else {
            npc = npcs[Math.floor(Math.random() * npcs.length)];
        }

        const dialog = this.npcDialog(npc);
        this.addNarrative(`${npc.name} says: "${dialog}"`, 'npc');

        // Role actions make NPCs useful, not just scenery.
        const loc = WorldData.locations[this.state.location];
        if (npc.role === 'healer') {
            this.addNarrative(`${npc.name} nods toward the altar: "Quick heal restores your body when you need it."`, 'system');
        } else if (npc.role === 'trader' && loc && loc.shop) {
            this.addNarrative(`${npc.name} gestures at the wares: type "shop" to browse.`, 'item');
        } else if (npc.role === 'guild') {
            this.addNarrative('The quest board is open — type "quests" to review your current tasks.', 'system');
        }
    },

    /** Pick NPC dialog flavored by the hero's quest state (v7.17.0). */
    npcDialog(npc) {
        const base = npc.dialog[Math.floor(Math.random() * npc.dialog.length)];
        const activeQuest = this.state.quests.find(q => !this.state.completedQuests.includes(q.id));
        const hints = {
            guild: activeQuest
                ? `The realm's need is great — ${activeQuest.name} still calls for a hero.`
                : 'Every current task is settled. Travel far — new quests await beyond the city.',
            healer: 'The altar of Auralis is always lit. Quick heal draws on its light.',
            tavern: 'Travelers whisper that the deep places stir again. Keep your sword close.',
            trader: 'My shelves hold supplies for every road. Gold buys what steel cannot.'
        };
        if (activeQuest && Math.random() < 0.45 && hints[npc.role]) return hints[npc.role];
        if (this.state.completedQuests.length > 0 && Math.random() < 0.35) {
            return `${base} Your deeds are already spoken of across the city.`;
        }
        return base;
    },

    castSpell(spellName) {
        // Some spells can be cast outside combat (healing, utility)
        const outOfCombatSpells = ['minor heal', 'heal', 'nature mend', 'mass heal', 'holy light', 'blessing', 'alohomora', 'open door', 'close door'];
        const isOutOfCombatSpell = outOfCombatSpells.some(s => spellName.toLowerCase().includes(s));
        if (!this.state.inCombat && !isOutOfCombatSpell) {
            this.addNarrative("You can only cast combat spells in battle. Healing and utility spells can be cast anytime. Type 'spells' to see your spell book.", 'system');
            return;
        }
        const spell = this.state.player.spells.find(s =>
            s.toLowerCase().includes(spellName.toLowerCase())
        );

        // Handle Alohomora / open door spell (works outside combat)
        if (spell && (spell.toLowerCase().includes('alohomora') || spell.toLowerCase().includes('open door'))) {
            const loc = WorldData.locations[this.state.location];
            if (loc?.specialDoor?.magical && !loc.specialDoor.open) {
                const cost = 20;
                if (this.state.player.mp < cost) { this.addNarrative("Not enough mana for Alohomora!", 'system'); return; }
                this.state.player.mp -= cost;
                loc.specialDoor.open = true;
                this.addNarrative(`✨ Alohomora! The magical door unlocks and swings open!`, 'magic');
                MusicSystem.playSFX('magic');
                this.updateDirectionButtons(loc.exits);
                this.save();
                return;
            }
            // Also try physical door
            if (loc?.houseExterior) {
                const cost = 10;
                if (this.state.player.mp < cost) { this.addNarrative("Not enough mana!", 'system'); return; }
                this.state.player.mp -= cost;
                this.openPhysicalDoor?.();
                this.addNarrative(`✨ The lock clicks open magically!`, 'magic');
                return;
            }
            this.addNarrative("There is no locked door here to unlock.", 'system');
            return;
        }

        // Handle close door spell
        if (spell && spell.toLowerCase().includes('close door')) {
            const loc = WorldData.locations[this.state.location];
            if (loc?.houseExterior) {
                this.closePhysicalDoor?.();
                this.addNarrative(`The door closes.`, 'system');
                return;
            }
            this.addNarrative("There is no door here to close.", 'system');
            return;
        }

        // Out-of-combat healing spells
        if (!this.state.inCombat && spell && ['minor heal', 'heal', 'nature mend', 'mass heal', 'holy light'].includes(spell.toLowerCase())) {
            const costs = { 'minor heal': 14, 'heal': 20, 'nature mend': 22, 'mass heal': 38, 'holy light': 25 };
            const cost = costs[spell.toLowerCase()] || 20;
            if (this.state.player.mp < cost) { this.addNarrative("Not enough mana!", 'system'); return; }
            const baseDamage = { 'minor heal': 18, 'heal': 34, 'nature mend': 40, 'mass heal': 30, 'holy light': 35 };
            const healAmount = (baseDamage[spell.toLowerCase()] || 20) + this.state.player.level * 2 + Math.floor(this.state.player.wis / 3);
            const p = this.state.player;
            if (p.hp >= p.maxHp) { this.addNarrative("You are already at full health.", 'system'); return; }
            this.state.player.mp -= cost;
            const newHp = Math.min(p.maxHp, p.hp + healAmount);
            const applied = newHp - p.hp;
            p.hp = newHp;
            this.addNarrative(`✨ You cast ${spell}. Healed ${applied} HP!`, 'magic');
            MusicSystem.playSFX('heal');
            // Also heal companions
            const companions = this.state.companions?.filter(c => c.hp > 0 && c.hp < c.maxHp) || [];
            for (const comp of companions.slice(0, 3)) {
                const compHeal = Math.floor(healAmount * 0.5);
                comp.hp = Math.min(comp.maxHp, comp.hp + compHeal);
                this.addNarrative(`${comp.name} heals for ${compHeal} HP. (${comp.hp}/${comp.maxHp})`, 'magic');
            }
            this.updateHUD();
            this.save();
            return;
        }

        if (!spell) {
            this.addNarrative(`You don't know that spell. Available: ${this.state.player.spells.join(', ')}`, 'system');
            return;
        }

        const costs = { 'power strike': 15, 'multi strike': 24, 'battle cry': 20, 'fireball': 25, 'ice storm': 30, 'lightning bolt': 35, 'backstab': 15, 'smoke bomb': 20, 'minor heal': 14, 'heal': 20, 'mass heal': 38, 'nature mend': 22, 'holy light': 25, 'blessing': 15, 'hammer smite': 22, 'piercing volley': 28, 'chi burst': 24, 'thorn storm': 30 };
        const cost = costs[spell.toLowerCase()] || 20;

        if (this.state.player.mp < cost) {
            this.addNarrative("Not enough mana!", 'system');
            return;
        }

        // Spell fail chance — spells sometimes fail (10% base, higher for expensive spells)
        const failChance = Math.min(0.25, 0.08 + (cost / 200));
        if (Math.random() < failChance) {
            this.state.player.mp -= Math.floor(cost / 2); // Still costs some mana on fail
            this.addNarrative(`✨ Your ${spell} fizzles and fails! The magic slips away. (-${Math.floor(cost / 2)} MP)`, 'combat');
            MusicSystem.playSFX('miss');
            return;
        }

        this.state.player.mp -= cost;

        const baseDamage = { 'power strike': 25, 'multi strike': 42, 'battle cry': 15, 'fireball': 45, 'ice storm': 40, 'lightning bolt': 50, 'backstab': 35, 'smoke bomb': 20, 'minor heal': 18, 'heal': 34, 'mass heal': 30, 'nature mend': 40, 'holy light': 35, 'blessing': 0, 'hammer smite': 48, 'piercing volley': 46, 'chi burst': 42, 'thorn storm': 44 };
        const damage = (baseDamage[spell.toLowerCase()] || 30) + this.state.player.level * 3 + Math.floor(this.state.player.int / 3);
        const key = spell.toLowerCase();

        this.combatSequence(async () => {
            if (['minor heal', 'heal', 'nature mend'].includes(key)) {
                const healAmount = damage;
                const newHp = Math.min(this.state.player.maxHp, this.state.player.hp + healAmount);
                const applied = newHp - this.state.player.hp;
                this.state.player.hp = newHp;
                if (this._pro) {
                    await this._pro.healingSpell(applied, this.state.player.hp);
                } else {
                    MusicSystem.playSFX('heal');
                    this.addNarrative(`Your magic restores ${applied} health. ${this.battleStatusText()}`, 'magic');
                }
            } else if (key === 'mass heal') {
                const healAmount = damage;
                this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + healAmount);
                this.state.companions.forEach(c => { c.hp = Math.min(c.maxHp, c.hp + healAmount); });
                MusicSystem.playSFX('heal');
                this.addNarrative(`Your magic restores ${healAmount} health to your whole battle group. ${this.battleStatusText()}`, 'magic');
            } else if (key === 'multi strike') {
                const hits = [0, 1, 2].map(() => Math.max(1, Math.floor(damage / 3) + Math.floor(Math.random() * 5)));
                const total = this.state.enemy ? hits.reduce((a, b) => a + b, 0) : 0;
                MusicSystem.playSFX('attack');
                for (const h of hits) {
                    this.applyEnemyDamage(h, null);
                    MusicSystem.playSFX('hit');
                    await new Promise(r => setTimeout(r, 180));
                }
                this.addNarrative(`Multi Strike lands ${hits.length} hits (${hits.join(' + ')}) for ${total} damage!`, 'combat');
            } else if (key === 'blessing') {
                this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + 20);
                this.state.player.mp = Math.min(this.state.player.maxMp, this.state.player.mp + 20);
                MusicSystem.playSFX('blessing');
                this.addNarrative(`A blessing restores your body and magic. ${this.battleStatusText()}`, 'magic');
            } else {
                MusicSystem.playSFX('magic');
                this.applyEnemyDamage(damage, `You cast ${spell} for {damage} damage!`);
            }

            this.updateHUD();

            const peacefulCast = ['minor heal', 'heal', 'nature mend', 'mass heal', 'blessing'].includes(key);
            if (!peacefulCast) {
                if (this.state.enemy && this.state.enemy.hp <= 0) {
                    await this.enemyDefeated();
                } else if (this.state.inCombat) {
                    await this.enemyAttack();
                }
            }
        });
    },

    // ============================================
    // COMBAT
    // ============================================

    // v7.17.0 — every combat action runs through one serialized promise chain so
    // sounds and TalkBack narration NEVER overlap, and turn order is exact:
    // player → companions → enemy → (defeat → loot → XP → victory).
    _combatChain: Promise.resolve(),

    /**
     * Serialize combat steps so audio, narration and state stay ordered.
     *
     * Re-entrancy fix: a step already running inside the chain (for example
     * playerAttack awaiting the monster turn) must NOT queue behind itself, or
     * it deadlocks and the monsters never act. A nested call runs inline while
     * only top-level calls are queued.
     */
    combatSequence(fn) {
        if (this._combatChainRunning) {
            try {
                return Promise.resolve(fn()).catch(err => console.warn('combat sequence error:', err));
            } catch (err) {
                console.warn('combat sequence error:', err);
                return Promise.resolve();
            }
        }
        this._combatChain = (this._combatChain || Promise.resolve())
            .then(async () => {
                this._combatChainRunning = true;
                try { return await fn(); }
                finally { this._combatChainRunning = false; }
            })
            .catch(err => { this._combatChainRunning = false; console.warn('combat sequence error:', err); });
        return this._combatChain;
    },

    /** Professional synchronized combat audio (professional-audio-combat-v24.js). */
    get _pro() { return window.ProfessionalAudioCombat; },

    /** Apply damage to the current enemy, honoring brace, with HUD update. */
    applyEnemyDamage(amount, sourceText) {
        const e = this.state.enemy;
        if (!e) return 0;
        let dmg = Math.max(1, Math.floor(Number(amount) || 0));
        if (e.braceTurns > 0) {
            dmg = Math.max(1, Math.ceil(dmg / 2));
            e.braceTurns--;
        }
        e.hp = Math.max(0, e.hp - dmg);
        if (sourceText) this.addNarrative(sourceText.replace('{damage}', String(dmg)), 'combat');
        this.updateEnemyHUD();
        return dmg;
    },

    startCombat(enemyName) {
        const enemyData = WorldData.enemies[enemyName];
        if (!enemyData) return;

        this.state.inCombat = true;
        this.state.defending = false;

        const levelBonus = 1 + (this.state.player.level - 1) * 0.15;

        this.state.enemy = {
            name: enemyName,
            hp: Math.floor(enemyData.hp * levelBonus),
            maxHp: Math.floor(enemyData.hp * levelBonus),
            attack: Math.floor(enemyData.attack * levelBonus),
            xp: Math.floor(enemyData.xp * levelBonus),
            gold: Math.floor(enemyData.gold * levelBonus),
            boss: enemyData.boss || false,
            finalBoss: enemyData.finalBoss || false,
            desc: enemyData.desc,
            // v7.17.0 enemy AI state: brace halves incoming damage once; roar
            // buffs the monster's attack briefly.
            braceTurns: 0,
            roarActive: false
        };

        if (!this.state.cleanEncounterMode) {
            this.addNarrative(`You encounter ${enemyName}.`, 'combat');
            if (enemyData.desc) this.addNarrative(enemyData.desc, 'system');
        }

        // Combat is a logical state in the current world location. Legacy HUD
        // nodes remain hidden only for compatibility with older extensions; no
        // player-facing battle panel or screen is opened.
        const legacyPanel=document.getElementById('combat-panel');
        if(legacyPanel){legacyPanel.hidden=true;legacyPanel.classList.add('hidden');legacyPanel.setAttribute('aria-hidden','true');}
        const enemyNameNode=document.getElementById('enemy-name');if(enemyNameNode)enemyNameNode.textContent=enemyName;
        const enemyDescNode=document.getElementById('enemy-desc');if(enemyDescNode)enemyDescNode.textContent=enemyData.desc||'';
        this.updateEnemyHUD();

        MusicSystem.play('combat');
    },

    updateEnemyHUD() {
        const e = this.state.enemy;
        if (!e) return;
        const el = document.getElementById('enemy-hp');
        if (el) el.textContent = `${Math.max(0, e.hp)}/${e.maxHp}`;
    },

    handleCombat(action) {
        if (!this.state.inCombat) return;

        switch(action) {
            case 'attack':
                this.playerAttack();
                break;
            case 'spell':
                this.showSpellPanel();
                break;
            case 'item':
                this.showItemPanel();
                break;
            case 'defend':
                this.defend();
                break;
            case 'flee':
                this.tryFlee();
                break;
        }
    },

    // Alexa-style spoken battle status: lets blind players compare HP/MP
    // with the monster after every action. No dice jargon, just numbers.
    battleStatusText() {
        const p = this.state.player, e = this.state.enemy;
        if (!p) return '';
        let text = `You have ${p.hp} of ${p.maxHp} health and ${p.mp} of ${p.maxMp} magic.`;
        if (this.state.inCombat && e && e.hp > 0) text += ` ${e.name} has ${e.hp} of ${e.maxHp} health.`;
        return text;
    },

    playerAttack() {
        if (!this.state.inCombat || !this.state.enemy) return;
        this.combatSequence(async () => {
            const p = this.state.player, e = this.state.enemy;
            if (!e || e.hp <= 0 || !p) return;

            // Effective STR includes weapon strength bonus (base STR + weapon STR).
            const weaponItem = this.state.inventory?.find(i => i.name === p.weapon && i.type === 'weapon');
            const weaponStr = weaponItem?.strength || 0;
            const effectiveStr = p.str + weaponStr;
            // Use weapon min/max damage range if available, else flat weaponDamage.
            let baseDamage;
            if (weaponItem?.minDamage !== undefined && weaponItem?.maxDamage !== undefined) {
                baseDamage = weaponItem.minDamage + Math.floor(Math.random() * (weaponItem.maxDamage - weaponItem.minDamage + 1));
            } else {
                baseDamage = Math.max(1, p.weaponDamage || 8);
            }
            const strBonus = Math.floor(effectiveStr / 2);
            const critChance = Math.floor(p.dex / 4);
            const isCrit = Math.random() * 100 < critChance;
            // v7.17.0: dodge chance so misses are possible (sounds + narration).
            const isMiss = Math.random() * 100 < 8;
            // Elemental damage bonuses from weapon
            const elementalBonus = (weaponItem?.fireDamage || 0) + (weaponItem?.airDamage || 0) + (weaponItem?.waterDamage || 0) + (weaponItem?.earthDamage || 0);
            let damage = Math.max(1, baseDamage + strBonus + Math.floor(elementalBonus / 3) + Math.floor(Math.random() * 6));
            if (isCrit) damage *= 2;
            // Build elemental suffix for attack narration
            const elemParts = [];
            if (weaponItem?.fireDamage) elemParts.push(`🔥${weaponItem.fireDamage}`);
            if (weaponItem?.airDamage) elemParts.push(`🌪️${weaponItem.airDamage}`);
            if (weaponItem?.waterDamage) elemParts.push(`💧${weaponItem.waterDamage}`);
            if (weaponItem?.earthDamage) elemParts.push(`🌍${weaponItem.earthDamage}`);
            const elemSuffix = elemParts.length ? ` (${elemParts.join('+')})` : '';

            if (this._pro) {
                // Professional timeline: swing → hit/miss → narrate → remaining HP.
                // Apply brace BEFORE narration so the narrated damage is accurate.
                let dmg = damage;
                if (e.braceTurns > 0) { dmg = Math.max(1, Math.ceil(dmg / 2)); e.braceTurns--; }
                await this._pro.playerAttack('You', e.name, dmg, isCrit, isMiss, isMiss ? e.hp : Math.max(0, e.hp - dmg));
                if (!isMiss) { e.hp = Math.max(0, e.hp - dmg); this.updateEnemyHUD(); }
            } else {
                if (isMiss) {
                    MusicSystem.playSFX('miss');
                    this.addNarrative(`Your attack misses ${e.name}!`, 'combat');
                } else {
                    MusicSystem.playSFX('hit');
                    this.addNarrative(`You ${isCrit ? 'CRITICALLY ' : ''}attack for ${damage} damage!${elemSuffix}`, 'combat');
                }
                if (!isMiss) this.applyEnemyDamage(damage, null);
            }

            if (e.hp <= 0) {
                // A defeated monster must NOT end the round. Surviving members of
                // the group still get exactly one turn each. enemyDefeated()
                // promotes the next monster into the active slot; once that
                // transition settles, the survivors act.
                await this.enemyDefeated();
                await this.resolveSurvivorTurn();
                return;
            }
            await this.companionTurn();
            if (this.state.inCombat && this.state.enemy && this.state.enemy.hp > 0) await this.enemyAttack();
        });
    },

    /**
     * Give the surviving monsters their turn after one of them was defeated.
     *
     * enemyDefeated() promotes the next queued monster asynchronously (there is
     * a short transition delay), so this waits for the promotion to land before
     * running exactly one monster turn. Returns silently when the whole group is
     * dead, when combat already ended, or when the player has fallen.
     */
    async resolveSurvivorTurn() {
        // Guard: if the active slot still holds a corpse and nothing is queued,
        // finish the battle instead of spinning on a 0 HP enemy.
        if (this.state.inCombat && this.state.enemy && this.state.enemy.hp <= 0
            && !this.state.combatTransition
            && !(this.state.sacred?.enemyQueue || []).length) {
            // The slot holds a corpse with nothing queued. Settle the battle
            // rather than spinning. Already-settled corpses are cleared so the
            // combat state cannot get stuck.
            if (!this.state.enemy._defeatProcessed) await this.enemyDefeated();
            else { this.state.inCombat = false; this.state.enemy = null; this.finishCommandCombat?.(); }
            return;
        }
        // The next monster is promoted after a short scripted delay via
        // combatTransition. Wait for that handoff, but bind the wait to this
        // encounter so it stops instantly if combat ends or the page unloads.
        const alive = () => { try { return typeof document !== 'undefined' && !!document.getElementById; } catch { return false; } };
        const token = this._survivorWait = (this._survivorWait || 0) + 1;
        for (let i = 0; i < 80; i++) {
            if (token !== this._survivorWait) return;         // superseded
            if (!this.state.inCombat) return;                 // combat finished
            if (this.state.player?.hp <= 0) return;           // player died
            if (!alive()) return;                             // page/document gone
            if (!this.state.combatTransition && this.state.enemy && this.state.enemy.hp > 0) break;
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        if (token !== this._survivorWait || !alive()) return;
        if (!this.state.inCombat || !this.state.enemy) return;
        if (this.state.enemy.hp <= 0 || this.state.player?.hp <= 0) return;
        await this.enemyAttack();
    },

    companionTurn() {
        return this.combatSequence(async () => {
            const active = this.state.companions.filter(c => c.hp > 0).slice(0, 3);
            for (const companion of active) {
                if (!this.state.enemy || this.state.enemy.hp <= 0) break;
                if (companion.heal && this.state.player.hp < this.state.player.maxHp * 0.45) {
                    const amount = Math.min(companion.heal, this.state.player.maxHp - this.state.player.hp);
                    this.state.player.hp += amount;
                    this.addNarrative(`${companion.name} heals you for ${amount} HP.`, 'magic');
                    MusicSystem.playSFX('heal');
                } else {
                    const damage = Math.max(1, companion.attack + Math.floor(Math.random() * 5));
                    const applied = this.applyEnemyDamage(damage, null);
                    this.addNarrative(`${companion.name} strikes for ${applied} damage!`, 'combat');
                    MusicSystem.playSFX('attack');
                }
                this.updateHUD();
            }
            if (this.state.enemy && this.state.enemy.hp <= 0) await this.enemyDefeated();
        });
    },

    defend() {
        if (!this.state.inCombat) return;
        this.state.defending = true;
        this.addNarrative("You raise your guard!", 'system');
        this.enemyAttack();
    },

    enemyAttack() {
        if (!this.state.inCombat || !this.state.enemy) return;
        this.combatSequence(async () => {
            const p = this.state.player, e = this.state.enemy;
            if (!e || e.hp <= 0 || !p || p.hp <= 0) return;

            // v7.17.0 enemy AI: a wounded monster may brace (halves incoming
            // damage on its next hit) and bosses may roar (attack buff).
            const pct = e.hp / e.maxHp;
            if (pct < 0.25 && !e.braceTurns && Math.random() < 0.35) {
                e.braceTurns = 1;
                this.addNarrative(`${e.name} braces its defenses!`, 'combat');
                return; // braced monsters skip their strike this turn
            }
            if (e.boss && !e.roarActive && pct < 0.5 && Math.random() < 0.4) {
                e.roarActive = true;
                e.attack = Math.floor(e.attack * 1.25);
                this.addNarrative(`${e.name} ROARS and its attacks grow stronger!`, 'combat');
                MusicSystem.playSFX('enemy-hit');
                return;
            }

            const isMiss = Math.random() * 100 < (8 + Math.floor((p.dex || 0) / 3));
            let damage = Math.max(1, e.attack + Math.floor(Math.random() * 4) - Math.floor((p.defense || 0) / 2));
            if (this.state.defending) {
                damage = Math.max(1, Math.floor(damage * 0.5));
                this.state.defending = false;
            }

            if (this._pro) {
                await this._pro.monsterAttack(e.name, damage, isMiss, Math.max(0, p.hp - damage));
            } else if (isMiss) {
                MusicSystem.playSFX('miss');
            } else {
                MusicSystem.playSFX('enemy-hit');
            }

            if (isMiss) {
                this.addNarrative(`${e.name} attacks but you dodge the blow!`, 'combat');
            } else {
                p.hp = Math.max(0, p.hp - damage);
                this.addNarrative(`${e.name} hits you for ${damage} damage!`, 'combat');
            }

            // Enemy also strikes a companion (if any alive) with reduced damage
            const aliveCompanions = this.state.companions.filter(c => c.hp > 0);
            if (aliveCompanions.length > 0 && !isMiss && Math.random() < 0.4) {
                const target = aliveCompanions[Math.floor(Math.random() * aliveCompanions.length)];
                const compDamage = Math.max(1, Math.floor(e.attack * 0.6) + Math.floor(Math.random() * 3));
                target.hp = Math.max(0, target.hp - compDamage);
                this.addNarrative(`${e.name} also hits ${target.name} for ${compDamage} damage! (${target.name} HP: ${target.hp}/${target.maxHp})`, 'combat');
                if (target.hp <= 0) {
                    this.addNarrative(`${target.name} has fallen in battle!`, 'combat');
                }
            }

            this.updateHUD();
            if (p.hp <= 0) {
                this.gameOver();
            } else if (!this._pro) {
                this.addNarrative(this.battleStatusText(), 'system');
            }
        });
    },

    // v7.17.0 — ordered defeat sequence: defeat sounds → loot → XP → quest →
    // victory. The victory fanfare NEVER plays before loot and XP narration ends.
    enemyDefeated() {
        return this.combatSequence(async () => {
            const e = this.state.enemy;
            const p = this.state.player;
            if (!e || !p) return;

            p.xp += e.xp;
            p.gold += e.gold;
            this.state.kills++;

            // Premium currency drops (rare)
            let bonusLoot = '';
            if (e.boss || e.finalBoss) {
                // Bosses always drop diamonds
                const diamondDrop = Math.floor(Math.random() * 3) + 1;
                p.diamonds = (p.diamonds || 0) + diamondDrop;
                bonusLoot += `, 💎 +${diamondDrop} diamonds`;
            } else if (Math.random() < 0.08) {
                // 8% chance for regular enemies to drop a ruby
                p.rubies = (p.rubies || 0) + 1;
                bonusLoot += ', 💎 +1 ruby';
            } else if (Math.random() < 0.03) {
                // 3% chance for regular enemies to drop a diamond
                p.diamonds = (p.diamonds || 0) + 1;
                bonusLoot += ', 💎 +1 diamond';
            }

            if (this._pro) {
                const oldLevel = p.level;
                await this._pro.monsterDefeat(e.name);
                await this._pro.loot(e.name, e.gold > 0 ? [{ gold: e.gold }] : []);
                if (p.xp >= p.xpToNext) this.levelUp(true);
                await this._pro.experience(e.xp, p.level, oldLevel);
            } else {
                this.addNarrative(`🎉 ${e.name} defeated! +${e.xp} XP, +${e.gold} gold${bonusLoot}`, 'treasure');
                MusicSystem.playSFX('victory');
                if (p.xp >= p.xpToNext) this.levelUp();
            }

            // Check for Black Sword
            if (e.finalBoss) {
                await this.victory();
                return;
            }

            // Check quests
            this.checkQuests('kill', e.name);

            // Chance to win a companion after defeating certain enemies
            const companionChance = e.boss ? 0.25 : 0.05;
            if (Math.random() < companionChance && this.state.companions.length < 3) {
                const companionPool = [
                    { name: 'Brave Squire', attack: 14, maxHp: 80, heal: 0 },
                    { name: 'Wandering Healer', attack: 6, maxHp: 60, heal: 25 },
                    { name: 'Shadow Rogue', attack: 18, maxHp: 70, heal: 0 },
                    { name: 'Forest Ranger', attack: 15, maxHp: 85, heal: 10 }
                ];
                const newCompanion = companionPool[Math.floor(Math.random() * companionPool.length)];
                if (!this.state.companions.some(c => c.name === newCompanion.name)) {
                    const companion = { name: newCompanion.name, role: 'companion', maxHp: newCompanion.maxHp, hp: newCompanion.maxHp, attack: newCompanion.attack, heal: newCompanion.heal };
                    this.state.companions.push(companion);
                    this.state.combatGroup.push(companion.name);
                    this.addNarrative(`🎉 ${companion.name} was impressed by your victory and joined your group! (ATK: ${companion.attack}, HP: ${companion.maxHp}${companion.heal ? `, Heal: ${companion.heal}` : ''})`, 'treasure');
                }
            }

            // End combat
            this.state.inCombat = false;
            this.state.enemy = null;
            document.getElementById('combat-panel').classList.add('hidden');

            if (this._pro) await this._pro.victory();
            MusicSystem.play(this.getLocationMusic());
            this.updateHUD();
            this.save();
        });
    },

    tryFlee() {
        if (!this.state.inCombat) return;
        this.combatSequence(async () => {
            const e = this.state.enemy;
            const fleeChance = e.boss ? 0.2 : 0.5;

            if (Math.random() < fleeChance) {
                const text='You escaped the battle.';await(this.emitGameEvent?.(text,'system')||Promise.resolve(this.addNarrative(text,'system')));
                this.state.inCombat = false;
                this.state.combatTransition = false;
                this.state.enemy = null;
                this.state.encounterTargets = [];
                this.state.battleSummary = null;
                if(this.state.sacred){this.state.sacred.enemyQueue=[];this.state.sacred.encounterNonce=(this.state.sacred.encounterNonce||0)+1;}
                const panel=document.getElementById('combat-panel');if(panel){panel.hidden=true;panel.classList.add('hidden');}
                this.finishCommandCombat?.();
                await MusicSystem.endBattle({victory:false,worldContext:this.getLocationMusic()});
                this.save();
            } else {
                const text='You fail to escape.';this.emitGameEvent?.(text,'combat')||this.addNarrative(text,'combat');
                await this.enemyAttack();
            }
        });
    },

    showSpellPanel() {
        const panel = document.getElementById('spell-panel');
        panel.classList.toggle('hidden');
        document.getElementById('item-panel').classList.add('hidden');

        panel.innerHTML = '';
        this.state.player.spells.forEach(spell => {
            const costs = { 'power strike': 15, 'multi strike': 24, 'battle cry': 20, 'fireball': 25, 'ice storm': 30, 'lightning bolt': 35, 'backstab': 15, 'smoke bomb': 20, 'minor heal': 14, 'heal': 20, 'mass heal': 38, 'nature mend': 22, 'holy light': 25, 'blessing': 15, 'hammer smite': 22, 'piercing volley': 28, 'chi burst': 24, 'thorn storm': 30 };
            const cost = costs[spell.toLowerCase()] || 20;

            const btn = document.createElement('button');
            btn.className = 'spell-btn';
            btn.textContent = `${spell} (${cost} MP)`;
            btn.onclick = () => {
                this.castSpell(spell);
                panel.classList.add('hidden');
            };
            panel.appendChild(btn);
        });
    },

    showItemPanel() {
        const panel = document.getElementById('item-panel');
        panel.classList.toggle('hidden');
        document.getElementById('spell-panel').classList.add('hidden');

        panel.innerHTML = '';

        const usable = this.state.inventory.filter(i => ['heal', 'mana', 'both'].includes(i.effect));

        if (usable.length === 0) {
            panel.innerHTML = '<p class="system">No usable items.</p>';
            return;
        }

        usable.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'item-btn';
            btn.textContent = `${item.name} x${item.quantity}`;
            btn.onclick = () => {
                this.useItem(item.name);
                panel.classList.add('hidden');
                if (this.state.inCombat) {
                    this.enemyAttack();
                }
            };
            panel.appendChild(btn);
        });
    },

    levelUp(quiet) {
        const p = this.state.player;
        p.level++;
        p.xp -= p.xpToNext;
        p.xpToNext = Math.floor(p.xpToNext * 1.5);
        p.maxHp += 12;
        p.maxMp += 6;
        p.hp = p.maxHp;
        p.mp = p.maxMp;
        p.str += 1;
        p.dex += 1;
        p.int += 1;

        if (!quiet) {
            this.addNarrative(`⬆️ LEVEL UP! You are now level ${p.level}!`, 'treasure');
            MusicSystem.playSFX('levelup');
        }
    },

    // ============================================
    // QUESTS
    // ============================================

    checkQuests(type, target) {
        this.state.quests.forEach(quest => {
            quest.objectives.forEach(obj => {
                if (obj.type === type && (obj.target === target || obj.target === 'any')) {
                    obj.current = (obj.current || 0) + 1;

                    if (obj.current >= obj.count) {
                        this.completeQuest(quest);
                    }
                }
            });
        });
    },

    completeQuest(quest) {
        this.addNarrative(`📜 Quest Complete: ${quest.name}!`, 'treasure');

        if (quest.reward.xp) this.state.player.xp += quest.reward.xp;
        if (quest.reward.gold) this.state.player.gold += quest.reward.gold;

        if (quest.reward.item) {
            const itemData = WorldData.items[quest.reward.item.toLowerCase().replace(/ /g, '_')];
            if (itemData) {
                this.addItemToInventory(quest.reward.item.toLowerCase().replace(/ /g, '_'), itemData);
                this.addNarrative(`Received: ${itemData.name}!`, 'item');
            }
        }

        this.state.completedQuests.push(quest.id);
        this.state.quests = this.state.quests.filter(q => q.id !== quest.id);

        // Add next quest
        const nextQuestIndex = WorldData.quests.findIndex(q => q.id === quest.id) + 1;
        if (nextQuestIndex < WorldData.quests.length) {
            this.state.quests.push(WorldData.quests[nextQuestIndex]);
        }

        MusicSystem.playSFX('levelup');
        this.updateHUD();
    },

    // ============================================
    // SOCIAL, COMPANIONS, GUILD & SHOPS
    // ============================================

    async sendFriendRequest(name) {
        name = name.trim();
        if (!name) return;
        if (window.OnlineSystem?.ready) {
            await OnlineSystem.sendFriendRequest(name);
            await this.showSocial({background:true});
            return;
        }
        this.addNarrative('Online friends are unavailable. Open Settings to check the connection.', 'system');
    },

    acceptFriendRequest(name) {
        const request = this.state.friendRequests.find(r => r.name.toLowerCase().includes(name.trim().toLowerCase()) && r.status === 'pending');
        if (!request) { this.addNarrative('No matching incoming request.', 'system'); return; }
        request.status = 'accepted';
        if (!this.state.friends.includes(request.name)) this.state.friends.push(request.name);
        this.addNarrative(`You accepted ${request.name}'s friend request.`, 'npc');
        this.save();
    },

    rejectFriendRequest(name) {
        const request = this.state.friendRequests.find(r => r.name.toLowerCase().includes(name.trim().toLowerCase()) && r.status === 'pending');
        if (!request) { this.addNarrative('No matching incoming request.', 'system'); return; }
        request.status = 'rejected';
        this.addNarrative(`You rejected ${request.name}'s friend request.`, 'system');
        this.save();
    },

    async sendChat(name, text) {
        if (!text) { this.addNarrative('Enter a message. Use Public as the recipient for world chat.', 'system'); return; }
        if (window.OnlineSystem?.ready) {
            const sent = await OnlineSystem.sendMessage(name || 'public', text);
            if (sent) this.addNarrative(`Message sent to ${name || 'Public'}.`, 'npc');
            await this.showSocial({background:true});
            return sent;
        }
        this.addNarrative('Online chat is unavailable. Open Settings to check the connection.', 'system');
    },

    inviteCompanion(name) {
        const npcs = WorldData.npcs[this.state.location] || [];
        const npc = npcs.find(n => n.role === 'companion' && n.name.toLowerCase().includes(name.trim().toLowerCase()));
        if (!npc) { this.addNarrative('No matching recruitable companion is here.', 'system'); return; }
        if (this.state.companions.length >= 3) { this.addNarrative('Your combat group is full (maximum 3 companions).', 'system'); return; }
        if (this.state.companions.some(c => c.name === npc.name)) { this.addNarrative(`${npc.name} is already in your group.`, 'system'); return; }
        const companion = { name: npc.name, role: npc.role, maxHp: npc.maxHp || 90, hp: npc.maxHp || 90, attack: npc.attack || 12, heal: npc.heal || 0 };
        this.state.companions.push(companion);
        this.state.combatGroup.push(companion.name);
        this.addNarrative(`${companion.name} joined your combat group!`, 'treasure');
        this.save();
    },

    /**
     * Quick heal — the dashboard / quick-action button. Per spec, this should
     * always be available when allowed by game rules. It chooses the best
     * available healing source (potion in inventory, or a free temple heal if
     * the player is in a temple, or a Minor-Heal spell if the player knows
     * one and is in a safe zone), then plays a synchronized heal sound
     * and announces the new HP via the a11y layer.
     */
    quickHeal() {
        if(window.GameSpellSystem)return window.GameSpellSystem.castHealing(this);
        const p = this.state.player;
        if (!p) {
            this.addNarrative("No active hero.", 'system');
            return;
        }
        if (this.state.inCombat) {
            this.addNarrative("You can't quick-heal during combat. Use a spell, item, or flee.", 'system');
            return;
        }
        if (p.hp >= p.maxHp) {
            this.addNarrative("You are already at full health.", 'system');
            // Still announce so TalkBack users hear the state.
            this.announceForBlind(`You are at full health. HP is ${p.hp} out of ${p.maxHp}.`);
            return;
        }

        // Choose the best healing source.
        const startHp = p.hp;
        let used = null;
        // 1) Healing potion in inventory (most accessible, lowest cost).
        const potion = (p.inventory || []).find(i => i && (i.effect === 'heal' || /healing/i.test(i.name || '')));
        if (potion && potion.quantity > 0) {
            const healAmount = potion.value || 20;
            p.hp = Math.min(p.maxHp, p.hp + healAmount);
            potion.quantity -= 1;
            if (potion.quantity <= 0) {
                p.inventory = p.inventory.filter(i => i !== potion);
            }
            used = `You drink a ${potion.name || 'healing potion'}.`;
        }
        // 2) Temple heal (free, if available in the current location).
        else if (this.state.location === 'grand_temple' || /temple|shrine|altar/i.test(this.state.location || '')) {
            p.hp = p.maxHp;
            used = 'The temple restores you to full health.';
        }
        // 3) Minor-heal spell (free, if known; only in safe zones, not in dungeons/combat).
        else if ((p.spells || []).some(s => /minor heal|heal|nature mend/i.test(s))) {
            const healAmount = 18;
            p.hp = Math.min(p.maxHp, p.hp + healAmount);
            used = 'Your magic restores you.';
        }
        else {
            this.addNarrative("You have no way to heal right now. Find a temple, a healing potion, or a healing spell.", 'system');
            this.announceForBlind("No way to heal. Find a temple, a healing potion, or a healing spell.");
            return;
        }

        const restored = p.hp - startHp;
        const text = `${used} +${restored} HP. (${p.hp}/${p.maxHp})`;
        const effects = used.startsWith('You drink') ? ['drink', 'heal'] : ['heal'];
        if (this.emitGameEvent) this.emitGameEvent(text, 'item', { sfx: effects });
        else { this.addNarrative(text, 'item'); effects.forEach(effect => MusicSystem.playSFX(effect)); }
        this.announceForBlind(`Healed ${restored} HP. You now have ${p.hp} out of ${p.maxHp}.`);
        this.save();
        this.updateHUD && this.updateHUD();
    },

    /**
     * Announce a line of text for TalkBack / screen-reader users.
     * Looks for an `announce` function (set up by the a11y module) on the
     * global window or via a known property; falls back to a no-op.
     */
    announceForBlind(text) {
        try {
            if (typeof window !== 'undefined' && window.A11Y && typeof window.A11Y.announce === 'function') {
                window.A11Y.announce(text);
                return;
            }
            if (typeof window !== 'undefined' && typeof window.announce === 'function') {
                window.announce(text);
                return;
            }
        } catch (_) {}
        // Fallback: add to narrative (which TalkBack can still pick up via
        // aria-live regions in the narrative panel).
        try { this.addNarrative('🔊 ' + text, 'system'); } catch (_) {}
    },

        healAlly(name) {
        const targetName = name.trim().toLowerCase();
        const companion = this.state.companions.find(c => c.name.toLowerCase().includes(targetName));
        const isFriend = this.state.friends.find(f => f.toLowerCase().includes(targetName));
        if (!companion && !isFriend) { this.addNarrative('That friend or companion is not available.', 'system'); return; }
        if (this.state.player.mp < 15) { this.addNarrative('You need 15 MP to heal an ally.', 'system'); return; }
        this.state.player.mp -= 15;
        if (companion) companion.hp = Math.min(companion.maxHp, companion.hp + 35);
        this.addNarrative(`You heal ${companion ? companion.name : isFriend} for 35 HP.`, 'magic');
        this.updateHUD();
        this.save();
    },

    async createGuild(name) {
        if (!OnlineSystem.ready) { this.addNarrative('Online guild service is unavailable.', 'system'); return; }
        await OnlineSystem.createGuild(name);
    },

    travelTo(query) {
        const q = query.trim().toLowerCase();
        const match = Object.entries(WorldData.locations).find(([id, loc]) => id.toLowerCase() === q || loc.name.toLowerCase().includes(q));
        if (!match) { this.addNarrative('Unknown destination. Use map or world to discover locations.', 'system'); return; }
        if (this.state.player.gold < 10) { this.addNarrative('Dimensional waystone travel costs 10 rupees.', 'system'); return; }
        this.state.player.gold -= 10;
        this.addNarrative('The dimensional waystone opens. Travel costs 10 rupees.', 'magic');
        this.enterLocation(match[0]);
        this.save();
    },

    async showSocial({background=false}={}) {
        const panel=document.getElementById('social-panel'),content=document.getElementById('social-content');if(background&&panel.classList.contains('hidden'))return false;panel.classList.remove('hidden');
        if(!OnlineSystem.ready){content.innerHTML=`<p>${this.escapeHTML(OnlineSystem.status)}</p><p>Online setup must finish before real requests and chat are available.</p>`;return false;}
        if(OnlineSystem.socialRefreshInFlight){OnlineSystem.socialRefreshQueued=true;return this._socialLoadPromise||false;}
        OnlineSystem.socialRefreshInFlight=true;content.setAttribute('aria-busy','true');
        if(!background&&!content.children.length)content.innerHTML='<p>Loading secure online social data…</p>';
        const load=(async()=>{
            try{
                const [requests,messages,brotherhoodInvites,combatInvites]=await Promise.all([OnlineSystem.listFriendRequests(),OnlineSystem.listMessages(),OnlineSystem.listBrotherhoodInvites(),OnlineSystem.listCombatGroupInvites()]);
                if(panel.classList.contains('hidden'))return false;
                this._brotherhoodInvites=brotherhoodInvites;this._combatInvites=combatInvites;
                const incoming=requests.filter(r=>r.receiver_id===OnlineSystem.user.id&&r.status==='pending'),outgoing=requests.filter(r=>r.sender_id===OnlineSystem.user.id&&r.status==='pending'),accepted=requests.filter(r=>r.status==='accepted').map(r=>r.sender_id===OnlineSystem.user.id?r.receiver:r.sender).filter(Boolean),companions=this.state.companions,visibleMessages=messages.slice(-20);
                content.innerHTML=`
                    <p><strong>Public Hero Name:</strong> ${this.escapeHTML(this.state.player?.name||OnlineSystem.profile?.display_name||'Hero')}</p>
                    <p>${OnlineSystem.linked?'✅ Google linked — chat, friends, guilds and cloud identity unlocked.':'💬 Guest mode — chat is available. Link Google for friend requests, guilds and cross-device identity.'}</p>
                    <h4>Incoming requests</h4><div class="social-list">${incoming.length?incoming.map(r=>`<div class="social-row"><span>${this.escapeHTML(r.sender?.display_name||'Hero')}</span><span><button onclick="OnlineSystem.respondToRequest('${r.id}','accepted')">Accept</button> <button onclick="OnlineSystem.respondToRequest('${r.id}','rejected')">Reject</button></span></div>`).join(''):'<p>None</p>'}</div>
                    <h4>Sent Requests</h4><p>${outgoing.length?outgoing.map(r=>this.escapeHTML(r.receiver?.display_name||'Hero')).join(', '):'None pending.'}</p>
                    <h4>Friends (${accepted.length})</h4><p>${accepted.length?accepted.map(f=>this.escapeHTML(f.display_name)).join(', '):'No accepted friends yet.'}</p>
                    <h4>Brotherhood Invitations</h4>${brotherhoodInvites.length?brotherhoodInvites.map(x=>`<div class="social-row"><span>${this.escapeHTML(x.guild?.name||'Brotherhood')} from ${this.escapeHTML(x.sender?.display_name||'Hero')}</span><button onclick="OnlineSystem.respondBrotherhoodInvite('${x.id}',true);OnlineSystem.refreshOpenSocial()">Accept</button></div>`).join(''):'<p>None</p>'}
                    <h4>Combat-Group Invitations</h4>${combatInvites.length?combatInvites.map(x=>`<div class="social-row"><span>${this.escapeHTML(x.group?.name||'Combat Group')} from ${this.escapeHTML(x.sender?.display_name||'Hero')}</span><button onclick="OnlineSystem.respondCombatGroupInvite('${x.id}',true);OnlineSystem.refreshOpenSocial()">Accept</button></div>`).join(''):'<p>None</p>'}
                    <h4>Combat companions (${companions.length}/3)</h4><div class="social-list">${companions.length?companions.map(c=>`<div class="social-row"><span>${this.escapeHTML(c.name)} — ${c.hp}/${c.maxHp} HP</span><button onclick="Game.healAlly('${this.escapeHTML(this.escapeJS(c.name))}');OnlineSystem.refreshOpenSocial()">Heal</button></div>`).join(''):'<p>Invite a companion NPC in an expanded-realm village.</p>'}</div>
                    <h4>Recent direct chat</h4><p class="settings-note">Showing the latest ${visibleMessages.length} unexpired message${visibleMessages.length===1?'':'s'}.</p><div class="chat-log" role="log" aria-live="off">${visibleMessages.length?visibleMessages.map(m=>`<p>[${new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}] <span id="direct-msg-${m.id}"><strong>${this.escapeHTML(m.sender?.display_name||'Hero')} says:</strong> ${this.escapeHTML(m.body)}</span> <button onclick="OnlineSystem.speakMessageById('${m.id}')" aria-label="Listen to message from ${this.escapeHTML(m.sender?.display_name||'Hero')}">Listen</button></p>`).join(''):'<p>No messages yet.</p>'}</div>`;
                window.TranslationService?.translateDirectLog?.(visibleMessages);return true;
            }catch(error){if(!background)content.innerHTML='<p>Social data could not finish loading. Your command input remains available; try again when the connection is stable.</p>';console.warn('Social refresh:',error?.message);return false;}
            finally{content.removeAttribute('aria-busy');OnlineSystem.socialRefreshInFlight=false;}
        })();this._socialLoadPromise=load;const result=await load;this._socialLoadPromise=null;
        if(OnlineSystem.socialRefreshQueued&&!panel.classList.contains('hidden')){OnlineSystem.socialRefreshQueued=false;clearTimeout(OnlineSystem.socialRefreshTimer);OnlineSystem.socialRefreshTimer=setTimeout(()=>this.showSocial({background:true}),250);}
        return result;
    },

    async showGuild() {
        const panel = document.getElementById('guild-panel');
        const content = document.getElementById('guild-content');
        panel.classList.remove('hidden');
        if (!OnlineSystem.ready) { content.innerHTML = `<p>${this.escapeHTML(OnlineSystem.status)}</p>`; return; }
        content.innerHTML = '<p>Loading online guild…</p>';
        const memberships = await OnlineSystem.listMyGuilds();
        if (!memberships.length) {
            content.innerHTML = '<p>You are not in a guild yet. Create Dawn Guard or accept an invitation.</p>';
            return;
        }
        content.innerHTML = memberships.map(m => `<div class="stat-row"><span>Guild</span><span>${this.escapeHTML(m.guild.name)}</span></div><div class="stat-row"><span>Rank</span><span>${this.escapeHTML(m.role)}</span></div><div class="stat-row"><span>Guild Rupees</span><span>${m.guild.rupees}</span></div>`).join('') + `<h4>Companion combat group</h4><p>${this.state.combatGroup.length ? this.state.combatGroup.map(this.escapeHTML).join(', ') : 'No companions invited.'}</p>`;
    },

    showShop() {
        const panel = document.getElementById('shop-panel');
        const content = document.getElementById('shop-content');
        const loc = WorldData.locations[this.state.location];
        if (!loc.shop) content.innerHTML = '<p>There is no shop at this location.</p>';
        else {
            const stock = ExpansionData.shopStock[loc.shop] || ExpansionData.shopStock.provisions;
            content.innerHTML = `<p>${this.escapeHTML(loc.name)} ${this.escapeHTML(loc.shop)} shop — You have ${this.state.player.gold} rupees.</p>` + stock.map(s => {
                const itemName = this.escapeHTML(WorldData.items[s.id]?.name || s.id);
                const jsName = this.escapeJS(s.id);
                return `<div class="shop-row"><span>${itemName} — ${s.price} rupees each</span>`
                    + `<span class="shop-controls">`
                    + `<label for="qty-${jsName.replace(/\s+/g,'-')}" class="sr-only">Quantity</label>`
                    + `<input type="number" id="qty-${jsName.replace(/\s+/g,'-')}" class="shop-qty" min="1" max="99" value="1" style="width:50px;text-align:center;">`
                    + `<button onclick="Game.buyItemQty('${jsName}', ${s.price})">Buy</button>`
                    + `</span></div>`;
            }).join('');
        }
        panel.classList.remove('hidden');
    },

    buyItem(id, price) {
        this.buyItemQty(id, price, 1);
    },

    buyItemQty(id, price, qty) {
        // Read qty from the input in the same shop row as the clicked button
        if (qty === undefined || qty === null || qty < 1) {
            const btn = document.activeElement;
            const row = btn?.closest?.('.shop-row');
            const inp = row?.querySelector?.('.shop-qty');
            qty = inp ? Math.max(1, Math.min(99, parseInt(inp.value) || 1)) : 1;
        }
        const totalCost = price * qty;
        if (this.state.player.gold < totalCost) { this.addNarrative(`Not enough rupees. You need ${totalCost} but have ${this.state.player.gold}.`, 'system'); return; }
        const item = WorldData.items[id];
        if (!item) return;
        this.state.player.gold -= totalCost;
        // Add quantity to inventory (stack if already have it)
        const existing = this.state.inventory.find(i => i.name === item.name);
        if (existing) {
            existing.quantity += qty;
        } else {
            this.addItemToInventory(id, item);
            if (qty > 1) {
                const newItem = this.state.inventory.find(i => i.name === item.name);
                if (newItem) newItem.quantity = qty;
            }
        }
        const text = `Bought ${qty} × ${item.name} for ${totalCost} rupees.`;
        if (this.emitGameEvent) this.emitGameEvent(text, 'item', { sfx: ['coin'] });
        else { this.addNarrative(text, 'item'); MusicSystem.playSFX('coin'); }
        this.updateHUD();
        this.showShop();
        this.save();
    },

    sellItem(itemName) {
        const q = String(itemName || '').toLowerCase().trim();
        const item = (this.state.inventory || []).find(i => {
            const name = String(i?.name || '').toLowerCase();
            return name === q || name.includes(q);
        });
        if (!item) { this.addNarrative(`You don't have ${q} to sell.`, 'system'); return; }
        // Sell price is 40% of base value, or a minimum of 1 gold
        const baseValue = item.value || item.damage || item.defense || 5;
        const sellPrice = Math.max(1, Math.floor(baseValue * 0.4));
        const qty = item.quantity || 1;
        // Remove item from inventory
        if (qty <= 1) {
            this.state.inventory = this.state.inventory.filter(i => i !== item);
        } else {
            item.quantity--;
        }
        this.state.player.gold += sellPrice;
        const text = `Sold ${item.name} for ${sellPrice} gold.`;
        if (this.emitGameEvent) this.emitGameEvent(text, 'item', { sfx: ['coin'] });
        else { this.addNarrative(text, 'item'); MusicSystem.playSFX('coin'); }
        this.updateHUD();
        this.showInventory();
        this.save();
    },

    showPremiumShop() {
        const panel = document.getElementById('shop-panel');
        const content = document.getElementById('shop-content');
        const p = this.state.player;
        const premiumItems = [
            { id: 'flame blade', price: { diamonds: 2 } },
            { id: 'frost spear', price: { diamonds: 2 } },
            { id: 'thunder axe', price: { diamonds: 3 } },
            { id: 'earth shatter maul', price: { diamonds: 3 } },
            { id: 'diamond edge katana', price: { diamonds: 5 } },
            { id: 'ruby heart bow', price: { rubies: 3 } }
        ];
        content.innerHTML = `<p>💎 Premium Shop — You have ${p.diamonds || 0} 💎 diamonds, ${p.rubies || 0} 🔴 rubies</p>` +
            premiumItems.map(pi => {
                const item = WorldData.items[pi.id];
                const cost = pi.price.diamonds ? `${pi.price.diamonds} 💎` : `${pi.price.rubies} 🔴`;
                return `<div class="shop-row"><span>${this.escapeHTML(item?.name || pi.id)} — ${cost}</span><button onclick="Game.buyPremiumItem('${this.escapeJS(pi.id)}')">Buy</button></div>`;
            }).join('');
        panel.classList.remove('hidden');
    },

    buyPremiumItem(id) {
        const p = this.state.player;
        const item = WorldData.items[id];
        if (!item) return;
        const cost = item.premiumCost;
        if (!cost) { this.addNarrative('This item is not available in the premium shop.', 'system'); return; }
        if (cost.diamonds && (p.diamonds || 0) < cost.diamonds) { this.addNarrative(`Not enough diamonds. You need ${cost.diamonds} 💎.`, 'system'); return; }
        if (cost.rubies && (p.rubies || 0) < cost.rubies) { this.addNarrative(`Not enough rubies. You need ${cost.rubies} 🔴.`, 'system'); return; }
        if (cost.diamonds) p.diamonds -= cost.diamonds;
        if (cost.rubies) p.rubies -= cost.rubies;
        this.addItemToInventory(id, item);
        const costText = cost.diamonds ? `${cost.diamonds} 💎` : `${cost.rubies} 🔴`;
        this.addNarrative(`Purchased ${item.name} for ${costText}!`, 'treasure');
        MusicSystem.playSFX('coin');
        this.updateHUD();
        this.showPremiumShop();
        this.save();
    },

    escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    },

    escapeJS(value) {
        return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]/g, ' ');
    },

    // ============================================
    // UI
    // ============================================

    addNarrative(text, type = 'system') {
        const narrative = document.getElementById('narrative');
        const p = document.createElement('p');
        p.textContent = text;
        p.className = type;
        narrative.appendChild(p);
        narrative.scrollTop = narrative.scrollHeight;

        while (narrative.children.length > 40) {
            narrative.removeChild(narrative.firstChild);
        }
    },

    updateDirectionButtons(exits = {}) {
        document.querySelectorAll('.dir-btn').forEach(button => {
            const available = Boolean(exits[button.dataset.cmd]);
            button.disabled = !available;
            button.classList.toggle('available', available);
            button.setAttribute('aria-label', `${button.dataset.cmd}${available ? ', available' : ', unavailable'}`);
        });
    },

    updateHUD() {
        const p = this.state.player;
        if (!p) return;

        document.getElementById('hp').textContent = `${p.hp}/${p.maxHp}`;
        document.getElementById('mp').textContent = `${p.mp}/${p.maxMp}`;
        document.getElementById('xp').textContent = `${p.xp}/${p.xpToNext}`;
        document.getElementById('gold').textContent = p.gold;

        const loc = WorldData.locations[this.state.location];
        document.getElementById('location-name').textContent = loc?.name || 'Unknown';

        if (this.state.isMultiplayer) {
            document.getElementById('turn-info').textContent = `P${this.state.currentPlayer + 1}: ${p.name}`;
        }
    },

    showInventory() {
        const panel = document.getElementById('inventory-panel');
        const list = document.getElementById('inv-list');

        list.innerHTML = '';

        if (this.state.inventory.length === 0) {
            list.innerHTML = '<p class="system">Your inventory is empty.</p>';
            this.addNarrative('Your bag is empty.', 'system');
            window.AudioManager?.playVoice?.('Inventory opened. Your bag is empty.', { channel: 'system' });
        } else {
            const spoken = this.state.inventory.map(i => `${i.name} times ${i.quantity}`).join('; ');
            this.addNarrative(`In your bag: ${spoken}.`, 'item');
            window.AudioManager?.playVoice?.(`Inventory opened. In your bag: ${spoken}.`, { channel: 'system' });
            this.state.inventory.forEach(item => {
                const div = document.createElement('div');
                div.className = 'inv-item';
                const canEquip = ['weapon','armor','helmet','gloves','boots','accessory'].includes(item.type);
                const canEat = item.type === 'food' || item.effect === 'hunger';
                const canUse = ['heal','mana','both'].includes(item.effect);
                const safeName = this.escapeHTML(this.escapeJS(item.name));
                const primary = canEquip
                    ? `<button onclick="Game.equipItem('${safeName}')">Equip</button>`
                    : canEat ? `<button onclick="Game.useItem('${safeName}')">Eat</button>`
                    : canUse ? `<button onclick="Game.useItem('${safeName}')">Use</button>` : '';
                div.innerHTML = `<span>${this.escapeHTML(item.name)} <small>${this.escapeHTML(item.type || 'item')}</small></span>`
                    + `<span>x${item.quantity} ${primary}`
                    + `<button onclick="Game.sellItem('${safeName}')">Sell</button>`
                    + `<button onclick="Game.examineInventoryItem('${safeName}')">Examine</button>`
                    + `<button onclick="Game.showInventoryItemDetails('${safeName}')">Details</button></span>`;
                list.appendChild(div);
            });
        }

        panel.classList.remove('hidden');
    },

    showStats() {
        const panel = document.getElementById('stats-panel');
        const stats = document.getElementById('char-stats');
        const p = this.state.player;

        // Compute effective STR: base STR + weapon strength bonus.
        const weaponItem = this.state.inventory?.find(i => i.name === p.weapon && i.type === 'weapon');
        const weaponStr = weaponItem?.strength || 0;
        const effectiveStr = p.str + weaponStr;
        const strDisplay = weaponStr > 0 ? `${effectiveStr} (${p.str} base + ${weaponStr} weapon)` : `${p.str}`;

        // Build weapon line with conditional stats (only show what the weapon has).
        let weaponLine = `${p.weapon} (${p.weaponDamage || 0} damage)`;
        const wData = WorldData.items[p.weapon?.toLowerCase()] || weaponItem;
        if (wData) {
            const extras = [];
            if (wData.minDamage !== undefined) extras.push(`min ${wData.minDamage}`);
            if (wData.maxDamage !== undefined) extras.push(`max ${wData.maxDamage}`);
            if (wData.strength) extras.push(`STR +${wData.strength}`);
            if (wData.fireDamage) extras.push(`🔥 fire ${wData.fireDamage}`);
            if (wData.airDamage) extras.push(`🌪️ air ${wData.airDamage}`);
            if (wData.waterDamage) extras.push(`💧 water ${wData.waterDamage}`);
            if (wData.earthDamage) extras.push(`🌍 earth ${wData.earthDamage}`);
            if (extras.length) weaponLine = `${p.weapon} (${p.weaponDamage || 0} dmg, ${extras.join(', ')})`;
        }

        stats.innerHTML = `
            <div class="stat-row"><span>Name:</span><span>${p.name}</span></div>
            <div class="stat-row"><span>Level:</span><span>${p.level}</span></div>
            <div class="stat-row"><span>Class:</span><span>${p.class}</span></div>
            <div class="stat-row"><span>Race:</span><span>${p.race}</span></div>
            <div class="stat-row"><span>HP:</span><span>${p.hp}/${p.maxHp}</span></div>
            <div class="stat-row"><span>MP:</span><span>${p.mp}/${p.maxMp}</span></div>
            <div class="stat-row"><span>STR:</span><span>${strDisplay}</span></div>
            <div class="stat-row"><span>DEX:</span><span>${p.dex}</span></div>
            <div class="stat-row"><span>INT:</span><span>${p.int}</span></div>
            <div class="stat-row"><span>WIS:</span><span>${p.wis}</span></div>
            <div class="stat-row"><span>VIT:</span><span>${p.vit || Math.max(10, Math.floor(p.maxHp / 10))}</span></div>
            <div class="stat-row"><span>XP:</span><span>${p.xp}/${p.xpToNext}</span></div>
            <div class="stat-row"><span>Gold:</span><span>${p.gold}</span></div>
            <div class="stat-row"><span>💎 Diamonds:</span><span>${p.diamonds || 0}</span></div>
            <div class="stat-row"><span>🔴 Rubies:</span><span>${p.rubies || 0}</span></div>
            <div class="stat-row"><span>Weapon:</span><span>${weaponLine}</span></div>
            <div class="stat-row"><span>Armor:</span><span>${p.armor || 'None'} (${p.defense || 0} defense)</span></div>
            <div class="stat-row"><span>Helmet:</span><span>${p.helmet || 'None'}</span></div>
            <div class="stat-row"><span>Gloves:</span><span>${p.gloves || 'None'}</span></div>
            <div class="stat-row"><span>Boots:</span><span>${p.boots || 'None'}</span></div>
            <div class="stat-row"><span>Accessory:</span><span>${p.accessory || 'None'}</span></div>
            <div class="stat-row"><span>Active Sets:</span><span>${p.activeSets?.join(', ') || 'None'}</span></div>
            <div class="stat-row"><span>Spells:</span><span>${p.spells.join(', ')}</span></div>
        `;

        panel.classList.remove('hidden');
        
        // Speak stats for screen readers and gesture mode
        const speechText = `Character stats. ${p.name}, level ${p.level} ${p.race} ${p.class}. HP ${p.hp} of ${p.maxHp}. MP ${p.mp} of ${p.maxMp}. Strength ${p.str}${weaponStr > 0 ? ` plus ${weaponStr} from weapon` : ''}. Dexterity ${p.dex}. Intelligence ${p.int}. Wisdom ${p.wis}. ${p.weapon}. ${p.armor || 'No armor'}. Gold ${p.gold}.`;
        window.AudioManager?.playVoice?.(speechText, { channel: 'system' });
    },

    showMap() {
        const panel = document.getElementById('map-panel');
        const map = document.getElementById('world-map');

        const mapArt = `
 [40 Endless Caves]--[Northern Mountains]--[Shrine / Eagle Peak]
                           |
 [4 Forest Gates / 37 Paths]--[West Forest]--[Kaliwasch]--[Eastern Ruins]
          |                                  |  \\
 [10 Villages / 60 sites]         [30 Capital Districts] [96 Realms]
          |
 [Aurora City: 30]--[Ironspire: 30]--[Seabreeze: 30]
       |                   |                 |
 [Private Houses]   [Estate Agents]    [Private Houses]
                                             |
 [Plains]--[Rivers]--[Farms]--[Graveyards]--[Mountain Roads]--[Tundra]
       |                                                        |
 [Fishing Waters]--[Understone Tunnel / N-S Bridge]--[Stormcrown Island Forest]
                                             |
                    [Southern Swamp]--[Dungeon Entrance]
                                             |       \\
                                        [Depths] [15 Royal Dungeon Sectors]
                                             |
                                [Shadow Chamber]--[Unknown Shadow Route]

 Total: ${Object.keys(WorldData.locations).length} connected locations
        `;

        map.textContent = mapArt;
        panel.classList.remove('hidden');
    },

    showSpellBook() {
        const p = this.state.player;
        if (!p) { this.addNarrative("No active hero.", 'system'); return; }
        const spells = p.spells || [];
        const mana = p.mp || 0;
        const maxMana = p.maxMp || 0;
        const outOfCombat = {
            'minor heal': { cost: 14, desc: 'Heal yourself for ~18+ HP' },
            'heal': { cost: 20, desc: 'Stronger heal ~34+ HP' },
            'nature mend': { cost: 22, desc: 'Druid heal ~40+ HP' },
            'mass heal': { cost: 38, desc: 'Heal all companions too' },
            'holy light': { cost: 25, desc: 'Paladin heal ~35+ HP' },
            'alohomora': { cost: 20, desc: 'Unlock magical doors' },
            'open door': { cost: 10, desc: 'Open physical doors' },
            'close door': { cost: 5, desc: 'Close doors behind you' },
            'blessing': { cost: 15, desc: 'Buff yourself or companions' }
        };
        const inCombat = {
            'power strike': { cost: 15, desc: 'Physical power attack' },
            'multi strike': { cost: 24, desc: 'Multi-hit attack' },
            'fireball': { cost: 25, desc: 'Fire damage' },
            'ice storm': { cost: 30, desc: 'Ice damage' },
            'lightning bolt': { cost: 35, desc: 'Lightning damage' },
            'backstab': { cost: 15, desc: 'Sneak attack' },
            'battle cry': { cost: 20, desc: 'Buff attack power' },
            'hammer smite': { cost: 22, desc: 'Holy hammer strike' },
            'piercing volley': { cost: 28, desc: 'Arrow volley' },
            'chi burst': { cost: 24, desc: 'Monk energy blast' },
            'thorn storm': { cost: 30, desc: 'Druid thorn damage' }
        };
        let text = `📖 Spell Book — MP: ${mana}/${maxMana}\n\n`;
        text += `✨ Spells you know: ${spells.join(', ') || 'None'}\n\n`;
        text += `🏠 Out-of-combat spells (can cast anytime):\n`;
        for (const [name, info] of Object.entries(outOfCombat)) {
            if (spells.some(s => s.toLowerCase().includes(name))) {
                text += `  • ${name} (${info.cost} MP) — ${info.desc}\n`;
            }
        }
        text += `\n⚔️ Combat spells (only in battle):\n`;
        for (const [name, info] of Object.entries(inCombat)) {
            if (spells.some(s => s.toLowerCase().includes(name))) {
                text += `  • ${name} (${info.cost} MP) — ${info.desc}\n`;
            }
        }
        text += `\n💡 Type "cast [spell name]" to cast. Type "alohomora" to unlock doors.`;
        this.addNarrative(text, 'magic');
        // Speak spell book for accessibility
        const knownSpells = spells.join(', ') || 'None';
        window.AudioManager?.playVoice?.(`Spell book opened. Mana ${mana} of ${maxMana}. Spells you know: ${knownSpells}.`, { channel: 'magic' });
        // Also add alohomora to spell list if mage/paladin
        if (!spells.some(s => s.toLowerCase().includes('alohomora')) && ['mage', 'paladin', 'druid', 'monk'].includes(p.class?.toLowerCase())) {
            spells.push('Alohomora');
            p.spells = spells;
            this.addNarrative('✨ You learned Alohomora — the door unlocking spell!', 'treasure');
        }
    },

    showQuests() {
        const panel = document.getElementById('quests-panel');
        const list = document.getElementById('quest-list');

        list.innerHTML = '';

        if (this.state.quests.length === 0) {
            list.innerHTML = '<p class="system">No active quests.</p>';
        } else {
            this.state.quests.forEach(quest => {
                const div = document.createElement('div');
                div.className = 'quest-item';

                let progress = '';
                quest.objectives.forEach(obj => {
                    progress += `${obj.current || 0}/${obj.count} `;
                });

                div.innerHTML = `
                    <span class="quest-name">${quest.name}</span>
                    <span class="quest-desc">${quest.description}</span>
                    <span class="quest-progress">Progress: ${progress}</span>
                `;
                list.appendChild(div);
            });
        }

        panel.classList.remove('hidden');
    },

    showHelp() {
        this.addNarrative("=== COMMANDS ===", 'system');
        this.addNarrative("Movement: north/n, south/s, east/e, west/w", 'system');
        this.addNarrative("look - Examine surroundings", 'system');
        this.addNarrative("take [item] - Pick up item", 'system');
        this.addNarrative("use/eat [food or potion] - Restore HP or MP", 'system');
        this.addNarrative("equip [weapon/armor] - Equip swords, blunt weapons, armor or accessories", 'system');
        this.addNarrative("cast [spell] - Cast magic; Mass Heal restores the full battle group", 'system');
        this.addNarrative("attack [name] - Hunt a monster still needed for this area’s finite quest pack", 'system');
        this.addNarrative("foes - List finite quest-pack progress; random wilderness encounters can continue afterward", 'system');
        this.addNarrative("inventory/i - View inventory", 'system');
        this.addNarrative("stats - View character stats", 'system');
        this.addNarrative("map/m - View world map", 'system');
        this.addNarrative("quests/q - View quests", 'system');
        this.addNarrative("talk - Talk to NPCs", 'system');
        this.addNarrative("up/u - Enter the expanded realms from Kaliwasch", 'system');
        this.addNarrative("social/friends - Friend requests, chat and companions", 'system');
        this.addNarrative("request/accept/reject [name] - Manage friend requests", 'system');
        this.addNarrative("message [name] [text] - Send a local chat message", 'system');
        this.addNarrative("invite [companion] - Add a local NPC to your combat group", 'system');
        this.addNarrative("heal [friend/companion] - Heal an ally for 15 MP", 'system');
        this.addNarrative("guild/group - Open guild and joint combat group", 'system');
        this.addNarrative("shop - Browse the current location's shop", 'system');
        this.addNarrative("travel [location] - Dimensional travel for 10 rupees", 'system');
        this.addNarrative("world - Print expanded-world totals", 'system');
        this.addNarrative("settings/account - Copy Player ID, link Google, cloud save, or set recovery PIN", 'system');
        this.addNarrative("temple / pray [attribute] / pray revive - Blessings and divine death recovery", 'system');
        this.addNarrative("palace / palace ceremony - Required advancement after leveling", 'system');
        this.addNarrative("palace quest / train companion [name] / increase [attribute]", 'system');
        this.addNarrative("guild spells - After the Card Test: two class helpers. Palace hunt and Island hunt grant the last two plus Shark Tide", 'system');
        this.addNarrative("encounters on/off - Full or reduced forest encounters", 'system');
        this.addNarrative("storage / throw [item] / take loot [item] - Manual item management", 'system');
        this.addNarrative("enchantment shop / enchant [item] [attribute] - Permanent equipment runes", 'system');
        this.addNarrative("watch/view/examine [target] - Inspect monsters, companions, and items", 'system');
        this.addNarrative("give/take items to/from companions; sell [item]; revive hero", 'system');
        this.addNarrative("inventory weapon/armor/potion/item/gold; buy/sell [quantity] [item]", 'system');
        this.addNarrative("list; status health/skills/magic/attributes/armor; read/press/use lever", 'system');
        this.addNarrative("online heroes; create/invite brotherhood; create/invite combat group", 'system');
        this.addNarrative("mark map [note]; map notes; feedback [text]; report bug/accessibility/chat [text]", 'system');
        this.addNarrative("buy house; house status; pay house tax; storage (inside owned Storage Room)", 'system');
        this.addNarrative("shop; list shop; buy [quantity] [item]; examine/compare [item]", 'system');
        this.addNarrative("chat rooms; join room [name] - Public, French, personal, and custom rooms", 'system');
        this.addNarrative("identify/attune/unattune [artifact]; artifact journal", 'system');
        this.addNarrative("publish map Title | note; community map; delete map marker [number]", 'system');
        this.addNarrative("Voice button - Speak one command in the selected language", 'system');
        this.addNarrative("fish / fishing status - Use rod and bait at marked water locations", 'system');
        this.addNarrative("examine [monster] - Hear monster attributes and spell list", 'system');
        this.addNarrative("spell field / practice [spell] - Spend 3 MP to improve mastery", 'system');
        this.addNarrative("cast shock - Strong single-target blue-flash damage and possible stun", 'system');
        this.addNarrative("cast light orbs - 3 MP per living monster; multi-target light damage", 'system');
        this.addNarrative("heal / multiple strike / opening doors - Validated named spells with mana and cooldowns", 'system');
        this.addNarrative("attack / attack [monster] / defend / flee - Command-only battle actions; attack outside battle is rejected", 'system');
        this.addNarrative("wayfinder / distance - Miles, steps and route to city, forest and cave entrances", 'system');
        this.addNarrative("exit forest / next exit step - Walk one calculated step toward the city", 'system');
        this.addNarrative("game hall / board games - Route to accessible Ludo, Snakes, Chess, Carrom and Blackjack", 'system');
        this.addNarrative("battle prayer / take everything - Direct combat prayer and loot actions", 'system');
        this.addNarrative("search location - Discover hidden physical rewards without revealing them early", 'system');
        this.addNarrative("examine spell [name] / spellbook - MP, healing, power and efficiency", 'system');
        this.addNarrative("examine black sword locations - Show discovered lore only; secrets stay hidden", 'system');
        this.addNarrative("city directory / city map - Routes to every city landmark", 'system');
        this.addNarrative("where is/go to palace, temple, guild, tavern, park, marketplace, shop, houses, streets or gates", 'system');
        this.addNarrative("open/close door; rest in tavern; examine combat", 'system');
    },

    /**
     * Restore interactive gameplay state after any overlay/panel closes.
     * Idempotent and safe to call at any time. During combat the direction
     * buttons stay disabled by design; out of combat they are re-enabled from
     * the authoritative world graph rather than from stale DOM state.
     */
    /** Invalidate any in-flight survivor-turn wait (combat ended or reset). */
    cancelSurvivorWait() { this.state.encounterNonceLocal = (this.state.encounterNonceLocal || 0) + 1; },

    restoreGameplayControls() {
        // A genuinely open modal dialog (e.g. the first-launch interface chooser
        // or the chat community notice) must keep its focus trap. Only clear the
        // trap when no modal is actually showing.
        const modalOpen = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
            .some(dialog => !dialog.classList.contains('hidden'));
        const container = document.getElementById('game-container');
        // Keep a real modal's focus trap intact, but ALWAYS restore the movement
        // controls themselves: a stale disabled direction button is the bug we
        // are fixing and it must never survive, modal or not.
        if (container && !modalOpen) { container.inert = false; container.removeAttribute('aria-hidden'); }

        const input = document.getElementById('cmd-input');
        if (input) { input.disabled = false; input.removeAttribute('aria-busy'); }

        if (this.state.inCombat && this.state.enemy) {
            this.updateCombatActionAvailability?.();
            return;
        }
        const exits = WorldData.locations[this.state.location]?.exits || {};
        this.updateDirectionButtons(exits);
        this.updateCombatActionAvailability?.();
    },

    closePanels({ restore = true } = {}) {
        document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
        if (restore) this.restoreGameplayControls();
    },

    // ============================================
    // GAME END
    // ============================================

    gameOver() {
        MusicSystem.playSFX('death');
        const p=this.state.player;
        p.permadead=false;p.pendingTempleRevival=true;p.hp=0;p.mp=0;
        this.state.inCombat=false;this.state.enemy=null;this.state.location='grand_temple';
        this.addNarrative(`${p.name}'s spirit is called to the Grand Temple. Walk there and pray to Auralis for revival.`,'magic');
        this.save();
        setTimeout(() => {
            document.getElementById('final-stats').innerHTML = `
                <p>Mode: ${p.mode==='archo'?'Archo / Permanent Hero':p.mode==='hardcore'?'Hardcore':'Standard'}</p>
                <p>Auralis is waiting at the Grand Temple. Revival will remove 25% of eligible carried item units and report only what was lost.</p>
                <p>Level: ${p.level}</p><p>Enemies Slain: ${this.state.kills}</p><p>Quests Completed: ${this.state.completedQuests.length}</p>`;
            const retry=document.querySelector('#gameover-screen .menu-btn');if(retry){retry.disabled=false;retry.textContent='Walk Spirit to Auralis Temple';retry.onclick=()=>{this.showScreen('game-screen');this.enterLocation('grand_temple');};}
            this.showScreen('gameover-screen');
        }, 1500);
    },

    victory() {
        // The battle timeline already played the centralized victory transition;
        // do not layer a duplicate fanfare over the final announcement.
        this.addNarrative("🏆 YOU HAVE CLAIMED THE BLACK SWORD!", 'treasure');
        this.addNarrative("The realm of Kandor is saved!", 'treasure');

        setTimeout(() => {
            this.showScreen('victory-screen');
        }, 3000);
    },

    // ============================================
    // SAVE/LOAD
    // ============================================

    getSaveData() {
        return {
            player: this.state.player,
            inventory: this.state.inventory,
            location: this.state.location,
            visited: this.state.visited,
            quests: this.state.quests,
            completedQuests: this.state.completedQuests,
            kills: this.state.kills,
            slainEnemies: this.state.slainEnemies || {},
            companions: this.state.companions,
            guild: this.state.guild,
            combatGroup: this.state.combatGroup,
            racing: this.state.racing || null
        };
    },

    getCloudData() {
        const roster = this.getRoster();
        const id = this.state.activeHeroId;
        // A loaded player may only update its own existing slot. In particular,
        // after deletion there is no loaded player to leak into a sibling slot.
        if (this.state.player && id && roster.heroes[id]) {
            roster.activeHeroId = id;
            roster.heroes[id] = this.getSaveData();
        }
        return roster;
    },

    save() {
        let id = this.state.activeHeroId;
        if (!this.state.player) return false;
        let roster = this.getRoster();
        // Backward compatibility for the original single-save API and old
        // integrations: only an entirely empty roster may acquire hero_legacy.
        // A deleted active slot is never guessed from a sibling hero.
        if (!id && !Object.keys(roster.heroes).length) {
            id = 'hero_legacy';
            this.state.activeHeroId = id;
        }
        if (!id) return false;
        const saveData = this.getSaveData();
        roster = this.getRoster();
        roster.activeHeroId = id;
        roster.heroes[id] = saveData;
        const stored = this.storeRoster(roster);
        localStorage.setItem(this.state.saveKey, JSON.stringify(saveData));
        window.OnlineSystem?.saveGame?.(stored);
        document.getElementById('btn-continue').disabled = false;
        return true;
    },

    continueGame() {
        const roster = this.getRoster();
        const id = roster.activeHeroId;
        const data = id ? roster.heroes[id] : null;
        if (!id || !data?.player) {
            this.state.activeHeroId = null;
            localStorage.removeItem(this.state.saveKey);
            document.getElementById('btn-continue').disabled = true;
            this.showHeroRoster();
            return false;
        }
        this.resetHeroRuntime();
        this.state.activeHeroId = id;
        this.state.pendingHeroId = null;
        localStorage.setItem(this.state.saveKey, JSON.stringify(data));
        this.state.player = data.player;
        this.state.inventory = Array.isArray(data.inventory) ? data.inventory : [];
        this.state.location = data.location || 'kaliwasch';
        this.state.visited = Array.isArray(data.visited) ? data.visited : [this.state.location];
        this.state.quests = Array.isArray(data.quests) ? data.quests : [];
        this.state.completedQuests = Array.isArray(data.completedQuests) ? data.completedQuests : [];
        this.state.kills = data.kills || 0;
        this.state.slainEnemies = data.slainEnemies || {};
        this.state.friends = data.friends || [];
        this.state.friendRequests = data.friendRequests || [];
        this.state.companions = data.companions || [];
        this.state.messages = data.messages || [];
        this.state.guild = data.guild || null;
        this.state.combatGroup = data.combatGroup || [];
        this.state.racing = data.racing || null;
        this.state.player.armor ||= 'Traveler Clothes';
        this.state.player.defense ||= 1;
        this.state.player.spells ||= ['Minor Heal'];
        if(this.state.player.permadead){this.state.player.permadead=false;this.state.player.pendingTempleRevival=true;this.state.player.hp=0;this.state.location='grand_temple';}

        this.showScreen('game-screen');
        this.enterLocation(this.state.location);
        this.look(); // Show description when loading/continuing a hero
        window.OnlineSystem?.syncActiveHero();
        return true;
    },

    // ============================================
    // SOCIAL HUB, NOTIFICATIONS, VOICE COMMANDS
    // ============================================

    combatGroups: {},
    activeCombatGroup: null,
    pendingNotifications: { friendRequests: [], combatInvites: [], gifts: [], trades: [] },

    refreshNotifications() {
        const el = (id) => document.getElementById(id);
        const fr = el('notif-friend-requests');
        const ci = el('notif-combat-invites');
        const gi = el('notif-gifts');
        const tr = el('notif-trades');
        const n = this.pendingNotifications;
        if (fr) fr.innerHTML = n.friendRequests.length
            ? n.friendRequests.map((r, i) => `<div class="shop-row"><span>${this.escapeHTML(r.from)}</span><button onclick="Game.respondFriendRequest(${i},'accepted')">Accept</button> <button onclick="Game.respondFriendRequest(${i},'rejected')">Decline</button></div>`).join('')
            : '<p class="muted">No pending friend requests.</p>';
        if (ci) ci.innerHTML = n.combatInvites.length
            ? n.combatInvites.map((r, i) => `<div class="shop-row"><span>${this.escapeHTML(r.groupName)} (from ${this.escapeHTML(r.from)})</span><button onclick="Game.respondCombatInvite(${i},'accepted')">Accept</button> <button onclick="Game.respondCombatInvite(${i},'rejected')">Decline</button></div>`).join('')
            : '<p class="muted">No pending combat group invites.</p>';
        if (gi) gi.innerHTML = n.gifts.length
            ? n.gifts.map((g, i) => `<div class="shop-row"><span>🎁 ${this.escapeHTML(g.from)} sent ${g.gold || 0} gold${g.item ? ' + ' + this.escapeHTML(g.item) : ''}</span><button onclick="Game.acceptGift(${i})">Accept</button></div>`).join('')
            : '<p class="muted">No gifts received.</p>';
        if (tr) tr.innerHTML = n.trades.length
            ? n.trades.map((t, i) => `<div class="shop-row"><span>${this.escapeHTML(t.from)} offers ${t.gold || 0} gold${t.wants ? ' for ' + this.escapeHTML(t.wants) : ''}</span><button onclick="Game.acceptTrade(${i})">Accept</button> <button onclick="Game.rejectTrade(${i})">Decline</button></div>`).join('')
            : '<p class="muted">No pending trade requests.</p>';
    },

    respondFriendRequest(idx, status) {
        const r = this.pendingNotifications.friendRequests[idx];
        if (!r) return;
        this.addNarrative(`Friend request from ${r.from} ${status}.`, 'npc');
        this.pendingNotifications.friendRequests.splice(idx, 1);
        this.refreshNotifications();
    },

    respondCombatInvite(idx, status) {
        const r = this.pendingNotifications.combatInvites[idx];
        if (!r) return;
        if (status === 'accepted') {
            this.activeCombatGroup = r.groupId;
            this.addNarrative(`⚔️ Combat Group Invite Link Accepted! You joined "${r.groupName}". You can now fight together with ${r.from}.`, 'treasure');
        } else {
            this.addNarrative(`You declined the combat group invite from ${r.from}.`, 'system');
        }
        this.pendingNotifications.combatInvites.splice(idx, 1);
        this.refreshNotifications();
    },

    acceptGift(idx) {
        const g = this.pendingNotifications.gifts[idx];
        if (!g) return;
        if (g.gold) { this.state.player.gold += g.gold; this.addNarrative(`🎁 Accepted ${g.gold} gold from ${g.from}!`, 'treasure'); }
        if (g.item) { this.addNarrative(`🎁 Accepted ${g.item} from ${g.from}!`, 'treasure'); }
        this.pendingNotifications.gifts.splice(idx, 1);
        this.updateHUD();
        this.refreshNotifications();
        this.save();
    },

    acceptTrade(idx) {
        const t = this.pendingNotifications.trades[idx];
        if (!t) return;
        if (t.gold) { this.state.player.gold += t.gold; }
        this.addNarrative(`💰 Trade accepted! You received ${t.gold || 0} gold from ${t.from}.`, 'treasure');
        this.pendingNotifications.trades.splice(idx, 1);
        this.updateHUD();
        this.refreshNotifications();
        this.save();
    },

    rejectTrade(idx) {
        const t = this.pendingNotifications.trades[idx];
        if (!t) return;
        this.addNarrative(`Trade request from ${t.from} declined.`, 'system');
        this.pendingNotifications.trades.splice(idx, 1);
        this.refreshNotifications();
    },

    refreshHub() {
        const groupName = this.activeCombatGroup ? (this.combatGroups[this.activeCombatGroup]?.name || 'Your Group') : null;
        const manageBtn = document.getElementById('btn-hub-manage-group');
        const inviteBtn = document.getElementById('btn-hub-invite-group');
        if (manageBtn) manageBtn.style.display = groupName ? '' : 'none';
        if (inviteBtn) inviteBtn.style.display = groupName ? '' : 'none';
    },

    executeVoiceCommand(text) {
        const result = document.getElementById('voice-command-result');
        if (!text || !text.trim()) { if (result) result.textContent = 'Please type a command first.'; return; }
        const cmd = text.trim().toLowerCase();
        // Map voice-style commands to game commands
        let gameCmd = cmd;
        if (cmd.startsWith('say ') || cmd.startsWith('chat ')) {
            // NPC chat: "say hello" → "talk hello"
            gameCmd = 'talk ' + cmd.replace(/^(say|chat)\s+/, '');
        } else if (cmd.startsWith('eat ')) {
            gameCmd = 'use ' + cmd.replace(/^eat\s+/, '');
        } else if (cmd.startsWith('drink ')) {
            gameCmd = 'use ' + cmd.replace(/^drink\s+/, '');
        } else if (cmd.startsWith('go ')) {
            gameCmd = cmd.replace(/^go\s+/, '');
        }
        // Close voice panel and execute
        document.getElementById('voice-command-panel')?.classList.add('hidden');
        this.processCommand(gameCmd);
        if (result) result.textContent = `Executed: "${gameCmd}"`;
    },

    createCombatGroup(name, description) {
        if (!name || !name.trim()) { this.addNarrative('Please enter a group name.', 'system'); return; }
        const id = 'cg_' + Date.now().toString(36);
        this.combatGroups[id] = {
            id, name: name.trim(), description: (description || '').trim(),
            owner: this.state.player?.name || 'Unknown',
            members: [this.state.player?.name || 'Unknown'],
            location: this.state.location,
            createdAt: new Date().toISOString()
        };
        this.activeCombatGroup = id;
        this.addNarrative(`⚔️ Combat group "${name.trim()}" created! Use "Invite to Combat Group" to add members.`, 'treasure');
        document.getElementById('combat-group-create-dialog')?.classList.add('hidden');
    },

    showInviteCombatGroup() {
        const dialog = document.getElementById('combat-group-invite-dialog');
        const list = document.getElementById('cg-invite-list');
        const status = document.getElementById('cg-invite-status');
        if (!dialog) return;
        // Show online players at same location (simulated — in real game, this comes from OnlineSystem)
        const myLoc = this.state.location;
        const myLocName = WorldData.locations[myLoc]?.name || 'Unknown';
        // Check OnlineSystem for online heroes
        if (window.OnlineSystem?.ready && window.OnlineSystem.listOnlineHeroes) {
            window.OnlineSystem.listOnlineHeroes().then(heroes => {
                const atLocation = heroes.filter(h => h.current_location === myLocName);
                if (atLocation.length === 0) {
                    if (list) list.innerHTML = '<p class="muted">No one is online at your location right now.</p>';
                    if (status) status.textContent = `Scanned heroes at ${myLocName}.`;
                } else {
                    if (list) list.innerHTML = atLocation.map(h =>
                        `<div class="shop-row"><span>${this.escapeHTML(h.display_name)} (Lv.${h.level})</span><button onclick="Game.inviteToCombatGroup('${this.escapeJS(h.display_name)}')">Invite</button></div>`
                    ).join('');
                    if (status) status.textContent = `${atLocation.length} hero(es) online at ${myLocName}.`;
                }
            }).catch(() => {
                if (list) list.innerHTML = '<p class="muted">Could not load online heroes.</p>';
            });
        } else {
            if (list) list.innerHTML = '<p class="muted">Connect Google to see other players online.</p>';
            if (status) status.textContent = 'Guest mode — connect Google to invite players.';
        }
        dialog.classList.remove('hidden');
    },

    inviteToCombatGroup(heroName) {
        if (!this.activeCombatGroup || !this.combatGroups[this.activeCombatGroup]) {
            this.addNarrative('Create a combat group first.', 'system'); return;
        }
        const group = this.combatGroups[this.activeCombatGroup];
        // Simulate sending invite (in real game, this goes through OnlineSystem)
        this.addNarrative(`⚔️ Combat group invite sent to ${heroName} for "${group.name}".`, 'treasure');
        group.members.push(heroName);
    },

    sendTradeRequest(targetName, gold, itemName) {
        if (!targetName?.trim()) { this.addNarrative('Enter a hero name.', 'system'); return; }
        if (!gold && !itemName) { this.addNarrative('Offer gold or request an item.', 'system'); return; }
        if (gold > (this.state.player?.gold || 0)) { this.addNarrative(`You only have ${this.state.player?.gold || 0} gold.`, 'system'); return; }
        this.addNarrative(`💰 Trade request sent to ${targetName}: ${gold || 0} gold${itemName ? ' for ' + itemName : ''}.`, 'treasure');
        if (gold) this.state.player.gold -= gold;
        this.updateHUD();
        this.save();
        document.getElementById('trade-dialog')?.classList.add('hidden');
    },

    sendGift(targetName, gold, itemName) {
        if (!targetName?.trim()) { this.addNarrative('Enter a hero name.', 'system'); return; }
        if (!gold && !itemName) { this.addNarrative('Enter gold or an item to gift.', 'system'); return; }
        if (gold > (this.state.player?.gold || 0)) { this.addNarrative(`You only have ${this.state.player?.gold || 0} gold.`, 'system'); return; }
        this.addNarrative(`🎁 Gift sent to ${targetName}: ${gold || 0} gold${itemName ? ' + ' + itemName : ''}.`, 'treasure');
        if (gold) this.state.player.gold -= gold;
        this.updateHUD();
        this.save();
        document.getElementById('gift-dialog')?.classList.add('hidden');
    },

    // ============================================
    // COMBAT COMPANION DAMAGE DISPLAY
    // ============================================

    updateUI() {
        // Update music button states
        document.getElementById('btn-music').classList.toggle('active', this.state.musicEnabled);
        document.getElementById('btn-sfx').classList.toggle('active', this.state.sfxEnabled);
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    Game.init();
});

// Global export
window.Game = Game;
window.WorldData = WorldData;
window.MusicSystem = MusicSystem;
