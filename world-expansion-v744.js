/**
 * v7.44.0 — World Expansion: Complex paths, many intermediate locations
 * Makes travel require 20-30 steps through various areas
 * Adds forests, tunnels, mountains, and more between major locations
 */
(() => {
    'use strict';

    // Wait for WorldData to be available
    const expand = () => {
        if (!window.WorldData || !window.WorldData.locations) {
            setTimeout(expand, 100);
            return;
        }

        const W = window.WorldData;

        // Create forest path system (20+ locations)
        const forestLocations = [];
        for (let i = 1; i <= 25; i++) {
            const id = `forest_path_${i}`;
            const names = [
                'Mossy Trail', 'Twisted Oaks', 'Whispering Pines', 'Fern Hollow', 
                'Deer Crossing', 'Old Growth', 'Sunlit Clearing', 'Shadow Glen',
                'Mushroom Circle', 'Babbling Brook', 'Fallen Log Bridge', 'Thorn Thicket',
                'Bird Song Meadow', 'Ancient Stump', 'Root Tangle', 'Mist Valley',
                'Wolf Den Approach', 'Eagle Nest View', 'Berry Patch', 'Hollow Tree',
                'Stream Crossing', 'Rocky Outcrop', 'Wildflower Field', 'Dark Canopy',
                'Forest Heart'
            ];
            W.locations[id] = {
                name: names[i-1] || `Forest Path ${i}`,
                region: 'Great Forest',
                description: `Part of the vast forest. ${i <= 10 ? 'The trees are thick here.' : i <= 20 ? 'You can barely see the sky.' : 'You feel closer to the heart of the forest.'}`,
                exits: {},
                features: ['forest'],
                items: i % 5 === 0 ? ['health_potion'] : [],
                enemies: i % 3 === 0 ? ['wolf', 'forest_spider', 'goblin'] : [],
                safe: i === 1 || i === 25
            };
            forestLocations.push(id);
        }

        // Connect forest paths in a winding path (no loops)
        for (let i = 0; i < forestLocations.length - 1; i++) {
            const current = forestLocations[i];
            const next = forestLocations[i + 1];
            const dirs = ['north', 'east', 'south', 'west'];
            const dir = dirs[i % 4];
            const opposite = { north: 'south', south: 'north', east: 'west', west: 'east' }[dir];
            W.locations[current].exits[dir] = next;
            W.locations[next].exits[opposite] = current;
        }

        // Connect forest start to Kaliwasch
        if (W.locations['kaliwasch_city']) {
            W.locations['kaliwasch_city'].exits.north = 'forest_path_1';
            W.locations['forest_path_1'].exits.south = 'kaliwasch_city';
        }

        // Create tunnel system (15+ locations)
        const tunnelLocations = [];
        for (let i = 1; i <= 18; i++) {
            const id = `tunnel_section_${i}`;
            const names = [
                'Tunnel Entrance', 'Narrow Passage', 'Crystal Chamber', 'Echo Hall',
                'Underground Stream', 'Stalactite Gallery', 'Deep Shaft', 'Mine Cart Track',
                'Goblin Warren', 'Forgotten Chamber', 'Lava Vent', 'Mushroom Cavern',
                'Ancient Ruins', 'Bottomless Pit Edge', 'Crystal Bridge', 'Dark Pool',
                'Treasure Room', 'Tunnel Exit'
            ];
            W.locations[id] = {
                name: names[i-1] || `Tunnel ${i}`,
                region: 'Underground Tunnels',
                description: `Part of the ancient tunnel system. ${i <= 6 ? 'The air is damp.' : i <= 12 ? 'Strange sounds echo.' : 'You sense the exit ahead.'}`,
                exits: {},
                features: ['underground', 'cave'],
                items: i % 4 === 0 ? ['mana_potion'] : [],
                enemies: i % 2 === 0 ? ['cave_troll', 'goblin_mage', 'dark_spirit'] : [],
                safe: i === 1 || i === 18,
                music: 'dungeon'
            };
            tunnelLocations.push(id);
        }

        // Connect tunnel sections
        for (let i = 0; i < tunnelLocations.length - 1; i++) {
            const current = tunnelLocations[i];
            const next = tunnelLocations[i + 1];
            const dirs = ['east', 'south', 'west', 'north', 'down', 'up'];
            const dir = dirs[i % 6];
            const opposite = { north: 'south', south: 'north', east: 'west', west: 'east', up: 'down', down: 'up' }[dir];
            W.locations[current].exits[dir] = next;
            W.locations[next].exits[opposite] = current;
        }

        // Connect tunnel to forest end
        if (W.locations['forest_path_25']) {
            W.locations['forest_path_25'].exits.east = 'tunnel_section_1';
            W.locations['tunnel_section_1'].exits.west = 'forest_path_25';
        }

        // Create mountain path (12 locations)
        const mountainLocations = [];
        for (let i = 1; i <= 12; i++) {
            const id = `mountain_path_${i}`;
            const names = [
                'Foothills', 'Rocky Ascent', 'Winding Trail', 'Cliff Edge',
                'Mountain Stream', 'Pine Forest', 'Snow Line', 'Eagle Peak',
                'High Pass', 'Summit Approach', 'Mountain Top', 'Ancient Shrine'
            ];
            W.locations[id] = {
                name: names[i-1] || `Mountain Path ${i}`,
                region: 'Northern Mountains',
                description: `Part of the mountain trail. ${i <= 4 ? 'The path climbs steadily.' : i <= 8 ? 'The air grows thin.' : 'You can see for miles.'}`,
                exits: {},
                features: ['mountain'],
                items: i % 6 === 0 ? ['health_potion'] : [],
                enemies: i % 3 === 0 ? ['mountain_lion', 'rock_golem', 'frost_spirit'] : [],
                safe: i === 1 || i === 12
            };
            mountainLocations.push(id);
        }

        // Connect mountain paths
        for (let i = 0; i < mountainLocations.length - 1; i++) {
            const current = mountainLocations[i];
            const next = mountainLocations[i + 1];
            const dir = i < 6 ? 'north' : 'up';
            const opposite = dir === 'north' ? 'south' : 'down';
            W.locations[current].exits[dir] = next;
            W.locations[next].exits[opposite] = current;
        }

        // Connect mountain to tunnel end
        if (W.locations['tunnel_section_18']) {
            W.locations['tunnel_section_18'].exits.north = 'mountain_path_1';
            W.locations['mountain_path_1'].exits.south = 'tunnel_section_18';
        }

        // Ensure cemetery is accessible from tunnel
        if (W.locations['city_cemetery'] && W.locations['tunnel_section_10']) {
            W.locations['tunnel_section_10'].exits.up = 'city_cemetery';
            W.locations['city_cemetery'].exits.down = 'tunnel_section_10';
        }

        // Create cemetery expansion (8 more locations)
        for (let i = 2; i <= 8; i++) {
            const id = `cemetery_section_${i}`;
            W.locations[id] = {
                name: `Cemetery Section ${i}`,
                region: 'City Cemetery',
                description: `Another part of the haunted cemetery. Fog clings to the ground. ${i >= 6 ? 'The spirits grow restless.' : 'Gravestones lean at odd angles.'}`,
                exits: {},
                features: ['cemetery', 'graveyard'],
                items: i % 3 === 0 ? ['lantern_fragment'] : [],
                enemies: ['skeleton', 'zombie', 'ghost', 'wraith'],
                safe: false,
                music: 'cemetery'
            };
        }

        // Connect cemetery sections
        for (let i = 1; i <= 8; i++) {
            const current = i === 1 ? 'city_cemetery' : `cemetery_section_${i-1}`;
            const next = i === 8 ? 'city_cemetery' : `cemetery_section_${i}`;
            if (i < 8) {
                const dir = ['north', 'east', 'south', 'west'][i % 4];
                const opposite = { north: 'south', south: 'north', east: 'west', west: 'east' }[dir];
                if (W.locations[current]) {
                    W.locations[current].exits[dir] = next;
                    if (W.locations[next]) {
                        W.locations[next].exits[opposite] = current;
                    }
                }
            }
        }

        console.log('World expansion complete: Added', forestLocations.length, 'forest paths,', tunnelLocations.length, 'tunnel sections,', mountainLocations.length, 'mountain paths, and 7 cemetery sections');
    };

    expand();
})();
