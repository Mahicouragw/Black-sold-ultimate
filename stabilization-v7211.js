/** v7.22 command-first combat, fair rewards, spells, accessibility and interface stabilization. */
(() => {
    'use strict';

    const numberWords=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
    const irregular=new Map([['child','children'],['deer','deer'],['dwarf','dwarves'],['elf','elves'],['fish','fish'],['foot','feet'],['goose','geese'],['knife','knives'],['life','lives'],['man','men'],['mouse','mice'],['ox','oxen'],['person','people'],['sheep','sheep'],['tooth','teeth'],['wife','wives'],['wolf','wolves'],['woman','women']]);
    const pluralizeWord=word=>{const lower=word.toLowerCase(),capitalized=word[0]===word[0]?.toUpperCase();let plural=irregular.get(lower);if(!plural){if(/[^aeiou]y$/i.test(word))plural=`${lower.slice(0,-1)}ies`;else if(/(?:s|x|z|ch|sh)$/i.test(word))plural=`${lower}es`;else plural=`${lower}s`;}return capitalized?plural[0].toUpperCase()+plural.slice(1):plural;};
    const pluralizeMonster=(name,count)=>{const clean=String(name||'monster').trim();if(count===1)return clean;const parts=clean.split(/\s+/),last=parts.pop();parts.push(pluralizeWord(last));return parts.join(' ');};
    const formatGroups=names=>{const groups=new Map();for(const raw of names||[]){const name=String(raw||'').trim();if(!name)continue;const key=name.toLocaleLowerCase(),entry=groups.get(key);if(entry)entry.count++;else groups.set(key,{name,count:1});}const phrases=[...groups.values()].map(({name,count})=>`${numberWords[count]||String(count)} ${pluralizeMonster(name,count)}`);if(!phrases.length)return'no monsters';if(phrases.length===1)return phrases[0];if(phrases.length===2)return`${phrases[0]} and ${phrases[1]}`;return`${phrases.slice(0,-1).join(', ')}, and ${phrases.at(-1)}`;};
    window.MonsterGroupFormatter=Object.freeze({format:formatGroups,pluralize:pluralizeMonster});

    const Mode={
        storageKey:'black_sword_interface_mode_v1',current:null,
        read(){try{const mode=localStorage.getItem(this.storageKey);return['blind','sighted'].includes(mode)?mode:null;}catch{return null;}},
        apply(mode,{persist=true,announce=false}={}){if(!['blind','sighted'].includes(mode))return false;this.current=mode;if(persist)try{localStorage.setItem(this.storageKey,mode);}catch{}document.documentElement.dataset.interfaceMode=mode;document.getElementById('location-art')?.setAttribute('aria-hidden','true');const select=document.getElementById('setting-interface-mode');if(select)select.value=mode;this.closeChooser();if(announce){const text=mode==='blind'?'Blind and TalkBack-first game interface selected. Android accessibility remains unchanged.':'Sighted visual game interface selected. All controls remain semantically accessible.';const help=document.getElementById('interface-mode-help');if(help)help.textContent=`${text} This setting persists across restarts.`;window.Game?.addNarrative?.(text,'system');}window.dispatchEvent(new CustomEvent('black-sword-interface-change',{detail:{mode}}));return true;},
        openChooser(){const dialog=document.getElementById('interface-mode-dialog'),game=document.getElementById('game-container');if(!dialog)return;dialog.classList.remove('hidden');if(game){game.inert=true;game.setAttribute('aria-hidden','true');}setTimeout(()=>document.getElementById('choose-interface-blind')?.focus(),0);},
        closeChooser(){const dialog=document.getElementById('interface-mode-dialog'),game=document.getElementById('game-container');dialog?.classList.add('hidden');if(game){game.inert=false;game.removeAttribute('aria-hidden');}},
        init(){const select=document.getElementById('setting-interface-mode');document.getElementById('choose-interface-blind')?.addEventListener('click',()=>this.apply('blind',{announce:true}));document.getElementById('choose-interface-sighted')?.addEventListener('click',()=>this.apply('sighted',{announce:true}));select?.addEventListener('change',()=>this.apply(select.value,{announce:true}));const saved=this.read();if(saved)this.apply(saved,{persist:false});else this.openChooser();}
    };
    window.InterfaceMode=Mode;

    // ── Real, persisted gameplay setting: More Frequent Monster Encounters ──
    // The encounter scheduler reads these values directly, so the toggle changes
    // actual gameplay probability, cooldowns and group size — never just a label.
    const EncounterSettings={
        storageKey:'black_sword_frequent_encounters_v1',
        profiles:Object.freeze({
            normal:Object.freeze({threshold:5,cooldownMs:90000,chance:0.06,minGroup:1,maxGroup:3}),
            frequent:Object.freeze({threshold:3,cooldownMs:45000,chance:0.18,minGroup:2,maxGroup:5})
        }),
        enabled:false,
        read(){try{return localStorage.getItem(this.storageKey)==='true';}catch{return false;}},
        write(value){try{localStorage.setItem(this.storageKey,value?'true':'false');}catch{}},
        tuning(){return this.enabled?this.profiles.frequent:this.profiles.normal;},
        syncUI(){const box=document.getElementById('setting-frequent-encounters');if(box)box.checked=this.enabled;},
        set(value,{persist=true,announce=true}={}){
            this.enabled=Boolean(value);
            if(persist)this.write(this.enabled);
            const game=window.Game;
            if(game?.state){const sacred=game.state.sacred;if(sacred){sacred.encounterMode=this.enabled?'full':'reduced';sacred.movesSinceEncounter=0;sacred.lastRandomEncounterAt=Date.now();}game.save?.();}
            this.syncUI();
            if(announce)window.Game?.addNarrative?.(this.enabled
                ? 'More frequent monster encounters are on. Wilderness battles happen sooner, in slightly larger groups, and still respect an encounter cooldown.'
                : 'More frequent monster encounters are off. Wilderness battles are rarer and use the longer cooldown.','system');
            return this.enabled;
        },
        init(){this.enabled=this.read();this.syncUI();const box=document.getElementById('setting-frequent-encounters');if(box&&!box.dataset.encounterBound){box.dataset.encounterBound='true';box.addEventListener('change',()=>this.set(box.checked));}}
    };
    window.EncounterSettings=EncounterSettings;

    const HEALING_NAMES=['minor heal','heal','mass heal','nature mend','supplica','hunter’s remedy',"hunter's remedy",'radiant choir','sanctuary','inner sanctuary','moonwell','second wind','soul mend'];
    const cooldownState=game=>game.state.spellCooldowns||(game.state.spellCooldowns={});
    const remaining=(game,key)=>Math.max(0,(cooldownState(game)[key]||0)-Date.now());
    const setCooldown=(game,key,ms)=>cooldownState(game)[key]=Date.now()+ms;
    const knownSpell=(game,names)=>game.state.player?.spells?.find(spell=>names.includes(spell.toLowerCase()));
    const event=(game,text,type='system',options={})=>game.emitGameEvent?.(text,type,options)||Promise.resolve(game.addNarrative(text,type));
    const recordMastery=(game,spell,{mp=0,damage=0,healing=0}={})=>{if(!game.getSpellEfficiency)return;const eff=game.getSpellEfficiency(spell),gain=Math.max(5,Math.round(mp+damage/10+healing/10));eff.entry.xp=(eff.entry.xp||0)+gain;eff.entry.casts=(eff.entry.casts||0)+1;eff.entry.totalMp=(eff.entry.totalMp||0)+mp;eff.entry.totalDamage=(eff.entry.totalDamage||0)+damage;eff.entry.totalHealing=(eff.entry.totalHealing||0)+healing;game.state.spellMastery[eff.key]=eff.entry;};

    const SPECIAL_DOOR=(()=>{const from='drakkar_keep_2',to='drakkar_keep_3',source=WorldData.locations[from],target=WorldData.locations[to];if(!source||!target)return null;const direction=Object.entries(source.exits||{}).find(([,id])=>id===to)?.[0]||'north',reverse=Object.entries(target.exits||{}).find(([,id])=>id===from)?.[0]||'south';return{id:'drakkar-rune-door',location:from,destination:to,direction,reverse,magical:true,canBeBrokenByMultipleStrike:true};})();
    const doorConfig=()=>SPECIAL_DOOR;
    const applyDoorState=game=>{const config=doorConfig();if(!config)return;const state=game.state.specialDoors||(game.state.specialDoors={});const open=Boolean(state[config.id]?.open),source=WorldData.locations[config.location],target=WorldData.locations[config.destination];source.specialDoor={...config,open};target.specialDoor={...config,location:config.destination,destination:config.location,direction:config.reverse,reverse:config.direction,open};if(open){source.exits[config.direction]=config.destination;target.exits[config.reverse]=config.location;source.features=(source.features||[]).filter(f=>f!=='runed locked door');target.features=(target.features||[]).filter(f=>f!=='runed locked door');if(!source.features.includes('opened runed door'))source.features.push('opened runed door');if(!target.features.includes('opened runed door'))target.features.push('opened runed door');}else{if(source.exits[config.direction]===config.destination)delete source.exits[config.direction];if(target.exits[config.reverse]===config.location)delete target.exits[config.reverse];source.features=(source.features||[]).filter(f=>f!=='opened runed door');target.features=(target.features||[]).filter(f=>f!=='opened runed door');if(!source.features.includes('runed locked door'))source.features.push('runed locked door');if(!target.features.includes('runed locked door'))target.features.push('runed locked door');}};

    const SpellSystem={
        config:Object.freeze({healing:Object.freeze({cost:14,cooldownMs:6000}),multipleStrike:Object.freeze({cost:18,cooldownMs:8000,failureChance:.12,maxTargets:3}),shock:Object.freeze({cost:12,cooldownMs:5000,failureChance:.10}),openingDoors:Object.freeze({cost:8,cooldownMs:3000})}),
        random:()=>Math.random(),
        castHealing(game){
            const p=game.state.player;if(!p)return false;const spell=knownSpell(game,HEALING_NAMES);if(!spell){game.addNarrative('You do not know a healing spell.','system');return false;}
            if(p.hp>=p.maxHp){game.addNarrative('Your health is already full.','system');return false;}
            const wait=remaining(game,'healing');if(wait){game.addNarrative('That healing spell is still recovering.','system');return false;}
            const cost=this.config.healing.cost;if(p.mp<cost){game.addNarrative('You do not have enough mana.','system');return false;}
            p.mp-=cost;const failure=Math.max(.02,.07-Math.max(0,(p.wis||10)-10)*.001);
            if(this.random()<failure){setCooldown(game,'healing',Math.floor(this.config.healing.cooldownMs/2));recordMastery(game,spell,{mp:cost});event(game,'Your healing spell failed.','combat',{eventId:`heal-fail:${Date.now()}`});game.updateHUD();game.save();if(game.state.inCombat)game.enemyAttack();return false;}
            const amount=Math.max(12,20+Math.floor((p.wis||10)/3)+(p.level||1)*2),before=p.hp;p.hp=Math.min(p.maxHp,p.hp+amount);const restored=p.hp-before;
            setCooldown(game,'healing',this.config.healing.cooldownMs);recordMastery(game,spell,{mp:cost,healing:restored});MusicSystem.playSFX('heal-chain');event(game,`${spell} restores ${restored} health.`,'green-light',{eventId:`heal:${Date.now()}`});game.updateHUD();game.save();if(game.state.inCombat)game.enemyAttack();return true;
        },
        castMultipleStrike(game){
            const p=game.state.player,spell=p?.spells?.find(s=>s.toLowerCase()==='multi strike');if(!spell){game.addNarrative('You do not know Multiple Strike.','system');return false;}
            if(!game.state.inCombat||!game.state.enemy){
                const door=WorldData.locations[game.state.location]?.specialDoor;
                if(door?.canBeBrokenByMultipleStrike)return this.breakSpecialDoor(game,door,spell);
                if(WorldData.locations[game.state.location]?.houseExterior)game.addNarrative('This door cannot be broken by Multiple Strike.','system');
                else game.addNarrative('You can only use Multiple Strike during battle.','system');return false;
            }
            const wait=remaining(game,'multipleStrike');if(wait){game.addNarrative('Multiple Strike is still recovering.','system');return false;}
            const targets=(game.aliveEncounterTargets?.()||[{name:game.state.enemy.name,active:true}]).slice(0,this.config.multipleStrike.maxTargets);if(!targets.length){game.addNarrative('There is no valid target.','system');return false;}
            const cost=this.config.multipleStrike.cost;if(p.mp<cost){game.addNarrative('You do not have enough mana.','system');return false;}
            p.mp-=cost;setCooldown(game,'multipleStrike',this.config.multipleStrike.cooldownMs);
            if(this.random()<this.config.multipleStrike.failureChance){recordMastery(game,spell,{mp:cost});event(game,'Your multiple strike failed.','combat',{eventId:`multi-fail:${Date.now()}`});game.updateHUD();game.save();game.enemyGroupTurn?.();return false;}
            let hits=0,total=0;for(const target of targets){const data=WorldData.enemies[target.name]||{},block=Math.max(.08,Math.min(.5,.14+(data.defense||0)/700));if(this.random()<block)continue;const damage=Math.max(8,Math.floor((p.weaponDamage||16)/3+(p.str||10)/4+this.random()*8));target.damage=(target.damage||0)+damage;if(target.active){game.state.enemy.hp=Math.max(0,game.state.enemy.hp-damage);target.hp=game.state.enemy.hp;}else target.hp=Math.max(1,(target.hp??target.maxHp??damage+1)-damage);hits++;total+=damage;}
            recordMastery(game,spell,{mp:cost,damage:total});MusicSystem.playSFX('magic');const text=hits?`The light from your hands strikes for ${total} damage.`:(targets.length>1?'The monsters block your spell.':`${targets[0].name} blocks the spell.`);event(game,text,'magic',{eventId:`multi:${Date.now()}`});game.updateHUD();game.updateEnemyHUD();game.updateEnemyGroupHUD?.();game.save();if(game.state.enemy.hp<=0)game.enemyDefeated();else game.enemyGroupTurn?.();return true;
        },
        breakSpecialDoor(game,door,spell){
            const p=game.state.player,wait=remaining(game,'multipleStrike');if(wait){game.addNarrative('Multiple Strike is still recovering.','system');return false;}const cost=this.config.multipleStrike.cost;if(p.mp<cost){game.addNarrative('You do not have enough mana.','system');return false;}if(door.open||game.state.specialDoors?.[door.id]?.open){game.addNarrative('The door is already open.','system');return false;}p.mp-=cost;setCooldown(game,'multipleStrike',this.config.multipleStrike.cooldownMs);game.state.specialDoors[door.id]={open:true,method:'multiple-strike'};applyDoorState(game);recordMastery(game,spell,{mp:cost});MusicSystem.playSFX('magic');MusicSystem.playSFX('door');event(game,'Multiple Strike shatters the special runed door. The passage is open.','magic',{eventId:`door:${door.id}`});game.updateDirectionButtons(WorldData.locations[game.state.location].exits);game.updateHUD();game.save();return true;
        },
        // Shock: fair three-outcome model — success, block, or failure. Costs are
        // always paid for a valid cast; no internal numbers are narrated.
        castShock(game){
            const p=game.state.player,spell=p?.spells?.find(x=>x.toLowerCase()==='shock');
            if(!spell){game.addNarrative('You do not know the Shock spell.','system');return false;}
            if(!game.state.inCombat||!game.state.enemy){game.addNarrative('You can only use Shock during battle.','system');return false;}
            const wait=remaining(game,'shock');if(wait){game.addNarrative('Shock is still recovering.','system');return false;}
            const cost=this.config.shock.cost;if(p.mp<cost){game.addNarrative('You do not have enough mana.','system');return false;}
            const enemy=game.state.enemy;
            p.mp-=cost;setCooldown(game,'shock',this.config.shock.cooldownMs);
            MusicSystem.playSFX('magic');
            if(this.random()<this.config.shock.failureChance){
                recordMastery(game,spell,{mp:cost});
                event(game,'Your shock spell failed.','combat',{eventId:`shock-fail:${Date.now()}`});
                game.updateHUD();game.save();game.enemyGroupTurn?.()||game.enemyAttack();return false;
            }
            const data=WorldData.enemies[enemy.name]||{},block=Math.max(.05,Math.min(.4,.10+(data.magic||0)/900+(data.defense||0)/1200));
            if(this.random()<block){
                recordMastery(game,spell,{mp:cost});
                event(game,`${enemy.name} blocks your shock spell.`,'combat',{eventId:`shock-block:${Date.now()}`});
                game.updateHUD();game.save();game.enemyGroupTurn?.()||game.enemyAttack();return false;
            }
            const damage=Math.max(10,20+Math.floor((p.int||10)/2)+Math.floor(this.random()*12));
            enemy.hp=Math.max(0,enemy.hp-damage);
            recordMastery(game,spell,{mp:cost,damage});
            event(game,`Your shock spell hits ${enemy.name} for ${damage} damage.`,'magic',{eventId:`shock:${Date.now()}`});
            game.updateHUD();game.updateEnemyHUD();game.updateEnemyGroupHUD?.();game.save();
            if(enemy.hp<=0)game.enemyDefeated();else game.enemyGroupTurn?.()||game.enemyAttack();
            return true;
        },
        castOpeningDoors(game){
            const p=game.state.player,spell=p?.spells?.find(s=>s.toLowerCase()==='alohomora');if(!spell){game.addNarrative('You do not know the Opening Doors spell, Alohomora.','system');return false;}
            const door=WorldData.locations[game.state.location]?.specialDoor;if(!door?.magical){game.addNarrative('The spell has no effect here. There is no compatible door.','system');return false;}
            if(door.open||game.state.specialDoors?.[door.id]?.open){game.addNarrative('The door is already open.','system');return false;}
            const wait=remaining(game,'openingDoors');if(wait){game.addNarrative('Opening Doors is still recovering.','system');return false;}const cost=this.config.openingDoors.cost;if(p.mp<cost){game.addNarrative('You do not have enough mana.','system');return false;}
            p.mp-=cost;setCooldown(game,'openingDoors',this.config.openingDoors.cooldownMs);game.state.specialDoors[door.id]={open:true,method:'alohomora'};applyDoorState(game);recordMastery(game,spell,{mp:cost});MusicSystem.playSFX('magic');MusicSystem.playSFX('door');event(game,'The magical door has opened.','green-light',{eventId:`door:${door.id}`});game.updateDirectionButtons(WorldData.locations[game.state.location].exits);game.updateHUD();game.save();return true;
        }
    };
    window.GameSpellSystem=SpellSystem;

    const applyGamePatches=()=>{
        if(!window.Game||Game._v722Stabilized)return;Game._v722Stabilized=true;
        Game._emittedGameEvents=new Set();Game._recentGameEvent={text:'',at:0};
        Game.emitGameEvent=function(text,type='system',{critical=false,eventId=''}={}){text=String(text||'').trim();if(!text)return Promise.resolve(false);if(eventId&&this._emittedGameEvents.has(eventId))return Promise.resolve(false);const now=Date.now();if(!eventId&&this._recentGameEvent.text===text&&now-this._recentGameEvent.at<400)return Promise.resolve(false);if(eventId){this._emittedGameEvents.add(eventId);if(this._emittedGameEvents.size>300)this._emittedGameEvents.delete(this._emittedGameEvents.values().next().value);}this._recentGameEvent={text,at:now};this.addNarrative(text,type);return window.AudioManager?.playVoice?.(text,{priority:critical?'critical':false})||Promise.resolve(false);};

        // COMBAT MODE: the normal game interface stays visible. Combat-only
        // controls are revealed inline; no separate battle screen or modal is
        // ever opened. Buttons, keyboard, typed commands, TalkBack and voice all
        // route through the single command engine (Game.processCommand).
        Game.runCombatCommand=function(command){const text=String(command||'').trim();if(!text)return;const input=document.getElementById('cmd-input');if(input)input.value='';this.processCommand(text);};
        Game.bindCombatActionButtons=function(){
            const box=document.getElementById('combat-actions');if(!box||box.dataset.combatBound)return;box.dataset.combatBound='true';
            box.addEventListener('click',eventObject=>{const button=eventObject.target.closest('[data-combat-command]');if(!button||button.disabled)return;this.runCombatCommand(button.dataset.combatCommand);});
        };
        Game.updateCombatActionAvailability=function(){
            const p=this.state.player,inCombat=Boolean(this.state.inCombat&&this.state.enemy);
            document.querySelectorAll('#combat-actions [data-combat-command]').forEach(button=>{
                const command=button.dataset.combatCommand;
                let usable=inCombat;
                if(command==='healing spell')usable=inCombat&&Boolean(p?.spells?.some(spell=>HEALING_NAMES.includes(spell.toLowerCase())));
                if(command==='multiple strike')usable=inCombat&&Boolean(p?.spells?.some(spell=>spell.toLowerCase()==='multi strike'));
                if(command==='shock')usable=inCombat&&Boolean(p?.spells?.some(spell=>spell.toLowerCase()==='shock'));
                button.disabled=!usable;button.setAttribute('aria-disabled',String(!usable));
            });
        };
        Game.beginCommandCombat=function(description){
            this.closePanels();
            const status=document.getElementById('combat-status'),text=document.getElementById('combat-status-text');
            if(status)status.classList.remove('hidden');
            if(text)text.textContent=`Encounter: ${description}. Choose a combat action, or type attack, attack [target], defend, flee, healing spell, multiple strike, or shock.`;
            document.querySelectorAll('.dir-btn').forEach(button=>{button.disabled=true;button.setAttribute('aria-disabled','true');});
            this.bindCombatActionButtons();this.updateCombatActionAvailability();
            const input=document.getElementById('cmd-input');
            // The command input stays usable: combat must never force the player
            // to wait for narration before acting.
            if(input){input.disabled=false;input.removeAttribute('aria-busy');input.value='';}
        };
        Game.finishCommandCombat=function(){
            const status=document.getElementById('combat-status');status?.classList.add('hidden');
            this.updateCombatActionAvailability();
            const input=document.getElementById('cmd-input');
            if(input){input.disabled=false;input.removeAttribute('aria-busy');input.value='';setTimeout(()=>input.focus(),0);}
            this.updateDirectionButtons?.(WorldData.locations[this.state.location]?.exits||{});
            this.emitGameEvent?.('The battle is over. You return to exploring.','system',{eventId:`combat-end:${Date.now()}`});
        };

        const oldShowMap=Game.showMap.bind(Game);Game.showMap=function(){if(Mode.current!=='blind')return oldShowMap();const location=WorldData.locations[this.state.location],exits=Object.entries(location?.exits||{}),routes=exits.map(([direction,id])=>`${direction} to ${WorldData.locations[id]?.name||id}`).join('; ')||'no open exits';this.addNarrative(`Text map. You are at ${location?.name||this.state.location}, in ${location?.region||'an unknown region'}. Open routes: ${routes}. Use Wayfinder, distance, city directory, or a destination command for an executable route.`,'location');};

        const oldGetSave=Game.getSaveData.bind(Game);Game.getSaveData=function(){return{...oldGetSave(),spellCooldowns:cooldownState(this),specialDoors:this.state.specialDoors||{}};};
        const oldContinue=Game.continueGame.bind(Game);Game.continueGame=function(){let data=null;try{const r=this.getRoster();data=r.heroes[r.activeHeroId]||JSON.parse(localStorage.getItem(this.state.saveKey));}catch{}oldContinue();this.state.spellCooldowns=data?.spellCooldowns||{};this.state.specialDoors=data?.specialDoors||{};applyDoorState(this);};
        applyDoorState(Game);

        const previousCast=Game.castSpell.bind(Game);Game.castSpell=function(name){const key=String(name||'').toLowerCase().trim();if(HEALING_NAMES.some(n=>key===n||key==='healing spell'))return SpellSystem.castHealing(this);if(['multi strike','multiple strike','multiple strike spell'].includes(key))return SpellSystem.castMultipleStrike(this);if(['alohomora','opening doors','opening door','opening doors spell'].includes(key))return SpellSystem.castOpeningDoors(this);if(['shock','shock spell'].includes(key))return SpellSystem.castShock(this);return previousCast(name);};
        Game.castQuickHeal=function(){return SpellSystem.castHealing(this);};Game.castQuickMulti=function(){return SpellSystem.castMultipleStrike(this);};

        const oldStart=Game.startCombat.bind(Game);Game.startCombat=function(name,queued=false){const add=this.addNarrative;if(!queued)this.addNarrative=function(text,type){if(/^A group of \d+ monsters surrounds you!$/.test(String(text))||/^You encounter (?:\d+ monsters?:|[^.]+\.$)/.test(String(text)))return;return add.call(this,text,type);};try{oldStart(name,queued);}finally{this.addNarrative=add;}if(!this.state.inCombat||!this.state.enemy)return;
            this.state.combatTransition=false;const p=this.state.player,e=this.state.enemy,tier=(p.level||1)<=4?'early':(p.level||1)<=12?'mid':'late',mult=tier==='early'?.85:tier==='late'?1.15:1;e.difficultyTier=tier;if(!e.boss&&!e.finalBoss){e.attack=Math.max(2,Math.floor(e.attack*mult));e.defense=Math.max(0,Math.floor((e.defense||0)*mult));}
            if(queued){this.updateEnemyHUD();return;}
            const names=[name,...(this.state.sacred?.enemyQueue||[])];this.state.encounterGroupNames=names;const description=formatGroups(names),message=`You encountered ${description}.`;this.beginCommandCombat(description);
            const panel=document.getElementById('combat-panel');if(panel){panel.hidden=true;panel.classList.add('hidden');panel.setAttribute('aria-label',`Combat encounter: ${description}`);panel.setAttribute('aria-hidden','true');}
            this.updateEnemyGroupHUD?.();this.updateCombatActionAvailability?.();this.emitGameEvent(message,'combat',{critical:true,eventId:`${this.state.battleSummary?.id||Date.now()}:encounter`});const input=document.getElementById('cmd-input');if(input&&this.state.inCombat){input.disabled=false;input.removeAttribute('aria-busy');input.focus();}
        };

        const oldGroupHud=Game.updateEnemyGroupHUD?.bind(Game);if(oldGroupHud)Game.updateEnemyGroupHUD=function(){oldGroupHud();const box=document.getElementById('enemy-group-list');if(!box)return;const names=(this.aliveEncounterTargets?.()||[]).map(target=>target.name);if(!names.length)return;const description=formatGroups(names),summary=document.createElement('p');summary.className='enemy-group-summary';summary.textContent=`Enemy group: ${description}.`;box.prepend(summary);box.setAttribute('aria-label',`Living enemy group: ${description}`);const text=document.getElementById('combat-status-text');if(text&&this.state.inCombat)text.textContent=`Fighting ${description}. Current target: ${this.state.enemy?.name}, ${Math.max(0,this.state.enemy?.hp||0)} health. Use commands to act.`;};
        const oldEnemyHud=Game.updateEnemyHUD.bind(Game);Game.updateEnemyHUD=function(){oldEnemyHud();this.updateCombatActionAvailability?.();const text=document.getElementById('combat-status-text');if(text&&this.state.inCombat&&this.state.enemy)text.textContent=`Current target: ${this.state.enemy.name}, ${Math.max(0,this.state.enemy.hp)} health. Choose a combat action or type a command.`;};

        const previousCommand=Game.processCommand.bind(Game);Game.processCommand=function(cmd){const raw=String(cmd||''),c=raw.toLowerCase().trim();if(!c)return;
            if(this.state.combatTransition){this.addNarrative('The next enemy is advancing. Keep your position.','system');return;}
            if(this.state.inCombat){
                if(c==='attack'||c==='fight'||c==='a'){this.playerAttack();return;}
                if(c.startsWith('attack ')||c.startsWith('fight ')){this.attackNamedTarget?.(c.replace(/^(attack|fight)\s+/,''));return;}
                if(c==='defend'){this.defend();return;}if(c==='flee'||c==='escape'){this.tryFlee();return;}
                if(['heal','healing spell','cast heal','cast healing spell'].includes(c)){SpellSystem.castHealing(this);return;}
                if(['multi strike','multiple strike','cast multi strike','cast multiple strike'].includes(c)){SpellSystem.castMultipleStrike(this);return;}
                if(['opening doors','opening door','cast opening doors','alohomora','cast alohomora'].includes(c)){SpellSystem.castOpeningDoors(this);return;}
                if(['shock','shock spell','cast shock','cast shock spell'].includes(c)){SpellSystem.castShock(this);return;}
                if(/^(north|south|east|west|northeast|northwest|southeast|southwest|up|down|n|s|e|w|ne|nw|se|sw|u|d)$/.test(c)){this.addNarrative('You cannot move during battle. Use flee if you want to escape.','system');return;}
                return previousCommand(cmd);
            }
            if(c==='attack'||c==='fight'||c==='a'||c.startsWith('attack ')||c.startsWith('fight ')){this.addNarrative('You are not in combat.','system');MusicSystem.playSFX('board-error');return;}
            if(['heal','healing spell','cast heal','cast healing spell'].includes(c)){SpellSystem.castHealing(this);return;}
            if(['multi strike','multiple strike','cast multi strike','cast multiple strike'].includes(c)){SpellSystem.castMultipleStrike(this);return;}
            if(['opening doors','opening door','cast opening doors','alohomora','cast alohomora'].includes(c)){SpellSystem.castOpeningDoors(this);return;}
            if(c==='feedback'||c==='send feedback'){this.addNarrative('Send feedback with: feedback [message], report bug [message], report accessibility [message], or report chat [message].','system');return;}
            const feedback=c.match(/^(?:send\s+)?feedback\s+(.+)$/);if(feedback){OnlineSystem.sendFeedback('gameplay',raw.slice(raw.toLowerCase().indexOf('feedback')+8).trim());return;}
            const report=c.match(/^report\s+(bug|accessibility|chat|player|suggestion)\s+(.+)$/);if(report){const category={bug:'bug',accessibility:'accessibility',chat:'moderation',player:'moderation',suggestion:'suggestion'}[report[1]];OnlineSystem.sendFeedback(category,report[2]);return;}
            if(c==='moderator inbox'){OnlineSystem.showModeratorInbox?.();return;}
            const moderate=raw.match(/^moderate\s+([0-9a-f-]{36})\s+(new|reviewing|resolved|escalated)(?:\s*\|\s*(.*))?$/i);if(moderate){OnlineSystem.moderateFeedback?.(moderate[1],moderate[2].toLowerCase(),moderate[3]||'');return;}
            return previousCommand(cmd);
        };
    };

    applyGamePatches();
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{applyGamePatches();Mode.init();EncounterSettings.init();},{once:true});else{Mode.init();EncounterSettings.init();}
})();
