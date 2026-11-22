
const BASE=new URL('./',self.registration.scope);
const PREFIX=`black-sword:${BASE.href}:shell:`;
const CACHE=PREFIX+'black-sword-v7.58.0-advent3';
const MUSIC_CACHE=`black-sword:${BASE.href}:music-v1`;
const CORE=[
  '','index.html','styles.css','manifest.webmanifest','version.js','music.js','accessible-dialogs.js','gesture-accessibility.js',
  'assets/voices/ashen-vale-guide-0.mp3','assets/voices/ashen-vale-guide-1.mp3','assets/voices/ashen-vale-guide-2.mp3','assets/voices/ashen-vale-guide-deeds.mp3',
  'assets/voices/aurora-city-estate-agent-0.mp3','assets/voices/aurora-city-estate-agent-1.mp3','assets/voices/aurora-city-estate-agent-2.mp3','assets/voices/aurora-city-estate-agent-deeds.mp3',
  'assets/voices/aurora-city-guild-registrar-0.mp3','assets/voices/aurora-city-guild-registrar-1.mp3','assets/voices/aurora-city-guild-registrar-2.mp3','assets/voices/aurora-city-guild-registrar-3.mp3',
  'assets/voices/aurora-city-guild-registrar-4.mp3','assets/voices/aurora-city-guild-registrar-5.mp3','assets/voices/aurora-city-guild-registrar-6.mp3','assets/voices/aurora-city-guild-registrar-7.mp3',
  'assets/voices/aurora-city-guild-registrar-8.mp3','assets/voices/aurora-city-guild-registrar-9.mp3','assets/voices/aurora-city-guild-registrar-deeds.mp3','assets/voices/aurora-city-tavern-keeper-0.mp3',
  'assets/voices/aurora-city-tavern-keeper-1.mp3','assets/voices/aurora-city-tavern-keeper-2.mp3','assets/voices/aurora-city-tavern-keeper-3.mp3','assets/voices/aurora-city-tavern-keeper-deeds.mp3',
  'assets/voices/brakka-ironhand-0.mp3','assets/voices/brakka-ironhand-1.mp3','assets/voices/brakka-ironhand-2.mp3','assets/voices/brakka-ironhand-deeds.mp3',
  'assets/voices/brother-cael-0.mp3','assets/voices/brother-cael-1.mp3','assets/voices/brother-cael-2.mp3','assets/voices/brother-cael-deeds.mp3',
  'assets/voices/captain-marcus-0.mp3','assets/voices/captain-marcus-1.mp3','assets/voices/captain-marcus-2.mp3','assets/voices/captain-marcus-deeds.mp3',
  'assets/voices/crystal-reach-guide-0.mp3','assets/voices/crystal-reach-guide-1.mp3','assets/voices/crystal-reach-guide-2.mp3','assets/voices/crystal-reach-guide-deeds.mp3',
  'assets/voices/dealer-jinx-0.mp3','assets/voices/dealer-jinx-1.mp3','assets/voices/dealer-jinx-2.mp3','assets/voices/dealer-jinx-deeds.mp3',
  'assets/voices/district-guide-0.mp3','assets/voices/district-guide-1.mp3','assets/voices/district-guide-2.mp3','assets/voices/district-guide-deeds.mp3',
  'assets/voices/drill-sergeant-0.mp3','assets/voices/drill-sergeant-1.mp3','assets/voices/drill-sergeant-deeds.mp3','assets/voices/elder-of-amberwick-0.mp3',
  'assets/voices/elder-of-amberwick-1.mp3','assets/voices/elder-of-amberwick-2.mp3','assets/voices/elder-of-amberwick-deeds.mp3','assets/voices/elder-of-frostmere-0.mp3',
  'assets/voices/elder-of-frostmere-1.mp3','assets/voices/elder-of-frostmere-2.mp3','assets/voices/elder-of-frostmere-deeds.mp3','assets/voices/elder-of-greenhollow-0.mp3',
  'assets/voices/elder-of-greenhollow-1.mp3','assets/voices/elder-of-greenhollow-2.mp3','assets/voices/elder-of-greenhollow-deeds.mp3','assets/voices/elder-of-ironford-0.mp3',
  'assets/voices/elder-of-ironford-1.mp3','assets/voices/elder-of-ironford-2.mp3','assets/voices/elder-of-ironford-deeds.mp3','assets/voices/elder-of-moonmeadow-0.mp3',
  'assets/voices/elder-of-moonmeadow-1.mp3','assets/voices/elder-of-moonmeadow-2.mp3','assets/voices/elder-of-moonmeadow-deeds.mp3','assets/voices/elder-of-oakrest-0.mp3',
  'assets/voices/elder-of-oakrest-1.mp3','assets/voices/elder-of-oakrest-2.mp3','assets/voices/elder-of-oakrest-deeds.mp3','assets/voices/elder-of-redhaven-0.mp3',
  'assets/voices/elder-of-redhaven-1.mp3','assets/voices/elder-of-redhaven-2.mp3','assets/voices/elder-of-redhaven-deeds.mp3','assets/voices/elder-of-starling-0.mp3',
  'assets/voices/elder-of-starling-1.mp3','assets/voices/elder-of-starling-2.mp3','assets/voices/elder-of-starling-deeds.mp3','assets/voices/elder-of-stonefield-0.mp3',
  'assets/voices/elder-of-stonefield-1.mp3','assets/voices/elder-of-stonefield-2.mp3','assets/voices/elder-of-stonefield-deeds.mp3','assets/voices/elder-of-willowbrook-0.mp3',
  'assets/voices/elder-of-willowbrook-1.mp3','assets/voices/elder-of-willowbrook-2.mp3','assets/voices/elder-of-willowbrook-deeds.mp3','assets/voices/ember-coast-guide-0.mp3',
  'assets/voices/ember-coast-guide-1.mp3','assets/voices/ember-coast-guide-2.mp3','assets/voices/ember-coast-guide-deeds.mp3','assets/voices/frostmarch-guide-0.mp3',
  'assets/voices/frostmarch-guide-1.mp3','assets/voices/frostmarch-guide-2.mp3','assets/voices/frostmarch-guide-deeds.mp3','assets/voices/garage-owner-vara-0.mp3',
  'assets/voices/garage-owner-vara-1.mp3','assets/voices/garage-owner-vara-2.mp3','assets/voices/garage-owner-vara-deeds.mp3','assets/voices/guild-master-helena-0.mp3',
  'assets/voices/guild-master-helena-1.mp3','assets/voices/guild-master-helena-2.mp3','assets/voices/guild-master-helena-3.mp3','assets/voices/guild-master-helena-4.mp3',
  'assets/voices/guild-master-helena-5.mp3','assets/voices/guild-master-helena-6.mp3','assets/voices/guild-master-helena-7.mp3','assets/voices/guild-master-helena-8.mp3',
  'assets/voices/guild-master-helena-9.mp3','assets/voices/guild-master-helena-deeds.mp3','assets/voices/ironroot-wilds-guide-0.mp3','assets/voices/ironroot-wilds-guide-1.mp3',
  'assets/voices/ironroot-wilds-guide-2.mp3','assets/voices/ironroot-wilds-guide-deeds.mp3','assets/voices/ironspire-city-estate-agent-0.mp3','assets/voices/ironspire-city-estate-agent-1.mp3',
  'assets/voices/ironspire-city-estate-agent-2.mp3','assets/voices/ironspire-city-estate-agent-deeds.mp3','assets/voices/ironspire-city-guild-registrar-0.mp3','assets/voices/ironspire-city-guild-registrar-1.mp3',
  'assets/voices/ironspire-city-guild-registrar-2.mp3','assets/voices/ironspire-city-guild-registrar-3.mp3','assets/voices/ironspire-city-guild-registrar-4.mp3','assets/voices/ironspire-city-guild-registrar-5.mp3',
  'assets/voices/ironspire-city-guild-registrar-6.mp3','assets/voices/ironspire-city-guild-registrar-7.mp3','assets/voices/ironspire-city-guild-registrar-8.mp3','assets/voices/ironspire-city-guild-registrar-9.mp3',
  'assets/voices/ironspire-city-guild-registrar-deeds.mp3','assets/voices/ironspire-city-tavern-keeper-0.mp3','assets/voices/ironspire-city-tavern-keeper-1.mp3','assets/voices/ironspire-city-tavern-keeper-2.mp3',
  'assets/voices/ironspire-city-tavern-keeper-3.mp3','assets/voices/ironspire-city-tavern-keeper-deeds.mp3','assets/voices/jade-lowlands-guide-0.mp3','assets/voices/jade-lowlands-guide-1.mp3',
  'assets/voices/jade-lowlands-guide-2.mp3','assets/voices/jade-lowlands-guide-deeds.mp3','assets/voices/kaliwasch-estate-agent-0.mp3','assets/voices/kaliwasch-estate-agent-1.mp3',
  'assets/voices/kaliwasch-estate-agent-2.mp3','assets/voices/kaliwasch-estate-agent-deeds.mp3','assets/voices/kaliwasch-guild-registrar-0.mp3','assets/voices/kaliwasch-guild-registrar-1.mp3',
  'assets/voices/kaliwasch-guild-registrar-2.mp3','assets/voices/kaliwasch-guild-registrar-3.mp3','assets/voices/kaliwasch-guild-registrar-4.mp3','assets/voices/kaliwasch-guild-registrar-5.mp3',
  'assets/voices/kaliwasch-guild-registrar-6.mp3','assets/voices/kaliwasch-guild-registrar-7.mp3','assets/voices/kaliwasch-guild-registrar-8.mp3','assets/voices/kaliwasch-guild-registrar-9.mp3',
  'assets/voices/kaliwasch-guild-registrar-deeds.mp3','assets/voices/kaliwasch-tavern-keeper-0.mp3','assets/voices/kaliwasch-tavern-keeper-1.mp3','assets/voices/kaliwasch-tavern-keeper-2.mp3',
  'assets/voices/kaliwasch-tavern-keeper-3.mp3','assets/voices/kaliwasch-tavern-keeper-deeds.mp3','assets/voices/king-aldric-0.mp3','assets/voices/king-aldric-1.mp3',
  'assets/voices/king-aldric-2.mp3','assets/voices/king-aldric-deeds.mp3','assets/voices/lyra-dawnstep-0.mp3','assets/voices/lyra-dawnstep-1.mp3',
  'assets/voices/lyra-dawnstep-2.mp3','assets/voices/lyra-dawnstep-deeds.mp3','assets/voices/mechanic-torque-0.mp3','assets/voices/mechanic-torque-1.mp3',
  'assets/voices/mechanic-torque-2.mp3','assets/voices/mechanic-torque-deeds.mp3','assets/voices/moonwood-guide-0.mp3','assets/voices/moonwood-guide-1.mp3',
  'assets/voices/moonwood-guide-2.mp3','assets/voices/moonwood-guide-deeds.mp3','assets/voices/nim-vex-0.mp3','assets/voices/nim-vex-1.mp3',
  'assets/voices/nim-vex-2.mp3','assets/voices/nim-vex-deeds.mp3','assets/voices/palace-chaplain-0.mp3','assets/voices/palace-chaplain-1.mp3',
  'assets/voices/palace-chaplain-2.mp3','assets/voices/palace-chaplain-deeds.mp3','assets/voices/race-organizer-petra-0.mp3','assets/voices/race-organizer-petra-1.mp3',
  'assets/voices/race-organizer-petra-2.mp3','assets/voices/race-organizer-petra-deeds.mp3','assets/voices/royal-archivist-0.mp3','assets/voices/royal-archivist-1.mp3',
  'assets/voices/royal-archivist-2.mp3','assets/voices/royal-archivist-3.mp3','assets/voices/royal-archivist-deeds.mp3','assets/voices/royal-armorer-0.mp3',
  'assets/voices/royal-armorer-1.mp3','assets/voices/royal-armorer-2.mp3','assets/voices/royal-armorer-deeds.mp3','assets/voices/royal-steward-0.mp3',
  'assets/voices/royal-steward-1.mp3','assets/voices/royal-steward-2.mp3','assets/voices/royal-steward-deeds.mp3','assets/voices/seabreeze-city-estate-agent-0.mp3',
  'assets/voices/seabreeze-city-estate-agent-1.mp3','assets/voices/seabreeze-city-estate-agent-2.mp3','assets/voices/seabreeze-city-estate-agent-deeds.mp3','assets/voices/seabreeze-city-guild-registrar-0.mp3',
  'assets/voices/seabreeze-city-guild-registrar-1.mp3','assets/voices/seabreeze-city-guild-registrar-2.mp3','assets/voices/seabreeze-city-guild-registrar-3.mp3','assets/voices/seabreeze-city-guild-registrar-4.mp3',
  'assets/voices/seabreeze-city-guild-registrar-5.mp3','assets/voices/seabreeze-city-guild-registrar-6.mp3','assets/voices/seabreeze-city-guild-registrar-7.mp3','assets/voices/seabreeze-city-guild-registrar-8.mp3',
  'assets/voices/seabreeze-city-guild-registrar-9.mp3','assets/voices/seabreeze-city-guild-registrar-deeds.mp3','assets/voices/seabreeze-city-tavern-keeper-0.mp3','assets/voices/seabreeze-city-tavern-keeper-1.mp3',
  'assets/voices/seabreeze-city-tavern-keeper-2.mp3','assets/voices/seabreeze-city-tavern-keeper-3.mp3','assets/voices/seabreeze-city-tavern-keeper-deeds.mp3','assets/voices/starfall-basin-guide-0.mp3',
  'assets/voices/starfall-basin-guide-1.mp3','assets/voices/starfall-basin-guide-2.mp3','assets/voices/starfall-basin-guide-deeds.mp3','assets/voices/storm-isles-guide-0.mp3',
  'assets/voices/storm-isles-guide-1.mp3','assets/voices/storm-isles-guide-2.mp3','assets/voices/storm-isles-guide-deeds.mp3','assets/voices/sunscar-desert-guide-0.mp3',
  'assets/voices/sunscar-desert-guide-1.mp3','assets/voices/sunscar-desert-guide-2.mp3','assets/voices/sunscar-desert-guide-deeds.mp3','assets/voices/tavern-keeper-greta-0.mp3',
  'assets/voices/tavern-keeper-greta-1.mp3','assets/voices/tavern-keeper-greta-2.mp3','assets/voices/tavern-keeper-greta-3.mp3','assets/voices/tavern-keeper-greta-deeds.mp3',
  'assets/voices/temple-priest-0.mp3','assets/voices/temple-priest-1.mp3','assets/voices/temple-priest-2.mp3','assets/voices/temple-priest-3.mp3',
  'assets/voices/temple-priest-deeds.mp3','assets/voices/void-frontier-guide-0.mp3','assets/voices/void-frontier-guide-1.mp3','assets/voices/void-frontier-guide-2.mp3',
  'assets/voices/void-frontier-guide-deeds.mp3','assets/voices/whispering-steppe-guide-0.mp3','assets/voices/whispering-steppe-guide-1.mp3','assets/voices/whispering-steppe-guide-2.mp3',
  'assets/voices/whispering-steppe-guide-deeds.mp3',
  'road-walking.js','npc-voices.js','assets/voices/aldric-deeds.mp3','assets/voices/aldric-fortune.mp3','assets/voices/aldric-gold.mp3','assets/voices/aldric-wares.mp3','assets/voices/aldric-welcome.mp3','assets/voices/courier-archive.mp3','assets/voices/courier-deeds.mp3','assets/voices/courier-route.mp3',
  'world.js','world-restructure-v748.js','world-expansion-v744.js','world-connectivity-v747.js','game-systems-v747.js','halloween-narration.js','expansion.js','regions-v4.js','online.js','game.js','sacred.js',
  'alexa-parity.js','equipment-sets.js','housing-world-v5.js','forest-expansion-v6.js','island-tunnel-fishing.js','translation.js',
  'chat-rooms.js','voice-artifacts-maps.js','spell-mastery-black-sword.js','world-grid-houses-combat-v8.js','city-directory-v9.js','context-actions-houses-prayer-v10.js',
  'cemetery-spellfield-combat-v11.js','cemetery-city-expansion-v23.js','astral-dragon-realm-v25.js','black-sword-alexa-multiplayer-v26.js','professional-audio-combat-v24.js','battle-summary-cleantext-v12.js',
  'expansive-forest-multitarget-v13.js','fair-group-combat-v14.js','wayfinder-battle-actions-v15.js','security-privacy-v16.js','resource-recovery-forest-exit-v17.js','companion-economy-arena-v18.js',
  'hunt-clear-v19.js','hunt-achievements-v20.js','hunt-wayfinder-v21.js','horse-racing-v22.js','world-navigation-v27.js','stabilization-v7211.js','chat-notice-feedback-v7221.js','healer-monsters-v7222.js','ai-npc-v7223.js','trading-v7224.js','car-racing-v28.js','game-tutorials-v29.js','palace-practice.html','items-hunger-v30.js','black-sword-features-v31.js','class-spells-v726.js','summon-allegiance-rings-v727.js','world-guide-rewards-v728.js','starlight-fair.js','advent-calendar-v730.js','christmas-crier-v731.js','christmas-games-v731.js','assets/advent/story-01.mp3','assets/advent/story-02.mp3','assets/advent/story-03.mp3','assets/advent/story-04.mp3','assets/advent/story-05.mp3','assets/advent/story-06.mp3','assets/advent/story-07.mp3','assets/advent/story-08.mp3','assets/advent/story-09.mp3','assets/advent/story-10.mp3','assets/advent/story-11.mp3','assets/advent/story-12.mp3','assets/crier/line-01.mp3','assets/crier/line-02.mp3','assets/crier/line-03.mp3','assets/crier/line-04.mp3','assets/crier/line-05.mp3','assets/crier/line-06.mp3','assets/crier/line-07.mp3','assets/crier/line-08.mp3','seasonal-events-v729.js','privacy.html','terms.html','game-hall.js','assets/vendor/chess.js',
  'narration-v755.js','bsu-server.js','survival-v755.js','palace-rooms-v755.js','prayer-angels-v755.js','screen-reader-v756.js','chess-ai-v755.js','game-hall-v755.js','pwa.js','backend-config.js','online-backend.js','icons/icon-192.png','assets/audio/sfx/attack-fast.wav','assets/audio/sfx/attack-heavy.wav','assets/audio/sfx/attack.wav','assets/audio/sfx/board-dice.wav','assets/audio/sfx/board-error.wav','assets/audio/sfx/board-piece.wav',
  'assets/audio/sfx/board-turn.wav','assets/audio/sfx/body-fall.wav','assets/audio/sfx/car-collision.mp3','assets/audio/sfx/car-door-close.ogg','assets/audio/sfx/car-door-open.ogg','assets/audio/sfx/car-horn.mp3',
  'assets/audio/sfx/car-skid.ogg','assets/audio/sfx/engine-idle.ogg','assets/audio/sfx/engine-rev.ogg','assets/audio/sfx/engine-start.ogg','assets/audio/sfx/engine-stop.ogg','assets/audio/sfx/gear-shift.ogg','assets/audio/sfx/car-crash.ogg','assets/audio/sfx/fuel-cap.ogg','assets/audio/sfx/fuel-pour.ogg','assets/audio/sfx/ladder-up.ogg','assets/audio/sfx/snake-down.ogg','assets/audio/sfx/game-win.ogg','assets/audio/sfx/game-lose.ogg','assets/audio/sfx/card-draw.wav','assets/audio/sfx/card-flip.wav','assets/audio/sfx/card-shuffle.wav','assets/audio/sfx/carrom-strike.wav',
  'assets/audio/sfx/check.wav','assets/audio/sfx/checkmate.wav','assets/audio/sfx/chess-move.wav','assets/audio/sfx/coin-collision.wav','assets/audio/sfx/coin.wav','assets/audio/sfx/death.wav',
  'assets/audio/sfx/door.wav','assets/audio/sfx/drink.ogg','assets/audio/sfx/eat.ogg','assets/audio/sfx/exp.wav',
  'assets/audio/sfx/explore.wav','assets/audio/sfx/ghost-moan.wav','assets/audio/sfx/ghost-scream.wav','assets/audio/sfx/goblin-cackle.wav','assets/audio/sfx/goblin-reaction.ogg','assets/audio/sfx/haunted-wind.wav',
  'assets/audio/sfx/heal-chain.wav','assets/audio/sfx/heal.wav','assets/audio/sfx/hit-metal-1.wav','assets/audio/sfx/hit-metal-2.wav','assets/audio/sfx/hit.wav','assets/audio/sfx/levelup.wav',
  'assets/audio/sfx/magic.wav','assets/audio/sfx/miss.wav','assets/audio/sfx/monster-hit.wav','assets/audio/sfx/monster-roar.wav','assets/audio/sfx/music-transition.wav','assets/audio/sfx/pickup.wav',
  'assets/audio/sfx/race-beep.mp3','assets/audio/sfx/race-checkpoint.mp3','assets/audio/sfx/spell-arcane.wav','assets/audio/sfx/spell-cast.wav','assets/audio/sfx/step-gravel.ogg','assets/audio/sfx/step-leaves-1.ogg',
  'assets/audio/sfx/step-leaves-2.ogg','assets/audio/sfx/step-mud.ogg','assets/audio/sfx/step-stone.ogg','assets/audio/sfx/step-wood.ogg','assets/audio/sfx/ui-click.wav',
  'assets/audio/audio-manifest.json','recorded-audio-checksums.json','assets/audio/licenses/Starter-Kit-Racing-MIT.txt','icons/icon-512.png','icons/icon-maskable-512.png','AUDIO_CREDITS.md'
];
const SOUNDTRACK=[
  'assets/audio/music/Fantasy-Choir-1.mp3',
  'assets/audio/music/Fantasy-Choir-2.mp3',
  'assets/audio/music/Fantasy-Choir-3.mp3',
  'assets/audio/music/adventure-intro.wav',
  'assets/audio/music/battle-fast.mp3',
  'assets/audio/music/battle.ogg',
  'assets/audio/music/boss.mp3',
  'assets/audio/music/dark-forest.mp3',
  'assets/audio/music/determined-pursuit.mp3',
  'assets/audio/music/town-theme-rpg.mp3',
  'assets/audio/music/natural-forest-theme.mp3',
  'assets/audio/music/battle-theme-a.mp3',
  'assets/audio/music/boss-battle-theme.mp3',
  'assets/audio/music/final-boss-theme.ogg',
  'assets/audio/music/dungeon.ogg',
  'assets/audio/music/exploration.mp3',
  'assets/audio/music/inn.mp3',
  'assets/audio/music/town.mp3',
  'assets/audio/music/victory.mp3'
];
// Keep the soundtrack between shell updates. Bump its cache revision if track bytes change.
self.addEventListener('message',event=>{
  const port=event.ports[0];
  if(event.data==='remove-soundtrack' && port){
    event.waitUntil(caches.delete(MUSIC_CACHE).then(
      ()=>port.postMessage({saved:0,total:SOUNDTRACK.length,done:true}),
      ()=>port.postMessage({error:'storage',done:true})
    ));
    return;
  }
  if(event.data==='check-soundtrack' && port){
    event.waitUntil((async()=>{
      try {
        // keys() reads request metadata without fetching or decoding any audio.
        const keys=await caches.has(MUSIC_CACHE) ? await (await caches.open(MUSIC_CACHE)).keys() : [];
        const urls=new Set(keys.map(request=>request.url));
        const saved=SOUNDTRACK.filter(path=>urls.has(new URL(path,BASE).href)).length;
        port.postMessage({saved,total:SOUNDTRACK.length,done:true});
      } catch { port.postMessage({error:'storage',done:true}); }
    })());
    return;
  }
  if(event.data!=='download-soundtrack'||!port)return;
  event.waitUntil((async()=>{
    let saved=0;
    try {
      const cache=await caches.open(MUSIC_CACHE);
      for(const path of SOUNDTRACK){
        try {
          const url=new URL(path,BASE).href;
          if(!await cache.match(url))await cache.add(url);
          saved++;
        } catch { /* Continue; retry only the missing tracks next time. */ }
        port.postMessage({saved,total:SOUNDTRACK.length});
      }
    } finally { port.postMessage({saved,total:SOUNDTRACK.length,done:true}); }
  })());
});
const CORE_URLS=CORE.map(path=>new URL(path,BASE).href);
const FALLBACK=new URL('index.html',BASE).href;
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(CORE_URLS)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));
// Service worker activates immediately after install, claims all pages.
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.pathname.includes('/api/')||url.hostname.endsWith('googleapis.com')||url.hostname.includes('google.com')||url.hostname.includes('gstatic.com')||url.hostname.includes('firebaseio.com')||url.hostname.includes('firebaseapp.com'))return;
  if(request.mode==='navigate'){
    // The installed index is the fallback for the entire scope. Only the game
    // entry points may refresh it; standalone pages keep their own cache keys.
    const page=url.origin+url.pathname;
    const shell=page===BASE.href||page===FALLBACK;
    event.respondWith((async()=>{
      let response;
      try { response=await fetch(request); }
      catch {
        const cache=await caches.open(CACHE);
        return (!shell && await cache.match(page)) || await cache.match(FALLBACK) || Response.error();
      }
      if(shell && response.status===200 && !response.redirected &&
         /^text\/html(?:\s*;|$)/i.test(response.headers.get('Content-Type')||'')) {
        try { await (await caches.open(CACHE)).put(FALLBACK,response.clone()); }
        catch { /* Cache quota or storage failure must not hide an online game. */ }
      }
      return response;
    })());
    return;
  }
  if(url.href.startsWith(new URL('assets/audio/music/',BASE).href)){
    event.respondWith(caches.open(MUSIC_CACHE).then(cache=>cache.match(request)).catch(()=>null)
      .then(hit=>hit||fetch(request)));
    return;
  }
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(request)).then(cached=>cached||fetch(request).then(response=>{
    if(response.status===200&&url.origin===self.location.origin){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  })));
});
