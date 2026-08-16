import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createRuntime, loadWorld } from '../scripts/load-world.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function audioFixture({ autoFinish = true } = {}) {
    const dom = new JSDOM('<!doctype html><body></body>', { url:'https://example.test/Black-sold-ultimate/', runScripts:'outside-only', pretendToBeVisual:true });
    const { window } = dom;
    window.Audio = class {
        constructor(){this.dataset={};this.paused=true;this.volume=1;this.currentTime=0;this.src='';this.listeners={};}
        addEventListener(type,listener){this.listeners[type]=listener;} removeAttribute(){} load(){} pause(){this.paused=true;}
        play(){this.paused=false;return Promise.resolve();}
    };
    window.AudioContext = class { constructor(){this.state='running';this.destination={};} createGain(){return{gain:{value:1},connect(){}};} createBufferSource(){return{connect(){},disconnect(){},addEventListener(){},start(){},playbackRate:{value:1}};} decodeAudioData(){return Promise.resolve({duration:.01});} };
    const spoken=[],cancelled=[];
    window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
    window.speechSynthesis={getVoices:()=>[{name:'English India',lang:'en-IN'}],addEventListener(){},cancel(){cancelled.push(true);},speak(utterance){spoken.push(utterance);if(autoFinish)queueMicrotask(()=>{utterance.onstart?.();utterance.onend?.();});}};
    window.fetch=async()=>({ok:false,status:404,arrayBuffer:async()=>new ArrayBuffer(0)});
    window.eval(await readFile('music.js','utf8'));
    const manager=window.AudioManager;manager.init();manager.fadeIn=async audio=>{audio.volume=manager.effectiveMusicVolume();};manager.fadeOut=async(audio,_d,{pause=true}={})=>{if(pause)audio.pause();};manager.fadeTo=async(audio,value)=>{audio.volume=value;};
    return {dom,window,manager,spoken,cancelled};
}

let runtime,worldFixture;
test.before(async()=>{runtime=await createRuntime();worldFixture=await loadWorld();await wait(10);});
test.after(()=>runtime?.dom.window.close());

// Audio preservation and contextual state (1–7)
test('(01/33) all fourteen baseline music files retain their exact before hashes',async()=>{
    const before=JSON.parse(await readFile('reports/audio-music-before-v7.21.1.json','utf8'));
    assert.equal(before.files.length,14);
    for(const file of before.files)assert.equal(hash(await readFile(file.path)),file.sha256,file.path);
});

test('(02/33) every added track has complete provenance, acquisition date, bytes, and checksum',async()=>{
    const manifest=JSON.parse(await readFile('assets/audio/audio-manifest.json','utf8'));
    const additions=manifest.assets.filter(a=>a.kind==='music'&&a.dateAccessed==='2026-08-16');
    assert.equal(additions.length,5);
    for(const asset of additions){for(const field of ['originalUrl','sourcePage','creator','license','licenseUrl','attributionRequirements','dateAccessed','sha256','bytes'])assert.ok(asset[field],`${asset.path}.${field}`);const bytes=await readFile(asset.path);assert.equal(bytes.length,asset.bytes);assert.equal(hash(bytes),asset.sha256);}
});

test('(03/33) new town, forest, normal, boss, and final-boss music is registered in suitable playlists',async()=>{
    const {dom,manager}=await audioFixture();
    assert.ok(manager.playlists.CITY.includes('townThemeRpg'));
    assert.ok(manager.playlists.FOREST.includes('naturalForest'));
    assert.ok(manager.playlists.BATTLE_NORMAL.includes('battleThemeA'));
    assert.ok(manager.playlists.BATTLE_BOSS.includes('bossBattleTheme'));
    assert.ok(manager.playlists.BATTLE_FINAL_BOSS.includes('finalBossTheme'));
    dom.window.close();
});

test('(04/33) exploration tracks loop stably until their world context changes',async()=>{
    const {dom,manager}=await audioFixture();manager.selectContextPlaylist('FOREST',{force:true});await wait(5);assert.equal(manager.worldAudio.loop,true);assert.equal(manager.audioState,'world');dom.window.close();
});

