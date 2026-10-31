/**
 * v7.47.0 — World Connectivity Fix
 * Ensures all major locations are accessible and properly connected
 * Makes the world more playable and explorable
 */
(() => {
    'use strict';

    const fixConnectivity = () => {
        if (!window.WorldData || !window.WorldData.locations) {
            setTimeout(fixConnectivity, 100);
            return;
        }

        const W = window.WorldData;

        // Ensure city has connections to all major areas
        if (W.locations['kaliwasch_city']) {
            const city = W.locations['kaliwasch_city'];
            
            // North to forest
            if (!city.exits.north) city.exits.north = 'forest_path_1';
            
            // East to caves
            if (!city.exits.east) city.exits.east = 'cave_entrance';
            
            // South to plains and mountains
            if (!city.exits.south) city.exits.south = 'plains_1';
            
            // West to coast
            if (!city.exits.west) city.exits.west = 'coast_1';
            
            // Up to city district
            if (!city.exits.up) city.exits.up = 'city_district_upper';
        }

        // Create cave entrance if it doesn't exist
        if (!W.locations['cave_entrance']) {
            W.locations['cave_entrance'] = {
                name: 'Cave Entrance',
                region: 'Dark Caves',
                description: 'The mouth of a dark cave. Cold air flows from within.',
                exits: { west: 'kaliwasch_city', east: 'tunnel_section_1' },
                features: ['cave', 'entrance'],
                items: [],
                enemies: ['cave_bat', 'goblin'],
                safe: false,
                music: 'dungeon'
            };
        } else {
            // Connect cave entrance to tunnels
            W.locations['cave_entrance'].exits.east = 'tunnel_section_1';
            W.locations['cave_entrance'].exits.west = 'kaliwasch_city';
        }

        // Create plains path
        if (!W.locations['plains_1']) {
            const plains = [];
            for (let i = 1; i <= 8; i++) {
                const id = `plains_${i}`;
                W.locations[id] = {
                    name: `Open Plains ${i}`,
                    region: 'Southern Plains',
                    description: `Vast open grasslands. ${i <= 4 ? 'The wind blows gently.' : 'Mountains visible to the north.'}`,
                    exits: {},
                    features: ['plains', 'outdoor'],
                    items: i % 3 === 0 ? ['herb'] : [],
                    enemies: i % 2 === 0 ? ['wild_boar', 'bandit'] : [],
                    safe: i === 1
                };
                plains.push(id);
            }
            
            // Connect plains
            for (let i = 0; i < plains.length - 1; i++) {
                W.locations[plains[i]].exits.south = plains[i + 1];
                W.locations[plains[i + 1]].exits.north = plains[i];
            }
            
            // Connect to city
            W.locations['plains_1'].exits.north = 'kaliwasch_city';
            
            // Connect last plains to mountains
            W.locations['plains_8'].exits.south = 'mountain_path_1';
            W.locations['mountain_path_1'].exits.north = 'plains_8';
        }

        // Create coast
        if (!W.locations['coast_1']) {
            const coast = [];
            for (let i = 1; i <= 6; i++) {
                const id = `coast_${i}`;
                W.locations[id] = {
                    name: `Rocky Coast ${i}`,
                    region: 'Western Coast',
                    description: `The ocean stretches before you. ${i <= 3 ? 'Waves crash on rocks.' : 'A lighthouse visible in the distance.'}`,
                    exits: {},
                    features: ['coast', 'water'],
                    items: i % 2 === 0 ? ['seashell'] : [],
                    enemies: i % 3 === 0 ? ['sea_serpent', 'pirate'] : [],
                    safe: i === 1
                };
                coast.push(id);
            }
            
            // Connect coast
            for (let i = 0; i < coast.length - 1; i++) {
                W.locations[coast[i]].exits.west = coast[i + 1];
                W.locations[coast[i + 1]].exits.east = coast[i];
            }
            
            // Connect to city
            W.locations['coast_1'].exits.east = 'kaliwasch_city';
        }

        // Create city upper district
        if (!W.locations['city_district_upper']) {
            W.locations['city_district_upper'] = {
                name: 'Upper City District',
                region: 'Kaliwasch',
                description: 'The wealthy district of Kaliwasch. Grand buildings and shops.',
                exits: { down: 'kaliwasch_city', north: 'guild_hall', east: 'temple' },
                features: ['city', 'urban'],
                items: [],
                enemies: [],
                safe: true
            };
        }

        // Ensure mountain summit is accessible
        if (W.locations['mountain_path_12']) {
            const summit = W.locations['mountain_path_12'];
            summit.name = 'Mountain Summit';
            summit.description = 'The peak of the mountain. You can see for miles in all directions. An ancient shrine stands here.';
            summit.features = ['mountain', 'summit', 'shrine'];
            summit.safe = true;
        }

        // Add more connections between forest and other areas
        if (W.locations['forest_path_15']) {
            W.locations['forest_path_15'].exits.north = 'cemetery_entrance';
            if (!W.locations['cemetery_entrance']) {
                W.locations['cemetery_entrance'] = {
                    name: 'Cemetery Entrance',
                    region: 'City Cemetery',
                    description: 'The gate to the haunted cemetery. Fog seeps through the bars.',
                    exits: { south: 'forest_path_15', north: 'city_cemetery' },
                    features: ['cemetery', 'entrance'],
                    items: [],
                    enemies: ['ghost'],
                    safe: false,
                    music: 'cemetery'
                };
            }
        }

        console.log('World connectivity fixed: All major areas accessible');
    };

    fixConnectivity();
})();
