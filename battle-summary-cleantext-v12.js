/** Natural descriptions and deferred whole-battle rewards. */
(() => {
    const cleanDescription=text=>String(text||'')
      .replace(/\b(?:physical\s+)?(?:forest\s+)?(?:branch|path|location|sector|district|chamber)\s+\d+\s+(?:of\s+\d+)?\s*[:.–-]?\s*/gi,'')
      .replace(/\b(?:level[- ]scaled|scalable)\s+(?:creatures?|monsters?|monster groups?)\b/gi,'dangerous creatures')
      .replace(/\bbase HP\s*\d+\b/gi,'natural toughness')
      .replace(/\s+/g,' ').trim();
    Object.values(WorldData.locations).forEach(loc=>{loc.description=cleanDescription(loc.description);});
    Object.values(WorldData.enemies).forEach(enemy=>{enemy.desc=cleanDescription(enemy.desc);});

    const oldStart=Game.startCombat.bind(Game);Game.startCombat=function(name,queued=false){if(!queued)this.state.battleSummary={xp:0,gold:0,defeated:[],drops:[],levels:0,startedAt:Date.now(),location:this.state.location};oldStart(name,queued);if(!queued){const names=[name,...(this.state.sacred?.enemyQueue||[])];const log=document.getElementById('narrative');if(this.state.randomEncounterPending&&log)log.innerHTML='';this.addNarrative(`You encounter ${names.length} monster${names.length===1?'':'s'}: ${names.join(', ')}.`,'combat');this.state.randomEncounterPending=false;}};

    Game.enemyDefeated=function(){const e=this.state.enemy,p=this.state.player;if(!e)return;const summary=this.state.battleSummary||(this.state.battleSummary={xp:0,gold:0,defeated:[],drops:[],levels:0,location:this.state.location});summary.xp+=e.xp||0;summary.gold+=e.gold||0;summary.defeated.push(e.name);p.xp+=e.xp||0;p.gold+=e.gold||0;this.state.kills++;this.addNarrative(`${e.name} defeated.`,'combat');this.checkQuests('kill',e.name);this.restoreMonsterDebuffs?.();
        if(Math.random()<.65){const pool=['bread','cheese wheel','healing potion','oak club','iron mace','black stick','fishing bait','ranger tonic'],id=pool[Math.floor(Math.random()*pool.length)],item=WorldData.items[id];if(item)summary.drops.push({...item,id,quantity:1});}
        const queue=[...(this.state.sacred?.enemyQueue||[])];if(this.state.sacred)this.state.sacred.enemyQueue=[];
        if(queue.length){const next=queue.shift();if(this.state.sacred)this.state.sacred.enemyQueue=queue;this.state.inCombat=false;this.state.enemy=null;setTimeout(()=>this.startCombat(next,true),450);return;}
        const add=this.addNarrative;this.addNarrative=()=>{};while(p.xp>=p.xpToNext){this.levelUp();summary.levels++;}this.addNarrative=add;
        this.state.inCombat=false;const finalBoss=e.finalBoss;this.state.enemy=null;document.getElementById('combat-panel').classList.add('hidden');MusicSystem.play(this.getLocationMusic());this.updateHUD();
        add.call(this,`Battle finished. ${summary.defeated.join(', ')} defeated.`,'treasure');
        if(summary.levels)add.call(this,`Level up! ${p.name} reached level ${p.level}.`,'treasure');
        add.call(this,`Experience gained: ${summary.xp}. Gold gained: ${summary.gold}.`,'treasure');
        if(summary.drops.length){const counts={};summary.drops.forEach(i=>counts[i.name]=(counts[i.name]||0)+1);add.call(this,`Dropped items: ${Object.entries(counts).map(([n,q])=>`${n} x${q}`).join(', ')}. Type “loot” to collect available ground items.`,'item');summary.drops.forEach(item=>OnlineSystem.dropWorldItem(summary.location,item).then(ok=>{if(!ok)this.state.sacred.groundLoot.push(item);}));}
        else add.call(this,'Dropped items: none.','system');
        MusicSystem.playSFX('victory');this.save();if(finalBoss)this.victory();
    };
    window.CleanBattleText={cleanDescription};
})();
