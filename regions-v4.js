/** Massive connected-world expansion: forests, cities, caves, dungeons, villages. */
(() => {
    const add = (id, data) => { WorldData.locations[id] = data; return id; };
    const enemyPool = Object.keys(WorldData.enemies);
    const pickEnemies = (seed, count=4) => Array.from({length:count},(_,i)=>enemyPool[(seed*7+i*11)%enemyPool.length]);
    const created = { forest:[], capital:[], cities:[], caves:[], dungeons:[], villages:[] };

    // 25 connected forest paths.
    const forestNames = ['Fern Trail','Whisper Path','Moss Crossing','Stag Run','Moonlit Track','Briar Walk','Owl Path','Ancient Rootway','Fox Trail','Silver Creek','Pine Bend','Mushroom Walk','Wolf Track','Sunbeam Path','Hollow Oak','Rainleaf Trail','Greenstone Way','Ranger Path','Wildflower Turn','Raven Track','Deepwood Walk','Amber Grove','Druid Path','Old Timber Road','Forest Crown'];
    forestNames.forEach((name,i) => {
        const id=`great_forest_path_${i+1}`, prev=i===0?'forest':`great_forest_path_${i}`, next=i===24?'village_1_center':`great_forest_path_${i+2}`;
        add(id,{name:`Great Forest — ${name}`,region:'Great Forest',description:`Path ${i+1} of 25 winds beneath living branches. Tracks and changing weather make every visit different.`,exits:{south:prev,north:next},features:['forest path','tracks','hidden clearing'],items:i%6===0?['herbs']:[],enemies:pickEnemies(i+3,6),safe:false,music:'forest'});created.forest.push(id);
    });
    WorldData.locations.forest.exits.north='great_forest_path_1';

    // Ten villages: center, houses, and four directional gates.
    const villageNames=['Willowbrook','Stonefield','Redhaven','Moonmeadow','Ironford','Greenhollow','Frostmere','Amberwick','Oakrest','Starling'];
    villageNames.forEach((v,vi)=>{
        const n=vi+1, center=`village_${n}_center`, house=`village_${n}_houses`, north=`village_${n}_north_gate`, east=`village_${n}_east_gate`, west=`village_${n}_west_gate`, south=`village_${n}_south_gate`;
        const routeBack=vi===0?'great_forest_path_25':`village_${n-1}_center`, routeNext=vi===9?'aurora_city_district_1':`village_${n+1}_center`;
        add(center,{name:`${v} Village`,region:v,description:`The center of ${v}, with a well, notice board, homes and roads to four gates.`,exits:{north,east,west,south,up:house,down:routeNext},features:['village well','quest board','inn'],items:['bread'],enemies:[],safe:true,shop:'provisions',music:'city'});
        add(house,{name:`${v} House Quarter`,region:v,description:`Warm homes, workshops and guest rooms belonging to the people of ${v}.`,exits:{down:center},features:['houses','workshop','guest room'],items:[],enemies:[],safe:true,music:'city'});
        [[north,'North'],[east,'East'],[west,'West'],[south,'South']].forEach(([id,dir])=>add(id,{name:`${v} ${dir} Gate`,region:v,description:`The guarded ${dir.toLowerCase()} gate of ${v}.`,exits:{up:center,down:dir==='South'?routeBack:center},features:['gatehouse','guards'],items:[],enemies:[],safe:true,music:'city'}));
        created.villages.push(center,house,north,east,west,south);
        WorldData.npcs[center]=[{name:`Elder of ${v}`,role:'quest',dialog:[`Welcome to ${v}.`,'Our gates are open to honorable heroes.','The Palace sends new missions each week.']}];
    });

    // Thirty detailed paths through Kaliwasch: houses, market, shop, temple, palace, academy.
    const districtKinds=['North Gate','House Lane','Baker Street','Blacksmith Row','Marketplace','Potion Shop','South Houses','Temple Road','Auralis Plaza','Palace Avenue','Royal Palace Gate','Companion Academy','Guild Street','Hero Hall','Library Walk','Mage Quarter','Enchantment Arcade','East Gate','Garden Path','Fountain Square','West Houses','Armorer Row','Food Market','Caravan Yard','West Gate','Canal Walk','Old House Road','Watch Barracks','Grand Square','Capital Waystone'];
    districtKinds.forEach((name,i)=>{
        const id=`kaliwasch_district_${i+1}`,prev=i===0?'kaliwasch':`kaliwasch_district_${i}`,next=i===29?'kaliwasch':`kaliwasch_district_${i+2}`;
        const shop=/Shop|Market|Blacksmith|Armorer|Enchantment/.test(name)?(/Potion|Enchantment/.test(name)?'alchemy':/Food|Market/.test(name)?'provisions':'weapons'):null;
        add(id,{name:`Kaliwasch — ${name}`,region:'Kaliwasch',description:`District ${i+1} of 30 in the capital. ${name} is busy with residents, travelers and guild business.`,exits:{south:prev,north:next},features:[name.toLowerCase(),'city road',i%5===0?'notice board':'houses'],items:[],enemies:[],safe:true,shop,music:'city'});created.capital.push(id);
    });
    WorldData.locations.kaliwasch.exits.down='kaliwasch_district_1';

    // Three more cities, each with the same 30-path depth and distinct identity.
    const cities=[['Aurora City','aurora'],['Ironspire City','ironspire'],['Seabreeze City','seabreeze']];
    cities.forEach(([city,slug],ci)=>districtKinds.forEach((kind,i)=>{
        const id=`${slug}_city_district_${i+1}`;
        const priorCity=ci===0?'village_10_center':`${cities[ci-1][1]}_city_district_30`;
        const nextCity=ci===cities.length-1?'kaliwasch':`${cities[ci+1][1]}_city_district_1`;
        const prev=i===0?priorCity:`${slug}_city_district_${i}`,next=i===29?nextCity:`${slug}_city_district_${i+2}`;
        const shop=/Shop|Market|Blacksmith|Armorer|Enchantment/.test(kind)?(/Potion|Enchantment/.test(kind)?'alchemy':/Food|Market/.test(kind)?'provisions':'weapons'):null;
        add(id,{name:`${city} — ${kind}`,region:city,description:`Path ${i+1} of 30 through ${city}, passing ${kind.toLowerCase()}, houses and civic buildings.`,exits:{south:prev,north:next},features:[kind.toLowerCase(),'houses','city path'],items:[],enemies:[],safe:true,shop,music:'city'});created.cities.push(id);
    }));

    // Forty cave chambers connected from the Northern Mountains.
    const caveTerms=['Mouth','Echo Hall','Crystal Shelf','Bat Gallery','Underground Stream','Stone Bridge','Glowworm Vault','Narrow Crawl','Miner Camp','Fallen Pillar','Salt Chamber','Iron Vein','Deep Well','Wind Tunnel','Bone Shelf','Blue Grotto','Lava Crack','Ancient Steps','Fungus Garden','Hidden Lake'];
    for(let i=0;i<40;i++){
        const id=`endless_cave_${i+1}`,prev=i===0?'mountains':`endless_cave_${i}`,next=i===39?'mountains':`endless_cave_${i+2}`;
        add(id,{name:`Endless Cave ${i+1} — ${caveTerms[i%caveTerms.length]}`,region:'Endless Caves',description:`Cave location ${i+1} of 40. Stone, water and old mining traces shape this chamber.`,exits:{south:prev,north:next},features:['cave chamber',caveTerms[i%caveTerms.length].toLowerCase()],items:i%8===0?['iron ore']:[],enemies:pickEnemies(i+40,5),safe:false,music:'dungeon'});created.caves.push(id);
    }
    WorldData.locations.mountains.exits.west='endless_cave_1';

    // Fifteen dungeon sectors beyond the original entrance.
    const dungeonTerms=['Guard Post','Prison Walk','Rust Gate','Flooded Cells','Torture Hall','Broken Chapel','Armory','Silent Corridor','Warden Room','Crypt Stairs','Shadow Vault','Runed Door','Dark Gallery','Boss Antechamber','Forgotten Throne'];
    dungeonTerms.forEach((name,i)=>{
        const id=`royal_dungeon_${i+1}`,prev=i===0?'dungeon_entrance':`royal_dungeon_${i}`,next=i===14?'dungeon_entrance':`royal_dungeon_${i+2}`;
        add(id,{name:`Royal Dungeon ${i+1} — ${name}`,region:'Royal Dungeon',description:`Dungeon sector ${i+1} of 15: ${name}. Old defenses and hostile creatures remain active.`,exits:{west:prev,east:next},features:['dungeon sector',name.toLowerCase()],items:i%5===0?['torch']:[],enemies:pickEnemies(i+90,6),safe:false,music:i>11?'boss':'dungeon'});created.dungeons.push(id);
    });
    WorldData.locations.dungeon_entrance.exits.east='royal_dungeon_1';

    // Recompute totals consumed by the existing world command.
    if(window.ExpansionData){
        ExpansionData.counts.locations=Object.keys(WorldData.locations).length;
        ExpansionData.counts.monsters=Object.keys(WorldData.enemies).length;
        ExpansionData.counts.shops=Object.values(WorldData.locations).filter(l=>l.shop).length;
        ExpansionData.v4=created;
    }
    console.log(`Regions v4 loaded: +${Object.values(created).flat().length} connected locations; ${Object.keys(WorldData.locations).length} total.`);
})();
