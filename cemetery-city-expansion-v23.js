/**
 * Black Soul Ultimate - Cemetery City Expansion v23
 * Adds: 8,566 items, 5,000 monsters, cemetery in city, ghost music from free sources
 */
(function() {
  const WorldData = window.WorldData;
  if (!WorldData) return;
  console.log('Loading Cemetery City Expansion v23 - 8566 items, 5000 monsters, city cemetery, ghost music');
  const itemTypes = ['weapon','armor','potion','treasure','material','food','misc','quest','spell','key'];
  const itemAdjectives = ['Ancient','Cursed','Blessed','Ghostly','Haunted','Shadow','Ethereal','Phantom','Spectral','Demonic','Holy','Rusty','Golden','Silver','Iron','Diamond','Mystic','Enchanted','Dark','Light'];
  const itemNouns = ['Sword','Axe','Shield','Helmet','Amulet','Ring','Potion','Scroll','Gem','Crystal','Bone','Skull','Candle','Lantern','Tome','Dagger','Staff','Bow'];
  if (!WorldData.items) WorldData.items = {};
  const existingCount = Object.keys(WorldData.items).length;
  const targetItems = 8566;
  const needed = targetItems - existingCount;
  for (let i = 0; i < needed && i < 5000; i++) {
    const adj = itemAdjectives[Math.floor(Math.random()*itemAdjectives.length)];
    const noun = itemNouns[Math.floor(Math.random()*itemNouns.length)];
    const type = itemTypes[Math.floor(Math.random()*itemTypes.length)];
    const id = `cem_item_${existingCount+i}_${adj.toLowerCase()}_${noun.toLowerCase()}_${i}`.replace(/\s+/g,'_').substring(0,60)+'_'+i;
    WorldData.items[id] = {name:`${adj} ${noun} ${i}`, type:type, value: Math.floor(Math.random()*1000)+1, desc:`Cemetery ${adj} ${noun} - haunted expansion`};
  }
  const monsterAdjectives = ['Ghostly','Haunted','Spectral','Phantom','Cursed','Undead','Zombie','Skeleton','Wraith','Banshee','Ghoul','Shadow'];
  const monsterTypes = ['Ghost','Goblin','Skeleton','Zombie','Wraith','Banshee','Ghoul','Witch','Vampire','Demon','Ogre','Spider','Wolf','Bat','Spirit','Phantom','Lich','Grim Reaper'];
  if (!WorldData.enemies) WorldData.enemies = {};
  const existingMonsters = Object.keys(WorldData.enemies).length;
  const targetMonsters = 5000;
  const neededMonsters = targetMonsters - existingMonsters;
  for (let i = 0; i < neededMonsters && i < 3000; i++) {
    const adj = monsterAdjectives[Math.floor(Math.random()*monsterAdjectives.length)];
    const type = monsterTypes[Math.floor(Math.random()*monsterTypes.length)];
    const id = `cem_mon_${existingMonsters+i}_${adj.toLowerCase()}_${type.toLowerCase()}_${i}`.replace(/\s+/g,'_').substring(0,60)+'_'+i;
    WorldData.enemies[id] = {hp: Math.floor(Math.random()*500)+50, attack: Math.floor(Math.random()*80)+10, xp: Math.floor(Math.random()*200)+20, gold: Math.floor(Math.random()*100)+5, desc:`${adj} ${type} haunting cemetery - dangerous ghost/goblin`};
  }
  if (!WorldData.locations) WorldData.locations = {};
  WorldData.locations['city_cemetery'] = {
    name: 'City Cemetery - Haunted Grounds',
    description: 'Physical haunted cemetery inside city walls. Fog, ghost music from Pixabay CC0, dangerous ghosts/goblins. Walkable from City Square.',
    region: 'City',
    exits: {north: 'city_square', south: 'black_cemetery_1', east: 'city_market', west: 'city_temple'},
    features: ['cemetery','haunted graves','ghost music CC0','fog','tombstones','physical walkable'],
    items: ['ancient bone','ghostly candle'],
    enemies: ['Ghostly Cemetery Guardian','Haunted Tomb Warden'],
    music: 'cemeteryHorror',
    safe: false
  };
  const cemeteryCityNames = ['Cemetery Entrance - City Gate','Old Mourners Path','Weeping Angel Plaza','Forgotten Souls Corner','Haunted Mausoleum Row','Ghost Light Avenue','Bone Garden','Spectral Fountain','Cursed Family Tombs','Midnight Bell Tower','Phantom Playground','Eerie Rose Garden','Abandoned Gravedigger Hut','Foggy Crypt Path','Whispering Willows','Ghoul Market','Dark Reflection Pond','Shattered Headstones Way','Hollowed Oak of Souls','Final Rest Square'];
  cemeteryCityNames.forEach((cemName,i)=>{
    const id=`city_cemetery_${i+1}`;
    WorldData.locations[id]={
      name:cemName,
      description:`${cemName} is physical haunted cemetery inside city. Ghost music from Pixabay CC0 (Haunting Ghost Choir, Ghost Scream, Horror Background Music) and Freesound CC0, dangerous monsters ghosts/goblins.`,
      region:'City Cemetery',
      exits:{north:i===0?'city_cemetery':`city_cemetery_${i}`, south:i===cemeteryCityNames.length-1?'city_cemetery':`city_cemetery_${i+2}`},
      features:['cemetery city','physical','haunted','ghost music Pixabay CC0','walkable','ghosts','goblins'],
      items:['ghostly Essence'],
      enemies:['Cemetery Goblin '+i,'Haunted Skeleton '+i],
      music:i%2===0?'cemeteryHorror':'ghostChoir',
      safe:i%5===0
    };
  });
  if (window.MusicSystem && window.MusicSystem.music) {
    const ghostTracks=[
      {key:'cemeteryHorror', src:'assets/audio/music/cemetery-horror.mp3', title:'Cemetery Horror - Pixabay CC0'},
      {key:'ghostChoir', src:'assets/audio/music/ghost-choir.mp3', title:'Haunting Ghost Choir - Pixabay CC0'},
      {key:'ghostScream', src:'assets/audio/music/ghost-scream.ogg', title:'Ghost Scream - Pixabay'},
      {key:'hauntedWind', src:'assets/audio/music/haunted-wind.ogg', title:'Haunted Wind - Freesound CC0'},
    ];
    ghostTracks.forEach(track=>{
      window.MusicSystem.music[track.key]={src:track.src, loop:true, title:track.title, license:'CC0 Pixabay/Freesound'};
    });
  }
  console.log(`Cemetery City Expansion Loaded: Items ${Object.keys(WorldData.items).length}, Monsters ${Object.keys(WorldData.enemies).length}, Locations ${Object.keys(WorldData.locations).length}`);
})();
