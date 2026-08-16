/**
 * Black Sword Ultimate v7.21 finite-world graph normalization.
 * Runs after every stabilized expansion has registered its locations. It does
 * not create procedural/infinite locations; it reshapes existing finite sets,
 * repairs classified physical links, and annotates the single graph consumed
 * by movement, maps and Wayfinder.
 */
(() => {
    const locations = window.WorldData?.locations;
    if (!locations) return;

    const DIRECTIONS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'up', 'down'];
    const OPPOSITE = {
        north: 'south', south: 'north', east: 'west', west: 'east',
        northeast: 'southwest', southwest: 'northeast',
        northwest: 'southeast', southeast: 'northwest', up: 'down', down: 'up'
    };
    const VECTOR = {
        north: [0, 1, 0], northeast: [1, 1, 0], east: [1, 0, 0], southeast: [1, -1, 0],
        south: [0, -1, 0], southwest: [-1, -1, 0], west: [-1, 0, 0], northwest: [-1, 1, 0],
        up: [0, 0, 1], down: [0, 0, -1]
    };
    const repairs = [];

    const disconnect = (id, direction) => {
        const location = locations[id];
        const destination = location?.exits?.[direction];
        if (!location || !destination) return;
        delete location.exits[direction];
        const reverse = OPPOSITE[direction];
        if (locations[destination]?.exits?.[reverse] === id) delete locations[destination].exits[reverse];
    };

    const connect = (from, direction, to, kind = 'physical') => {
        if (!locations[from] || !locations[to] || !OPPOSITE[direction]) return false;
        const reverse = OPPOSITE[direction];
        disconnect(from, direction);
        disconnect(to, reverse);
        locations[from].exits ||= {};
        locations[to].exits ||= {};
        locations[from].exits[direction] = to;
        locations[to].exits[reverse] = from;
        locations[from].exitMetadata ||= {};
        locations[to].exitMetadata ||= {};
        locations[from].exitMetadata[direction] = { kind, reciprocal: true };
        locations[to].exitMetadata[reverse] = { kind, reciprocal: true };
        return true;
    };

    const clearFamilyExits = ids => {
        const family = new Set(ids);
        for (const id of ids) {
            const location = locations[id];
            if (!location) continue;
            for (const [direction, destination] of Object.entries(location.exits || {})) {
                if (family.has(destination)) disconnect(id, direction);
            }
        }
    };

    const gridFamily = (ids, columns, { clearAll = false } = {}) => {
        const valid = ids.filter(id => locations[id]);
        const family = new Set(valid);
        for (const id of valid) {
            const location = locations[id];
            if (clearAll) {
                for (const direction of Object.keys(location.exits || {})) disconnect(id, direction);
                location.exits = {};
            } else {
                for (const [direction, destination] of Object.entries(location.exits || {})) {
                    if (family.has(destination)) disconnect(id, direction);
                }
            }
        }
        valid.forEach((id, index) => {
            const row = Math.floor(index / columns), column = index % columns;
            if (column + 1 < columns && valid[index + 1]) connect(id, 'east', valid[index + 1], 'regional-road');
            if (valid[index + columns]) connect(id, 'south', valid[index + columns], 'regional-road');
            locations[id].gridPosition = { row, column };
        });
        return valid;
    };

    const numbered = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).filter(id => locations[id]);

    // ---------------------------------------------------------------------
    // Capital geography: Market Square is a four-way civic hub, while gates
    // lead to real adjacent regions. This replaces overwritten expansion links.
    // ---------------------------------------------------------------------
    if (locations.kaliwasch) {
        locations.kaliwasch.name = 'Kaliwasch Market Square';
        locations.kaliwasch.region = 'Kaliwasch';
        locations.kaliwasch.locationType = 'market';
        locations.kaliwasch.description = 'Kaliwasch Market Square is the finite capital’s central crossroads. North Street leads toward the mountain gate, East Street toward the ruins, South Street toward the wetlands, and West Street toward the Great Forest.';
        for (const direction of Object.keys(locations.kaliwasch.exits || {})) disconnect('kaliwasch', direction);
        locations.kaliwasch.exits = {};
        connect('kaliwasch', 'north', 'kaliwasch_district_3', 'city-street');
        connect('kaliwasch', 'east', 'kaliwasch_district_8', 'city-street');
        connect('kaliwasch', 'south', 'kaliwasch_district_27', 'city-street');
        connect('kaliwasch', 'west', 'kaliwasch_district_16', 'city-street');
        disconnect('kaliwasch_district_30', 'down');
        connect('kaliwasch_district_1', 'north', 'mountains', 'city-gate');
        connect('kaliwasch_district_5', 'east', 'ruins', 'city-gate');
        connect('kaliwasch_district_30', 'south', 'swamp', 'city-gate');
        connect('kaliwasch_district_21', 'west', 'great_forest_east_gate', 'city-gate');
        connect('kaliwasch_district_5', 'northeast', 'valoria_citadel', 'kingdom-road');
    }

    // ---------------------------------------------------------------------
    // Twelve expanded realms: eight meaningful sites per region form a ring
    // with cross-routes; the regions themselves occupy a finite 4 × 3 atlas.
    // ---------------------------------------------------------------------
    const realmSites = [
        [1, 2, 'north'], [2, 3, 'east'], [3, 4, 'south'], [4, 5, 'south'],
        [5, 6, 'west'], [6, 7, 'west'], [7, 8, 'north'], [8, 1, 'east'],
        [2, 8, 'southwest'], [2, 4, 'southeast'], [6, 8, 'northwest']
    ];
    for (let region = 1; region <= 12; region++) {
        const ids = numbered(`realm_${region}_`, 8);
        clearFamilyExits(ids);
        realmSites.forEach(([a, b, direction]) => connect(`realm_${region}_${a}`, direction, `realm_${region}_${b}`, 'realm-route'));
    }
    for (let region = 1; region <= 12; region++) {
        const column = (region - 1) % 4, row = Math.floor((region - 1) / 4);
        if (column < 3) connect(`realm_${region}_3`, 'east', `realm_${region + 1}_8`, 'realm-border');
        if (row < 2) connect(`realm_${region}_2`, 'north', `realm_${region + 4}_6`, 'realm-border');
    }
    connect('kaliwasch_district_30', 'southeast', 'realm_1_8', 'waystone-road');
    disconnect('seabreeze_city_district_30', 'down');
    connect('kaliwasch_district_30', 'northeast', 'seabreeze_city_district_30', 'capital-coast-road');

    // ---------------------------------------------------------------------
    // Villages form a serpentine 5 × 2 pastoral route. Cardinal gate names now
    // match their movement direction; houses remain a logical upper interior.
    // ---------------------------------------------------------------------
    const villagePositions = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1]];
    const villageAt = new Map(villagePositions.map((position, index) => [position.join(','), index + 1]));
    for (let village = 1; village <= 10; village++) {
        const center = `village_${village}_center`;
        const members = [center, `village_${village}_houses`, `village_${village}_north_gate`, `village_${village}_east_gate`, `village_${village}_south_gate`, `village_${village}_west_gate`];
        members.forEach(id => {
            if (!locations[id]) return;
            for (const direction of Object.keys(locations[id].exits || {})) disconnect(id, direction);
            locations[id].exits = {};
        });
        connect(center, 'north', `village_${village}_north_gate`, 'village-street');
        connect(center, 'east', `village_${village}_east_gate`, 'village-street');
        connect(center, 'south', `village_${village}_south_gate`, 'village-street');
        connect(center, 'west', `village_${village}_west_gate`, 'village-street');
        connect(center, 'up', `village_${village}_houses`, 'village-interior');
    }
    const gateFor = { north: 'north_gate', east: 'east_gate', south: 'south_gate', west: 'west_gate' };
    const stepFor = { north: [0, 1], east: [1, 0], south: [0, -1], west: [-1, 0] };
    villagePositions.forEach(([x, y], index) => {
        const village = index + 1;
        for (const [direction, [dx, dy]] of Object.entries(stepFor)) {
            const neighbor = villageAt.get(`${x + dx},${y + dy}`);
            if (!neighbor || village > neighbor) continue;
            connect(`village_${village}_${gateFor[direction]}`, direction, `village_${neighbor}_${gateFor[OPPOSITE[direction]]}`, 'pasture-road');
        }
    });
    connect('great_forest_path_25', 'southwest', 'village_1_west_gate', 'forest-village-road');
    connect('village_10_north_gate', 'northwest', 'aurora_city_district_1', 'village-city-road');

    // ---------------------------------------------------------------------
    // Long generated corridors become bounded regional grids and switchbacks.
    // Existing locations, encounters, items and save IDs are preserved.
    // ---------------------------------------------------------------------
    const reshaped = [
        ['sun_plain_', 12, 4], ['silver_river_', 10, 5], ['harvest_farm_', 10, 5],
        ['quiet_graveyard_', 8, 4], ['high_mountain_road_', 12, 4], ['frost_tundra_', 12, 4],
        ['black_sword_legacy_', 12, 4], ['city_cemetery_', 20, 5], ['black_cemetery_', 20, 5],
        ['cityward_forest_trail_', 20, 5]
    ];
    reshaped.forEach(([prefix, count, columns]) => gridFamily(numbered(prefix, count), columns, { clearAll: true }));

    connect('great_forest_south_gate', 'south', 'sun_plain_1', 'forest-pasture-boundary');
    connect('sun_plain_12', 'east', 'silver_river_1', 'plains-river-road');
    connect('silver_river_10', 'southeast', 'harvest_farm_1', 'river-farm-road');
    connect('harvest_farm_10', 'east', 'quiet_graveyard_1', 'farm-cemetery-road');
    connect('mountains', 'northeast', 'high_mountain_road_1', 'mountain-road');
    connect('high_mountain_road_12', 'east', 'frost_tundra_1', 'mountain-tundra-road');
    connect('frost_tundra_12', 'southeast', 'shrine', 'tundra-shrine-road');
    connect('shadow_chamber', 'down', 'black_sword_legacy_1', 'catacomb-stairs');
    connect('quiet_graveyard_8', 'east', 'city_cemetery', 'cemetery-gate');
    connect('city_cemetery', 'east', 'city_cemetery_1', 'cemetery-path');
    connect('city_cemetery', 'south', 'black_cemetery_1', 'cemetery-path');
    connect('city_cemetery', 'up', 'astral_citadel_gate', 'astral-portal');
    connect('expansive_forest_60', 'east', 'cityward_forest_trail_1', 'forest-road');
    connect('cityward_forest_trail_20', 'northeast', 'kaliwasch_district_21', 'forest-city-road');

    // Caves are an 8-row grid. Replace the one seven-step north/south seam with
    // a carved switchback while retaining all chamber IDs.
    connect('mountains', 'northwest', 'endless_cave_1', 'cave-entrance');
    connect('great_forest_west_gate', 'southwest', 'deep_forest_branch_1', 'deep-forest-trail');

    // Remove superseded duplicate links left by older expansion patches. Each
    // destination is advertised under exactly one meaningful direction.
    disconnect('mountains', 'up');
    disconnect('dark_hall', 'east');
    disconnect('city_cemetery', 'north');

    // The 10 × 10 expansive forest is split into four five-by-five woods. The
    // seams are crossed at named switchbacks, preventing ten-step straight runs.
    for (let row = 0; row < 10; row++) {
        const left = `expansive_forest_${row * 10 + 5}`;
        disconnect(left, 'east');
    }
    for (let column = 0; column < 10; column++) {
        const top = `expansive_forest_${4 * 10 + column + 1}`;
        disconnect(top, 'south');
    }
    connect('expansive_forest_25', 'southeast', 'expansive_forest_36', 'forest-switchback');
    connect('expansive_forest_45', 'northeast', 'expansive_forest_56', 'forest-switchback');
    connect('expansive_forest_55', 'southeast', 'expansive_forest_66', 'forest-switchback');
    connect('expansive_forest_75', 'northeast', 'expansive_forest_86', 'forest-switchback');
    connect('expansive_forest_42', 'southeast', 'expansive_forest_53', 'forest-switchback');
    connect('expansive_forest_48', 'southwest', 'expansive_forest_57', 'forest-switchback');

    // ---------------------------------------------------------------------
    // Break any remaining physical cardinal chain after six edges by relabeling
    // a reciprocal edge as a meaningful switchback. No fake destination is made.
    // ---------------------------------------------------------------------
    const switchbackCandidates = {
        north: ['northeast', 'northwest'], south: ['southeast', 'southwest'],
        east: ['northeast', 'southeast'], west: ['northwest', 'southwest']
    };
    const breakLongChains = direction => {
        let changed = true, passes = 0;
        while (changed && passes++ < 2000) {
            changed = false;
            for (const start of Object.keys(locations).sort()) {
                const path = [start], seen = new Set(path);
                let current = start;
                while (path.length <= 8) {
                    const next = locations[current]?.exits?.[direction];
                    if (!next || !locations[next] || seen.has(next)) break;
                    path.push(next); seen.add(next); current = next;
                }
                if (path.length <= 7) continue;
                const from = path[5], to = path[6], reverse = OPPOSITE[direction];
                if (locations[to]?.exits?.[reverse] !== from) continue;
                const alternative = switchbackCandidates[direction].find(candidate => !locations[from].exits[candidate] && !locations[to].exits[OPPOSITE[candidate]]);
                if (!alternative) continue;
                disconnect(from, direction);
                connect(from, alternative, to, 'geographic-switchback');
                repairs.push({ type: 'direction-chain', from, oldDirection: direction, newDirection: alternative, to });
                changed = true;
                break;
            }
        }
    };
    ['north', 'south', 'east', 'west'].forEach(breakLongChains);

    // ---------------------------------------------------------------------
    // Classify before repairing reciprocity. Portals, locked exteriors and
    // explicit one-way drops are retained; ordinary physical links are repaired
    // only when the opposite slot is empty. Conflicting accidental edges lose
    // the unpaired edge instead of overwriting a valid established road.
    // ---------------------------------------------------------------------
    const edgeKind = (from, direction, to) => {
        const source = locations[from], target = locations[to];
        const text = `${from} ${source?.name || ''} ${(source?.features || []).join(' ')} ${to} ${target?.name || ''}`.toLowerCase();
        if (source?.oneWayExits?.includes?.(direction) || /one[- ]way|cliff drop|teleport/.test(text)) return 'intentional-one-way';
        if (target?.houseExterior || source?.houseExterior || (direction === 'down' && /foyer/.test(text))) return 'conditional-door';
        if (/portal/.test(text)) return 'portal';
        return 'physical';
    };

    for (const [from, source] of Object.entries(locations)) {
        source.exits ||= {};
        for (const [direction, to] of Object.entries({ ...source.exits })) {
            if (!DIRECTIONS.includes(direction)) {
                delete source.exits[direction];
                repairs.push({ type: 'invalid-direction', from, direction, to });
                continue;
            }
            if (!locations[to]) {
                delete source.exits[direction];
                repairs.push({ type: 'missing-destination', from, direction, to });
                continue;
            }
            const reverse = OPPOSITE[direction], kind = edgeKind(from, direction, to);
            const reverseDestination = locations[to].exits?.[reverse];
            if (reverseDestination === from) continue;
            source.exitMetadata ||= {};
            if (kind !== 'physical') {
                source.exitMetadata[direction] = { kind, reciprocal: false };
                continue;
            }
            if (!reverseDestination) {
                locations[to].exits[reverse] = from;
                locations[to].exitMetadata ||= {};
                locations[to].exitMetadata[reverse] = { kind: 'physical-repair', reciprocal: true };
                source.exitMetadata[direction] = { kind: 'physical-repair', reciprocal: true };
                repairs.push({ type: 'reverse-link', from, direction, to, reverse });
            } else {
                delete source.exits[direction];
                delete source.exitMetadata[direction];
                repairs.push({ type: 'conflicting-exit-removed', from, direction, to, occupiedBy: reverseDestination });
            }
        }
    }

    // ---------------------------------------------------------------------
    // Required finite-world schema and contextual music metadata.
    // ---------------------------------------------------------------------
    const inferType = (id, location) => {
        if (location.locationType) return location.locationType;
        const text = `${id} ${location.name || ''} ${location.region || ''} ${(location.features || []).join(' ')}`.toLowerCase();
        const types = ['market', 'village', 'forest', 'pasture', 'island', 'mountain', 'cave', 'dungeon', 'temple', 'palace', 'cemetery', 'tavern', 'city'];
        return types.find(type => text.includes(type)) || (location.safe ? 'settlement' : 'wilderness');
    };
    const musicFor = (id, location) => {
        const text = `${id} ${location.name || ''} ${location.region || ''} ${(location.features || []).join(' ')} ${location.music || ''}`.toLowerCase();
        if (/market|bazaar/.test(text)) return 'CITY_MARKET';
        if (/cemetery|grave|tomb|crypt/.test(text)) return 'CEMETERY';
        if (/palace|citadel|throne/.test(text)) return 'PALACE';
        if (/temple|shrine|sanctum|altar/.test(text)) return 'TEMPLE';
        if (/dungeon|depth|prison/.test(text)) return 'DUNGEON';
        if (/cave|cavern|tunnel|grotto/.test(text)) return 'CAVE';
        if (/island|shore|dock/.test(text)) return 'ISLAND';
        if (/mountain|peak|tundra|frostmarch/.test(text)) return 'MOUNTAIN';
        if (/forest|wood|grove|thicket/.test(text)) return 'FOREST';
        if (/pasture|plain|farm|meadow|steppe/.test(text)) return 'PASTURE';
        if (/village|tavern|inn|house/.test(text)) return 'VILLAGE';
        if (/city|street|district|gate|square/.test(text)) return 'CITY';
        if (/myster|ruin|swamp|void|shadow/.test(text)) return 'MYSTERIOUS';
        return location.safe ? 'TRAVEL' : 'EXPLORATION';
    };

    const regions = [...new Set(Object.values(locations).map(location => location.region || 'Uncharted'))].sort();
    const regionIndex = new Map(regions.map((region, index) => [region, index]));
    const assigned = new Set();
    for (const [id, location] of Object.entries(locations)) {
        location.id = id;
        location.name ||= id.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
        location.region ||= 'Uncharted';
        location.description ||= `A defined location in ${location.region}.`;
        location.locationType = inferType(id, location);
        location.musicContext = musicFor(id, location);
        location.musicContexts = [location.musicContext];
        if (location.musicContext === 'FOREST' && /shrine|mystic|ancient|fairy/.test(`${id} ${location.name}`.toLowerCase())) location.musicContexts.push('MYSTERIOUS');
        if (location.boss) location.musicContexts.push(location.finalBoss ? 'BATTLE_FINAL_BOSS' : 'BATTLE_BOSS');
        location.music = location.musicContext;
        location.accessibleDescription = `${location.name}. ${location.description}`;
        location.coordinates = null;
        location.exitMetadata ||= {};
        for (const [direction, destination] of Object.entries(location.exits)) {
            const reverse = OPPOSITE[direction];
            const reciprocal = locations[destination]?.exits?.[reverse] === id;
            location.exitMetadata[direction] ||= { kind: edgeKind(id, direction, destination), reciprocal };
            location.exitMetadata[direction].reciprocal = reciprocal;
        }
    }

    // Logical coordinates are deterministic and region-local. They describe the
    // actual graph rather than driving a second, stale navigation map.
    const byRegion = new Map();
    for (const [id, location] of Object.entries(locations)) {
        if (!byRegion.has(location.region)) byRegion.set(location.region, []);
        byRegion.get(location.region).push(id);
    }
    for (const [region, ids] of byRegion) {
        const baseX = (regionIndex.get(region) % 12) * 100;
        const baseY = Math.floor(regionIndex.get(region) / 12) * 100;
        let component = 0;
        for (const start of ids.sort()) {
            if (assigned.has(start)) continue;
            const queue = [start];
            locations[start].coordinates = { x: baseX + component * 12, y: baseY, z: 0 };
            assigned.add(start);
            while (queue.length) {
                const current = queue.shift(), origin = locations[current].coordinates;
                for (const [direction, destination] of Object.entries(locations[current].exits)) {
                    if (!locations[destination] || locations[destination].region !== region || assigned.has(destination)) continue;
                    const [dx, dy, dz] = VECTOR[direction];
                    locations[destination].coordinates = { x: origin.x + dx, y: origin.y + dy, z: origin.z + dz };
                    assigned.add(destination);
                    queue.push(destination);
                }
            }
            component++;
        }
        const points = ids.map(id => locations[id].coordinates).filter(Boolean);
        const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
        const minY = Math.min(...points.map(point => point.y)), maxY = Math.max(...points.map(point => point.y));
        ids.forEach(id => {
            const point = locations[id].coordinates, boundary = [];
            if (point.x === minX) boundary.push('west');
            if (point.x === maxX) boundary.push('east');
            if (point.y === minY) boundary.push('south');
            if (point.y === maxY) boundary.push('north');
            locations[id].regionBoundary = boundary;
        });
    }

    const route = (start, target) => {
        if (!locations[start] || !locations[target]) return null;
        if (start === target) return [];
        const queue = [start], seen = new Set(queue), parent = new Map();
        while (queue.length) {
            const current = queue.shift();
            for (const direction of DIRECTIONS) {
                const next = locations[current].exits[direction];
                if (!next || seen.has(next) || !locations[next]) continue;
                seen.add(next); parent.set(next, [current, direction]);
                if (next === target) {
                    const result = []; let cursor = next;
                    while (cursor !== start) {
                        const [previous, step] = parent.get(cursor);
                        result.push(step); cursor = previous;
                    }
                    return result.reverse();
                }
                queue.push(next);
            }
        }
        return null;
    };

    const directionCounts = Object.fromEntries(DIRECTIONS.map(direction => [direction, 0]));
    Object.values(locations).forEach(location => Object.keys(location.exits).forEach(direction => directionCounts[direction]++));
    const report = {
        locations: Object.keys(locations).length,
        edges: Object.values(locations).reduce((total, location) => total + Object.keys(location.exits).length, 0),
        regions: regions.length,
        directionCounts,
        repairs,
        finite: true
    };

    window.WorldGraph = { locations, directions: DIRECTIONS, opposite: OPPOSITE, route, report };
    if (window.ExpansionData?.counts) window.ExpansionData.counts.locations = report.locations;
    console.log(`WorldGraph v7.21 normalized ${report.locations} finite locations across ${report.regions} regions.`);
})();
