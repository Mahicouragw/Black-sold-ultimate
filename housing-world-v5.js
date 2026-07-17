/** City grids, private taxed housing, interior rooms, and new wilderness routes. */
(() => {
    const cities=[
        {key:'kaliwasch',label:'Kaliwasch',prefix:'kaliwasch_district_',hub:'kaliwasch',cost:1200},
        {key:'aurora',label:'Aurora City',prefix:'aurora_city_district_',hub:'aurora_city_district_1',cost:1500},
        {key:'ironspire',label:'Ironspire City',prefix:'ironspire_city_district_',hub:'ironspire_city_district_1',cost:1800},
        {key:'seabreeze',label:'Seabreeze City',prefix:'seabreeze_city_district_',hub:'seabreeze_city_district_1',cost:1600}
    ];
    const roomDefs=[
        ['foyer','Foyer','An entry foyer with a coat rack, guest bench, and a lock controlled by the owner.'],
        ['hallway','Hallway','A private hallway linking every room of the house.'],
        ['hall','Great Hall','A broad hall for meals, visitors, trophies, and furniture.'],
        ['bedroom','Bedroom','A quiet private bedroom with a wardrobe and writing desk.'],
        ['double_bedroom','Double Bedroom','A larger bedroom with a double bed, two wardrobes, and a balcony window.'],
        ['bathroom','Bathroom','A tiled bathroom with a copper bath, wash basin, and clean water.'],
        ['kitchen','Kitchen','A stone-hearth kitchen with shelves, table, and food preparation space.'],
        ['storage','Storage Room','A secure owner-only storage room. Stored items are never visible to other players.']
    ];
    const add=(id,data)=>WorldData.locations[id]=data;

    // Convert each 30-location city from a linear chain into a 5x6 street grid.
    cities.forEach((city,ci)=>{
        for(let i=1;i<=30;i++){
            const id=`${city.prefix}${i}`,loc=WorldData.locations[id];if(!loc)continue;
            const row=Math.floor((i-1)/5),col=(i-1)%5,exits={};
            if(row>0)exits.north=`${city.prefix}${i-5}`;if(row<5)exits.south=`${city.prefix}${i+5}`;
            if(col>0)exits.west=`${city.prefix}${i-1}`;if(col<4)exits.east=`${city.prefix}${i+1}`;
            loc.exits=exits;loc.safe=true;loc.enemies=[];loc.music=/House|Inn/.test(loc.name)?'inn':'city';
            loc.description+=` This is row ${row+1}, street ${col+1} of the ${city.label} street grid.`;
        }
        const first=WorldData.locations[`${city.prefix}1`],last=WorldData.locations[`${city.prefix}30`];
        if(ci===0){first.exits.up='kaliwasch';WorldData.locations.kaliwasch.exits.down=`${city.prefix}1`;last.exits.down='kaliwasch';}
        else {first.exits.up=ci===1?'village_10_center':`${cities[ci-1].prefix}30`;last.exits.down=ci===cities.length-1?'kaliwasch':`${cities[ci+1].prefix}1`;}
        // Explicit streets, gates and services are represented by named grid nodes.
        const names={1:'North Gate',3:'North Street',5:'East Gate',8:'East Street',11:'West Street',15:'Marketplace',18:'Shop Row',20:'Guild Hall',23:'Temple Street',25:'Palace Street',27:'South Street',30:'South Gate'};
        Object.entries(names).forEach(([n,name])=>{const loc=WorldData.locations[`${city.prefix}${n}`];loc.name=`${city.label} — ${name}`;loc.features=[name.toLowerCase(),'city street',name.includes('Gate')?'gatehouse':'houses'];if(name==='Marketplace')loc.shop='provisions';if(name==='Shop Row')loc.shop='weapons';});

        // Private eight-room house, physically attached to House Lane (district 2).
        roomDefs.forEach(([room,label,description])=>{
            const id=`private_house_${city.key}_${room}`,base=`private_house_${city.key}_`;
            const exits=room==='foyer'?{down:`${city.prefix}2`,east:`${base}hallway`}:room==='hallway'?{west:`${base}foyer`,north:`${base}bedroom`,south:`${base}hall`,east:`${base}storage`,up:`${base}double_bedroom`,down:`${base}bathroom`}:room==='hall'?{north:`${base}hallway`,east:`${base}kitchen`}:room==='kitchen'?{west:`${base}hall`}:room==='bedroom'?{south:`${base}hallway`}:room==='double_bedroom'?{down:`${base}hallway`}:room==='bathroom'?{up:`${base}hallway`}: {west:`${base}hallway`};
            add(id,{name:`${city.label} Private House — ${label}`,region:`${city.label} Private House`,description,exits,features:['private residence',room.replace('_',' ')],items:[],enemies:[],safe:true,music:'inn',privateHouse:city.key,houseRoom:room});
        });
        WorldData.locations[`${city.prefix}2`].exits.up=`private_house_${city.key}_foyer`;
        WorldData.locations[`${city.prefix}2`].features.push('estate agency','private house door');
        WorldData.npcs[`${city.prefix}2`]=[{name:`${city.label} Estate Agent`,role:'estate',dialog:[`A private house costs ${city.cost} rupees.`,'Property tax is due every seven days.','Only the owner can enter and use house storage.']}];
    });

    // Restore physical landmark links in the new Kaliwasch grid using vertical doors.
    WorldData.locations.kaliwasch_district_9.exits.up='grand_temple';WorldData.locations.grand_temple.exits={down:'kaliwasch_district_9'};
    WorldData.locations.kaliwasch_district_11.exits.up='royal_palace';WorldData.locations.royal_palace.exits={down:'kaliwasch_district_11'};
    WorldData.locations.kaliwasch_district_17.exits.up='arcane_enchantery';WorldData.locations.arcane_enchantery.exits={down:'kaliwasch_district_17'};

    // Distinct non-hostile wilderness routes plus a hostile tundra.
    const routeSpecs=[
        ['sun_plain','Sunward Plains',12,'great_forest_path_12','farms',true],
        ['silver_river','Silver River Road',10,'sun_plain_12','rivers',true],
        ['harvest_farm','Harvest Farmlands',10,'silver_river_10','farms',true],
        ['quiet_graveyard','Quiet Graveyard Road',8,'harvest_farm_10','graveyards',true],
        ['high_mountain_road','High Mountain Road',12,'mountains','mountain roads',true],
        ['frost_tundra','Frost Tundra',12,'high_mountain_road_12','tundra',false]
    ];
    routeSpecs.forEach(([slug,label,count,gateway,feature,safe],ri)=>{
        for(let i=1;i<=count;i++)add(`${slug}_${i}`,{name:`${label} ${i}`,region:label,description:`Location ${i} of ${count} along ${label}. The route contains ${feature}, changing weather, travelers, and landmarks.`,exits:{south:i===1?gateway:`${slug}_${i-1}`,north:i===count?(ri===routeSpecs.length-1?'kaliwasch':`${routeSpecs[ri+1][0]}_1`):`${slug}_${i+1}`},features:[feature,'travel route'],items:[],enemies:safe?[]:WorldData.locations.forest.enemies.slice(0,6),safe,music:safe?'wilderness':'forest'});
        const gateLoc=WorldData.locations[gateway];if(gateLoc){if(gateway==='mountains')gateLoc.exits.up=`${slug}_1`;else if(!gateLoc.exits.west)gateLoc.exits.west=`${slug}_1`;else if(!gateLoc.exits.east)gateLoc.exits.east=`${slug}_1`;else gateLoc.exits.down=`${slug}_1`;}
    });

    // Random encounters are restricted to forests, caves, dungeons, depths, and tundra.
    Object.entries(WorldData.locations).forEach(([id,loc])=>{
        const allowed=/forest|cave|dungeon|depth|shadow|tundra/i.test(`${id} ${loc.region||''} ${loc.name}`);
        if(!allowed)loc.safe=true;
        if(/city|village|house|street|gate|market|palace|temple|academy/i.test(`${id} ${loc.name}`)){loc.safe=true;loc.enemies=[];}
    });

    const housingDefaults=()=>({houses:{}});
    const ensureHousing=()=>Game.state.housing=Object.assign(housingDefaults(),Game.state.housing||{});
    const oldGet=Game.getSaveData.bind(Game);Game.getSaveData=function(){return{...oldGet(),housing:ensureHousing()};};
    const oldContinue=Game.continueGame.bind(Game);Game.continueGame=function(){let data;try{const r=this.getRoster();data=r.heroes[r.activeHeroId]||JSON.parse(localStorage.getItem(this.state.saveKey));}catch{}oldContinue();this.state.housing=Object.assign(housingDefaults(),data?.housing||{});};
    Game.currentHouseCity=function(){return WorldData.locations[this.state.location]?.privateHouse||null;};
    Game.houseStatus=function(cityKey=this.currentHouseCity()||cities.find(c=>this.state.location.startsWith(c.prefix))?.key){const h=ensureHousing().houses[cityKey],city=cities.find(c=>c.key===cityKey);if(!city){this.addNarrative('No local estate office found.','system');return;}if(!h){this.addNarrative(`You do not own a house in ${city.label}. Purchase price: ${city.cost} rupees.`,'system');return;}const days=Math.max(0,Math.ceil((h.taxPaidUntil-Date.now())/86400000));this.addNarrative(`${city.label} house owned. Tax ${days?`paid for about ${days} more day(s)`: 'is overdue'}. Stored item types: ${h.storage.length}.`,'location');};
    Game.buyHouse=function(){const city=cities.find(c=>this.state.location===`${c.prefix}2`);if(!city){this.addNarrative('Buy houses only from an estate agent on House Lane.','system');return;}const hs=ensureHousing();if(hs.houses[city.key]){this.addNarrative(`You already own the ${city.label} house.`,'system');return;}if(this.state.player.gold<city.cost){this.addNarrative(`The house costs ${city.cost} rupees.`,'system');return;}this.state.player.gold-=city.cost;hs.houses[city.key]={ownedAt:Date.now(),taxPaidUntil:Date.now()+7*86400000,storage:[]};this.addNarrative(`You purchase the ${city.label} private house. Seven days of property tax are included.`,'treasure');this.updateHUD();this.save();};
    Game.payHouseTax=function(){const cityKey=this.currentHouseCity()||cities.find(c=>this.state.location.startsWith(c.prefix))?.key,h=ensureHousing().houses[cityKey],city=cities.find(c=>c.key===cityKey);if(!h||!city){this.addNarrative('You do not own this house.','system');return;}const tax=Math.ceil(city.cost*.1);if(this.state.player.gold<tax){this.addNarrative(`Seven-day property tax costs ${tax} rupees.`,'system');return;}this.state.player.gold-=tax;h.taxPaidUntil=Math.max(Date.now(),h.taxPaidUntil)+7*86400000;this.addNarrative(`Property tax paid: ${tax} rupees. Storage access extended seven days.`,'treasure');this.updateHUD();this.save();};
    const oldMove=Game.move.bind(Game);Game.move=function(direction){const dest=WorldData.locations[this.state.location]?.exits?.[direction],target=WorldData.locations[dest];if(target?.privateHouse){const h=ensureHousing().houses[target.privateHouse];if(!h){this.addNarrative('The private house door is locked. Buy the house from the estate agent first.','system');return;}}oldMove(direction);};
    const oldStorage=Game.showStorage.bind(Game);Game.showStorage=function(){const city=this.currentHouseCity(),loc=WorldData.locations[this.state.location],h=ensureHousing().houses[city];if(!city||loc?.houseRoom!=='storage'||!h){this.addNarrative('Private storage is available only inside the Storage Room of a house you own.','system');return;}if(h.taxPaidUntil<Date.now()){this.addNarrative('Property tax is overdue. Stored items remain safe, but storage access is disabled until tax is paid.','system');return;}this.state.sacred.storage=h.storage;oldStorage();};
    const oldStore=Game.storeItem.bind(Game);Game.storeItem=function(id){const city=this.currentHouseCity(),h=ensureHousing().houses[city];if(!city||WorldData.locations[this.state.location]?.houseRoom!=='storage'||!h||h.taxPaidUntil<Date.now()){this.addNarrative('You cannot store items here. Use an owned, tax-paid house Storage Room.','system');return;}this.state.sacred.storage=h.storage;oldStore(id);};
    const oldRetrieve=Game.retrieveItem.bind(Game);Game.retrieveItem=function(id){const city=this.currentHouseCity(),h=ensureHousing().houses[city];if(!city||WorldData.locations[this.state.location]?.houseRoom!=='storage'||!h||h.taxPaidUntil<Date.now()){this.addNarrative('You cannot retrieve stored items until you are in your tax-paid house Storage Room.','system');return;}this.state.sacred.storage=h.storage;oldRetrieve(id);};

    Game.showPublicLoot=async function(){const drops=await OnlineSystem.listWorldDrops(this.state.location),local=this.state.sacred?.groundLoot||[],content=document.getElementById('storage-content');this._publicDrops=drops;content.innerHTML=`<h4>Public Ground Loot — ${this.escapeHTML(WorldData.locations[this.state.location]?.name||this.state.location)}</h4>${drops.length?drops.map(d=>`<div class="storage-row"><span>${this.escapeHTML(d.item_snapshot?.name||d.item_id)} x${d.quantity}</span><button onclick="Game.takePublicLoot('${d.id}')">Take</button></div>`).join(''):local.length?local.map(i=>`<div class="storage-row"><span>${this.escapeHTML(i.name)} x${i.quantity}</span><button onclick="Game.takeLocalGroundLoot('${this.escapeHTML(this.escapeJS(i.id))}')">Take local fallback</button></div>`).join(''):'<p>No public dropped items here.</p>'}<p>Any online player at this location may take database-backed drops. Drops expire after one hour because another player or a roaming creature may take them.</p>`;document.getElementById('storage-panel').classList.remove('hidden');};
    Game.dropPublicItem=async function(query){const item=this.state.inventory.find(i=>i.name.toLowerCase().includes(query.toLowerCase())||i.id===query);if(!item){this.addNarrative('You do not carry that item.','system');return;}const snapshot={...item,id:item.id};const ok=await OnlineSystem.dropWorldItem(this.state.location,snapshot);if(!ok)return;item.quantity--;if(item.quantity<=0)this.state.inventory.splice(this.state.inventory.indexOf(item),1);this.addNarrative(`${item.name} is now public ground loot. Another player may take it.`,'item');this.save();};
    Game.takePublicLoot=async function(id){const result=await OnlineSystem.takeWorldDrop(id);if(!result){this.addNarrative('That public item was already taken or expired.','system');return;}const item={...result.item_snapshot,id:result.item_id};for(let i=0;i<(result.quantity||1);i++)this.addItemToInventory(result.item_id,item);this.addNarrative(`You take ${item.name} from public ground loot.`,'item');this.save();this.showPublicLoot();};
    Game.takeLocalGroundLoot=function(id){const list=this.state.sacred?.groundLoot||[],item=list.find(i=>i.id===id);if(!item)return;this.addItemToInventory(item.id,item);item.quantity--;if(item.quantity<=0)list.splice(list.indexOf(item),1);this.addNarrative(`You take ${item.name} from fallback ground loot.`,'item');this.save();this.showPublicLoot();};
    Game.takePublicLootByName=async function(query){const drops=await OnlineSystem.listWorldDrops(this.state.location),drop=drops.find(d=>(d.item_snapshot?.name||d.item_id).toLowerCase().includes(query.toLowerCase()));if(drop)this.takePublicLoot(drop.id);else{const local=this.state.sacred?.groundLoot?.find(i=>i.name.toLowerCase().includes(query.toLowerCase()));if(local)this.takeLocalGroundLoot(local.id);else this.addNarrative('No matching public item is on the ground.','system');}};
    const oldDefeated=Game.enemyDefeated.bind(Game);Game.enemyDefeated=function(){const before=this.state.sacred?.groundLoot?.length||0,location=this.state.location;oldDefeated();const generated=(this.state.sacred?.groundLoot||[]).splice(before);generated.forEach(item=>OnlineSystem.dropWorldItem(location,item).then(ok=>{if(!ok)this.state.sacred.groundLoot.push(item);}));};
    const oldCommand=Game.processCommand.bind(Game);Game.processCommand=function(cmd){const c=cmd.toLowerCase().trim();if(c==='buy house'||c==='purchase house'){this.buyHouse();return;}if(c==='pay house tax'||c==='pay property tax'){this.payHouseTax();return;}if(c==='house status'||c==='property status'){this.houseStatus();return;}if(c==='loot'||c==='check loot'){this.showPublicLoot();return;}if(c.startsWith('take loot ')){this.takePublicLootByName(c.slice(10));return;}if(c.startsWith('drop ')||c.startsWith('throw ')){this.dropPublicItem(c.replace(/^(drop|throw) /,''));return;}oldCommand(cmd);};
    if(window.ExpansionData){ExpansionData.counts.locations=Object.keys(WorldData.locations).length;ExpansionData.counts.shops=Object.values(WorldData.locations).filter(l=>l.shop).length;}
    window.HousingWorld={cities,roomDefs};
})();
