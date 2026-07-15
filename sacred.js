/**
 * Sacred Realms expansion: Auralis temple, palace progression, monster pools,
 * secure ID+PIN progress recovery, manual loot/storage and advanced classes.
 */
(() => {
    const GOD = 'Auralis, Keeper of the Five Flames';
    const FOREST_MONSTERS = [
        ['briar goblin',16,5],['moss goblin',18,6],['thorn goblin',20,7],['young forest orc',25,8],
        ['wildwood orc',30,10],['needle spider',10,4],['amber spider',14,5],['moon spider',19,7],
        ['gray wolf pup',12,5],['redwood wolf',22,8],['dire fox',15,6],['razor boar',28,9],
        ['vine serpent',17,7],['grove imp',13,6],['bark skeleton',24,8],['pollen wisp',11,7],
        ['root crawler',21,8],['hollow bandit',26,9],['mushroom brute',29,9],['forest shade',30,10]
    ];

    WorldData.locations.grand_temple = {
        name: 'Grand Temple of Auralis', safe: true, music: 'temple', enemies: [], items: [],
        exits: { west: 'kaliwasch_district_9' }, features: ['altar of five flames','prayer circle','blessing font'],
        description: `Five colored flames illuminate the Grand Temple. ${GOD} listens to sincere prayers and rewards faithful heroes with divine attributes.`
    };
    WorldData.locations.royal_palace = {
        name: 'Royal Palace of Kandor', safe: true, music: 'palace', enemies: [], items: [],
        exits: { west: 'kaliwasch_district_11' }, features: ['royal quest board','companion academy','hall of attributes'],
        description: 'The Royal Palace issues quests to every hero. The Companion Academy trains loyal allies whenever their hero earns a new level.'
    };
    WorldData.locations.arcane_enchantery = {
        name: 'The Five-Runes Enchantery', safe: true, music: 'dungeon', enemies: [], items: [],
        exits: { west: 'kaliwasch_district_17' }, features: ['rune forge','magic-point font','weapon appraisal desk'],
        description: 'Runes of strength, dexterity, intelligence, wisdom, health, and magic circle a smokeless forge. Enchanter Selvara can bind permanent bonuses to equipment.'
    };
    WorldData.locations.kaliwasch.features.push('Grand Temple of Auralis','Royal Palace','Five-Runes Enchantery');
    // Landmarks are physical map locations, reached by walking through city districts.
    WorldData.locations.kaliwasch_district_9.exits.east='grand_temple';
    WorldData.locations.kaliwasch_district_11.exits.east='royal_palace';
    WorldData.locations.kaliwasch_district_17.exits.east='arcane_enchantery';

    FOREST_MONSTERS.forEach(([name,hp,attack], i) => {
        WorldData.enemies[name] = {
            hp, attack, xp: 10 + i * 2, gold: 5 + i,
            magic: 10 + (i % 6) * 4, str: 10 + (i % 5) * 5, dex: 10 + (i % 7) * 3,
            defense: 10 + (i % 4) * 5, weaponDamage: 10 + (i % 5) * 4,
            desc: `${name} — HP ${hp}, magic ${10 + (i%6)*4}, strength ${10 + (i%5)*5}, defense ${10 + (i%4)*5}.`
        };
    });
    WorldData.locations.forest.enemies = FOREST_MONSTERS.map(m => m[0]);

    // Every weapon carries a broad 50–300 attribute profile as requested.
    Object.values(WorldData.items).filter(i => i.type === 'weapon').forEach((item, i) => {
        const seed = Math.min(250, 50 + i * 7);
        item.damage = Math.max(50, Math.min(300, item.damage || seed));
        item.str = item.str || Math.min(300, seed + 10);
        item.dex = item.dex || Math.min(300, seed + 5);
        item.int = item.int || Math.min(300, seed);
        item.wis = item.wis || Math.min(300, seed);
        item.hp = item.hp || Math.min(300, seed + 20);
        item.mp = item.mp || Math.min(300, seed + 15);
    });
    const blackSword = {
        name:'THE BLACK SWORD', type:'weapon', weaponType:'sharp', damage:300,
        str:250,dex:220,int:180,wis:180,hp:300,mp:200,legendary:true,
        desc:'A sharp legendary blade. Damage 300; STR 250; DEX 220; INT 180; WIS 180; HP 300; MP 200.'
    };
    WorldData.items['black sword'] = blackSword;
    WorldData.items['THE BLACK SWORD'] = blackSword;
    WorldData.items['black stick'] = {
        name:'Black Stick', type:'weapon', weaponType:'blunt', damage:210,
        str:230,dex:150,int:200,wis:240,hp:260,mp:220,legendary:true,
        desc:'A blunt relic of compressed shadow wood. Damage 210; STR 230; DEX 150; INT 200; WIS 240; HP 260; MP 220.'
    };

    const defaults = () => ({
        god:GOD, favor:0, lastPrayer:0, lastDailyBlessing:0, createdAt:Date.now(),
        guildTraining:false, cardTestPassed:false, cardTestQuestion:null, encounterMode:'full', movesSinceEncounter:3, pendingPalaceAdvancements:0, companionTrainingPoints:0,
        unspentAttributePoints:0, storage:[], groundLoot:[], vitality:10, enemyQueue:[]
    });
    const ensure = game => {
        game.state.sacred = Object.assign(defaults(), game.state.sacred || {});
        const p = game.state.player;
        if (p) {
            p.vit = p.vit || Math.max(10, Math.floor(p.maxHp / 10));
            p.spells ||= [];
            ['Minor Heal','Multi Strike','Alohomora','Emerald Lifestrike'].forEach(s => { if (!p.spells.includes(s)) p.spells.push(s); });
        }
        return game.state.sacred;
    };

    // Add recovery and storage UI without another HTML dependency.
    const titleMenu = document.querySelector('#title-screen .menu-buttons');
    titleMenu.insertAdjacentHTML('beforeend', '<button id="btn-id-recovery" class="menu-btn">🔐 Continue with Player ID + PIN</button>');
    document.getElementById('title-screen').insertAdjacentHTML('afterend', `
      <div id="recovery-screen" class="screen"><h2>🔐 Restore Hero Progress</h2>
        <div class="char-form"><div class="form-group"><label for="recover-player-id">Player ID</label><input id="recover-player-id" placeholder="KND-XXXX-XXXX"></div>
        <div class="form-group"><label for="recover-pin">6-digit secret PIN</label><input id="recover-pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••••"></div>
        <p id="recovery-status" class="settings-note">This restores hero progress only. Your PIN is verified securely; its hash is never exposed.</p></div>
        <button id="btn-recover-progress" class="menu-btn big-btn primary">Restore Progress</button>
        <button class="menu-btn back-btn" data-screen="title-screen" onclick="Game.showScreen('title-screen')">← Back</button></div>`);
    document.querySelector('.settings-card').insertAdjacentHTML('beforeend', `
      <hr><label for="recovery-pin-setting">Create/change 6-digit recovery PIN</label>
      <input id="recovery-pin-setting" type="password" inputmode="numeric" maxlength="6" placeholder="6 digits">
      <button id="btn-set-recovery-pin" class="menu-btn">🔐 Save Recovery PIN</button>`);
    document.getElementById('game-screen').insertAdjacentHTML('beforeend', `
      <div id="storage-panel" class="panel hidden" aria-label="Item storage and ground loot"><h3>📦 Item Storage & Ground Loot</h3><div id="storage-content"></div><button class="menu-btn close-btn" onclick="this.parentElement.classList.add('hidden')">Close</button></div>`);

    const oldCreate = Game.createCharacter.bind(Game);
    Game.createCharacter = function(isMulti) {
        oldCreate(isMulti);
        this.state.sacred = defaults();
        ensure(this);
        this.save();
    };
    const oldGetSave = Game.getSaveData.bind(Game);
    Game.getSaveData = function() {
        ensure(this);
        return { ...oldGetSave(), sacred:this.state.sacred };
    };
    const oldContinue = Game.continueGame.bind(Game);
    Game.continueGame = function() {
        let data = null;
        try {
            const roster=this.getRoster(); data=roster.heroes[roster.activeHeroId] || JSON.parse(localStorage.getItem(this.state.saveKey));
        } catch {}
        oldContinue();
        this.state.sacred = Object.assign(defaults(), data?.sacred || {});
        ensure(this);
    };
    const oldLevelUp = Game.levelUp.bind(Game);
    Game.levelUp = function() {
        oldLevelUp();
        const s=ensure(this), p=this.state.player;
        p.str+=2; p.dex+=2; p.int+=2; // original already added one: total +3
        p.wis+=3; p.vit=(p.vit||10)+3;
        s.pendingPalaceAdvancements++;
        this.addNarrative('All five core attributes increased by 3. You must now visit the Royal Palace for an advancement ceremony, bonus attribute, and companion training point.', 'treasure');
        this.save();
    };

    const oldEquip = Game.equipItem.bind(Game);
    Game.equipItem = function(name) {
        const item=this.state.inventory.find(i=>i.name.toLowerCase().includes(name.toLowerCase()));
        if (!item) return oldEquip(name);
        const p=this.state.player, slot=item.type;
        p.equipmentBonuses ||= {};
        const previous=p.equipmentBonuses[slot];
        if (previous) ['str','dex','int','wis'].forEach(k=>p[k]-=previous[k]||0);
        if (previous) { p.maxHp-=previous.hp||0; p.maxMp-=previous.mp||0; }
        oldEquip(name);
        if (['weapon','armor','accessory'].includes(slot)) {
            const bonus={str:item.str||0,dex:item.dex||0,int:item.int||0,wis:item.wis||0,hp:item.hp||0,mp:item.mp||0};
            ['str','dex','int','wis'].forEach(k=>p[k]+=bonus[k]); p.maxHp+=bonus.hp; p.maxMp+=bonus.mp;
            p.hp=Math.min(p.maxHp,p.hp+bonus.hp); p.mp=Math.min(p.maxMp,p.mp+bonus.mp); p.equipmentBonuses[slot]=bonus;
            this.addNarrative(`${item.name} grants STR +${bonus.str}, DEX +${bonus.dex}, INT +${bonus.int}, WIS +${bonus.wis}, HP +${bonus.hp}, MP +${bonus.mp}.`, 'treasure');
            this.updateHUD(); this.save();
        }
    };

    Game.walkToLandmark=function(target,entry,label,route){
        if(this.state.location===target){this.showSacredActions();return;}
        if(this.state.location===entry){this.move('up');return;}
        this.addNarrative(`${label} is a physical location. From Kaliwasch: ${route}, then Up through its door. No dashboard shortcut is available.`,'location');
    };
    Game.goTemple = function(){ this.walkToLandmark('grand_temple','kaliwasch_district_9','Grand Temple of Auralis','Down, East three times, South'); };
    Game.goPalace = function(){ this.walkToLandmark('royal_palace','kaliwasch_district_11','Royal Palace','Down, South twice'); };
    Game.goEnchantery = function(){ this.walkToLandmark('arcane_enchantery','kaliwasch_district_17','Five-Runes Enchantery','Down, South three times, East'); };
    Game.showSacredActions = function() {
        if (this.state.location==='grand_temple') this.addNarrative(this.state.player?.pendingTempleRevival?`🙏 ${GOD} is ready to revive your spirit. Type "pray" or "pray revive".`:`🙏 Pray to ${GOD}: type "pray" or "pray strength/dexterity/intelligence/wisdom/health/magic".`, 'magic');
        if (this.state.location==='royal_palace') this.addNarrative('🏰 Type "palace ceremony", "palace quest", "train companion [name]", or "increase [attribute]".', 'system');
        if (this.state.location==='arcane_enchantery') this.addNarrative('✨ Type "enchantments" to browse or "enchant [item] [strength/dexterity/intelligence/wisdom/health/magic]".', 'magic');
    };
    Game.showEnchantments = function() {
        if (this.state.location!=='arcane_enchantery') { this.addNarrative('Visit the Five-Runes Enchantery first. Type "enchantment shop".', 'system'); return; }
        const content=document.getElementById('shop-content');
        const gear=this.state.inventory.filter(i=>['weapon','armor','accessory'].includes(i.type));
        content.innerHTML=`<p>Enchanter Selvara permanently strengthens equipment. Each rune starts at 100 rupees and rises with prior enchantments.</p>${gear.length?gear.map(i=>`<div class="enchant-card"><strong>${this.escapeHTML(i.name)}</strong><small>${this.escapeHTML(i.desc||'')}</small><div>${['strength','dexterity','intelligence','wisdom','health','magic'].map(a=>`<button onclick="Game.enchantItem('${this.escapeHTML(this.escapeJS(i.id))}','${a}')">+ ${a}</button>`).join('')}</div></div>`).join(''):'<p>Carry a weapon, armor, or accessory to enchant it.</p>'}`;
        document.getElementById('shop-panel').classList.remove('hidden');
    };
    Game.enchantItem = function(query, attribute) {
        if (this.state.location!=='arcane_enchantery') { this.addNarrative('Enchantments are available only at the Five-Runes Enchantery.', 'system'); return; }
        const item=this.state.inventory.find(i=>i.id===query||i.name.toLowerCase().includes(query.toLowerCase()));
        if(!item||!['weapon','armor','accessory'].includes(item.type)){this.addNarrative('Matching equipment was not found.','system');return;}
        const map={strength:'str',dexterity:'dex',intelligence:'int',wisdom:'wis',health:'hp',magic:'mp'},key=map[attribute];
        if(!key){this.addNarrative('Choose strength, dexterity, intelligence, wisdom, health, or magic.','system');return;}
        item.enchantments ||= {}; const total=Object.values(item.enchantments).reduce((a,b)=>a+b,0); const cost=100+total*75;
        if(this.state.player.gold<cost){this.addNarrative(`This rune costs ${cost} rupees. You do not have enough.`, 'system');return;}
        this.state.player.gold-=cost; item.enchantments[key]=(item.enchantments[key]||0)+1; const amount=['hp','mp'].includes(key)?15:10; item[key]=(item[key]||0)+amount;
        const p=this.state.player, equipped=[p.weapon,p.armor,p.accessory].includes(item.name);
        if(equipped){if(key==='hp'){p.maxHp+=amount;p.hp+=amount;}else if(key==='mp'){p.maxMp+=amount;p.mp+=amount;}else p[key]+=amount;}
        this.addNarrative(`✨ Selvara binds ${attribute} +${amount} to ${item.name} for ${cost} rupees.`, 'green-light');MusicSystem.playSFX('magic');this.updateHUD();this.save();this.showEnchantments();
    };
    Game.divineRevive=function(){
        const p=this.state.player;if(this.state.location!=='grand_temple'){this.addNarrative('Your spirit must reach the Grand Temple first.','system');return;}if(!p.pendingTempleRevival){this.addNarrative(`${p.name} does not need divine revival.`,'system');return;}
        const equipped=new Set([p.weapon,p.armor,p.helmet,p.gloves,p.boots,p.accessory].filter(Boolean));
        const eligible=this.state.inventory.filter(i=>i.quantity>0&&i.type!=='quest'&&!i.legendary&&!equipped.has(i.name));
        const units=eligible.reduce((n,i)=>n+i.quantity,0),removeCount=units?Math.max(1,Math.ceil(units*.25)):0,lost={};
        for(let n=0;n<removeCount;n++){const available=eligible.filter(i=>i.quantity>0);if(!available.length)break;const item=available[Math.floor(Math.random()*available.length)];item.quantity--;lost[item.name]=(lost[item.name]||0)+1;}
        this.state.inventory=this.state.inventory.filter(i=>i.quantity>0);
        const fraction=p.mode==='archo'?1:(p.mode==='hardcore'?0.25:0.5);p.hp=Math.max(1,Math.ceil(p.maxHp*fraction));p.mp=Math.ceil(p.maxMp*fraction);p.pendingTempleRevival=false;p.permadead=false;
        const lostText=Object.entries(lost).map(([name,count])=>`${name} x${count}`).join(', ');
        this.addNarrative(`Auralis revives ${p.name}.`,'green-light');
        this.addNarrative(lostText?`Missing from inventory: ${lostText}.`:'Missing from inventory: nothing. No eligible carried items were available.','item');
        MusicSystem.playSFX('heal');this.updateHUD();this.save();
    };
    Game.pray = function(choice='') {
        if (this.state.location!=='grand_temple') { this.addNarrative('Travel to the Grand Temple first. Type "temple".', 'system'); return; }
        if(this.state.player?.pendingTempleRevival){this.divineRevive();return;}
        const s=ensure(this), now=Date.now();
        if (now-s.lastPrayer >= 60*60*1000) { s.favor++; s.lastPrayer=now; this.addNarrative(`${GOD} receives your prayer. Divine favor is now ${s.favor}.`, 'green-light'); }
        else this.addNarrative(`${GOD} hears you, but favor can increase only once per hour.`, 'magic');
        const dailyReady=now-s.createdAt>=24*60*60*1000 && now-s.lastDailyBlessing>=24*60*60*1000;
        if (!dailyReady) {
            const remaining=Math.ceil(Math.max(0,24*60*60*1000-(now-s.createdAt))/(60*60*1000));
            this.addNarrative(`The first Five-Flame blessing becomes available after one day${remaining ? ` (about ${remaining} hours remaining)` : ''}.`, 'system'); this.save(); return;
        }
        const key=choice.toLowerCase();
        const aliases={strength:'str',dexterity:'dex',intelligence:'int',wisdom:'wis',health:'health',magic:'magic','magic points':'magic',mp:'magic'};
        if (!aliases[key]) { this.addNarrative('Auralis offers one daily attribute: strength, dexterity, intelligence, wisdom, health, or magic points. Type "pray [attribute]".', 'green-light'); return; }
        if (aliases[key]==='health') { this.state.player.maxHp+=5; this.state.player.hp+=5; }
        else if (aliases[key]==='magic') { this.state.player.maxMp+=5; this.state.player.mp+=5; }
        else this.state.player[aliases[key]]+=1;
        s.lastDailyBlessing=now; this.addNarrative(`${GOD} grants your daily ${key} blessing!`, 'green-light'); this.updateHUD(); this.save();
    };
    Game.palaceCeremony = function() {
        if (this.state.location!=='royal_palace') { this.addNarrative('Advancement ceremonies take place only at the Royal Palace. Type "palace".', 'system'); return; }
        const s=ensure(this), p=this.state.player;
        if(s.pendingPalaceAdvancements<1){this.addNarrative('No advancement ceremony is pending. Earn another hero level first.','system');return;}
        s.pendingPalaceAdvancements--;s.unspentAttributePoints++;s.companionTrainingPoints++;
        p.hp=p.maxHp;p.mp=p.maxMp;this.state.companions.forEach(c=>{c.hp=c.maxHp;});
        this.addNarrative(`The Royal Court recognizes ${p.name} at level ${p.level}. Hero and companions are restored; one Palace attribute choice and one companion training point are unlocked.`,'treasure');
        MusicSystem.playSFX('levelup');this.updateHUD();this.save();
    };
    Game.palaceQuest = function() {
        if (this.state.location!=='royal_palace') { this.addNarrative('Go to the Royal Palace first. Type "palace".', 'system'); return; }
        if (!this.state.quests.some(q=>q.id==='royal_hunt') && !this.state.completedQuests.includes('royal_hunt')) {
            this.state.quests.push({id:'royal_hunt',name:'Royal Forest Hunt',description:'Defeat five forest monsters for the Crown.',objectives:[{type:'kill',target:'any',count:5,current:0}],reward:{xp:250,gold:180}});
            this.addNarrative('The Palace grants the Royal Forest Hunt quest.', 'treasure'); this.save();
        } else this.addNarrative('You already received the current Palace quest.', 'system');
    };
    Game.trainCompanionAtPalace = function(name) {
        if (this.state.location!=='royal_palace') { this.addNarrative('Companion training is available only in the Palace.', 'system'); return; }
        const s=ensure(this), c=this.state.companions.find(x=>x.name.toLowerCase().includes(name.toLowerCase()));
        if (!c) { this.addNarrative('Companion not found.', 'system'); return; }
        if (s.companionTrainingPoints<1) { this.addNarrative('Earn another hero level to receive a companion training point.', 'system'); return; }
        s.companionTrainingPoints--; c.level=(c.level||1)+1; c.maxHp+=15; c.hp=c.maxHp; c.attack+=4; c.heal=(c.heal||0)+3;
        this.addNarrative(`${c.name} reaches companion level ${c.level}! HP, attack and healing increased.`, 'treasure'); this.save();
    };
    Game.increaseAttribute = function(choice) {
        if (this.state.location!=='royal_palace') { this.addNarrative('Choose the bonus attribute in the Palace.', 'system'); return; }
        const s=ensure(this), map={strength:'str',dexterity:'dex',intelligence:'int',wisdom:'wis',vitality:'vit',health:'health'}; const k=map[choice.toLowerCase()];
        if (!k) { this.addNarrative('Choose strength, dexterity, intelligence, wisdom, vitality, or health.', 'system'); return; }
        if (s.unspentAttributePoints<1) { this.addNarrative('No Palace attribute points are available. Level up first.', 'system'); return; }
        if(k==='health'){this.state.player.maxHp+=5;this.state.player.hp+=5;}else this.state.player[k]=(this.state.player[k]||0)+1;
        s.unspentAttributePoints--; this.addNarrative(`Palace bonus applied to ${choice}.`, 'treasure'); this.save();
    };
    const CLASS_GUILD_SPELLS={
        warrior:['Double Strike','Trial Spell'], mage:['Abra Catabra','Survey Guardia'], summoner:['Supplica','Hocus Pocus'], hunter:['Twin Shot','Hunter’s Remedy'],
        rogue:['Shadow Dance','Venom Arc'], cleric:['Radiant Choir','Sanctuary'], paladin:['Judgment Hammer','Sacred Guard'], ranger:['Piercing Volley','Nature Mend'],
        monk:['Chi Burst','Inner Sanctuary'], druid:['Thorn Storm','Moonwell']
    };
    Game.startCardTest=function(){const s=ensure(this);if(this.state.location!=='kaliwasch'){this.addNarrative('Take the Card Test in the Kaliwasch Guild Hall.','system');return;}if(!this.state.completedQuests.includes('tutorial')){this.addNarrative('Finish the tutorial before taking the Card Test.','system');return;}if(s.cardTestPassed){this.addNarrative('You already passed the Guild Card Test. Type "guild spells".','system');return;}s.cardTestQuestion='map';this.addNarrative('Guild Card Test: I contain cities but no houses, forests but no trees, and rivers but no water. What am I? Type "answer [word]".','npc');this.save();};
    Game.answerCardTest=function(answer){const s=ensure(this);if(!s.cardTestQuestion){this.addNarrative('Start the test with "card test".','system');return;}if(answer.trim().toLowerCase()!=='map'){this.addNarrative('That answer is not accepted. Study the riddle and try again.','system');return;}s.cardTestPassed=true;s.cardTestQuestion=null;this.addNarrative('Card Test passed! Your class spell cards are ready.','treasure');this.learnGuildSpells();};
    Game.learnGuildSpells = function() {
        const s=ensure(this), p=this.state.player;
        if (this.state.location!=='kaliwasch') { this.addNarrative('Return to the Kaliwasch Guild Hall.', 'system'); return; }
        if (!this.state.completedQuests.includes('tutorial')) { this.addNarrative('Finish the tutorial before guild spell training.', 'system'); return; }
        if (!s.cardTestPassed) { this.addNarrative('Pass the Guild Card Test first. Type "card test".', 'system'); return; }
        if (s.guildTraining) { this.addNarrative('Your class spell cards are already learned.', 'system'); return; }
        const grants=CLASS_GUILD_SPELLS[p.class]||['Adventurer’s Focus','Second Wind'];
        grants.forEach(sp=>{if(!p.spells.includes(sp))p.spells.push(sp)});s.guildTraining=true;
        this.addNarrative(`Guild training complete: learned ${grants.join(' and ')}!`, 'treasure');this.save();
    };

    const oldCast=Game.castSpell.bind(Game);
    Game.castSpell=function(name){
        const spell=this.state.player?.spells?.find(s=>s.toLowerCase().includes(name.toLowerCase())); const key=spell?.toLowerCase();
        if(key==='alohomora'){
            const p=this.state.player;if(p.mp<8){this.addNarrative('Alohomora requires 8 MP.','system');return;}p.mp-=8;MusicSystem.playSFX('door');
            const loc=WorldData.locations[this.state.location], exits=['north','west','east','south','up','down'].filter(d=>loc.exits[d]);
            this.addNarrative(`Alohomora releases the lock with a metallic click. Available directions: ${exits.join(', ')||'none'}.`,'green-light');this.updateHUD();this.save();return;
        }
        const special=Object.values(CLASS_GUILD_SPELLS).flat().map(s=>s.toLowerCase()).concat(['emerald lifestrike','spirit wolf','soul mend']);
        if(!special.includes(key)) return oldCast(name);
        if(!this.state.inCombat){this.addNarrative('Cast this class spell during combat.','system');return;}
        const p=this.state.player,e=this.state.enemy,cost=key==='emerald lifestrike'?30:22;if(p.mp<cost){this.addNarrative('Not enough mana!','system');return;}p.mp-=cost;
        const healing=['soul mend','supplica','hunter’s remedy',"hunter's remedy",'radiant choir','sanctuary','nature mend','inner sanctuary','moonwell','second wind'];
        const guards=['survey guardia','sacred guard'];
        const doubles=['double strike','twin shot','shadow dance'];
        if(key==='emerald lifestrike'){
            const dmg=e.name.includes('orc')?25:e.name.includes('goblin')?16:Math.min(45,20+p.level);e.hp-=dmg;p.hp=Math.min(p.maxHp,p.hp+dmg);
            this.addNarrative(`🔴 Emerald Lifestrike cuts ${e.name} for ${dmg} damage!`,'red-light');this.addNarrative(`🟢 Green life returns ${dmg} HP.`,'green-light');
        } else if(healing.includes(key)){
            const heal=25+Math.floor(p.wis/2);p.hp=Math.min(p.maxHp,p.hp+heal);this.state.companions.forEach(c=>c.hp=Math.min(c.maxHp,c.hp+heal));this.addNarrative(`🟢 ${spell} restores ${heal} HP to the battle group.`,'green-light');
        } else if(guards.includes(key)){
            this.state.defending=true;p.hp=Math.min(p.maxHp,p.hp+10);this.addNarrative(`🟢 ${spell} creates a protective ward and restores 10 HP.`,'green-light');
        } else if(doubles.includes(key)){
            const hit=Math.max(8,Math.floor((p.weaponDamage+p.dex)/4)),total=hit*2;e.hp-=total;this.addNarrative(`🔴 ${spell} lands two strikes of ${hit} for ${total} damage.`,'red-light');
        } else if(key==='hocus pocus'){
            const dmg=20+Math.floor(Math.random()*31)+p.int;e.hp-=dmg;this.addNarrative(`🔴 Hocus Pocus releases unpredictable magic for ${dmg} damage!`,'red-light');
        } else {
            const dmg=Math.max(20,Math.floor((p.int+p.wis+p.str)/2)+p.level*3);e.hp-=dmg;this.addNarrative(`🔴 ${spell} deals ${dmg} damage!`,'red-light');
        }
        MusicSystem.playSFX(key.includes('strike')?'attack':'magic');this.updateHUD();if(e.hp<=0)this.enemyDefeated();else this.enemyAttack();
    };

    const oldStart=Game.startCombat.bind(Game);
    Game.startCombat=function(enemyName,queued=false){
        const s=ensure(this), loc=WorldData.locations[this.state.location];
        if(!queued && loc?.enemies?.length){
            const maximum=s.encounterMode==='full'?6:3;
            const count=1+Math.floor(Math.random()*maximum);
            s.enemyQueue=Array.from({length:count-1},()=>loc.enemies[Math.floor(Math.random()*loc.enemies.length)]);
            s.movesSinceEncounter=0;
            if(count>1)this.addNarrative(`A group of ${count} monsters surrounds you!`,'combat');
        }
        oldStart(enemyName);
    };
    const oldDefeated=Game.enemyDefeated.bind(Game);
    Game.enemyDefeated=function(){
        const defeated=this.state.enemy?.name||'monster', s=ensure(this);
        if(Math.random()<0.65){const pool=['bread','cheese wheel','healing potion','oak club','iron mace','black stick'];const id=pool[Math.floor(Math.random()*pool.length)];s.groundLoot.push({...WorldData.items[id],id,quantity:1});this.addNarrative(`${defeated} dropped ${WorldData.items[id].name}. Loot is waiting on the ground. Type "loot" to inspect it or "take loot ${id}".`,'item');}
        else this.addNarrative(`${defeated} dropped no item loot. Gold and XP were still awarded.`, 'system');
        const queue=[...(s.enemyQueue||[])];s.enemyQueue=[];oldDefeated();
        if(queue.length && !this.state.inCombat){const next=queue.shift();s.enemyQueue=queue;setTimeout(()=>this.startCombat(next,true),500);}
    };
    const oldEnter=Game.enterLocation.bind(Game);
    Game.enterLocation=function(id){
        const s=ensure(this),loc=WorldData.locations[id];
        s.movesSinceEncounter=(s.movesSinceEncounter||0)+1;
        if(loc&&!loc.safe&&loc.enemies?.length){
            // Suppress the old 50% roll; use a cooldown plus a much lower custom chance.
            const previousSafe=loc.safe;loc.safe=true;oldEnter(id);loc.safe=previousSafe;
            const threshold=s.encounterMode==='full'?3:5, chance=s.encounterMode==='full'?0.20:0.06;
            if(s.movesSinceEncounter>=threshold&&Math.random()<chance){
                const enemy=loc.enemies[Math.floor(Math.random()*loc.enemies.length)];setTimeout(()=>this.startCombat(enemy),900);
            }
        } else oldEnter(id);
        if(['grand_temple','royal_palace','arcane_enchantery'].includes(id))this.showSacredActions();
    };

    Game.showStorage=function(){
        const s=ensure(this),content=document.getElementById('storage-content');
        const row=(item,action,label)=>`<div class="storage-row"><span>${this.escapeHTML(item.name)} x${item.quantity}</span><button onclick="Game.${action}('${this.escapeHTML(this.escapeJS(item.id))}')">${label}</button></div>`;
        content.innerHTML=`<h4>Inventory</h4>${this.state.inventory.length?this.state.inventory.map(i=>row(i,'storeItem','Store')).join(''):'<p>Empty</p>'}<h4>Stored Items</h4>${s.storage.length?s.storage.map(i=>row(i,'retrieveItem','Take')).join(''):'<p>Empty</p>'}<h4>Ground Loot</h4>${s.groundLoot.length?s.groundLoot.map(i=>row(i,'takeLoot','Take')).join('')+'<button class="menu-btn" onclick="Game.takeAllLoot()">Take All Ground Loot</button>':'<p>Nothing on the ground</p>'}<p>No item is collected automatically. Gold and XP are battle rewards, not item loot.</p>`;
        document.getElementById('storage-panel').classList.remove('hidden');
    };
    const moveOne=(from,to,id)=>{const item=from.find(i=>i.id===id);if(!item)return false;const dest=to.find(i=>i.id===id);if(dest)dest.quantity++;else to.push({...item,quantity:1});item.quantity--;if(item.quantity<=0)from.splice(from.indexOf(item),1);return true;};
    Game.storeItem=function(id){const s=ensure(this);if(moveOne(this.state.inventory,s.storage,id)){this.addNarrative('Item stored.','item');this.save();this.showStorage();}};
    Game.retrieveItem=function(id){const s=ensure(this);if(moveOne(s.storage,this.state.inventory,id)){this.addNarrative('Item returned to inventory.','item');this.save();this.showStorage();}};
    Game.throwItem=function(query){const s=ensure(this),item=this.state.inventory.find(i=>i.name.toLowerCase().includes(query.toLowerCase())||i.id===query);if(item&&moveOne(this.state.inventory,s.groundLoot,item.id)){this.addNarrative(`${item.name} thrown onto the ground.`,'item');this.save();}};
    Game.takeLoot=function(query){const s=ensure(this),item=s.groundLoot.find(i=>i.name.toLowerCase().includes(query.toLowerCase())||i.id===query);if(item&&moveOne(s.groundLoot,this.state.inventory,item.id)){this.addNarrative(`You take ${item.name}.`,'item');this.save();this.showStorage();}else this.addNarrative('No matching item is on the ground.','system');};
    Game.takeAllLoot=function(){const s=ensure(this);if(!s.groundLoot.length){this.addNarrative('There is no item loot to take.','system');return;}let count=0;while(s.groundLoot.length){const item=s.groundLoot[0];if(moveOne(s.groundLoot,this.state.inventory,item.id))count++;else break;}this.addNarrative(`You manually take ${count} loot item${count===1?'':'s'}.`,'item');this.save();this.showStorage();};

    Game.examineEntity=function(query){
        const q=query.toLowerCase(), enemy=this.state.enemy&&this.state.enemy.name.toLowerCase().includes(q)?this.state.enemy:null, companion=this.state.companions.find(c=>c.name.toLowerCase().includes(q)), item=this.state.inventory.find(i=>i.name.toLowerCase().includes(q))||ensure(this).groundLoot.find(i=>i.name.toLowerCase().includes(q));
        if(enemy)this.addNarrative(`${enemy.name}: HP ${enemy.hp}/${enemy.maxHp}, attack ${enemy.attack}. ${enemy.desc||''}`,'combat');
        else if(companion)this.addNarrative(`${companion.name}: level ${companion.level||1}, HP ${companion.hp}/${companion.maxHp}, attack ${companion.attack}, healing ${companion.heal||0}.`,'npc');
        else if(item)this.addNarrative(`${item.name}: ${item.desc||'No description.'} Type ${item.type||'item'}.`,'item');
        else this.addNarrative('Nothing matching that description is visible.','system');
    };
    Game.giveItemToCompanion=function(itemQuery,compQuery){const item=this.state.inventory.find(i=>i.name.toLowerCase().includes(itemQuery.toLowerCase())),c=this.state.companions.find(x=>x.name.toLowerCase().includes(compQuery.toLowerCase()));if(!item||!c){this.addNarrative('Item or companion not found.','system');return;}c.inventory||=[];if(moveOne(this.state.inventory,c.inventory,item.id)){this.addNarrative(`You give ${item.name} to ${c.name}.`,'item');this.save();}};
    Game.takeItemFromCompanion=function(itemQuery,compQuery){const c=this.state.companions.find(x=>x.name.toLowerCase().includes(compQuery.toLowerCase()));const item=c?.inventory?.find(i=>i.name.toLowerCase().includes(itemQuery.toLowerCase()));if(!item){this.addNarrative('That companion does not carry the item.','system');return;}moveOne(c.inventory,this.state.inventory,item.id);this.addNarrative(`You take ${item.name} from ${c.name}.`,'item');this.save();};
    Game.equipCompanion=function(compQuery,itemQuery){const c=this.state.companions.find(x=>x.name.toLowerCase().includes(compQuery.toLowerCase())),item=c?.inventory?.find(i=>i.name.toLowerCase().includes(itemQuery.toLowerCase()));if(!c||!item||!['weapon','armor'].includes(item.type)){this.addNarrative('Companion or suitable carried equipment not found.','system');return;}if(item.type==='weapon'){c.weapon=item.name;c.attack+=(item.damage||0);}else{c.armor=item.name;c.maxHp+=(item.hp||item.defense||0);c.hp=c.maxHp;}this.addNarrative(`${c.name} equips ${item.name}.`,'treasure');this.save();};
    Game.sellItem=function(query){const loc=WorldData.locations[this.state.location],item=this.state.inventory.find(i=>i.name.toLowerCase().includes(query.toLowerCase()));if(!loc?.shop&&this.state.location!=='arcane_enchantery'){this.addNarrative('Sell items at a shop or enchantery.','system');return;}if(!item){this.addNarrative('You do not carry that item.','system');return;}const price=Math.max(1,Math.floor((item.value||item.damage||10)*.35));item.quantity--;if(item.quantity<=0)this.state.inventory.splice(this.state.inventory.indexOf(item),1);this.state.player.gold+=price;this.addNarrative(`Sold ${item.name} for ${price} rupees.`,'treasure');this.save();};
    Game.dismissCompanion=function(query){const i=this.state.companions.findIndex(c=>c.name.toLowerCase().includes(query.toLowerCase()));if(i<0){this.addNarrative('Companion not found.','system');return;}const [c]=this.state.companions.splice(i,1);this.state.combatGroup=this.state.combatGroup.filter(n=>n!==c.name);this.addNarrative(`${c.name} leaves your group.`,'npc');this.save();};
    Game.reviveHero=function(){const p=this.state.player;if(p.hp>0&&!p.pendingTempleRevival){this.addNarrative(`${p.name} does not need revival.`,'system');return;}p.pendingTempleRevival=true;if(this.state.location!=='grand_temple'){this.addNarrative('Walk the spirit to the Grand Temple, then type “pray revive”.','system');return;}this.divineRevive();};

    const oldCommand=Game.processCommand.bind(Game);
    Game.processCommand=function(cmd){const c=cmd.toLowerCase().trim();
        // Typed combat actions now execute instead of being blocked by the old guard.
        if(this.state.inCombat){
            if(c==='attack'||c==='fight'||c.startsWith('attack ')){this.playerAttack();return;}
            if(c==='flee'){this.tryFlee();return;}if(c==='defend'){this.defend();return;}
            if(c.startsWith('cast ')||c.startsWith('spell ')){this.castSpell(c.replace(/^(cast|spell) /,''));return;}
            if(c.startsWith('use ')||c.startsWith('eat ')){this.useItem(c.replace(/^(use|eat) /,''));if(this.state.inCombat&&this.state.enemy)this.enemyAttack();return;}
        }
        if(['temple','go temple','enter temple'].includes(c)){this.goTemple();return;}if(['palace','go palace','enter palace'].includes(c)){this.goPalace();return;}
        if(['enchantment shop','enchantery','go enchantery','go enchantment shop'].includes(c)){this.goEnchantery();this.showEnchantments();return;}
        if(c==='enchantments'||c==='list enchantments'){this.showEnchantments();return;}
        if(c.startsWith('enchant ')){const parts=c.slice(8).split(' '),attr=parts.pop();this.enchantItem(parts.join(' '),attr);return;}
        if(c==='out'&&this.state.location==='grand_temple'){this.enterLocation('kaliwasch_district_9');return;}
        if(c==='out'&&this.state.location==='royal_palace'){this.enterLocation('kaliwasch_district_11');return;}
        if(c==='out'&&this.state.location==='arcane_enchantery'){this.enterLocation('kaliwasch_district_17');return;}
        if(c==='pray'||c.startsWith('pray ')){this.pray(c.slice(5).trim());return;}if(c==='palace ceremony'||c==='advance hero'){this.palaceCeremony();return;}if(c==='palace quest'||c==='receive quest'){this.palaceQuest();return;}
        if(c.startsWith('train companion ')){this.trainCompanionAtPalace(c.slice(16));return;}if(c.startsWith('increase ')){this.increaseAttribute(c.slice(9));return;}
        if(c==='card test'||c==='guild card test'){this.startCardTest();return;}if(c.startsWith('answer ')){this.answerCardTest(c.slice(7));return;}
        if(c==='learn guild spells'||c==='guild spells'){this.learnGuildSpells();return;}if(c==='encounters on'){ensure(this).encounterMode='full';this.addNarrative('Normal encounters enabled: occasional groups of 1–6 monsters after a movement cooldown.','system');this.save();return;}
        if(c==='encounters off'){ensure(this).encounterMode='reduced';this.addNarrative('Encounter frequency reduced: rare groups of only 1–3 monsters after a longer cooldown.','system');this.save();return;}
        if(c==='storage'||c==='loot'||c==='check loot'){this.showStorage();return;}if(c==='take all loot'){this.takeAllLoot();return;}if(c.startsWith('throw ')||c.startsWith('drop ')){this.throwItem(c.replace(/^(throw|drop) /,''));return;}if(c.startsWith('take loot ')){this.takeLoot(c.slice(10));return;}
        if(c==='mission'||c==='missions'){this.showQuests();return;}if(c==='hero management'||c==='manage heroes'){this.showHeroRoster();return;}
        if(c.startsWith('watch ')||c.startsWith('view ')||c.startsWith('examine ')){this.examineEntity(c.replace(/^(watch|view|examine) /,''));return;}
        if(c==='watch'||c==='view'||c==='examine'){this.look();return;}
        if(c.startsWith('my name is ')){const name=cmd.trim().slice(11).trim();if(name.length>=2){this.state.player.name=name.slice(0,20);this.addNarrative(`Your hero is now known as ${this.state.player.name}.`,'npc');this.save();}return;}
        if(c.startsWith('info')){const topic=c.slice(4).trim();this.addNarrative(topic==='developer'?'Developed for the Black Sword Ultimate community.':topic==='online'?OnlineSystem.status:'Black Sword Ultimate — Sacred Realms v3, online multiplayer RPG.','system');return;}
        if(c.startsWith('read ')){this.addNarrative(`You read the ${c.slice(5)}. Its words hint at Auralis, the Palace, and dangers beyond Kaliwasch.`,'location');return;}
        if(c.startsWith('open ')){this.addNarrative(`You open or inspect the ${c.slice(5)}.`, 'system');return;}
        if(c.startsWith('say ')){this.talkToNPC();return;}if(c==='goodbye'){this.save();this.showScreen('title-screen');return;}
        if(c==='what am i wearing'||c==='equipment'){const p=this.state.player;this.addNarrative(`Weapon: ${p.weapon||'none'}; armor: ${p.armor||'none'}; helmet: ${p.helmet||'none'}; gloves: ${p.gloves||'none'}; boots: ${p.boots||'none'}; accessory: ${p.accessory||'none'}; sets: ${p.activeSets?.join(', ')||'none'}.`,'item');return;}
        if(c.startsWith('sell ')){this.sellItem(c.slice(5));return;}if(c==='feedback'){this.addNarrative('Feedback: open the project repository or contact the game administrator.','system');return;}
        if(c==='revive hero'||c.startsWith('revive ')){this.reviveHero();return;}if(c.startsWith('recruit ')){this.inviteCompanion(c.slice(8));return;}if(c.startsWith('dismiss ')){this.dismissCompanion(c.slice(8));return;}
        const give=c.match(/^give (.+) to (.+)$/);if(give){this.giveItemToCompanion(give[1],give[2]);return;}
        const take=c.match(/^take (.+) from (.+)$/);if(take){this.takeItemFromCompanion(take[1],take[2]);return;}
        const ce=c.match(/^(.+):\s*(?:equip|wear) (.+)!?$/);if(ce){this.equipCompanion(ce[1],ce[2].replace(/!$/,''));return;}
        if(c==='restart'){this.addNarrative('To protect your heroes, create another hero from Hero Management instead of deleting progress.','system');return;}
        oldCommand(cmd);
    };

    async function setRecoveryPin(){
        const pin=document.getElementById('recovery-pin-setting').value.trim();if(!/^\d{6}$/.test(pin)){Game.addNarrative('PIN must contain exactly 6 digits.','system');return;}
        const {error}=await OnlineSystem.client.rpc('set_player_recovery_pin',{new_pin:pin,current_save:Game.getCloudData()});
        Game.addNarrative(error?`Recovery setup failed: ${error.message}`:'Recovery PIN securely saved. Keep it private.',error?'system':'treasure');document.getElementById('recovery-pin-setting').value='';
    }
    async function recoverProgress(){
        const code=document.getElementById('recover-player-id').value.trim().toUpperCase(),pin=document.getElementById('recover-pin').value.trim(),status=document.getElementById('recovery-status');
        if(!OnlineSystem.ready){status.textContent='Wait for the online guest session to connect.';return;}status.textContent='Verifying securely…';
        const {data,error}=await OnlineSystem.client.rpc('recover_progress_with_pin',{code,supplied_pin:pin});if(error){status.textContent=error.message;return;}
        const roster=data?.heroes?data:(data?.player?{version:2,activeHeroId:'hero_recovered',heroes:{hero_recovered:data}}:null);if(!roster){status.textContent='No hero progress was found.';return;}
        localStorage.setItem(Game.state.rosterKey,JSON.stringify(roster));const active=roster.heroes[roster.activeHeroId]||Object.values(roster.heroes)[0];localStorage.setItem(Game.state.saveKey,JSON.stringify(active));localStorage.setItem('black_sword_recovered_by_id','true');await OnlineSystem.saveGame(roster);OnlineSystem.updateHeroEntryPoints(true);status.textContent=`Progress restored: ${Object.values(roster.heroes).map(h=>h.player?.name||'Hero').join(', ')}. Reloading…`;setTimeout(()=>location.reload(),800);
    }
    const oldOnlineSave=OnlineSystem.saveGame.bind(OnlineSystem);
    OnlineSystem.saveGame=async function(data){await oldOnlineSave(data);if(this.ready)this.client.rpc('update_recovery_save',{current_save:data}).then(()=>{});};

    document.getElementById('btn-id-recovery').addEventListener('click',()=>Game.showScreen('recovery-screen'));
    document.getElementById('btn-set-recovery-pin').addEventListener('click',setRecoveryPin);
    document.getElementById('btn-recover-progress').addEventListener('click',recoverProgress);
    document.querySelectorAll('[data-sacred]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.sacred;if(a==='pray'){if(Game.state.location!=='grand_temple')Game.goTemple();else Game.pray();}if(a==='palace')Game.goPalace();if(a==='enchant'){Game.goEnchantery();Game.showEnchantments();}if(a==='storage')Game.showStorage();}));

    window.SacredRealms={GOD,FOREST_MONSTERS};
})();
