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
        const roster = this.getRoster();
        if (Object.keys(roster.heroes).length >= 6) {
            alert('Each account can have up to six heroes.');
            return;
        }
        this.state.pendingHeroId = `hero_${Date.now().toString(36)}`;
        document.getElementById('char-name').value = '';
        document.querySelectorAll('.race-btn,.class-btn').forEach(b => b.classList.remove('selected'));
        document.getElementById('btn-begin').disabled = true;
        this.updateCharacterPreview();
        this.showScreen('char-screen');
    },

    showHeroRoster() {
        const roster = this.getRoster();
        const container = document.getElementById('hero-roster');
        const entries = Object.entries(roster.heroes);
        container.innerHTML = entries.length ? entries.map(([id, data]) => {
            const p = data.player || {};
            const loc = WorldData.locations[data.location]?.name || data.location || 'Unknown';
            return `<article class="hero-card ${id === roster.activeHeroId ? 'active' : ''}">
                <h3>${this.escapeHTML(p.name || 'Unnamed Hero')}</h3>
                <p>${this.escapeHTML(p.race || 'Unknown')} ${this.escapeHTML(p.class || 'Adventurer')} • Level ${p.level || 1}</p>
                <p>Mode: ${p.mode === 'archo' ? 'Archo / Permanent Hero' : p.mode === 'hardcore' ? 'Hardcore / Temple Revival' : 'Standard / Temple Revival'}${p.pendingTempleRevival ? ' • Spirit awaiting Auralis' : ''}</p>
                <p>❤️ ${p.hp || 0}/${p.maxHp || 0} • ✨ ${p.mp || 0}/${p.maxMp || 0}</p>
                <p>STR ${p.str || 0} • DEX ${p.dex || 0} • INT ${p.int || 0} • WIS ${p.wis || 0}</p>
                <p>📍 ${this.escapeHTML(loc)}</p>
                <button class="menu-btn" onclick="Game.playHero('${id}')">${p.pendingTempleRevival || p.permadead ? 'Walk Spirit to Temple' : id === roster.activeHeroId ? 'Continue' : 'Play This Hero'}</button>
                <button class="menu-btn danger-btn" onclick="Game.deleteHero('${id}')">Delete Hero</button>
            </article>`;
        }).join('') : '<p class="system">No heroes yet. Create your first hero.</p>';
        document.getElementById('btn-create-another-hero').disabled = entries.length >= 6;
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

    deleteHero(id) {
        const roster=this.getRoster(),hero=roster.heroes[id];
        if(!hero)return;
        const name=hero.player?.name||'this hero';
        if(!confirm(`Permanently delete ${name}? This cannot be undone.`))return;
        delete roster.heroes[id];
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
        document.getElementById('char-name').addEventListener('input', () => {
            this.updateCharButton();
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

        document.getElementById('btn-begin').addEventListener('click', () => {
            this.createCharacter(false);
        });

        // Multiplayer
        document.getElementById('btn-start-mp').addEventListener('click', () => {
            this.createCharacter(true);
        });

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
        document.getElementById('btn-social-send').addEventListener('click', () => {
            const name = document.getElementById('social-name').value.trim();
            const message = document.getElementById('social-message').value.trim();
            if (message) this.sendChat(name || 'Public', message);
            else if (name) this.sendFriendRequest(name);
            else this.addNarrative('Enter a message for public chat or an exact hero name for a friend request.', 'system');
            document.getElementById('social-message').value = '';
            this.showSocial();
        });
        document.getElementById('btn-create-guild').addEventListener('click', async () => {
            await this.createGuild('Dawn Guard');
            this.showGuild();
        });
        document.getElementById('btn-copy-player-id').addEventListener('click', () => OnlineSystem.copyPlayerCode());
        document.getElementById('btn-link-google').addEventListener('click', () => OnlineSystem.linkGoogle());
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
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.state.screen !== 'game-screen') return;

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
        this.updateCharButton();
    },

    updateCharButton() {
        const name = document.getElementById('char-name').value.trim();
        const race = document.querySelector('.race-btn.selected');
        const cls = document.querySelector('.class-btn.selected');
        document.getElementById('btn-begin').disabled = name.length < 2 || !race || !cls;
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

        // Show only standard compass/vertical directions in a consistent order.
        const directionOrder = ['north','west','east','south','up','down'];
        const exits = directionOrder.filter(direction => loc.exits[direction]);
        this.addNarrative(`Available directions: ${exits.length ? exits.map(d => d[0].toUpperCase() + d.slice(1)).join(', ') : 'None'}`, 'system');
        this.updateDirectionButtons(loc.exits);
        if (loc.shop) this.addNarrative(`🛒 A ${loc.shop} shop is open here. Type "shop" to browse.`, 'item');
        const localNpcs = WorldData.npcs[locId] || [];
        if (localNpcs.length) this.addNarrative(`Nearby: ${localNpcs.map(n => n.name).join(', ')}. Type "talk" or "invite [name]".`, 'npc');

        // Check for random encounter
        if (!loc.safe && loc.enemies && loc.enemies.length > 0 && Math.random() > 0.5) {
            setTimeout(() => {
                const enemyName = loc.enemies[Math.floor(Math.random() * loc.enemies.length)];
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

        const c = cmd.toLowerCase().trim();

        // Movement
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

        // Attack
        if (c === 'attack' || c === 'fight') {
            this.attack();
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

        // Talk to NPC
        if (c.startsWith('talk ') || c === 'talk') {
            this.talkToNPC();
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
        const dest = loc.exits[direction];

        if (!dest) {
            this.addNarrative("You can't go that way.", 'system');
            MusicSystem.playSFX('explore');
            return;
        }

        this.addNarrative(`You travel ${direction}...`, 'system');
        MusicSystem.playSFX('explore');

        setTimeout(() => {
            this.enterLocation(dest);
        }, 500);
    },

    look() {
        this.showLocationArt(this.state.location);
        const loc = WorldData.locations[this.state.location];
        this.addNarrative(loc.description, 'location');
        const directionOrder = ['north','west','east','south','up','down'];
        const exits = directionOrder.filter(direction => loc.exits[direction]);
        this.addNarrative(`Available directions: ${exits.length ? exits.map(d => d[0].toUpperCase() + d.slice(1)).join(', ') : 'None'}`, 'system');
        this.updateDirectionButtons(loc.exits);

        if (loc.items && loc.items.length > 0) {
            this.addNarrative(`You see: ${loc.items.map(i => WorldData.items[i]?.name || i).join(', ')}`, 'item');
        }
    },

    takeItem(itemName) {
        const loc = WorldData.locations[this.state.location];

        const found = loc.items?.find(i =>
            i.toLowerCase().includes(itemName.toLowerCase()) ||
            (WorldData.items[i]?.name.toLowerCase().includes(itemName.toLowerCase()))
        );

        if (!found) {
            this.addNarrative("There's no such item here.", 'system');
            return;
        }

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
        const item = this.state.inventory.find(i =>
            i.name.toLowerCase().includes(itemName.toLowerCase())
        );

        if (!item) {
            this.addNarrative("You don't have that item.", 'system');
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

    attack() {
        const loc = WorldData.locations[this.state.location];
        if (loc.enemies && loc.enemies.length > 0) {
            const enemyName = loc.enemies[Math.floor(Math.random() * loc.enemies.length)];
            this.startCombat(enemyName);
        } else {
            this.addNarrative("There's nothing to attack here.", 'system');
        }
    },

    talkToNPC() {
        const npcs = WorldData.npcs[this.state.location];
        if (npcs && npcs.length > 0) {
            const npc = npcs[Math.floor(Math.random() * npcs.length)];
            const dialog = npc.dialog[Math.floor(Math.random() * npc.dialog.length)];
            this.addNarrative(`${npc.name} says: "${dialog}"`, 'npc');
            MusicSystem.playSFX('coin');
        } else {
            this.addNarrative("There's no one to talk to here.", 'system');
        }
    },

    castSpell(spellName) {
        if (this.state.inCombat) {
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

            // Calculate spell damage
            const baseDamage = { 'power strike': 25, 'multi strike': 42, 'battle cry': 15, 'fireball': 45, 'ice storm': 40, 'lightning bolt': 50, 'backstab': 35, 'smoke bomb': 20, 'minor heal': 18, 'heal': 34, 'mass heal': 30, 'nature mend': 40, 'holy light': 35, 'blessing': 0, 'hammer smite': 48, 'piercing volley': 46, 'chi burst': 42, 'thorn storm': 44 };
            const damage = (baseDamage[spell.toLowerCase()] || 30) + this.state.player.level * 3 + Math.floor(this.state.player.int / 3);
            const key = spell.toLowerCase();

            if (['minor heal', 'heal', 'nature mend'].includes(key)) {
                const healAmount = damage;
                this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + healAmount);
                this.addNarrative(`You cast ${spell}! Healed ${healAmount} HP!`, 'magic');
            } else if (key === 'mass heal') {
                const healAmount = damage;
                this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + healAmount);
                this.state.companions.forEach(c => { c.hp = Math.min(c.maxHp, c.hp + healAmount); });
                this.addNarrative(`You cast ${spell}! Everyone in your battle group recovers ${healAmount} HP!`, 'magic');
            } else if (key === 'multi strike') {
                const hits = [0,1,2].map(() => Math.max(1, Math.floor(damage / 3) + Math.floor(Math.random() * 5)));
                const total = hits.reduce((a,b) => a + b, 0);
                this.state.enemy.hp -= total;
                this.addNarrative(`Multi Strike lands ${hits.length} hits (${hits.join(' + ')}) for ${total} damage!`, 'combat');
            } else if (key === 'blessing') {
                this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + 20);
                this.state.player.mp = Math.min(this.state.player.maxMp, this.state.player.mp + 20);
                this.addNarrative(`You cast ${spell}! Restored HP and MP!`, 'magic');
            } else {
                this.state.enemy.hp -= damage;
                this.addNarrative(`You cast ${spell} for ${damage} damage!`, 'magic');
            }

            MusicSystem.playSFX('magic');
            this.updateHUD();

            if (this.state.enemy.hp <= 0) {
                this.enemyDefeated();
            } else {
                this.enemyAttack();
            }
        } else {
            this.addNarrative("You can only cast spells in combat.", 'system');
        }
    },

    // ============================================
    // COMBAT
    // ============================================

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
            desc: enemyData.desc
        };

        this.addNarrative(`⚔️ A ${enemyName} appears!`, 'combat');
        if (enemyData.desc) {
            this.addNarrative(enemyData.desc, 'system');
        }

        document.getElementById('combat-panel').classList.remove('hidden');
        document.getElementById('enemy-name').textContent = enemyName;
        document.getElementById('enemy-desc').textContent = enemyData.desc || '';
        this.updateEnemyHUD();

        MusicSystem.play('combat');
        MusicSystem.playSFX('attack');
    },

    updateEnemyHUD() {
        const e = this.state.enemy;
        document.getElementById('enemy-hp').textContent = `${Math.max(0, e.hp)}/${e.maxHp}`;
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

    playerAttack() {
        const p = this.state.player;
        const e = this.state.enemy;

        const baseDamage = p.weaponDamage || 8;
        const strBonus = Math.floor(p.str / 2);
        const critChance = Math.floor(p.dex / 4);
        const isCrit = Math.random() * 100 < critChance;

        let damage = baseDamage + strBonus + Math.floor(Math.random() * 6);
        if (isCrit) damage *= 2;

        e.hp -= damage;

        this.addNarrative(`You ${isCrit ? 'CRITICALLY ' : ''}attack for ${damage} damage!`, 'combat');
        MusicSystem.playSFX('hit');

        this.updateEnemyHUD();

        if (e.hp <= 0) {
            this.enemyDefeated();
        } else {
            this.companionTurn();
            if (this.state.inCombat && this.state.enemy && this.state.enemy.hp > 0) this.enemyAttack();
        }
    },

    companionTurn() {
        const active = this.state.companions.filter(c => c.hp > 0).slice(0, 3);
        active.forEach(companion => {
            if (!this.state.enemy || this.state.enemy.hp <= 0) return;
            if (companion.heal && this.state.player.hp < this.state.player.maxHp * 0.45) {
                const amount = Math.min(companion.heal, this.state.player.maxHp - this.state.player.hp);
                this.state.player.hp += amount;
                this.addNarrative(`${companion.name} heals you for ${amount} HP.`, 'magic');
            } else {
                const damage = companion.attack + Math.floor(Math.random() * 5);
                this.state.enemy.hp -= damage;
                this.addNarrative(`${companion.name} strikes for ${damage} damage!`, 'combat');
            }
        });
        this.updateHUD();
        if (this.state.enemy && this.state.enemy.hp <= 0) this.enemyDefeated();
        else if (this.state.enemy) this.updateEnemyHUD();
    },

    defend() {
        this.state.defending = true;
        this.addNarrative("You raise your guard!", 'system');
        this.enemyAttack();
    },

    enemyAttack() {
        const p = this.state.player;
        const e = this.state.enemy;

        let damage = Math.max(1, e.attack + Math.floor(Math.random() * 4) - Math.floor((p.defense || 0) / 2));
        if (this.state.defending) {
            damage = Math.floor(damage * 0.5);
            this.state.defending = false;
        }

        p.hp -= damage;
        this.addNarrative(`${e.name} attacks for ${damage} damage!`, 'combat');
        MusicSystem.playSFX('hit');

        this.updateHUD();

        if (p.hp <= 0) {
            this.gameOver();
        }
    },

    enemyDefeated() {
        const e = this.state.enemy;
        const p = this.state.player;

        p.xp += e.xp;
        p.gold += e.gold;
        this.state.kills++;

        this.addNarrative(`🎉 ${e.name} defeated! +${e.xp} XP, +${e.gold} gold`, 'treasure');
        MusicSystem.playSFX('victory');

        // Level up check
        if (p.xp >= p.xpToNext) {
            this.levelUp();
        }

        // Check for Black Sword
        if (e.finalBoss) {
            this.victory();
            return;
        }

        // Check quests
        this.checkQuests('kill', e.name);

        // End combat
        this.state.inCombat = false;
        this.state.enemy = null;
        document.getElementById('combat-panel').classList.add('hidden');

        MusicSystem.play(this.getLocationMusic());
        this.updateHUD();
        this.save();
    },

    tryFlee() {
        const e = this.state.enemy;
        const fleeChance = e.boss ? 0.2 : 0.5;

        if (Math.random() < fleeChance) {
            this.addNarrative("You escaped!", 'system');
            this.state.inCombat = false;
            this.state.enemy = null;
            document.getElementById('combat-panel').classList.add('hidden');
            MusicSystem.play(this.getLocationMusic());
        } else {
            this.addNarrative("Failed to escape!", 'system');
            this.enemyAttack();
        }
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

    levelUp() {
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

        this.addNarrative(`⬆️ LEVEL UP! You are now level ${p.level}!`, 'treasure');
        MusicSystem.playSFX('levelup');
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
            this.showSocial();
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
            this.showSocial();
            return;
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

    async showSocial() {
        const panel = document.getElementById('social-panel');
        const content = document.getElementById('social-content');
        panel.classList.remove('hidden');
        if (!OnlineSystem.ready) {
            content.innerHTML = `<p>${this.escapeHTML(OnlineSystem.status)}</p><p>Online setup must finish before real requests and chat are available.</p>`;
            return;
        }
        content.innerHTML = '<p>Loading secure online social data…</p>';
        const [requests, messages, brotherhoodInvites, combatInvites] = await Promise.all([OnlineSystem.listFriendRequests(), OnlineSystem.listMessages(), OnlineSystem.listBrotherhoodInvites(), OnlineSystem.listCombatGroupInvites()]);
        this._brotherhoodInvites=brotherhoodInvites; this._combatInvites=combatInvites;
        const incoming = requests.filter(r => r.receiver_id === OnlineSystem.user.id && r.status === 'pending');
        const outgoing = requests.filter(r => r.sender_id === OnlineSystem.user.id && r.status === 'pending');
        const accepted = requests.filter(r => r.status === 'accepted').map(r => r.sender_id === OnlineSystem.user.id ? r.receiver : r.sender).filter(Boolean);
        const companions = this.state.companions;
        content.innerHTML = `
            <p><strong>Public Hero Name:</strong> ${this.escapeHTML(this.state.player?.name || OnlineSystem.profile?.display_name || 'Hero')}</p>
            <p>${OnlineSystem.linked ? '✅ Google linked — chat, friends, guilds and cloud identity unlocked.' : '💬 Guest mode — chat is available. Link Google for friend requests, guilds and cross-device identity.'}</p>
            <h4>Incoming requests</h4>
            <div class="social-list">${incoming.length ? incoming.map(r => `<div class="social-row"><span>${this.escapeHTML(r.sender?.display_name || 'Hero')}</span><span><button onclick="OnlineSystem.respondToRequest('${r.id}','accepted')">Accept</button> <button onclick="OnlineSystem.respondToRequest('${r.id}','rejected')">Reject</button></span></div>`).join('') : '<p>None</p>'}</div>
            <h4>Sent Requests</h4><p>${outgoing.length ? outgoing.map(r => this.escapeHTML(r.receiver?.display_name||'Hero')).join(', ') : 'None pending.'}</p>
            <h4>Friends (${accepted.length})</h4><p>${accepted.length ? accepted.map(f => this.escapeHTML(f.display_name)).join(', ') : 'No accepted friends yet.'}</p>
            <h4>Brotherhood Invitations</h4>${brotherhoodInvites.length?brotherhoodInvites.map((x,i)=>`<div class="social-row"><span>${this.escapeHTML(x.guild?.name||'Brotherhood')} from ${this.escapeHTML(x.sender?.display_name||'Hero')}</span><button onclick="OnlineSystem.respondBrotherhoodInvite('${x.id}',true);Game.showSocial()">Accept</button></div>`).join(''):'<p>None</p>'}
            <h4>Combat-Group Invitations</h4>${combatInvites.length?combatInvites.map(x=>`<div class="social-row"><span>${this.escapeHTML(x.group?.name||'Combat Group')} from ${this.escapeHTML(x.sender?.display_name||'Hero')}</span><button onclick="OnlineSystem.respondCombatGroupInvite('${x.id}',true);Game.showSocial()">Accept</button></div>`).join(''):'<p>None</p>'}
            <h4>Combat companions (${companions.length}/3)</h4>
            <div class="social-list">${companions.length ? companions.map(c => `<div class="social-row"><span>${this.escapeHTML(c.name)} — ${c.hp}/${c.maxHp} HP</span><button onclick="Game.healAlly('${this.escapeHTML(this.escapeJS(c.name))}'); Game.showSocial()">Heal</button></div>`).join('') : '<p>Invite a companion NPC in an expanded-realm village.</p>'}</div>
            <h4>Recent online chat</h4><div class="chat-log">${messages.length ? messages.map(m => `<p>[${new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}] <strong>${this.escapeHTML(m.sender?.display_name || 'Hero')}</strong>${m.receiver_id ? ' privately' : ' publicly'}: ${this.escapeHTML(m.body)} <small>${this.escapeHTML(m.voice_id || 'boy-1')}</small> <button onclick="OnlineSystem.speakMessageById('${m.id}')">Listen</button></p>`).join('') : '<p>No messages yet.</p>'}</div>`;
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
                div.innerHTML = `<span>${this.escapeHTML(item.name)} <small>${this.escapeHTML(item.type || '')}</small></span><span>x${item.quantity} ${canEquip ? `<button onclick="Game.equipItem('${this.escapeHTML(this.escapeJS(item.name))}')">Equip</button>` : canUse ? `<button onclick="Game.useItem('${this.escapeHTML(this.escapeJS(item.name))}')">Use</button>` : ''}</span>`;
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
 [25 Great Forest Paths]--[West Forest]--[Kaliwasch]--[Eastern Ruins]
          |                                  |  \\
 [10 Villages / 60 sites]         [30 Capital Districts] [96 Realms]
          |
 [Aurora City: 30]--[Ironspire: 30]--[Seabreeze: 30]
       |                   |                 |
 [Private Houses]   [Estate Agents]    [Private Houses]
                                             |
 [Plains]--[Rivers]--[Farms]--[Graveyards]--[Mountain Roads]--[Tundra]
                                             |
                    [Southern Swamp]--[Dungeon Entrance]
                                             |       \\
                                        [Depths] [15 Royal Dungeon Sectors]

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
        this.addNarrative("attack - Start combat", 'system');
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
        this.addNarrative("mark map [note]; map notes; feedback [text]; report bug [text]", 'system');
        this.addNarrative("buy house; house status; pay house tax; storage (inside owned Storage Room)", 'system');
        this.addNarrative("shop; list shop; buy [quantity] [item]; examine/compare [item]", 'system');
        this.addNarrative("chat rooms; join room [name] - Public, French, personal, and custom rooms", 'system');
    },

    closePanels() {
        document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
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
        MusicSystem.playSFX('victory');
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