test('(05/33) battle transition pauses the world layer and starts the one overlay layer immediately',async()=>{
    const {dom,manager}=await audioFixture();await manager.startMusicLayer('world','naturalForest');await manager.beginBattle('BATTLE_NORMAL');assert.equal(manager.worldAudio.paused,true);assert.equal(manager.overlayAudio.paused,false);assert.equal(manager.audioState,'battle');dom.window.close();
});

test('(06/33) boss and final-boss context selection never falls back to the normal playlist',async()=>{
    const {dom,window,manager}=await audioFixture();window.Game={state:{enemy:{boss:true}}};assert.equal(manager.battleContextFromGame('BATTLE_NORMAL'),'BATTLE_BOSS');window.Game.state.enemy={boss:true,finalBoss:true};assert.equal(manager.battleContextFromGame('BATTLE_NORMAL'),'BATTLE_FINAL_BOSS');assert.equal(manager.playlists.BATTLE_NORMAL.includes('finalBossTheme'),false);dom.window.close();
});

test('(07/33) battle end restores the saved world context through victory and restore states',async()=>{
    const {dom,manager}=await audioFixture();manager.worldContext='FOREST';manager.battleActive=true;manager.overlayMode='battle';manager.overlayAudio.paused=false;const originalNext=manager.nextTrack.bind(manager);manager.nextTrack=context=>context==='BATTLE_VICTORY'?null:originalNext(context);await manager.endBattle({victory:true,worldContext:'FOREST'});assert.equal(manager.battleActive,false);assert.equal(manager.worldContext,'FOREST');assert.equal(manager.audioState,'world');assert.equal(manager.worldAudio.loop,true);dom.window.close();
});

// Central game TTS (8–12)
test('(08/33) ordinary game TTS requests are serialized in insertion order',async()=>{
    const {dom,manager,spoken}=await audioFixture();manager.voiceEnabled=true;await Promise.all([manager.playVoice('first'),manager.playVoice('second')]);assert.deepEqual(spoken.map(u=>u.text),['first','second']);dom.window.close();
});

test('(09/33) critical TTS cancels active and queued stale speech before speaking',async()=>{
    const {dom,manager,spoken,cancelled}=await audioFixture({autoFinish:false});manager.voiceEnabled=true;const first=manager.playVoice('stale active');const second=manager.playVoice('stale queued');const critical=manager.speakCritical('critical encounter');assert.deepEqual(spoken.map(u=>u.text),['stale active','critical encounter']);spoken.at(-1).onstart?.();spoken.at(-1).onend?.();assert.deepEqual(await Promise.all([first,second,critical]),[false,false,true]);assert.ok(cancelled.length);dom.window.close();
});

test('(10/33) TTS volume and ducking are independent from stored music volume',async()=>{
    const {dom,manager,spoken}=await audioFixture({autoFinish:false});manager.voiceEnabled=true;manager.setMusicVolume(.31);manager.setVoiceVolume(.42);await Promise.resolve();const task=manager.playVoice('volume check');assert.equal(spoken[0].volume,.42);spoken[0].onstart?.();assert.equal(manager.duckRequests.has('voice'),true);assert.equal(manager.volume,.31);spoken[0].onend?.();await task;assert.equal(manager.duckRequests.has('voice'),false);dom.window.close();
});

test('(11/33) GAME_TTS_TEST is hidden, explicit, and does not auto-run speech',async()=>{
    const {dom,window,spoken}=await audioFixture();assert.equal(typeof window.GAME_TTS_TEST.run,'function');assert.equal(typeof window.GAME_TTS_TEST.snapshot,'function');assert.equal(spoken.length,0);dom.window.close();
});

