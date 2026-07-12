/**
 * Realms & Relations expansion
 * Adds 96 explorable locations, 100 monsters, shops, companions, guilds and
 * local simulated social data. No account or network connection is required.
 */
(() => {
    const regionNames = [
        'Ember Coast', 'Moonwood', 'Sunscar Desert', 'Frostmarch',
        'Storm Isles', 'Jade Lowlands', 'Ashen Vale', 'Crystal Reach',
        'Whispering Steppe', 'Ironroot Wilds', 'Starfall Basin', 'Void Frontier'
    ];
    const siteNames = [
        'Crossroads', 'Village', 'Wilds', 'Ruins', 'Cavern', 'Sanctum', 'Citadel', 'Bazaar'
    ];
    const regionFlavor = [
        'warm sea winds and ember-red cliffs', 'silver leaves and watchful ancient trees',
        'golden dunes beneath a merciless sun', 'blue glaciers and singing ice',
        'thunderclouds circling broken islands', 'rice terraces and jade-green rivers',
        'black orchards under a copper sky', 'prismatic stone and luminous waterfalls',
        'endless grass stirred by whispering spirits', 'towering roots wrapped around iron ruins',
        'fallen stars glowing in quiet lakes', 'floating rock and tears in reality'
    ];
    const monsterFamilies = [
        ['Ember', 'Jackal'], ['Moon', 'Stalker'], ['Dune', 'Scorpion'], ['Frost', 'Warg'],
        ['Storm', 'Drake'], ['Jade', 'Serpent'], ['Ash', 'Revenant'], ['Crystal', 'Golem'],
        ['Whisper', 'Harpy'], ['Void', 'Marauder']
    ];
    const ranks = ['Whelp', 'Scout', 'Hunter', 'Raider', 'Brute', 'Mystic', 'Champion', 'Warden', 'Tyrant', 'Ancient'];
    const shopKinds = ['provisions', 'weapons', 'alchemy', 'relics'];

    const enemyIds = [];
    monsterFamilies.forEach((family, familyIndex) => {
        ranks.forEach((rank, rankIndex) => {
            const id = `${family[0]} ${family[1]} ${rank}`.toLowerCase();
            const tier = familyIndex + rankIndex + 1;
            WorldData.enemies[id] = {
                hp: 24 + tier * 11,
                attack: 6 + tier * 2,
                xp: 18 + tier * 14,
                gold: 8 + tier * 7,
                boss: rankIndex === 9,
                desc: `A ${rank.toLowerCase()} ${family.join(' ').toLowerCase()} from the expanded realms.`
            };
            enemyIds.push(id);
        });
    });

    const shopStock = {
        provisions: [
            { id: 'bread', price: 8 }, { id: 'healing potion', price: 45 }, { id: 'mana potion', price: 40 }
        ],
        weapons: [
            { id: 'goblin axe', price: 140 }, { id: 'wooden staff', price: 75 }, { id: 'iron ore', price: 20 }
        ],
        alchemy: [
            { id: 'healing potion', price: 40 }, { id: 'mana potion', price: 35 }, { id: 'fairy dust', price: 65 }
        ],
        relics: [
            { id: 'golden amulet', price: 240 }, { id: 'ancient scroll', price: 110 }, { id: 'mystic orb', price: 500 }
        ]
    };

    const expandedIds = [];
    regionNames.forEach((region, regionIndex) => {
        siteNames.forEach((site, siteIndex) => {
            const id = `realm_${regionIndex + 1}_${siteIndex + 1}`;
            const globalIndex = regionIndex * siteNames.length + siteIndex;
            const previous = globalIndex === 0 ? 'kaliwasch' : `realm_${Math.floor((globalIndex - 1) / 8) + 1}_${((globalIndex - 1) % 8) + 1}`;
            const next = globalIndex === 95 ? 'kaliwasch' : `realm_${Math.floor((globalIndex + 1) / 8) + 1}_${((globalIndex + 1) % 8) + 1}`;
            const shop = siteIndex === 1 || siteIndex === 7 ? shopKinds[(regionIndex + siteIndex) % shopKinds.length] : null;
            const enemyStart = (globalIndex * 3) % enemyIds.length;
            WorldData.locations[id] = {
                name: `${region} ${site}`,
                region,
                description: `You reach the ${site.toLowerCase()} of ${region}, a land of ${regionFlavor[regionIndex]}. ${shop ? `A ${shop} shop welcomes travelers here.` : 'The road promises danger and discovery.'}`,
                exits: { south: previous, north: next },
                features: shop ? [`${shop} shop`, 'waystone', 'guild noticeboard'] : ['waystone', 'camp site', 'monster tracks'],
                items: siteIndex === 0 ? ['bread'] : [],
                enemies: siteIndex === 0 || shop ? [] : [enemyIds[enemyStart], enemyIds[(enemyStart + 1) % enemyIds.length], enemyIds[(enemyStart + 2) % enemyIds.length]],
                safe: siteIndex === 0 || Boolean(shop),
                shop,
                music: shop ? 'city' : (siteIndex >= 4 ? 'dungeon' : 'wilderness')
            };
            expandedIds.push(id);
        });
    });

    // The new world is entered by going "up" from the capital.
    WorldData.locations.kaliwasch.exits.up = expandedIds[0];
    WorldData.locations[expandedIds[0]].exits.south = 'kaliwasch';
    WorldData.locations[expandedIds[expandedIds.length - 1]].exits.north = 'kaliwasch';

    // Give every expanded region several NPCs, including a recruitable companion.
    const companionTemplates = [
        { name: 'Lyra Dawnstep', role: 'ranger', maxHp: 90, attack: 16, heal: 0 },
        { name: 'Brother Cael', role: 'healer', maxHp: 82, attack: 9, heal: 18 },
        { name: 'Brakka Ironhand', role: 'guardian', maxHp: 135, attack: 13, heal: 0 },
        { name: 'Nim Vex', role: 'arcanist', maxHp: 74, attack: 21, heal: 0 }
    ];
    regionNames.forEach((region, i) => {
        const townId = `realm_${i + 1}_2`;
        WorldData.npcs[townId] = [
            { name: `${region} Guide`, role: 'guide', dialog: [`Welcome to ${region}.`, 'Use the waystones and keep your party close.', 'The guild pays well for monster trophies.'] },
            { ...companionTemplates[i % companionTemplates.length], role: 'companion', dialog: ['I could use a worthy traveling partner.', 'Invite me and I will fight beside you.', 'A strong party survives together.'] }
        ];
    });

    window.ExpansionData = {
        expandedIds,
        enemyIds,
        regionNames,
        shopStock,
        companions: companionTemplates,
        counts: {
            locations: Object.keys(WorldData.locations).length,
            monsters: Object.keys(WorldData.enemies).length,
            shops: Object.values(WorldData.locations).filter(l => l.shop).length
        }
    };
    console.log(`Expansion loaded: ${window.ExpansionData.counts.locations} locations, ${window.ExpansionData.counts.monsters} monsters, ${window.ExpansionData.counts.shops} shops.`);
})();
