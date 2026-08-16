/** Natural descriptions and one authoritative whole-battle reward settlement. */
(() => {
    const cleanDescription=text=>String(text||'')
      .replace(/\b(?:physical\s+)?(?:forest\s+)?(?:branch|path|location|sector|district|chamber)\s+\d+\s+(?:of\s+\d+)?\s*[:.–-]?\s*/gi,'')
      .replace(/\b(?:level[- ]scaled|scalable)\s+(?:creatures?|monsters?|monster groups?)\b/gi,'dangerous creatures')
      .replace(/\bbase HP\s*\d+\b/gi,'natural toughness')
      .replace(/\s+/g,' ').trim();
    Object.values(WorldData.locations).forEach(loc=>{loc.description=cleanDescription(loc.description);});
    Object.values(WorldData.enemies).forEach(enemy=>{enemy.desc=cleanDescription(enemy.desc);});

    let battleSequence=0;
    const oldStart=Game.startCombat.bind(Game);
    Game.startCombat=function(name,queued=false){
        if(!queued)this.state.battleSummary={
            id:`battle_${Date.now().toString(36)}_${(++battleSequence).toString(36)}`,
            xp:0,gold:0,defeated:[],enemyRecords:[],drops:[],levels:0,
            startedAt:Date.now(),location:this.state.location,settled:false
        };
        oldStart(name,queued);
        if(!queued){
            const names=[name,...(this.state.sacred?.enemyQueue||[])];
            const log=document.getElementById('narrative');
            if(this.state.randomEncounterPending&&log)log.innerHTML='';
            this.addNarrative(`You encounter ${names.length} monster${names.length===1?'':'s'}: ${names.join(', ')}.`,'combat');
            this.state.randomEncounterPending=false;
        }
    };

    Game.enemyDefeated=async function(){
        const e=this.state.enemy,p=this.state.player;if(!e||!p||e._defeatProcessed)return;
        e._defeatProcessed=true;
        const summary=this.state.battleSummary||(this.state.battleSummary={id:`battle_${Date.now().toString(36)}_${(++battleSequence).toString(36)}`,xp:0,gold:0,defeated:[],enemyRecords:[],drops:[],levels:0,location:this.state.location,settled:false});
        summary.xp+=Math.max(0,e.xp||0);summary.gold+=Math.max(0,e.gold||0);summary.defeated.push(e.name);
        summary.enemyRecords.push({name:e.name,xp:e.xp||0,gold:e.gold||0,boss:Boolean(e.boss),finalBoss:Boolean(e.finalBoss),elite:Boolean(e.elite)});
        this.state.kills++;this.checkQuests('kill',e.name);this.recordDefeatedForArea?.(summary.location,e.name,Boolean(this.state.arena?.active));this.restoreMonsterDebuffs?.();
        if(window.ProfessionalAudioCombat)await window.ProfessionalAudioCombat.monsterDefeat(e.name);
        else this.addNarrative(`${e.name} defeated.`,'combat');

        if(Math.random()<0.65){
            const pool=['bread','cheese wheel','healing potion','oak club','iron mace','black stick','fishing bait','ranger tonic'];
            const id=pool[Math.floor(Math.random()*pool.length)],item=WorldData.items[id];
            if(item)summary.drops.push({...item,id,quantity:1});
        }

        const queue=[...(this.state.sacred?.enemyQueue||[])];if(this.state.sacred)this.state.sacred.enemyQueue=[];
        if(queue.length){
            const next=queue.shift();if(this.state.sacred)this.state.sacred.enemyQueue=queue;
            this.state.inCombat=true;this.state.enemy=null;this.state.combatTransition=true;
            setTimeout(()=>{if(this.state.combatTransition&&this.state.battleSummary?.id===summary.id)this.startCombat(next,true);},450);
            return;
        }
        this.state.combatTransition=false;
        if(summary.settled)return;
        summary.settled=true;
        const finalBoss=e.finalBoss,oldLevel=p.level;
        const transaction=window.RewardEconomy?.settleBattle(this,summary)||{id:summary.id,gold:summary.gold,xp:summary.xp,premium:{},items:summary.drops};
        while(p.xp>=p.xpToNext){this.levelUp(true);summary.levels++;}

        this.state.inCombat=false;this.state.enemy=null;
        const panel=document.getElementById('combat-panel');if(panel){panel.hidden=true;panel.classList.add('hidden');}
        this.finishCommandCombat?.();
        this.updateHUD();

        const defeatedGroup=window.MonsterGroupFormatter?.format(summary.defeated)||summary.defeated.join(', ');
        const victoryText=`You defeated ${defeatedGroup}.`;
        const rewardText=window.RewardEconomy?.describe(transaction)||`Rewards: ${transaction.gold} gold and ${transaction.xp} experience.`;
        await (this.emitGameEvent?.(victoryText,'treasure',{eventId:`${summary.id}:victory`})||Promise.resolve(this.addNarrative(victoryText,'treasure')));
        await (this.emitGameEvent?.(rewardText,'treasure',{eventId:`${summary.id}:reward`})||Promise.resolve(this.addNarrative(rewardText,'treasure')));
        if(summary.levels){const text=`Level up! ${p.name} reached level ${p.level}.`;await(this.emitGameEvent?.(text,'treasure',{eventId:`${summary.id}:level`})||Promise.resolve(this.addNarrative(text,'treasure')));MusicSystem.playSFX('levelup');}

        if(summary.drops.length){
            const counts={};summary.drops.forEach(i=>counts[i.name]=(counts[i.name]||0)+1);
            this.addNarrative(`Ground loot is available: ${Object.entries(counts).map(([n,q])=>q>1?`${q} ${n}`:n).join(', ')}. Type “loot” to inspect it, “take everything”, or “take loot [item]”.`,'item');
            summary.drops.forEach(item=>OnlineSystem.dropWorldItem(summary.location,item).then(ok=>{if(!ok)this.state.sacred.groundLoot.push(item);}));
        }else this.addNarrative('Ground loot: none.','system');
        const actions=document.getElementById('context-actions');if(actions)actions.innerHTML='';

        if(this.state.arena?.active){const a=this.state.arena;this.addNarrative(`Arena victory ${a.wins}. Say “next” for wave ${(a.wave||0)+1}, “arena rest”, or “leave arena”.`,'combat');}
        await MusicSystem.endBattle({victory:true,worldContext:this.getLocationMusic()});
        this.save();
        if(finalBoss)this.victory();
        // Explicitly retain this for audit/tests: one settlement changed XP/gold,
        // and repeat calls with the same transaction ID are idempotent.
        return{transaction,oldLevel,newLevel:p.level};
    };
    window.CleanBattleText={cleanDescription};
})();
