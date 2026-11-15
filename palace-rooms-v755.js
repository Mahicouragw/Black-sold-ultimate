/**
 * Black Sword Ultimate v7.55 — the rooms of the Royal Palace.
 *
 * The palace used to be a single room above the palace gate. It is now a small
 * building the hero walks through:
 *
 *                     Throne Room
 *                          |
 *          Chapel ---- Great Hall
 *                          |
 *          Library -- Entrance Hall -- Armory        (Entrance Hall = royal_palace,
 *                          |                           down to the palace gate)
 *                      Courtyard
 *
 * Every link is two-way and the building is a tree, so there are no loops.
 * The chapel is a place of prayer, the armory sells weapons and armor, and the
 * King gives palace quests in the throne room as well as at the quest board.
 */
(function () {
    'use strict';
    const WD = window.WorldData;
    const hall = WD?.locations?.royal_palace;
    if (!hall || WD.locations.kaliwasch_palace_great_hall) return;

    const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east', up: 'down', down: 'up' };
    const STEP = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] };
    const gate = WD.locations.kaliwasch_district_11;
    const origin = { x: gate?.coordinates?.x ?? 199, y: gate?.coordinates?.y ?? 401, z: 1 };
    const REGION = gate?.region || 'Kaliwasch';

    const ROOMS = {
        kaliwasch_palace_great_hall: {
            name: 'Royal Palace — Great Hall', at: [0, 1], type: 'palace', music: 'PALACE',
            description: 'A long hall of white stone, hung with the banners of every city in the realm. Courtiers and messengers cross the floor. The throne room is to the north, the palace chapel is to the west, and the entrance hall is to the south.',
            features: ['banners of the realm', 'long tables', 'tall windows']
        },
        kaliwasch_palace_throne_room: {
            name: 'Royal Palace — Throne Room', at: [0, 2], type: 'palace', music: 'PALACE',
            description: 'The throne of Kandor stands on a dais of dark marble. King Aldric receives heroes here, and Captain Marcus of the Royal Guard stands beside him. Say palace quest to ask the King for a task. The great hall is to the south.',
            features: ['throne of Kandor', 'marble dais', 'royal guard']
        },
        kaliwasch_palace_chapel: {
            name: 'Royal Palace — Chapel', at: [-1, 1], type: 'temple', music: 'TEMPLE', prayerPlace: true,
            description: 'A small, quiet chapel lit by five candles, one for each of the five flames. You can pray here as you would in a temple. The great hall is to the east.',
            features: ['altar', 'five candles', 'prayer benches']
        },
        kaliwasch_palace_armory: {
            name: 'Royal Palace — Armory', at: [1, 0], type: 'palace', music: 'PALACE', shop: 'weapons',
            description: 'Racks of swords, spears, shields and mail line the walls. The Royal Armorer sells weapons and armor to heroes in the service of the crown. Say shop to see what is for sale. The entrance hall is to the west.',
            features: ['weapon racks', 'shield wall', 'armorer\'s bench']
        },
        kaliwasch_palace_library: {
            name: 'Royal Palace — Library', at: [-1, 0], type: 'palace', music: 'PALACE',
            description: 'Shelves of books and scrolls rise to the ceiling. The Royal Archivist keeps the histories of the realm and is glad to share what they say. Say talk to ask for advice. The entrance hall is to the east.',
            features: ['bookshelves', 'reading desks', 'map table']
        },
        kaliwasch_palace_courtyard: {
            name: 'Royal Palace — Courtyard', at: [0, -1], type: 'palace', music: 'PALACE',
            description: 'An open courtyard with a fountain at its center. Guards drill on the flagstones under the eye of the Drill Sergeant. The entrance hall is to the north.',
            features: ['fountain', 'training dummies', 'guard drill']
        }
    };
    const LINKS = [
        ['royal_palace', 'north', 'kaliwasch_palace_great_hall'],
        ['kaliwasch_palace_great_hall', 'north', 'kaliwasch_palace_throne_room'],
        ['kaliwasch_palace_great_hall', 'west', 'kaliwasch_palace_chapel'],
        ['royal_palace', 'east', 'kaliwasch_palace_armory'],
        ['royal_palace', 'west', 'kaliwasch_palace_library'],
        ['royal_palace', 'south', 'kaliwasch_palace_courtyard']
    ];

    for (const [id, def] of Object.entries(ROOMS)) {
        if (WD.locations[id]) continue;   // never replace an existing place
        WD.locations[id] = {
            id, name: def.name, region: REGION, description: def.description,
            exits: {}, exitMetadata: {}, features: def.features, items: [], enemies: [], safe: true,
            shop: def.shop || null, music: def.music, musicContext: def.music, musicContexts: [def.music],
            locationType: def.type, accessibleDescription: `${def.name}. ${def.description}`,
            coordinates: { x: origin.x + def.at[0], y: origin.y + def.at[1], z: origin.z },
            regionBoundary: [], palaceRoom: true, ...(def.prayerPlace ? { prayerPlace: true } : {})
        };
    }
    for (const [from, direction, to] of LINKS) {
        const a = WD.locations[from], b = WD.locations[to], back = OPPOSITE[direction];
        if (!a || !b || !STEP[direction]) continue;
        if (a.exits[direction] || b.exits[back]) continue;   // keep whatever is already there
        a.exits[direction] = to; b.exits[back] = from;
        (a.exitMetadata ||= {})[direction] = { kind: 'physical', reciprocal: true };
        (b.exitMetadata ||= {})[back] = { kind: 'physical', reciprocal: true };
    }

    // The entrance hall now says where the other rooms are.
    const ways = [];
    if (hall.exits.north === 'kaliwasch_palace_great_hall') ways.push('The great hall and the throne room are to the north');
    if (hall.exits.east === 'kaliwasch_palace_armory') ways.push('the armory is to the east');
    if (hall.exits.west === 'kaliwasch_palace_library') ways.push('the library is to the west');
    if (hall.exits.south === 'kaliwasch_palace_courtyard') ways.push('the courtyard is to the south');
    if (ways.length && !/great hall/i.test(hall.description || '')) {
        hall.description = `${hall.description} ${ways.join(', ')}. The palace gate is down.`.trim();
        hall.accessibleDescription = `${hall.name}. ${hall.description}`;
    }

    WD.npcs = WD.npcs || {};
    const people = {
        kaliwasch_palace_throne_room: [
            { name: 'King Aldric', role: 'king', dialog: ['Kandor has need of you, hero. Say palace quest and I will give you a task.', 'Return to me when your task is done and you will be rewarded.', 'A hero who eats, rests and prays will serve the realm for many years.'] },
            { name: 'Captain Marcus', role: 'guard captain', dialog: ['The Royal Guard stands ready.', 'Never go into a hard fight hungry. A weak arm loses battles.', 'If a fight turns against you, pray. I have seen angels answer a hero whose strength was almost gone.'] }
        ],
        kaliwasch_palace_great_hall: [
            { name: 'Royal Steward', role: 'steward', dialog: ['Welcome to the palace. The King receives heroes in the throne room, to the north.', 'The chapel is to the west if you wish to pray.', 'The armory, the library and the courtyard open from the entrance hall, to the south.'] }
        ],
        kaliwasch_palace_chapel: [
            { name: 'Palace Chaplain', role: 'priest', dialog: ['You may pray here as in any temple. Say pray.', 'A daily blessing is given once each day. Come back tomorrow for the next one.', 'When your health is nearly gone, pray wherever you stand. Four angels will come.'] }
        ],
        kaliwasch_palace_armory: [
            { name: 'Royal Armorer', role: 'trader', dialog: ['Good steel for the servants of the crown. Say shop to see my stock.', 'Keep your weapon equipped. A blade in the bag wins no fights.'] }
        ],
        kaliwasch_palace_library: [
            { name: 'Royal Archivist', role: 'scholar', dialog: ['Time passes in this realm as it does in yours. A good meal keeps hunger away for hours.', 'Health and magic return slowly with time, one point each minute, even while you are away.', 'The temple gives one blessing each day, and one lasting blessing in a lifetime. Choose it with care.', 'Say where am I at any time to hear the exits around you.'] }
        ],
        kaliwasch_palace_courtyard: [
            { name: 'Drill Sergeant', role: 'trainer', dialog: ['Feet apart, shield up! Say defend to raise your guard in a fight.', 'Know when to flee. A living hero can fight again tomorrow.'] }
        ]
    };
    for (const [id, list] of Object.entries(people)) if (WD.locations[id] && !WD.npcs[id]) WD.npcs[id] = list;

    window.PalaceRooms = { rooms: Object.keys(ROOMS), links: LINKS.map(link => link.slice()) };
})();
