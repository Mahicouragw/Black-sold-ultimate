const CACHE='black-sword-v7.30.0';
const BASE=new URL('./',self.registration.scope);
const CORE=[
  '','index.html','styles.css','manifest.webmanifest','version.js','music.js','accessible-dialogs.js','gesture-accessibility.js',
  'world.js','expansion.js','regions-v4.js','online.js','game.js','sacred.js',
  'alexa-parity.js','equipment-sets.js','housing-world-v5.js','forest-expansion-v6.js','island-tunnel-fishing.js','translation.js',
  'chat-rooms.js','voice-artifacts-maps.js','spell-mastery-black-sword.js','world-grid-houses-combat-v8.js','city-directory-v9.js','context-actions-houses-prayer-v10.js',
  'cemetery-spellfield-combat-v11.js','cemetery-city-expansion-v23.js','astral-dragon-realm-v25.js','black-sword-alexa-multiplayer-v26.js','professional-audio-combat-v24.js','battle-summary-cleantext-v12.js',
  'expansive-forest-multitarget-v13.js','fair-group-combat-v14.js','wayfinder-battle-actions-v15.js','security-privacy-v16.js','resource-recovery-forest-exit-v17.js','companion-economy-arena-v18.js',
  'hunt-clear-v19.js','hunt-achievements-v20.js','hunt-wayfinder-v21.js','horse-racing-v22.js','world-navigation-v27.js','stabilization-v7211.js','chat-notice-feedback-v7221.js','healer-monsters-v7222.js','ai-npc-v7223.js','trading-v7224.js','car-racing-v28.js','game-tutorials-v29.js','items-hunger-v30.js','black-sword-features-v31.js','class-spells-v726.js','summon-allegiance-rings-v727.js','world-guide-rewards-v728.js','seasonal-events-v729.js','privacy.html','terms.html','game-hall.js','assets/vendor/chess.js',
  'pwa.js','backend-config.js','firebase-auth-client.js','neon-game-client.js','assets/vendor/neon-0.9.0-beta.js','assets/vendor/NEON-LICENSE.txt','icons/icon-192.png','assets/audio/music/Fantasy-Choir-1.mp3','assets/audio/music/Fantasy-Choir-2.mp3',
  'assets/audio/music/Fantasy-Choir-3.mp3','assets/audio/music/adventure-intro.wav','assets/audio/music/battle-fast.mp3','assets/audio/music/battle.ogg','assets/audio/music/boss.mp3','assets/audio/music/dark-forest.mp3',
  'assets/audio/music/determined-pursuit.mp3','assets/audio/music/town-theme-rpg.mp3','assets/audio/music/natural-forest-theme.mp3','assets/audio/music/battle-theme-a.mp3','assets/audio/music/boss-battle-theme.mp3','assets/audio/music/final-boss-theme.ogg','assets/audio/music/dungeon.ogg','assets/audio/music/exploration.mp3','assets/audio/music/inn.mp3','assets/audio/music/town.mp3','assets/audio/music/victory.mp3',
  'assets/audio/sfx/attack-fast.wav','assets/audio/sfx/attack-heavy.wav','assets/audio/sfx/attack.wav','assets/audio/sfx/board-dice.wav','assets/audio/sfx/board-error.wav','assets/audio/sfx/board-piece.wav',
  'assets/audio/sfx/board-turn.wav','assets/audio/sfx/body-fall.wav','assets/audio/sfx/car-collision.mp3','assets/audio/sfx/car-door-close.ogg','assets/audio/sfx/car-door-open.ogg','assets/audio/sfx/car-horn.mp3',
  'assets/audio/sfx/car-skid.ogg','assets/audio/sfx/car-start.mp3','assets/audio/sfx/card-draw.wav','assets/audio/sfx/card-flip.wav','assets/audio/sfx/card-shuffle.wav','assets/audio/sfx/carrom-strike.wav',
  'assets/audio/sfx/check.wav','assets/audio/sfx/checkmate.wav','assets/audio/sfx/chess-move.wav','assets/audio/sfx/coin-collision.wav','assets/audio/sfx/coin.wav','assets/audio/sfx/death.wav',
  'assets/audio/sfx/door.wav','assets/audio/sfx/drink.ogg','assets/audio/sfx/eat.ogg','assets/audio/sfx/engine-high.wav','assets/audio/sfx/engine-low.wav','assets/audio/sfx/exp.wav',
  'assets/audio/sfx/explore.wav','assets/audio/sfx/ghost-moan.wav','assets/audio/sfx/ghost-scream.wav','assets/audio/sfx/goblin-cackle.wav','assets/audio/sfx/goblin-reaction.ogg','assets/audio/sfx/haunted-wind.wav',
  'assets/audio/sfx/heal-chain.wav','assets/audio/sfx/heal.wav','assets/audio/sfx/hit-metal-1.wav','assets/audio/sfx/hit-metal-2.wav','assets/audio/sfx/hit.wav','assets/audio/sfx/levelup.wav',
  'assets/audio/sfx/magic.wav','assets/audio/sfx/miss.wav','assets/audio/sfx/monster-hit.wav','assets/audio/sfx/monster-roar.wav','assets/audio/sfx/music-transition.wav','assets/audio/sfx/pickup.wav',
  'assets/audio/sfx/race-beep.mp3','assets/audio/sfx/race-checkpoint.mp3','assets/audio/sfx/spell-arcane.wav','assets/audio/sfx/spell-cast.wav','assets/audio/sfx/step-gravel.ogg','assets/audio/sfx/step-leaves-1.ogg',
  'assets/audio/sfx/step-leaves-2.ogg','assets/audio/sfx/step-mud.ogg','assets/audio/sfx/step-stone.ogg','assets/audio/sfx/step-wood.ogg','assets/audio/sfx/ui-click.wav',
  'assets/audio/audio-manifest.json','recorded-audio-checksums.json','assets/audio/licenses/Starter-Kit-Racing-MIT.txt','icons/icon-512.png','icons/icon-maskable-512.png','AUDIO_CREDITS.md'
];
const CORE_URLS=CORE.map(path=>new URL(path,BASE).href);
const FALLBACK=new URL('index.html',BASE).href;
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(CORE_URLS)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()).then(()=>{
    // Tell all controlled pages to reload so they pick up the new cache.
    self.clients.matchAll({type:'window'}).then(clients=>{
      clients.forEach(c=>c.postMessage({type:'RELOAD_FOR_UPDATE'}));
    });
  })
));
// Allow pages to send SKIP_WAITING to force immediate activation.
self.addEventListener('message',event=>{
  if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.pathname.includes('/api/')||url.hostname.endsWith('.neon.tech')||url.hostname.endsWith('.neon.build')||url.hostname.includes('google.com')||url.hostname.includes('gstatic.com')||url.hostname.includes('firebaseio.com')||url.hostname.includes('firebaseapp.com'))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(FALLBACK,copy));return response;
    }).catch(()=>caches.match(FALLBACK)));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok&&url.origin===self.location.origin){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  })));
});
