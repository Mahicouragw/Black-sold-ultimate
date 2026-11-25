/** City grids, private taxed housing, interior rooms, and new wilderness routes. */
(() => {
    // A deed is priced in diamonds, the rarest currency in the world, between
    // one hundred and three hundred of them. Diamonds cannot be bought with
    // money anywhere: they are found in battle and in a present from the gift
    // shop, which is why the estate agent deals in them and nothing else.
    const cities=[
        {key:'kaliwasch',label:'Kaliwasch',prefix:'kaliwasch_district_',hub:'kaliwasch',diamonds:100},
        {key:'aurora',label:'Aurora City',prefix:'aurora_city_district_',hub:'aurora_city_district_1',diamonds:150},
        {key:'ironspire',label:'Ironspire City',prefix:'ironspire_city_district_',hub:'ironspire_city_district_1',diamonds:300},
        {key:'seabreeze',label:'Seabreeze City',prefix:'seabreeze_city_district_',hub:'seabreeze_city_district_1',diamonds:200}
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
        WorldData.npcs[`${city.prefix}2`]=[{name:`${city.label} Estate Agent`,role:'estate',dialog:['Only the owner can enter and use house storage.']}];
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

    /* ------------------------------------------------------------- the estate
     *  A deed is bought and kept with diamonds, never money. The agent's ledger
     *  records every diamond the estate receives, so a hero can always see
     *  where they went. Auto-pay lets the agent collect the monthly due itself.
     *  At most three months are ever charged, so a long absence is never
     *  ruinous, and an unpaid due locks only the storage, never the front door.
     */
    const MONTH = 30 * 86400000;
    const housingDefaults = () => ({ houses: {} });
    const ensureHousing = () => {
        const hs = Game.state.housing = Object.assign(housingDefaults(), Game.state.housing || {});
        hs.houses = hs.houses || {};
        return hs;
    };
    const cityOf = key => cities.find(c => c.key === key) || null;
    const monthlyDue = city => Math.max(3, Math.round(city.diamonds * 0.05));
    const daysLeft = until => Math.max(0, Math.ceil((until - Date.now()) / 86400000));
    // The ledger is written the first time a diamond reaches the estate, so a
    // hero who has never bought a house carries no empty paperwork.
    const ledgerOf = hs => (hs.agentLedger ||= { total: 0, entries: [] });
    const creditAgent = (hs, city, amount, why) => {
        const ledger = ledgerOf(hs);
        ledger.total = (ledger.total || 0) + amount;
        ledger.entries = [{ at: Date.now(), city: city.key, amount, why }, ...(ledger.entries || [])].slice(0, 12);
    };
    /** Older saves kept a rupee tax date; it becomes the paid-through date. */
    const houseRecord = h => {
        h.storage = h.storage || [];
        h.paidUntil = h.paidUntil || h.taxPaidUntil || Date.now() + MONTH;
        h.owed = h.owed || 0;
        h.autopay = Boolean(h.autopay);
        return h;
    };
    Game.currentHouseCity = function () { return WorldData.locations[this.state.location]?.privateHouse || null; };
    // The estate travels with the hero: the deeds, the ledger and the paid-through dates.
    const oldGet = Game.getSaveData.bind(Game);
    Game.getSaveData = function () { return { ...oldGet(), housing: ensureHousing() }; };
    const oldContinue = Game.continueGame.bind(Game);
    Game.continueGame = function () {
        let data;
        try { const roster = this.getRoster(); data = roster.heroes[roster.activeHeroId] || JSON.parse(localStorage.getItem(this.state.saveKey)); } catch { }
        oldContinue.call(this);
        this.state.housing = Object.assign(housingDefaults(), data?.housing || {});
    };

    Game.houseDueMonths = function (h) {
        const paid = houseRecord(h).paidUntil;
        return Math.min(3, Math.max(1, Math.floor((Date.now() - paid) / MONTH)));
    };

    /** What is owed on a house at this instant, in diamonds (zero when paid up). */
    Game.houseDueNow = function (cityKey) {
        const hs = ensureHousing(), city = cityOf(cityKey), owned = city && hs.houses[city.key];
        if (!city || !owned) return 0;
        const h = houseRecord(owned);
        return h.paidUntil >= Date.now() ? 0 : monthlyDue(city) * this.houseDueMonths(h);
    };

    /** The monthly estate due, collected by the agent in diamonds. */
    Game.settleHouseDues = function (announce = true) {
        const hs = ensureHousing(), p = this.state.player;
        const result = { paid: 0, owed: 0, cities: [] };
        if (!p) return result;
        for (const [key, raw] of Object.entries(hs.houses)) {
            const city = cityOf(key); if (!city || !raw) continue;
            const h = houseRecord(raw);
            if (h.paidUntil > Date.now()) continue;
            const months = this.houseDueMonths(h), due = monthlyDue(city) * months;
            if (h.autopay && (p.diamonds || 0) >= due) {
                p.diamonds -= due;
                h.paidUntil = Date.now() + MONTH;
                h.owed = 0;
                creditAgent(hs, city, due, months > 1 ? `${months} months of due` : 'monthly due');
                result.paid += due; result.cities.push(city.key);
                if (announce) this.addNarrative(`The ${city.label} estate agent takes ${due} diamonds for the estate due and writes it in the ledger. The house is paid up for another month.`, 'treasure');
                this.updateHUD?.();
            } else {
                h.owed = due;
                result.owed += due; result.cities.push(city.key);
                if (announce && h.warnedFor !== h.paidUntil) {
                    h.warnedFor = h.paidUntil;
                    this.addNarrative(`The ${city.label} estate due of ${due} diamonds is unpaid${h.autopay ? ', and auto-pay found too few diamonds' : ''}. The private storage stays locked, though the front door still opens to you. Say "pay estate due" with the agent, or "house autopay on" to let the agent collect each month.`, 'system');
                }
            }
        }
        hs.settledAt = Date.now();
        if (result.paid || result.owed) this.save?.();
        return result;
    };

    Game.houseStatus = function (cityKey) {
        const hs = ensureHousing(), city = cityKey ? cityOf(cityKey) : ownedCity(this);
        if (!city) {
            const own = Object.keys(hs.houses).length;
            this.addNarrative(own
                ? 'You own more than one house. Name the city: "house status kaliwasch", or stand in a city and ask again.'
                : 'You do not own a house yet. The deeds cost one hundred to three hundred diamonds: say "houses for sale" for every city, "diamonds" to hear where diamonds are found, or "estate agent" to be shown the way.', 'system');
            return;
        }
        const owned = hs.houses[city.key];
        if (!owned) {
            this.addNarrative(`You do not own a house in ${city.label}. The deed costs ${city.diamonds} diamonds and you carry ${this.state.player?.diamonds || 0}. Say "houses for sale" for every city, or "diamonds" to hear where diamonds are found.`, 'system');
            return;
        }
        const h = houseRecord(owned), unpaid = h.paidUntil < Date.now();
        const dueText = unpaid
            ? `and ${this.houseDueNow(city.key)} diamonds are owed now, so the private storage is locked`
            : `paid for about ${daysLeft(h.paidUntil)} more day(s)`;
        this.addNarrative(`${city.label} house owned. The monthly estate due is ${monthlyDue(city)} diamonds, ${dueText}. Auto-pay is ${h.autopay ? 'on, so the agent collects it each month in diamonds' : 'off'}. Stored item types: ${h.storage.length}.`, 'location');
    };

    Game.estateLedger = function () {
        const hs = ensureHousing(), ledger = hs.agentLedger || { total: 0, entries: [] };
        const rows = (ledger.entries || []).map(e => `${cityOf(e.city)?.label || e.city}: ${e.amount} diamonds, ${e.why}`);
        this.addNarrative(ledger.total
            ? `The estate agent's ledger. Diamonds received: ${ledger.total}. Recent lines — ${rows.join('; ')}. Every diamond went to a deed or the monthly estate due. No money changes hands here: the estate deals only in diamonds.`
            : 'The estate ledger is empty. Buy a deed or pay a monthly due and the agent writes it down.', 'location');
    };

    const agentCity = () => cities.find(c => Game.state.location === `${c.prefix}2`) || null;
    /** The house the hero means when they do not name a city. */
    const ownedCity = game => {
        const here = game.currentHouseCity() || cities.find(c => String(game.state.location).startsWith(c.prefix))?.key;
        if (here) return cityOf(here);
        const owned = Object.keys(ensureHousing().houses);
        return owned.length === 1 ? cityOf(owned[0]) : null;
    };
    const cityByName = query => { const q = String(query || '').trim().toLowerCase(); if (!q) return null; return cities.find(c => c.key === q || c.label.toLowerCase() === q || c.label.toLowerCase().startsWith(q) || c.key.startsWith(q)) || null; };

    /** Where the estate agents are, and how to reach the nearest one from here. */
    Game.estateAgentDirections = function () {
        const here = agentCity();
        if (here) {
            const owned = ensureHousing().houses[here.key];
            this.addNarrative(`You are standing at the ${here.label} estate agent on House Lane. The deed costs ${here.diamonds} diamonds; say "houses for sale" for the price list, ${owned ? '"house status" for your own house' : '"buy house" to sign the deed here'}.`, 'location');
            return;
        }
        const city = cities.find(c => String(this.state.location).startsWith(c.prefix));
        const where = cities.map(c => `${c.label}: ${WorldData.locations[`${c.prefix}2`]?.name || `${c.prefix}2`}`).join('; ');
        this.addNarrative(`The estate agents keep the second street of every city grid — ${where}. ${city ? `You are in ${city.label} now: from the city hub walk the grid to ${city.label} House Lane (district street 2).` : 'Travel to a city hub first, then walk the grid to its district street 2.'} You may also buy at a distance by naming the city, for example "buy house kaliwasch".`, 'location');
    };

    Game.housesForSale = function () {
        const hs = ensureHousing(), here = agentCity(), p = this.state.player || {};
        const rows = cities.map(c => {
            const h = hs.houses[c.key];
            const own = h ? ` — already yours${houseRecord(h).autopay ? ', auto-pay on' : ''}` : '';
            return `${c.label}: ${c.diamonds} diamonds${own}${here?.key === c.key ? ' — the agent is beside you' : ''}`;
        });
        this.addNarrative(`Houses for sale. ${rows.join('. ')}. The monthly estate due is a twentieth of the price, in diamonds, and auto-pay lets the agent collect it. You carry ${p.diamonds || 0} diamonds. ${here ? `Say "buy house" to sign the ${here.label} deed here.` : 'Say "buy house <city>" to sign a deed from a distance, or "estate agent" to be shown the way to one.'}`, 'location');
    };

    Game.buyHouse = function (requested) {
        const hs = ensureHousing(), p = this.state.player;
        if (!p) { this.addNarrative('Create a hero first.', 'system'); return false; }
        const here = agentCity();
        const city = here || cityByName(requested);
        if (!city) {
            const names = cities.map(c => `${c.label} (${c.diamonds} diamonds)`).join(', ');
            this.addNarrative(`No deed was signed. Name the city you mean: ${names}. Say "buy house kaliwasch", or stand at an estate agent on House Lane and say "buy house".`, 'system');
            return false;
        }
        if (hs.houses[city.key]) { this.addNarrative(`You already own the ${city.label} house. Say "house status" to hear its estate due and storage.`, 'system'); return false; }
        const price = city.diamonds, held = p.diamonds || 0;
        if (held < price) {
            const short = price - held;
            this.addNarrative(`The ${city.label} deed costs ${price} diamonds; you carry ${held}, so ${short} diamonds are still missing. Diamonds are rare and always earned: in the hands of fallen monsters and bosses, in the arena, behind the Christmas doors and at the tree, and on the twelfth-night bounty board. The estate agent and the rune shop take them too, and so does the Wrapped Parcel. Say "diamonds" to hear every way to earn one.`, 'system');
            return false;
        }
        p.diamonds -= price;
        hs.houses[city.key] = { ownedAt: Date.now(), paidUntil: Date.now() + MONTH, storage: [], autopay: false, owed: 0 };
        creditAgent(hs, city, price, 'deed');
        const rooms = Object.values(WorldData.locations).filter(l => l.privateHouse === city.key && l.houseRoom).length;
        this.addNarrative(`You purchase the ${city.label} private house for ${price} diamonds, and the agent writes the deed and the payment in the ledger. The first month's estate due is included; after that it costs ${monthlyDue(city)} diamonds a month, and auto-pay lets the agent collect it. Enter from ${city.label} House Lane: the private door stands at the top of the second street, and your key opens it. The house has ${rooms} rooms and a Storage Room that opens while the due is paid.`, 'treasure');
        this.updateHUD(); this.save(); this.updateContextActions?.();
        return true;
    };

    Game.payHouseDue = function (cityKey) {
        const hs = ensureHousing(), p = this.state.player;
        const city = cityKey ? cityOf(cityKey) : ownedCity(this), owned = city && hs.houses[city.key];
        if (!city || !owned) { this.addNarrative('You do not own a house here. Say "houses for sale" to see the deeds.', 'system'); return false; }
        const h = houseRecord(owned);
        if (h.paidUntil > Date.now()) { this.addNarrative(`The ${city.label} estate due is already paid for about ${daysLeft(h.paidUntil)} more day(s).`, 'system'); return false; }
        const months = this.houseDueMonths(h), due = monthlyDue(city) * months;
        if ((p.diamonds || 0) < due) { this.addNarrative(`The ${city.label} estate due is ${due} diamonds and you carry ${p.diamonds || 0}. Say "diamonds" to hear where they are found.`, 'system'); return false; }
        p.diamonds -= due;
        h.paidUntil = Date.now() + MONTH;
        h.owed = 0;
        creditAgent(hs, city, due, months > 1 ? `${months} months of due` : 'monthly due');
        this.addNarrative(`You pay the ${city.label} estate due: ${due} diamonds, written in the agent's ledger. The house is paid up for a month and the storage opens again.`, 'treasure');
        this.updateHUD?.(); this.save?.(); this.updateContextActions?.();
        return true;
    };

    /** Auto-pay is the agent's standing order, paid from diamonds, never money. */
    Game.setHouseAutopay = function (on = true, cityKey) {
        const hs = ensureHousing();
        const city = cityKey ? cityOf(cityKey) : ownedCity(this), owned = city && hs.houses[city.key];
        if (!city || !owned) { this.addNarrative('An estate agent can only set auto-pay on a house you own. Say "estate agent" to find one.', 'system'); return false; }
        const h = houseRecord(owned);
        h.autopay = Boolean(on);
        if (h.autopay) {
            this.addNarrative(`Auto-pay is on for the ${city.label} house. When a month turns, the agent takes ${monthlyDue(city)} diamonds and writes it in the ledger.`, 'location');
            this.settleHouseDues(true);
        } else {
            this.addNarrative(`Auto-pay is off for the ${city.label} house. The monthly due waits for you in diamonds, and the storage stays locked until it is paid.`, 'location');
        }
        this.save?.(); this.updateContextActions?.();
        return true;
    };
    // Standing at an agent tells the truth about the deed and the month, even
    // though the agent's recorded voice has only one line left to speak.
    const oldEnter = Game.enterLocation.bind(Game);
    Game.enterLocation = function (id, visited) {
        const result = oldEnter(id, visited);
        const here = cities.find(c => id === `${c.prefix}2`);
        if (here && this.state.player) {
            const owned = ensureHousing().houses[here.key];
            this.addNarrative(owned
                ? `The ${here.label} Estate Agent looks up from the ledger. Your house is ${this.houseDueNow(here.key) ? `behind on the estate due: ${this.houseDueNow(here.key)} diamonds` : 'paid up'}, and auto-pay is ${houseRecord(owned).autopay ? 'on' : 'off'}. Say "house status" to hear it all.`
                : `The ${here.label} Estate Agent taps the price board: a private house is ${here.diamonds} diamonds, and the monthly due is ${monthlyDue(here)} diamonds. Say "houses for sale" for every city, or "buy house" to sign this one.`, 'location');
        }
        return result;
    };

    const oldMove=Game.move.bind(Game);Game.move=function(direction){if(Date.now()-(ensureHousing().settledAt||0)>3600000)this.settleHouseDues(true);const dest=WorldData.locations[this.state.location]?.exits?.[direction],target=WorldData.locations[dest];if(target?.privateHouse&&!(this.state.inCombat&&this.state.enemy)){const h=ensureHousing().houses[target.privateHouse];if(!h){const text=window.Narration?window.Narration.t('move.houseLocked'):'You did not move. The door of this private house is locked. Buy the house from the estate agent first.';this._lastMoveResult={moved:false,direction,reason:'move.houseLocked'};if(this.emitGameEvent)this.emitGameEvent(text,'system',{sfx:['board-error']});else this.addNarrative(text,'system');return false;}}return oldMove(direction);};
    const oldStorage=Game.showStorage.bind(Game);Game.showStorage=function(){const city=this.currentHouseCity(),loc=WorldData.locations[this.state.location],h=ensureHousing().houses[city];if(!city||loc?.houseRoom!=='storage'||!h){this.addNarrative('Private storage is available only inside the Storage Room of a house you own.','system');return;}if(houseRecord(h).paidUntil<Date.now()){this.addNarrative(`The monthly estate due of ${this.houseDueNow(city)} diamonds is unpaid. Stored items remain safe, but the storage stays locked until it is paid.`,'system');return;}this.state.sacred.storage=h.storage;oldStorage();};
    const oldStore=Game.storeItem.bind(Game);Game.storeItem=function(id){const city=this.currentHouseCity(),h=ensureHousing().houses[city];if(!city||WorldData.locations[this.state.location]?.houseRoom!=='storage'||!h||houseRecord(h).paidUntil<Date.now()){this.addNarrative('You cannot store items here. Use the Storage Room of a house you own whose estate due is paid.','system');return;}this.state.sacred.storage=h.storage;oldStore(id);};
    const oldRetrieve=Game.retrieveItem.bind(Game);Game.retrieveItem=function(id){const city=this.currentHouseCity(),h=ensureHousing().houses[city];if(!city||WorldData.locations[this.state.location]?.houseRoom!=='storage'||!h||houseRecord(h).paidUntil<Date.now()){this.addNarrative('You cannot retrieve stored items until you are in the Storage Room of your own house, with the estate due paid.','system');return;}this.state.sacred.storage=h.storage;oldRetrieve(id);};

    Game.showPublicLoot=async function(){const drops=await OnlineSystem.listWorldDrops(this.state.location),local=this.state.sacred?.groundLoot||[],content=document.getElementById('storage-content');this._publicDrops=drops;content.innerHTML=`<h4>Public Ground Loot — ${this.escapeHTML(WorldData.locations[this.state.location]?.name||this.state.location)}</h4>${drops.length?drops.map(d=>`<div class="storage-row"><span>${this.escapeHTML(d.item_snapshot?.name||d.item_id)} x${d.quantity}</span><button onclick="Game.takePublicLoot('${d.id}')">Take</button></div>`).join(''):local.length?local.map(i=>`<div class="storage-row"><span>${this.escapeHTML(i.name)} x${i.quantity}</span><button onclick="Game.takeLocalGroundLoot('${this.escapeHTML(this.escapeJS(i.id))}')">Take local fallback</button></div>`).join(''):'<p>No public dropped items here.</p>'}<p>Any online player at this location may take database-backed drops. Drops expire after one hour because another player or a roaming creature may take them.</p>`;document.getElementById('storage-panel').classList.remove('hidden');};
    Game.dropPublicItem=async function(query){const item=this.state.inventory.find(i=>i.name.toLowerCase().includes(query.toLowerCase())||i.id===query);if(!item){this.addNarrative('You do not carry that item.','system');return;}const snapshot={...item,id:item.id};const ok=await OnlineSystem.dropWorldItem(this.state.location,snapshot);if(!ok)return;item.quantity--;if(item.quantity<=0)this.state.inventory.splice(this.state.inventory.indexOf(item),1);this.addNarrative(`${item.name} is now public ground loot. Another player may take it.`,'item');this.save();};
    Game.takePublicLoot=async function(id){const result=await OnlineSystem.takeWorldDrop(id);if(!result){this.addNarrative('That public item was already taken or expired.','system');return;}const item={...result.item_snapshot,id:result.item_id};for(let i=0;i<(result.quantity||1);i++)this.addItemToInventory(result.item_id,item);this.addNarrative(`You take ${item.name} from public ground loot.`,'item');this.save();this.showPublicLoot();};
    Game.takeLocalGroundLoot=function(id){const list=this.state.sacred?.groundLoot||[],item=list.find(i=>i.id===id);if(!item)return;this.addItemToInventory(item.id,item);item.quantity--;if(item.quantity<=0)list.splice(list.indexOf(item),1);this.addNarrative(`You take ${item.name} from fallback ground loot.`,'item');this.save();this.showPublicLoot();};
    Game.takePublicLootByName=async function(query){const drops=await OnlineSystem.listWorldDrops(this.state.location),drop=drops.find(d=>(d.item_snapshot?.name||d.item_id).toLowerCase().includes(query.toLowerCase()));if(drop)this.takePublicLoot(drop.id);else{const local=this.state.sacred?.groundLoot?.find(i=>i.name.toLowerCase().includes(query.toLowerCase()));if(local)this.takeLocalGroundLoot(local.id);else this.addNarrative('No matching public item is on the ground.','system');}};
    const oldDefeated=Game.enemyDefeated.bind(Game);Game.enemyDefeated=function(){const before=this.state.sacred?.groundLoot?.length||0,location=this.state.location;const r=Promise.resolve(oldDefeated());r.finally(()=>{const generated=(this.state.sacred?.groundLoot||[]).splice(before);generated.forEach(item=>OnlineSystem.dropWorldItem(location,item).then(ok=>{if(!ok)this.state.sacred.groundLoot.push(item);}));});return r;};
    const oldCommand=Game.processCommand.bind(Game);Game.processCommand=function(cmd){const c=cmd.toLowerCase().trim();
        // The monthly due is settled before anything else, so a returning hero
        // sees an honest purse and an honest storage lock. A command about the
        // estate itself is answered first, without a warning in front of it.
        if(!/^(pay |house |estate |autopay )/.test(c)&&Date.now()-(ensureHousing().settledAt||0)>3600000)this.settleHouseDues(true);
        if(c==='buy house'||c==='purchase house'){this.buyHouse();return;}
        if(c.startsWith('buy house ')||c.startsWith('purchase house ')){this.buyHouse(c.replace(/^(buy|purchase) house /,''));return;}
        if(c==='houses for sale'||c==='houses'||c==='house list'||c==='houses list'||c==='private houses'||c==='buy a house'){this.housesForSale();return;}
        if(c==='estate agent'||c==='where is the estate agent'||c==='house agent'||c==='where can i buy a house'||c==='how to buy a house'){this.estateAgentDirections();return;}
        if(c==='pay house tax'||c==='pay property tax'||c==='pay estate due'||c==='pay house due'||c==='pay the estate due'){this.payHouseDue();return;}
        if(c==='house status'||c==='property status'||c==='house due'){this.houseStatus();return;}
        if(c==='house autopay on'||c==='estate autopay on'||c==='autopay on'){this.setHouseAutopay(true);return;}
        if(c==='house autopay off'||c==='estate autopay off'||c==='autopay off'){this.setHouseAutopay(false);return;}
        if(c==='estate ledger'||c==='house ledger'||c==='estate agent ledger'){this.estateLedger();return;}if(c==='loot'||c==='check loot'){this.showPublicLoot();return;}if(c.startsWith('take loot ')){this.takePublicLootByName(c.slice(10));return;}if(c.startsWith('drop ')||c.startsWith('throw ')){this.dropPublicItem(c.replace(/^(drop|throw) /,''));return;}oldCommand(cmd);};
    if(window.ExpansionData){ExpansionData.counts.locations=Object.keys(WorldData.locations).length;ExpansionData.counts.shops=Object.values(WorldData.locations).filter(l=>l.shop).length;}
    window.HousingWorld={cities,roomDefs};
})();
