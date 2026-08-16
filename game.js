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
        pendingHeroId: null
    },

    // ============================================
    // INITIALIZATION
    // ============================================

    init() {
        this.loadState();
        this.bindEvents();
        this.updateUI();
        window.OnlineSystem?.init();
        console.log('⚔️ The Black Sword Chronicles - Ultimate Edition loaded!');
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
        if (!roster?.heroes) roster = { version: 2, activeHeroId: null, heroes: {} };
        // Migrate the original one-hero save without deleting it.
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

    storeRoster(roster) {
        localStorage.setItem(this.state.rosterKey, JSON.stringify(roster));
    },

    startNewHero() {
        // No application/UI roster cap. The backend still owns authentication,
        // payload, rate, and resource protections for cloud saves and names.
        this.state.pendingHeroId = `hero_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
        document.getElementById('char-name').value = '';
        OnlineSystem.heroNameAvailable=null;const nameStatus=document.getElementById('hero-name-status');if(nameStatus){nameStatus.textContent='Enter at least two characters.';nameStatus.className='name-status';}
        document.querySelectorAll('.race-btn,.class-btn').forEach(b => b.classList.remove('selected'));
        document.getElementById('btn-begin').disabled = true;
        this.updateCharacterPreview();
        this.showScreen('char-screen');
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
        const roster = this.getRoster(),data=roster.heroes[id];
        if (!data) return;
        // Migrate previously fallen Hardcore heroes into the new temple-revival system.
        if(data.player?.permadead){data.player.permadead=false;data.player.pendingTempleRevival=true;data.player.hp=0;data.location='grand_temple';}
        roster.activeHeroId = id;
        this.storeRoster(roster);
        this.state.activeHeroId = id;
        localStorage.setItem(this.state.saveKey, JSON.stringify(data));
        this.continueGame();
    },

    async renameActiveHero(name) {
        name=name.trim().slice(0,20);if(name.length<2)return;
        const result=await OnlineSystem.reserveHeroName(name,this.state.activeHeroId);
        if(!result.ok){this.addNarrative(result.error.includes('already exists')?'The name already exists. Please choose another name.':result.error,'system');return;}
        this.state.player.name=name;this.addNarrative(`Your hero is now known as ${name}.`,'npc');this.save();OnlineSystem.syncActiveHero();
    },

    deleteHero(id) {
        const roster=this.getRoster(),hero=roster.heroes[id];
        if(!hero)return;
        const name=hero.player?.name||'this hero';
        if(!confirm(`Permanently delete ${name} (hero ID ${id})? This cannot be undone.`))return;
        delete roster.heroes[id];window.OnlineSystem?.releaseHeroName(id);
        if(roster.activeHeroId===id)roster.activeHeroId=Object.keys(roster.heroes)[0]||null;
        this.storeRoster(roster);this.state.activeHeroId=roster.activeHeroId;
        if(roster.activeHeroId)localStorage.setItem(this.state.saveKey,JSON.stringify(roster.heroes[roster.activeHeroId]));else localStorage.removeItem(this.state.saveKey);
        document.getElementById('btn-continue').disabled=!roster.activeHeroId;
        window.OnlineSystem?.saveGame(roster);this.showHeroRoster();
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

    generateHeroName() {
        const race = document.querySelector('.race-btn.selected')?.dataset.race || 'human';
        const cls = document.querySelector('.class-btn.selected')?.dataset.class || 'adventurer';
        const raceStarts = {
            human:['Alden','Mira','Rowan','Elara'], elf:['Ael','Lyth','Syl','Eira'], dwarf:['Brom','Dagna','Thorin','Kelda'],
            halfling:['Pip','Milo','Tilly','Nessa'], orc:['Grom','Urza','Thrak','Mogra'], gnome:['Nim','Fizz','Tink','Wren']
        };
        const classEnds = {
            warrior:['Ironheart','Stormblade'], mage:['Starweaver','Brightmind'], rogue:['Nightstep','Quickhand'], cleric:['Lightkeeper','Dawnvoice'],
            paladin:['Oathhammer','Sunshield'], ranger:['Wildpath','Greenarrow'], monk:['Stillwater','Swiftpalm'], druid:['Moonroot','Oakwhisper'],
            summoner:['Spiritcaller','Runebinder'], hunter:['Wolfeye','Hawktrack'], adventurer:['Wayfarer','Braveheart']
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
        const name=document.getElementById('char-name').value.trim(),slot=this.state.pendingHeroId||`hero_${Date.now().toString(36)}`;
        const reserved=await OnlineSystem.reserveHeroName(name,slot);
        if(!reserved.ok){const status=document.getElementById('hero-name-status');status.textContent=reserved.error.includes('already exists')?'The name already exists. Please choose another name.':reserved.error;status.className='name-status unavailable';OnlineSystem.heroNameAvailable=false;this.updateCharButton();return;}
        this.state.pendingHeroId=slot;this.createCharacter(isMulti);
    },

    createCharacter(isMulti) {
        const name = document.getElementById('char-name').value.trim();
        const race = document.querySelector('.race-btn.selected').dataset.race;
        const cls = document.querySelector('.class-btn.selected').dataset.class;
        const background = document.getElementById('char-background').value;
        const mode = document.getElementById('hero-mode').value;

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
        this.state.activeHeroId = this.state.pendingHeroId || this.state.activeHeroId || `hero_${Date.now().toString(36)}`;
        this.state.pendingHeroId = null;

        this.showScreen('game-screen');
        this.enterLocation('kaliwasch');
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

    enterLocation(locId) {
        const loc = WorldData.locations[locId];
        if (!loc) return;

        this.state.location = locId;

        if (!this.state.visited.includes(locId)) {
            this.state.visited.push(locId);
        }

        // Play location music
        MusicSystem.play(loc.music || 'tavern');

        // Display ASCII art
        this.showLocationArt(locId);

        // Show description
        this.addNarrative(loc.description, 'location');

        // Show the actual finite-world exits in a stable compass order.
        const directionOrder = ['northwest','north','northeast','west','east','southwest','south','southeast','up','down'];
        const exits = directionOrder.filter(direction => loc.exits[direction]);
        this.addNarrative(`Available directions: ${exits.length ? exits.map(d => d[0].toUpperCase() + d.slice(1)).join(', ') : 'None'}`, 'system');
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

        // Movement
        if (['north', 'n', 'south', 's', 'east', 'e', 'west', 'w', 'northeast', 'ne', 'northwest', 'nw', 'southeast', 'se', 'southwest', 'sw', 'up', 'u', 'down', 'd'].includes(c)) {
            const dirMap = { n: 'north', s: 'south', e: 'east', w: 'west', ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest', u: 'up', d: 'down' };
            this.move(dirMap[c] || c);
            return;
        }

        // Look
        if (c === 'look' || c === 'l') {
            this.look();
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

    move(direction) {
        const loc = WorldData.locations[this.state.location];
        const dest = loc?.exits?.[direction];

        if (!dest || !WorldData.locations[dest]) {
            this.addNarrative(`You cannot move ${direction} from here.`, 'system');
            MusicSystem.playSFX('explore');
            return;
        }
        // Serialize movement so rapid keyboard/voice input cannot dispatch two
        // logical moves from the same origin or produce duplicate announcements.
        if (this._movementPending) return;
        this._movementPending = true;
        MusicSystem.playSFX('explore');

        setTimeout(() => {
            try {
                const target = WorldData.locations[dest];
                if (!target) return;
                this.addNarrative(`You moved ${direction} to ${target.name}.`, 'location');
                this.enterLocation(dest);
            } finally {
                this._movementPending = false;
            }
        }, 320);
    },

    look() {
        this.showLocationArt(this.state.location);
        const loc = WorldData.locations[this.state.location];
        this.addNarrative(loc.description, 'location');
        const directionOrder = ['northwest','north','northeast','west','east','southwest','south','southeast','up','down'];
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
            this.addNarrative(`You pick up ${itemData.name}!`, 'item');
            MusicSystem.playSFX('pickup');

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

        const item = this.state.inventory.find(i =>
            i.name.toLowerCase().includes(itemName.toLowerCase())
        );

        if (!item) {
            this.addNarrative("You don't have that item.", 'system');
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

        if (item.effect === 'heal') {
            const healAmount = item.value;
            this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + healAmount);
            this.addNarrative(`You use ${item.name}. Healed ${healAmount} HP!`, 'item');
            MusicSystem.playSFX('heal');
        } else if (item.effect === 'mana') {
            const manaAmount = item.value;
            this.state.player.mp = Math.min(this.state.player.maxMp, this.state.player.mp + manaAmount);
            this.addNarrative(`You use ${item.name}. Restored ${manaAmount} MP!`, 'magic');
            MusicSystem.playSFX('heal');
        } else if (item.effect === 'both') {
            this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + item.value);
            this.state.player.mp = Math.min(this.state.player.maxMp, this.state.player.mp + item.value);
            this.addNarrative(`You eat ${item.name}. Restored ${item.value} HP and MP!`, 'item');
            MusicSystem.playSFX('heal');
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
        const item = this.state.inventory.find(i => i.name.toLowerCase().includes(String(query || '').toLowerCase()));
        if (!item) { this.addNarrative("You do not carry that item.", 'system'); return null; }
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
            this.addNarrative(`Equipped ${item.name} (${p.weaponDamage} damage).`, 'item');
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
        MusicSystem.playSFX('coin');
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
        if (!this.state.inCombat) {
            this.addNarrative("You can only cast spells in combat.", 'system');
            return;
        }
        const spell = this.state.player.spells.find(s =>
            s.toLowerCase().includes(spellName.toLowerCase())
        );

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
                MusicSystem.playSFX('magic');
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

    combatSequence(fn) {
        this._combatChain = (this._combatChain || Promise.resolve())
            .then(() => fn())
            .catch(err => console.warn('combat sequence error:', err));
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

            const baseDamage = Math.max(1, p.weaponDamage || 8);
            const strBonus = Math.floor(p.str / 2);
            const critChance = Math.floor(p.dex / 4);
            const isCrit = Math.random() * 100 < critChance;
            // v7.17.0: dodge chance so misses are possible (sounds + narration).
            const isMiss = Math.random() * 100 < 8;
            let damage = Math.max(1, baseDamage + strBonus + Math.floor(Math.random() * 6));
            if (isCrit) damage *= 2;

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
                    this.addNarrative(`You ${isCrit ? 'CRITICALLY ' : ''}attack for ${damage} damage!`, 'combat');
                }
                if (!isMiss) this.applyEnemyDamage(damage, null);
            }

            if (e.hp <= 0) { await this.enemyDefeated(); return; }
            await this.companionTurn();
            if (this.state.inCombat && this.state.enemy && this.state.enemy.hp > 0) await this.enemyAttack();
        });
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

            if (this._pro) {
                const oldLevel = p.level;
                await this._pro.monsterDefeat(e.name);
                await this._pro.loot(e.name, e.gold > 0 ? [{ gold: e.gold }] : []);
                // Level up state first so the XP narration reports the true level
                // (narration/sound handled by the professional timeline).
                if (p.xp >= p.xpToNext) this.levelUp(true);
                await this._pro.experience(e.xp, p.level, oldLevel);
            } else {
                this.addNarrative(`🎉 ${e.name} defeated! +${e.xp} XP, +${e.gold} gold`, 'treasure');
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
        this.addNarrative(`${used} +${restored} HP. (${p.hp}/${p.maxHp})`, 'item');
        MusicSystem.playSFX('heal');
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
            content.innerHTML = `<p>You are not in a guild. ${OnlineSystem.linked ? 'Create Dawn Guard or accept a future guild invitation.' : 'Link Google in Settings before creating or joining one.'}</p>`;
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
            content.innerHTML = `<p>${this.escapeHTML(loc.name)} ${this.escapeHTML(loc.shop)} shop — You have ${this.state.player.gold} rupees.</p>` + stock.map(s => `<div class="shop-row"><span>${this.escapeHTML(WorldData.items[s.id]?.name || s.id)} — ${s.price} rupees</span><button onclick="Game.buyItem('${this.escapeJS(s.id)}', ${s.price})">Buy</button></div>`).join('');
        }
        panel.classList.remove('hidden');
    },

    buyItem(id, price) {
        if (this.state.player.gold < price) { this.addNarrative('Not enough rupees.', 'system'); return; }
        const item = WorldData.items[id];
        if (!item) return;
        this.state.player.gold -= price;
        this.addItemToInventory(id, item);
        this.addNarrative(`Bought ${item.name} for ${price} rupees.`, 'item');
        this.updateHUD();
        this.showShop();
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
        } else {
            this.state.inventory.forEach(item => {
                const div = document.createElement('div');
                div.className = 'inv-item';
                const canEquip = ['weapon','armor','helmet','gloves','boots','accessory'].includes(item.type);
                const canUse = ['heal','mana','both'].includes(item.effect);
                const safeName = this.escapeHTML(this.escapeJS(item.name));
                const primary = canEquip
                    ? `<button onclick="Game.equipItem('${safeName}')">Equip</button>`
                    : canUse ? `<button onclick="Game.useItem('${safeName}')">Use</button>` : '';
                div.innerHTML = `<span>${this.escapeHTML(item.name)} <small>${this.escapeHTML(item.type || '')}</small></span>`
                    + `<span>x${item.quantity} ${primary}`
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

        stats.innerHTML = `
            <div class="stat-row"><span>Name:</span><span>${p.name}</span></div>
            <div class="stat-row"><span>Level:</span><span>${p.level}</span></div>
            <div class="stat-row"><span>Class:</span><span>${p.class}</span></div>
            <div class="stat-row"><span>Race:</span><span>${p.race}</span></div>
            <div class="stat-row"><span>HP:</span><span>${p.hp}/${p.maxHp}</span></div>
            <div class="stat-row"><span>MP:</span><span>${p.mp}/${p.maxMp}</span></div>
            <div class="stat-row"><span>STR:</span><span>${p.str}</span></div>
            <div class="stat-row"><span>DEX:</span><span>${p.dex}</span></div>
            <div class="stat-row"><span>INT:</span><span>${p.int}</span></div>
            <div class="stat-row"><span>WIS:</span><span>${p.wis}</span></div>
            <div class="stat-row"><span>VIT:</span><span>${p.vit || Math.max(10, Math.floor(p.maxHp / 10))}</span></div>
            <div class="stat-row"><span>XP:</span><span>${p.xp}/${p.xpToNext}</span></div>
            <div class="stat-row"><span>Gold:</span><span>${p.gold}</span></div>
            <div class="stat-row"><span>Weapon:</span><span>${p.weapon} (${p.weaponDamage || 0} damage)</span></div>
            <div class="stat-row"><span>Armor:</span><span>${p.armor || 'None'} (${p.defense || 0} defense)</span></div>
            <div class="stat-row"><span>Helmet:</span><span>${p.helmet || 'None'}</span></div>
            <div class="stat-row"><span>Gloves:</span><span>${p.gloves || 'None'}</span></div>
            <div class="stat-row"><span>Boots:</span><span>${p.boots || 'None'}</span></div>
            <div class="stat-row"><span>Accessory:</span><span>${p.accessory || 'None'}</span></div>
            <div class="stat-row"><span>Active Sets:</span><span>${p.activeSets?.join(', ') || 'None'}</span></div>
            <div class="stat-row"><span>Spells:</span><span>${p.spells.join(', ')}</span></div>
        `;

        panel.classList.remove('hidden');
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
        this.addNarrative("guild spells - Summoner/Hunter tutorial spell rewards", 'system');
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
    restoreGameplayControls() {
        // A genuinely open modal dialog (e.g. the first-launch interface chooser
        // or the chat community notice) must keep its focus trap. Only clear the
        // trap when no modal is actually showing.
        const modalOpen = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
            .some(dialog => !dialog.classList.contains('hidden'));
        const container = document.getElementById('game-container');
        if (container && !modalOpen) { container.inert = false; container.removeAttribute('aria-hidden'); }
        if (modalOpen) return;

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
            combatGroup: this.state.combatGroup
        };
    },

    getCloudData() {
        const roster = this.getRoster();
        if (this.state.player && this.state.activeHeroId) {
            roster.activeHeroId = this.state.activeHeroId;
            roster.heroes[this.state.activeHeroId] = this.getSaveData();
        }
        return roster;
    },

    save() {
        const saveData = this.getSaveData();
        localStorage.setItem(this.state.saveKey, JSON.stringify(saveData));
        if (this.state.activeHeroId) {
            const roster = this.getRoster();
            roster.activeHeroId = this.state.activeHeroId;
            roster.heroes[this.state.activeHeroId] = saveData;
            this.storeRoster(roster);
        }
        window.OnlineSystem?.saveGame(this.getCloudData());
        document.getElementById('btn-continue').disabled = false;
    },

    continueGame() {
        const roster = this.getRoster();
        if (roster.activeHeroId && roster.heroes[roster.activeHeroId]) {
            this.state.activeHeroId = roster.activeHeroId;
            localStorage.setItem(this.state.saveKey, JSON.stringify(roster.heroes[roster.activeHeroId]));
        }
        const saved = localStorage.getItem(this.state.saveKey);
        if (saved) {
            const data = JSON.parse(saved);
            this.state.player = data.player;
            this.state.inventory = data.inventory;
            this.state.location = data.location;
            this.state.visited = data.visited;
            this.state.quests = data.quests;
            this.state.completedQuests = data.completedQuests || [];
            this.state.kills = data.kills || 0;
            this.state.slainEnemies = data.slainEnemies || {};
            this.state.friends = data.friends || [];
            this.state.friendRequests = data.friendRequests || [];
            this.state.companions = data.companions || [];
            this.state.messages = data.messages || [];
            this.state.guild = data.guild || null;
            this.state.combatGroup = data.combatGroup || [];
            this.state.player.armor ||= 'Traveler Clothes';
            this.state.player.defense ||= 1;
            this.state.player.spells ||= ['Minor Heal'];
            if(this.state.player.permadead){this.state.player.permadead=false;this.state.player.pendingTempleRevival=true;this.state.player.hp=0;this.state.location='grand_temple';}

            this.showScreen('game-screen');
            this.enterLocation(this.state.location);
            window.OnlineSystem?.syncActiveHero();
        }
    },

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