test('(12/33) shipped gameplay modules create no competing Audio engines',async()=>{
    const files=(await readdir('.')).filter(name=>name.endsWith('.js')&&name!=='music.js');for(const file of files){const text=await readFile(file,'utf8');assert.equal(/new\s+Audio\s*\(/.test(text),false,file);}
});

// Monster aggregation and encounter announcement (13–17)
test('(13/33) monster formatter uses singular wording for one monster',()=>assert.equal(runtime.window.MonsterGroupFormatter.format(['wild boar']),'one wild boar'));
test('(14/33) repeated monsters aggregate once with a count and plural',()=>assert.equal(runtime.window.MonsterGroupFormatter.format(['wild boar','wild boar','wild boar']),'three wild boars'));
test('(15/33) mixed groups retain first-seen order and natural conjunctions',()=>assert.equal(runtime.window.MonsterGroupFormatter.format(['goblin','wolf','goblin','witch']),'two goblins, one wolf, and one witch'));
test('(16/33) irregular monster plurals are not formed by blindly appending s',()=>assert.equal(runtime.window.MonsterGroupFormatter.format(['wolf','wolf','fairy','fairy']),'two wolves and two fairies'));

test('(17/33) encounter log, accessible label, and visible group summary share one aggregate description',()=>{
    const {Game,document}=runtime.window;Game.state.player={level:1,spells:[],hp:100,maxHp:100,mp:50,maxMp:50,str:10,dex:10,int:10,wis:10,defense:1};Game.state.location='forest';Game.state.sacred={enemyQueue:[],encounterMode:'full',movesSinceEncounter:5,lastRandomEncounterAt:0,groundLoot:[]};const oldRandom=runtime.window.Math.random;runtime.window.Math.random=()=>0;document.getElementById('narrative').innerHTML='';Game.startCombat('root goblin');const lines=[...document.querySelectorAll('#narrative p')].filter(p=>p.textContent.startsWith('You encountered '));assert.equal(lines.length,1);const description=lines[0].textContent.replace(/^You encountered |\.$/g,'');assert.ok(document.getElementById('combat-panel').getAttribute('aria-label').includes(description));assert.ok(document.querySelector('.enemy-group-summary').textContent.includes(description));runtime.window.Math.random=oldRandom;
});

// Endless protected wilderness encounters (18–21)
test('(18/33) ordinary roaming pool remains populated after quest quotas are exhausted',()=>{
    const {Game,WorldData}=runtime.window,loc='forest';Game.state.slainEnemies[loc]=Object.fromEntries(WorldData.locations[loc].enemies.map(name=>[name,999]));const pool=Game.getRandomEncounterPool(loc);assert.ok(pool.length);assert.ok(pool.every(name=>!WorldData.enemies[name].boss&&!WorldData.enemies[name].finalBoss));
});

test('(19/33) defeated bosses remain finite even though ordinary wilderness monsters are endless',()=>{
    const {Game,WorldData}=runtime.window;const found=Object.entries(WorldData.locations).find(([,l])=>(l.enemies||[]).some(n=>WorldData.enemies[n]?.boss||WorldData.enemies[n]?.finalBoss));assert.ok(found);const [id,loc]=found,boss=loc.enemies.find(n=>WorldData.enemies[n]?.boss||WorldData.enemies[n]?.finalBoss);Game.state.slainEnemies[id]={[boss]:Game.getEnemyQuota(id,boss)};assert.equal(Game.getRandomEncounterPool(id).includes(boss),false);
});

test('(20/33) movement and wall-clock cooldowns prevent encounter spam',()=>{
    const {Game}=runtime.window;Game.state.location='forest';Game.state.sacred={...(Game.state.sacred||{}),encounterMode:'full',movesSinceEncounter:10,lastRandomEncounterAt:100000};assert.equal(Game.randomEncounterEligibility('forest',120000).eligible,false);assert.equal(Game.randomEncounterEligibility('forest',146000).eligible,true);Game.state.sacred.movesSinceEncounter=1;assert.equal(Game.randomEncounterEligibility('forest',200000).eligible,false);
});

test('(21/33) generated roaming groups stay within two to six and do not mutate quest kill counts',()=>{
    const {Game}=runtime.window;Game.state.location='forest';Game.state.inCombat=false;Game.state.enemy=null;Game.state.sacred={...(Game.state.sacred||{}),enemyQueue:[]};const before=JSON.stringify(Game.state.slainEnemies),oldRandom=runtime.window.Math.random;runtime.window.Math.random=()=>.999;Game.startCombat('root goblin');const size=1+(Game.state.sacred.enemyQueue||[]).length;assert.ok(size>=2&&size<=6);assert.equal(JSON.stringify(Game.state.slainEnemies),before);runtime.window.Math.random=oldRandom;
});

// Finite live world and Wayfinder (22–25)
const graphRoute=(locations,start,target)=>{const queue=[[start,[]]],seen=new Set([start]);while(queue.length){const [id,path]=queue.shift();if(id===target)return path;for(const [direction,next] of Object.entries(locations[id]?.exits||{}))if(!seen.has(next)){seen.add(next);queue.push([next,[...path,direction]]);}}return null;};

test('(22/33) city, forest, cave, dungeon, and cemetery entrances are reachable from Market Square',()=>{
    const L=worldFixture.world.locations;for(const id of ['forest','great_forest_north_gate','great_forest_south_gate','great_forest_east_gate','great_forest_west_gate','expansive_forest_1','mountains','dungeon_entrance','city_cemetery_1'])assert.ok(graphRoute(L,'kaliwasch',id)?.length,id);
});

test('(23/33) island ferry transition is real, reciprocal, and both shores are reachable',()=>{
    const L=worldFixture.world.locations;assert.equal(L.seabreeze_ferry.exits.northeast,'storm_island_central_dock');assert.equal(L.storm_island_central_dock.exits.southwest,'seabreeze_ferry');assert.ok(graphRoute(L,'kaliwasch','storm_island_central_dock'));
});

test('(24/33) Wayfinder reads the same finalized movement graph',()=>{
    const {Game,WorldGraph}=runtime.window;const a=Game.findPath('kaliwasch','storm_island_central_dock'),b=WorldGraph.route('kaliwasch','storm_island_central_dock');assert.ok(a?.length&&b?.length);const execute=path=>{let id='kaliwasch';for(const direction of path){assert.ok(runtime.window.WorldData.locations[id].exits[direction]);id=runtime.window.WorldData.locations[id].exits[direction];}return id;};assert.equal(execute(a),'storm_island_central_dock');assert.equal(execute(b),'storm_island_central_dock');
});

test('(25/33) every advertised step on required landmark routes is executable',()=>{
    const L=worldFixture.world.locations;for(const target of ['forest','seabreeze_ferry','storm_island_central_dock','dungeon_entrance']){let id='kaliwasch';for(const direction of graphRoute(L,id,target)){const next=L[id].exits[direction];assert.ok(next,`${id}.${direction}`);id=next;}assert.equal(id,target);}
});

// Interface modes (26–28)
test('(26/33) first launch requires an explicit Blind/TalkBack-first or Sighted choice',()=>{
    const {document}=runtime.window;if(!runtime.window.InterfaceMode.read()){assert.equal(document.getElementById('interface-mode-dialog').classList.contains('hidden'),false);assert.equal(document.getElementById('game-container').inert,true);}else assert.ok(['blind','sighted'].includes(runtime.window.InterfaceMode.read()));
});

test('(27/33) interface switching is immediate and persists independently of login state',()=>{
    const {InterfaceMode,document,localStorage}=runtime.window;InterfaceMode.apply('blind');assert.equal(document.documentElement.dataset.interfaceMode,'blind');assert.equal(localStorage.getItem(InterfaceMode.storageKey),'blind');InterfaceMode.current=null;assert.equal(InterfaceMode.read(),'blind');InterfaceMode.apply('sighted');assert.equal(document.getElementById('setting-interface-mode').value,'sighted');
});

test('(28/33) both modes preserve semantic accessibility and never disable platform accessibility',async()=>{
    const {document,InterfaceMode}=runtime.window;for(const mode of ['blind','sighted']){InterfaceMode.apply(mode);assert.equal(document.getElementById('game-container').getAttribute('role'),'main');assert.ok(document.getElementById('setting-interface-mode').labels.length);assert.equal(document.getElementById('narrative').getAttribute('role'),'log');}const source=await readFile('stabilization-v7211.js','utf8');assert.equal(/(?:TalkBack|accessibility)[\s\S]{0,30}\.(?:disable|stop)\s*\(/i.test(source),false);
});

// Uncapped, ID-safe hero roster (29–31)
const makeHero=(index,id)=>({player:{name:`Hero ${index}`,race:'human',class:'warrior',level:index,hp:10,maxHp:10,mp:5,maxMp:5,str:10,dex:10,int:10,wis:10,spells:[]},location:'kaliwasch',inventory:[],visited:['kaliwasch'],quests:[],completedQuests:[],slainEnemies:{},id});

test('(29/33) creating another hero is allowed when more than six already exist',()=>{
    const {Game,localStorage}=runtime.window,heroes={};for(let i=1;i<=8;i++)heroes[`stable_${i}`]=makeHero(i,`stable_${i}`);localStorage.setItem(Game.state.rosterKey,JSON.stringify({version:2,activeHeroId:'stable_1',heroes}));Game.startNewHero();assert.ok(Game.state.pendingHeroId);assert.equal(Game.state.screen,'char-screen');
});

test('(30/33) a large roster renders every stable ID with TalkBack-safe named actions',()=>{
    const {Game,document}=runtime.window;Game.showHeroRoster();assert.equal(document.querySelectorAll('#hero-roster .hero-card').length,8);assert.equal(document.getElementById('btn-create-another-hero').disabled,false);for(const card of document.querySelectorAll('.hero-card')){assert.ok(card.querySelector('.hero-stable-id code'));for(const button of card.querySelectorAll('button'))assert.ok(button.getAttribute('aria-label'));}
});

test('(31/33) deletion is confirmation-protected and targets the stable hero ID, not list index',()=>{
    const {Game,localStorage}=runtime.window;let prompt='';runtime.window.confirm=text=>(prompt=text,true);Game.deleteHero('stable_3');const roster=JSON.parse(localStorage.getItem(Game.state.rosterKey));assert.equal(Boolean(roster.heroes.stable_3),false);assert.ok(roster.heroes.stable_4);assert.match(prompt,/stable_3/);
});

// Server-enforced ephemeral chat (32–33)
test('(32/33) migration enforces immutable server five-minute expiry, secure room RLS, purge, and indexes',async()=>{
    const sql=await readFile('supabase/features_v18_five_minute_chat.sql','utf8');for(const pattern of [/new\.created_at=clock_timestamp\(\)/i,/new\.expires_at=new\.created_at\+interval '5 minutes'/i,/timestamps are immutable/i,/expires_at>now\(\).*chat_room_members/is,/m\.room_id=chat_room_messages\.room_id/i,/blocked_user_id=auth\.uid\(\)/i,/purge_expired_chat_messages/i,/room_messages_room_expiration_idx/i,/messages_receiver_expiration_idx/i])assert.match(sql,pattern);assert.match(sql,/revoke all on function public\.purge_expired_chat_messages\(\) from public,anon,authenticated/i);
});

test('(33/33) chat clients query, filter, expire, delete-reconcile, and reject cross-room realtime rows',async()=>{
    const [online,rooms]=await Promise.all([readFile('online.js','utf8'),readFile('chat-rooms.js','utf8')]);assert.match(online,/\.gt\('expires_at',new Date\(\)\.toISOString\(\)\)/);assert.match(online,/isFreshMessage/);assert.match(online,/eventType==='DELETE'/);assert.match(rooms,/\.gt\('expires_at',now\)/);assert.match(rooms,/payload\.new\.room_id!==roomId/);assert.match(rooms,/isFresh\(payload\.new\)/);assert.match(rooms,/scheduleExpiry/);assert.match(rooms,/eventType==='DELETE'/);
});
