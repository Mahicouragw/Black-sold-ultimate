const CACHE='black-sword-v7.21.1';
const BASE=new URL('./',self.registration.scope);
const CORE=[
  '','index.html','styles.css','manifest.webmanifest','version.js','music.js',
  'world.js','expansion.js','regions-v4.js','online.js','game.js','sacred.js',
  'alexa-parity.js','equipment-sets.js','housing-world-v5.js','forest-expansion-v6.js','island-tunnel-fishing.js','translation.js',
  'chat-rooms.js','voice-artifacts-maps.js','spell-mastery-black-sword.js','world-grid-houses-combat-v8.js','city-directory-v9.js','context-actions-houses-prayer-v10.js',
  'cemetery-spellfield-combat-v11.js','cemetery-city-expansion-v23.js','astral-dragon-realm-v25.js','black-sword-alexa-multiplayer-v26.js','professional-audio-combat-v24.js','battle-summary-cleantext-v12.js',
  'expansive-forest-multitarget-v13.js','fair-group-combat-v14.js','wayfinder-battle-actions-v15.js','security-privacy-v16.js','resource-recovery-forest-exit-v17.js','companion-economy-arena-v18.js',
  'hunt-clear-v19.js','hunt-achievements-v20.js','hunt-wayfinder-v21.js','horse-racing-v22.js','world-navigation-v27.js','stabilization-v7211.js','game-hall.js','assets/vendor/chess.js',
  'pwa.js','supabase-config.js','assets/vendor/supabase-2.57.4.js','icons/icon-192.png','assets/audio/music/Fantasy-Choir-1.mp3','assets/audio/music/Fantasy-Choir-2.mp3',
  'assets/audio/music/Fantasy-Choir-3.mp3','assets/audio/music/adventure-intro.wav','assets/audio/music/battle-fast.mp3','assets/audio/music/battle.ogg','assets/audio/music/boss.mp3','assets/audio/music/dark-forest.mp3',
  'assets/audio/music/determined-pursuit.mp3','assets/audio/music/town-theme-rpg.mp3','assets/audio/music/natural-forest-theme.mp3','assets/audio/music/battle-theme-a.mp3','assets/audio/music/boss-battle-theme.mp3','assets/audio/music/final-boss-theme.ogg','assets/audio/music/dungeon.ogg','assets/audio/music/exploration.mp3','assets/audio/music/inn.mp3','assets/audio/music/town.mp3','assets/audio/music/victory.mp3',
  'assets/audio/sfx/attack-fast.wav','assets/audio/sfx/attack-heavy.wav','assets/audio/sfx/attack.wav','assets/audio/sfx/board-dice.wav','assets/audio/sfx/board-error.wav','assets/audio/sfx/board-piece.wav',
  'assets/audio/sfx/board-turn.wav','assets/audio/sfx/body-fall.wav','assets/audio/sfx/card-draw.wav','assets/audio/sfx/card-flip.wav','assets/audio/sfx/card-shuffle.wav','assets/audio/sfx/carrom-strike.wav',
  'assets/audio/sfx/check.wav','assets/audio/sfx/checkmate.wav','assets/audio/sfx/chess-move.wav','assets/audio/sfx/coin-collision.wav','assets/audio/sfx/coin.wav','assets/audio/sfx/death.wav',
  'assets/audio/sfx/door.wav','assets/audio/sfx/exp.wav','assets/audio/sfx/explore.wav','assets/audio/sfx/ghost-moan.wav','assets/audio/sfx/ghost-scream.wav','assets/audio/sfx/goblin-cackle.wav',
  'assets/audio/sfx/haunted-wind.wav','assets/audio/sfx/heal-chain.wav','assets/audio/sfx/heal.wav','assets/audio/sfx/hit-metal-1.wav','assets/audio/sfx/hit-metal-2.wav','assets/audio/sfx/hit.wav',
  'assets/audio/sfx/levelup.wav','assets/audio/sfx/magic.wav','assets/audio/sfx/miss.wav','assets/audio/sfx/monster-hit.wav','assets/audio/sfx/monster-roar.wav','assets/audio/sfx/pickup.wav',
  'assets/audio/sfx/spell-arcane.wav','assets/audio/sfx/spell-cast.wav','assets/audio/sfx/step-gravel.ogg','assets/audio/sfx/step-leaves-1.ogg','assets/audio/sfx/step-leaves-2.ogg','assets/audio/sfx/step-mud.ogg',
  'assets/audio/sfx/step-stone.ogg','assets/audio/sfx/step-wood.ogg','assets/audio/audio-manifest.json','icons/icon-512.png','icons/icon-maskable-512.png','AUDIO_CREDITS.md'
];
const CORE_URLS=CORE.map(path=>new URL(path,BASE).href);
const FALLBACK=new URL('index.html',BASE).href;
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(CORE_URLS)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.pathname.includes('/api/')||url.hostname.includes('supabase.co')||url.hostname.includes('google.com'))return;
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
