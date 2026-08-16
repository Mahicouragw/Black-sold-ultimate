/** v7.21.1 targeted accessibility, encounter-text, and interface stabilization. */
(() => {
    'use strict';

    const numberWords = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
    const irregular = new Map([
        ['child','children'],['deer','deer'],['dwarf','dwarves'],['elf','elves'],['fish','fish'],
        ['foot','feet'],['goose','geese'],['knife','knives'],['life','lives'],['man','men'],
        ['mouse','mice'],['ox','oxen'],['person','people'],['sheep','sheep'],['tooth','teeth'],
        ['wife','wives'],['wolf','wolves'],['woman','women']
    ]);
    const pluralizeWord = word => {
        const lower=word.toLowerCase(),capitalized=word[0]===word[0]?.toUpperCase();
        let plural=irregular.get(lower);
        if(!plural){
            if(/[^aeiou]y$/i.test(word)) plural=`${lower.slice(0,-1)}ies`;
            else if(/(?:s|x|z|ch|sh)$/i.test(word)) plural=`${lower}es`;
            else plural=`${lower}s`;
        }
        return capitalized ? plural[0].toUpperCase()+plural.slice(1) : plural;
    };
    const pluralizeMonster = (name,count) => {
        const clean=String(name||'monster').trim();
        if(count===1)return clean;
        const parts=clean.split(/\s+/),last=parts.pop();
        parts.push(pluralizeWord(last));
        return parts.join(' ');
    };
    const formatGroups = names => {
        const groups=new Map();
        for(const raw of names||[]){const name=String(raw||'').trim();if(!name)continue;const key=name.toLocaleLowerCase();const entry=groups.get(key);if(entry)entry.count++;else groups.set(key,{name,count:1});}
        const phrases=[...groups.values()].map(({name,count})=>`${numberWords[count]||String(count)} ${pluralizeMonster(name,count)}`);
        if(!phrases.length)return 'no monsters';
        if(phrases.length===1)return phrases[0];
        if(phrases.length===2)return `${phrases[0]} and ${phrases[1]}`;
        return `${phrases.slice(0,-1).join(', ')}, and ${phrases.at(-1)}`;
    };
    window.MonsterGroupFormatter=Object.freeze({format:formatGroups,pluralize:pluralizeMonster});

    const Mode={
        storageKey:'black_sword_interface_mode_v1',
        current:null,
        read(){try{const mode=localStorage.getItem(this.storageKey);return ['blind','sighted'].includes(mode)?mode:null;}catch{return null;}},
        apply(mode,{persist=true,announce=false}={}){
            if(!['blind','sighted'].includes(mode))return false;
            this.current=mode;
            if(persist)try{localStorage.setItem(this.storageKey,mode);}catch{}
            document.documentElement.dataset.interfaceMode=mode;
            const art=document.getElementById('location-art');if(art)art.setAttribute('aria-hidden','true');
            const select=document.getElementById('setting-interface-mode');if(select)select.value=mode;
            this.closeChooser();
            if(announce){
                const text=mode==='blind'?'Blind and TalkBack-first game interface selected. Android accessibility remains unchanged.':'Sighted visual game interface selected. All controls remain semantically accessible.';
                const help=document.getElementById('interface-mode-help');if(help)help.textContent=`${text} This setting persists across restarts.`;
                window.Game?.addNarrative?.(text,'system');
            }
            window.dispatchEvent(new CustomEvent('black-sword-interface-change',{detail:{mode}}));
            return true;
        },
        openChooser(){
            const dialog=document.getElementById('interface-mode-dialog'),game=document.getElementById('game-container');if(!dialog)return;
            dialog.classList.remove('hidden');if(game){game.inert=true;game.setAttribute('aria-hidden','true');}
            setTimeout(()=>document.getElementById('choose-interface-blind')?.focus(),0);
        },
        closeChooser(){
            const dialog=document.getElementById('interface-mode-dialog'),game=document.getElementById('game-container');dialog?.classList.add('hidden');
            if(game){game.inert=false;game.removeAttribute('aria-hidden');}
        },
        init(){
            const select=document.getElementById('setting-interface-mode');
            document.getElementById('choose-interface-blind')?.addEventListener('click',()=>this.apply('blind',{announce:true}));
            document.getElementById('choose-interface-sighted')?.addEventListener('click',()=>this.apply('sighted',{announce:true}));
            select?.addEventListener('change',()=>this.apply(select.value,{announce:true}));
            const saved=this.read();if(saved)this.apply(saved,{persist:false});else this.openChooser();
        }
    };
    window.InterfaceMode=Mode;

    const applyGamePatches=()=>{
        if(!window.Game||Game._v7211Stabilized)return;
        Game._v7211Stabilized=true;

        const oldShowMap=Game.showMap.bind(Game);
        Game.showMap=function(){
            if(Mode.current!=='blind')return oldShowMap();
            const location=WorldData.locations[this.state.location],exits=Object.entries(location?.exits||{});
            const routes=exits.map(([direction,id])=>`${direction} to ${WorldData.locations[id]?.name||id}`).join('; ')||'no open exits';
            this.addNarrative(`Text map. You are at ${location?.name||this.state.location}, in ${location?.region||'an unknown region'}. Open routes: ${routes}. Use Wayfinder, distance, city directory, or a destination command for an executable step-by-step route.`,'location');
        };

        const oldStart=Game.startCombat.bind(Game);
        Game.startCombat=function(name,queued=false){
            const add=this.addNarrative;
            if(!queued){
                // Older wrappers emitted two competing encounter summaries. Keep
                // their setup behavior while suppressing only those duplicate lines.
                this.addNarrative=function(text,type){
                    if(/^A group of \d+ monsters surrounds you!$/.test(String(text))||/^You encounter (?:\d+ monsters?:|[^.]+\.$)/.test(String(text)))return;
                    return add.call(this,text,type);
                };
            }
            try{oldStart(name,queued);}finally{this.addNarrative=add;}
            if(queued||!this.state.inCombat||!this.state.enemy)return;
            const names=[name,...(this.state.sacred?.enemyQueue||[])];
            this.state.encounterGroupNames=names;
            const description=formatGroups(names),message=`You encounter ${description}.`;
            add.call(this,message,'combat');
            this.updateEnemyGroupHUD?.();
            const panel=document.getElementById('combat-panel'),controls=[...(panel?.querySelectorAll('button')||[])];
            if(panel){panel.setAttribute('aria-label',`Combat encounter: ${description}`);panel.setAttribute('aria-busy','true');}
            controls.forEach(button=>{if(!button.disabled){button.disabled=true;button.dataset.ttsEncounterLock='true';}});
            const speech=window.AudioManager?.speakCritical?.(message)||Promise.resolve(false);
            Promise.resolve(speech).finally(()=>{
                if(panel)panel.removeAttribute('aria-busy');
                controls.forEach(button=>{if(button.dataset.ttsEncounterLock==='true'){button.disabled=false;delete button.dataset.ttsEncounterLock;}});
            });
        };

        const oldGroupHud=Game.updateEnemyGroupHUD?.bind(Game);
        if(oldGroupHud)Game.updateEnemyGroupHUD=function(){
            oldGroupHud();
            const box=document.getElementById('enemy-group-list');if(!box)return;
            const names=(this.aliveEncounterTargets?.()||[]).map(target=>target.name);
            if(!names.length)return;
            const description=formatGroups(names),summary=document.createElement('p');
            summary.className='enemy-group-summary';summary.textContent=`Enemy group: ${description}.`;
            box.prepend(summary);box.setAttribute('aria-label',`Living enemy group: ${description}`);
        };
    };

    applyGamePatches();
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{applyGamePatches();Mode.init();},{once:true});
    else Mode.init();
})();
