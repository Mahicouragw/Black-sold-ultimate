// A seasonal spur off the market. No overworld travel, combat or economy bypass.
(() => {
    const market='kaliwasch', square='starlight_square', pond='starlight_pond', kitchen='starlight_kitchen';
    const rooms = [
        [square,'Starlight Bell Court','A paper star swings above a brass bell. Merchant Aldric pins a quiz card to the tree. Say Christmas quiz. East is the pond; west is the kitchen.',{southwest:market,east:pond,west:kitchen},'Merchant Aldric'],
        [pond,'Ribbon Ice Pond','The Temple Priest knots red ribbons around the safe fishing holes. Say Christmas help to collect his daily bait. Bring a rod; cast here, then take your catch to the kitchen.',{west:square},'Temple Priest'],
        [kitchen,'Greta’s Gingerbread Kitchen','Greta rolls pastry beside the stove. Say Christmas help for her cooking lesson. Choose Cooking recipes to see which of your ingredients you can cook.',{east:square},'Tavern Keeper Greta']
    ];
    // A five-by-five city district, north of the three fairgrounds. Each address
    // is stable across visits and years so saves, routing and narration agree.
    const blocks=[
        ['Carolers’ Arch','Parcel Office','Pinecone Exchange','Toymaker Lane','Cocoa Terrace'],
        ['Candle Chapel','Ribbon Arcade','Clockwork Lobby','Glassblower Court','Music Box Theatre'],
        ['Snowshoe Bridge','Fawn Meadow','Reindeer Crossing','Lantern Orchard','Sleighwright Yard'],
        ['Ginger Gate','Peppermint Thicket','Frostbell Hollow','Silver Fir Copse','Snow Hare Warren'],
        ['North Watch','Mistletoe Ridge','Grand Christmas Tree','Star Observatory','Northern Lights Pier']
    ];
    const id=(row,col)=>`starlight_city_${row}_${col}`;
    const lobby=id(1,2), tree=id(4,2), workshop='starlight_secret_workshop';
    const wild=new Set([id(2,1),id(2,2),id(3,1),id(3,2),id(3,3),id(3,4)]);
    const materials=['ruby glass ball','gold ribbon','silver tree star'];
    rooms[0][3].north=id(0,2);
    for(let r=0;r<5;r++)for(let c=0;c<5;c++){
        const place=id(r,c), exits={};
        if(r<4)exits.north=id(r+1,c);if(r>0)exits.south=id(r-1,c);if(c<4)exits.east=id(r,c+1);if(c>0)exits.west=id(r,c-1);
        if(place===id(0,2))exits.south=square;
        const detail=place===lobby?'A tiny bell is hidden behind the clock. Say Christmas ring bell.':place===tree?'Its empty branches await glass balls, ribbon and a star. Say Christmas decorate.':wild.has(place)?'Glass-frost prowlers stalk the little lantern fawns. Say Christmas protect to stand guard.':'Follow the brass stars set into the snowy pavement.';
        rooms.push([place,blocks[r][c],detail,exits]);
    }
    rooms.push([workshop,'Hidden Elf Workshop','An elf packs healing lights. Say Christmas recruit to ask for battle help.',{up:lobby}]);
    const inside=g=>g.state.location?.startsWith('starlight_');
    function journal(g){const year=window.SeasonalEvents.parts(new Date()).y,p=g.state.player;
        if(p.starCity?.year!==year)p.starCity={year,found:[],rescued:0};return p.starCity;}
    function cityAction(g,c){
        if(!g.state.player)return false;
        const say=t=>g.addNarrative(t,'system'),loc=g.state.location;
        if(c==='christmas map'){say(`Christmas City. Bell Court connects west to the kitchen, east to the pond and north to Pinecone Exchange. City rows from south to north; each row is listed west to east: ${blocks.map(row=>row.join(', ')).join('; ')}. Visit Clockwork Lobby for a hidden passage.`);return true;}
        if(!['christmas protect','christmas ring bell','christmas recruit','christmas decorate','christmas gift','christmas quest'].includes(c))return false;
        const j=journal(g);
        if(c==='christmas quest'){say(`Lantern fawns protected: ${j.rescued}/3. Decorations: ${j.found.join(', ')||'none'}. Tree: ${j.decorated?'lit':'unlit'}. Guard a fawn in the wild districts, collect all three decorations, then visit the Grand Christmas Tree. Santa visits Kaliwasch Market Square on December 25.`);return true;}
        if(g.state.inCombat||g.state.combatTransition){say('Finish the battle first.');return true;}
        if(c==='christmas protect'){if(!wild.has(loc))say('Find the fawns at Reindeer Crossing or Frostbell Hollow.');else g.startCombat('glass-frost prowler');return true;}
        if(c==='christmas ring bell' && loc===lobby){j.door=true;sync(g);g.updateDirectionButtons(WorldData.locations[lobby].exits);say('The clock slides aside. Go down to the elf workshop.');}
        else if(c==='christmas recruit' && loc===workshop){j.elf=true;say('Pip the Christmas Elf joins you. In Christmas City battles he mends your wounds.');}
        else if(c==='christmas decorate' && loc===tree){if(j.decorated)say('Your star is already shining.');else if(j.found.length<3 || j.rescued<3)say('Guard three fawns and collect a glass ball, ribbon and a silver star first.');else{j.decorated=true;say('You tie the gold ribbon, hang the ruby ball and lift the star. The whole tree lights up! Visit Santa on December 25.');}}
        else if(c==='christmas gift' && loc===market){if(window.SeasonalEvents.parts(new Date()).d!==25)say('Santa’s sleigh arrives December 25.');else if(!j.decorated)say('Santa asks you to finish decorating the Grand Christmas Tree.');else if(j.gift)say('Santa has already given you this year’s gift.');else{j.gift=true;g.state.player.gold+=250;g.updateHUD();say('Santa Claus steps out of his sleigh and gives you 250 gold for protecting the fawns!');}}
        else{say('That action needs its own location. Say Christmas map or Christmas quest.');return true;}
        g.save();return true;
    }
    function victory(g,enemy){if(!wild.has(g.state.location)||!open(new Date())||!g.state.player||String(enemy?.name).toLowerCase()!=='glass-frost prowler')return;
        const j=journal(g);j.rescued=Math.min(3,j.rescued+1);const missing=materials.filter(m=>!j.found.includes(m));if(missing.length){const m=missing[Math.floor(Math.random()*missing.length)];j.found.push(m);g.addNarrative(`A lantern fawn escapes! You recover a ${m}.`,'treasure');}g.save();}
    function elf(g){if(!inside(g)||!g.state.inCombat||!g.state.player?.starCity?.elf||!open(new Date())||!journal(g).elf)return;
        const p=g.state.player,n=Math.min(4,p.maxHp-p.hp);if(n>0&&p.hp>0){p.hp+=n;g.addNarrative(`Pip’s lantern restores ${n} HP.`,'magic');g.updateHUD();}}
    const quiz=[['Which direction leads from Bell Court to Ribbon Ice Pond?','east'],['Who tends the gingerbread kitchen?','greta'],['What hangs above the brass bell: a star or a lantern?','star']];
    const santa={name:'Santa Claus',role:'gift giver',dialog:['My sleigh followed your silver star. Say Christmas gift here after decorating the tree.']};
    const open = date => window.SeasonalEvents?.activeEvents(date).some(e=>e.id==='christmas');
    function sync(game,date=new Date()) {
        const w=window.WorldData, active=open(date);
        if(!w?.locations[market])return false;
        const gate=w.locations[market].exits;
        const hosts=w.npcs[market],today=window.SeasonalEvents.parts(date);
        if(active && today.d===25){if(!hosts.includes(santa))hosts.push(santa);}else if(hosts.includes(santa))hosts.splice(hosts.indexOf(santa),1);
        if(!active){if(gate.northeast===square)delete gate.northeast;return false;}
        w.enemies['glass-frost prowler'] ||= {...w.enemies['root goblin'],name:'Glass-frost prowler'};
        for(const [id,name,description,exits,npc] of rooms){
            if(!w.locations[id])w.locations[id]={id,name,description,exits,region:'Christmas City',safe:!wild.has(id),music:'CHRISTMAS',musicContext:'CHRISTMAS',features:id===pond?['fishing']:[],items:[],enemies:wild.has(id)?['glass-frost prowler']:[]};
            const host=w.npcs[market]?.find(n=>n.name===npc);
            if(host)w.npcs[id]=[host];
        }
        if(game.state.player?.starCity?.year===window.SeasonalEvents.parts(date).y && game.state.player.starCity.door)w.locations[lobby].exits.down=workshop;else delete w.locations[lobby].exits.down;
        if(!gate.northeast)gate.northeast=square;
        return true;
    }
    function command(g,raw){
        const c=String(raw).trim().toLowerCase(), active=sync(g),say=text=>g.addNarrative(text,'system');
        if(!active && g.state.location?.startsWith('starlight_')){g.enterLocation(market);say('The fair has closed. You return to Market Square.');return true;}
        if(!/^christmas(?: |$)/.test(c))return false;
        if(!active){say('Starlight Fair opens December 1 through December 25, India time.');return true;}
        if(cityAction(g,c))return true;
        if(c==='christmas'){say('From Kaliwasch Market Square go northeast. Say Christmas map to read the city map, Christmas quest for the tree quest, or Christmas quiz at Bell Court. At Ribbon Ice Pond use fish; in Greta’s kitchen use recipes and cook. Talk to each host through People here.');return true;}
        if(c==='christmas help' && g.state.player && !g.state.inCombat){
            if(g.state.location===pond){
                const {y,m,d}=window.SeasonalEvents.parts(new Date()), day=`${y}-${m}-${d}`;
                if(g.state.player.starlightBait===day){say('The priest is mending nets. You already collected today’s bait.');return true;}
                g.addItemToInventory('fishing bait',WorldData.items['fishing bait']);
                g.state.player.starlightBait=day;g.save();say('The priest threads a hook and hands you one fishing bait. Bring your rod and say fish.');return true;
            }
            if(g.state.location===kitchen){say('Greta warms the pan and checks your ingredients with you.');g.inspectCooking();return true;}
        }
        if(g.state.location!==square || !g.state.player || g.state.inCombat){say('Visit Bell Court in peace for the Christmas quiz.');return true;}
        const p=g.state.player,year=window.SeasonalEvents.parts(new Date()).y;
        const progress=p.starlightQuiz?.year===year?p.starlightQuiz:{year,step:0};
        if(progress.step>=quiz.length){say('Your star is already on the tree. You received this year’s 75 gold.');return true;}
        const [question,answer]=quiz[progress.step];
        if(c==='christmas quiz'){say(`${question} Say Christmas answer followed by your answer.`);return true;}
        if(!c.startsWith('christmas answer ')){say('Say Christmas quiz for the question.');return true;}
        if(c.slice(17).trim()!==answer){say(`Not quite. ${question}`);return true;}
        p.starlightQuiz=progress; progress.step++;
        if(progress.step===quiz.length){p.gold+=75;g.updateHUD();say('Aldric rings the bell and hangs your star. You earned 75 gold!');}
        else say(`Correct! ${quiz[progress.step][0]}`);
        g.save();return true;
    }
    function calendarTick(){
        const g=window.Game;if(!g||!window.SeasonalEvents)return;
        const before=WorldData.locations[market]?.exits?.northeast;
        const active=sync(g);
        if(!active && inside(g) && g.state.player && !g.state.inCombat && !g.state.combatTransition){g.enterLocation(market);g.save();}
        if(g.state.location===market && before!==WorldData.locations[market].exits.northeast)g.updateDirectionButtons(WorldData.locations[market].exits);
        if(g.state.location===market && g.state.player)g.updateSpeakerButtons();
    }
    // India uses a fixed UTC+05:30 offset. Recheck when a sleeping tab returns.
    function schedule(){const day=86400000;window.setTimeout(()=>{calendarTick();schedule();},day-((Date.now()+19800000)%day)+50);}
    schedule();document.addEventListener('visibilitychange',()=>{if(!document.hidden)calendarTick();});
    window.StarlightFair={sync,command,victory,elf};
})();
