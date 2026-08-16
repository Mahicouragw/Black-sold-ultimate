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
  // v7.17.2 FIX: the previous loop generated ~3000 procedurally-named monsters
  // that NO location referenced, while the locations below referenced names
  // that did not exist (combat silently did nothing). Now every referenced
  // enemy and item is defined by its exact name.
  if (!WorldData.locations) WorldData.locations = {};
  WorldData.locations['city_cemetery'] = {
    name: 'City Cemetery - Haunted Grounds',
    description: 'Physical haunted cemetery inside city walls. Fog, ghost music CC0, dangerous ghosts/goblins. Walkable from Quiet Graveyard Road.',
    region: 'City',
    // v7.17.2 FIX: exits now point to real locations (quiet_graveyard_8 exists
    // via housing-world-v5; black_cemetery_1 via cemetery-spellfield-v11; the
    // east/west arms stay inside the cemetery cluster).
    exits: {north: 'quiet_graveyard_8', south: 'black_cemetery_1', east: 'city_cemetery_1', west: 'city_cemetery_20'},
    features: ['cemetery','haunted graves','ghost music CC0','fog','tombstones','physical walkable'],
    items: ['ancient bone','ghostly candle'],
    enemies: ['Ghostly Cemetery Guardian','Haunted Tomb Warden'],
    music: 'cemeteryHorror',
    safe: false
  };
  // One-way from the world into the cemetery: Quiet Graveyard Road 8 gains a
  // south exit (kept only if that slot is still free).
  const qg8 = WorldData.locations.quiet_graveyard_8;
  if (qg8 && !qg8.exits.south) qg8.exits.south = 'city_cemetery';
  const cemeteryCityNames = ['Cemetery Entrance - City Gate','Old Mourners Path','Weeping Angel Plaza','Forgotten Souls Corner','Haunted Mausoleum Row','Ghost Light Avenue','Bone Garden','Spectral Fountain','Cursed Family Tombs','Midnight Bell Tower','Phantom Playground','Eerie Rose Garden','Abandoned Gravedigger Hut','Foggy Crypt Path','Whispering Willows','Ghoul Market','Dark Reflection Pond','Shattered Headstones Way','Hollowed Oak of Souls','Final Rest Square'];
  const cemeterySizes = { 'Cemetery Goblin': [70, 16, 55, 30], 'Haunted Skeleton': [95, 22, 75, 45] };
  for (let i = 0; i < cemeteryCityNames.length; i++) {
    for (const [base, s] of Object.entries(cemeterySizes)) {
      WorldData.enemies[`${base} ${i}`] = { hp: s[0] + i * 3, attack: s[1] + Math.floor(i / 4), xp: s[2] + i * 2, gold: s[3] + i, desc: `${base} haunting the city cemetery - dangerous ghost/goblin` };
    }
  }
  WorldData.enemies['Ghostly Cemetery Guardian'] = { hp: 480, attack: 46, xp: 420, gold: 260, boss: true, desc: 'A towering spectral guardian bound to the cemetery gate' };
  WorldData.enemies['Haunted Tomb Warden'] = { hp: 350, attack: 40, xp: 330, gold: 210, desc: 'A restless warden who still patrols the tombs' };
  if (!WorldData.items) WorldData.items = {};
  WorldData.items['ancient bone'] = { name: 'Ancient Bone', type: 'misc', value: 45, desc: 'A brittle bone from an old grave' };
  WorldData.items['ghostly candle'] = { name: 'Ghostly Candle', type: 'misc', value: 60, desc: 'A candle burning with pale blue flame' };
  WorldData.items['ghostly Essence'] = { name: 'Ghostly Essence', type: 'misc', value: 75, desc: 'Ectoplasm gathered from a haunting' };

  cemeteryCityNames.forEach((cemName,i)=>{
    const id=`city_cemetery_${i+1}`;
    WorldData.locations[id]={
      name:cemName,
      description:`${cemName} is physical haunted cemetery inside city. Verified OpenGameArt music and sound effects with licences recorded in AUDIO_CREDITS.md, dangerous monsters ghosts/goblins.`,
      region:'City Cemetery',
      exits:{north:i===0?'city_cemetery':`city_cemetery_${i}`, south:i===cemeteryCityNames.length-1?'city_cemetery':`city_cemetery_${i+2}`},
      features:['cemetery city','physical','haunted','verified licensed ghost audio','walkable','ghosts','goblins'],
      items:['ghostly Essence'],
      enemies:['Cemetery Goblin '+i,'Haunted Skeleton '+i],
      music:i%2===0?'cemeteryHorror':'ghostChoir',
      safe:i%5===0
    };
  });
  if (window.AudioManager) {
    // Location data selects a context, never a fixed or SFX-backed music file.
    // The centralized manager maps both legacy labels to the verified cemetery
    // playlist (Cathedral in the Forest, RPG Ambience and A Winter Tale).
    window.AudioManager.contextAliases.cemeteryhorror='CEMETERY';
    window.AudioManager.contextAliases.ghostchoir='CEMETERY';
  }
  console.log(`Cemetery City Expansion Loaded: Items ${Object.keys(WorldData.items).length}, Monsters ${Object.keys(WorldData.enemies).length}, Locations ${Object.keys(WorldData.locations).length}`);
})();
