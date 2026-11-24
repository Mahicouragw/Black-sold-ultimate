/**
 * 7.64.0 — every place gets its own description.
 *
 * The world has 1164 locations. 525 of them shared one of 100 descriptions:
 * four forest paths in a row said exactly the same thing, every private house
 * hallway read the same, and several cave chambers were indistinguishable by
 * ear. For a screen-reader game that is not a detail — if two rooms describe
 * themselves identically, the player cannot tell where they are.
 *
 * This module finds every shared description and replaces it, for each place,
 * with a description built from that place's own name, region, features and
 * exits. The place's name is always part of the sentence, and names are unique
 * in the world, so no two descriptions can ever be the same again. Locations
 * that already had a description of their own keep it untouched.
 *
 * Nothing is translated here: descriptions stay in the authored English the
 * rest of the world text uses, and the narration layer speaks them as before.
 */
(() => {
    'use strict';

    const MOODS = {
        forest: [
            'Birds answer the wind in the high branches.',
            'Leaves shift overhead and let patches of light through.',
            'The air smells of moss and wet bark.',
            'Something small moves in the undergrowth and goes still.',
            'Far off, a woodpecker keeps a slow, steady beat.',
            'The trail is soft underfoot and easy to follow.'
        ],
        cave: [
            'Water drips somewhere beyond the reach of the light.',
            'The air is cool and carries the smell of wet stone.',
            'Every step returns a small echo.',
            'Old tool marks scar the nearest wall.',
            'A narrow draught moves through the chamber.',
            'Loose gravel shifts underfoot with each step.'
        ],
        house: [
            'The floorboards answer with a soft creak.',
            'Daylight falls through the nearest window.',
            'The rooms are quiet and orderly.',
            'A warm, lived-in smell hangs in the air.',
            'The walls carry the faint smell of wood smoke.',
            'Everything here is kept neat and ready for guests.'
        ],
        water: [
            'Water laps steadily nearby.',
            'The air is damp and tastes of salt.',
            'Gulls call somewhere above the waterline.',
            'Ropes creak with the slow movement of the water.',
            'The light shifts as the surface moves.',
            'A cool breeze comes off the water.'
        ],
        stone: [
            'Cold stone holds the day’s chill.',
            'Dust turns slowly in the light.',
            'The walls carry old carvings worn smooth.',
            'Footsteps echo longer than they should.',
            'The stone underfoot is uneven but dry.',
            'A thin draught finds every gap in the masonry.'
        ],
        field: [
            'Grass moves in long, slow waves.',
            'The sky feels wide and open here.',
            'Insects hum close to the ground.',
            'A distant fence line marks the edge of the fields.',
            'The wind carries the smell of turned earth.',
            'The path here is worn bare by feet and hooves.'
        ],
        city: [
            'Voices and cartwheels carry from the next street.',
            'The stones are worn smooth by years of traffic.',
            'A shutter knocks softly in the breeze.',
            'Somewhere nearby a shopkeeper calls out a price.',
            'The smell of bread and smoke drifts past.',
            'The street is busy without being crowded.'
        ]
    };

    const LEAD = [
        'is a', 'stands as a', 'serves as a', 'marks a'
    ];

    const EXIT_WORD = {
        north: 'north', south: 'south', east: 'east', west: 'west',
        up: 'up the steps', down: 'down the steps',
        northeast: 'north-east', northwest: 'north-west',
        southeast: 'south-east', southwest: 'south-west'
    };

    const hash = text => {
        let value = 2166136261;
        for (let index = 0; index < text.length; index++) {
            value ^= text.charCodeAt(index);
            value = Math.imul(value, 16777619);
        }
        return value >>> 0;
    };

    const list = items => {
        const clean = items.filter(Boolean);
        if (!clean.length) return '';
        if (clean.length === 1) return clean[0];
        if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
        return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
    };

    const family = location => {
        const text = `${location.name} ${location.region} ${(location.features || []).join(' ')}`.toLowerCase();
        if (/house|foyer|hallway|bedroom|kitchen|parlour|study|attic|cellar/.test(text)) return 'house';
        if (/cave|cavern|mine|tunnel|grotto|underground|depths|catacomb/.test(text)) return 'cave';
        if (/sea|harbour|harbor|dock|pier|ship|beach|shore|island|lake|river/.test(text)) return 'water';
        if (/forest|wood|grove|glade|trail|thicket|jungle/.test(text)) return 'forest';
        if (/field|farm|pasture|meadow|plain|garden|orchard/.test(text)) return 'field';
        if (/city|town|market|street|square|inn|tavern|shop|guild|palace|temple/.test(text)) return 'city';
        return 'stone';
    };

    function describe(id, location) {
        const seed = hash(id);
        const name = String(location.name || id).trim();
        const region = String(location.region || 'this land').trim();
        const features = (location.features || []).map(String).filter(Boolean).slice(0, 3);
        const kind = features[0] || 'place';
        const lead = LEAD[seed % LEAD.length];
        const familyName = family(location);
        const moods = MOODS[familyName] || MOODS.stone;

        // If the shared text was a real sentence, keep its meaning as a preface.
        const previous = String(location.description || '').trim();
        const inherits = previous.length > 40 && /^[A-Z(“"]/.test(previous)
            ? `${previous.replace(/\s+/g, ' ')} `
            : '';

        const exits = Object.entries(location.exits || {})
            .filter(([, destination]) => destination && window.WorldData?.locations?.[destination])
            .slice(0, 3)
            .map(([direction, destination]) => `${EXIT_WORD[direction] || direction} toward ${window.WorldData.locations[destination].name}`);

        const parts = [];
        // The place speaks its own name first: that is what tells a player,
        // arriving by ear, exactly where they are standing.
        parts.push(`${name} ${lead} ${kind} in ${region}.`);
        if (inherits) parts.push(inherits.trim());
        if (features.length > 1) parts.push(`You can see ${list(features.slice(1))} here.`);
        if (exits.length) parts.push(`Ways lead ${list(exits)}.`);
        if (location.safe) parts.push('This is a safe place.');
        parts.push(moods[seed % moods.length]);

        return parts.join(' ').replace(/\s+/g, ' ').trim();
    }

    /** Rewrites every description that is shared with another place. */
    function apply(world = window.WorldData) {
        const locations = world?.locations;
        if (!locations) return { rewritten: 0, duplicates: 0 };

        const byText = new Map();
        for (const [id, location] of Object.entries(locations)) {
            const text = String(location.description || '').trim();
            if (!byText.has(text)) byText.set(text, []);
            byText.get(text).push(id);
        }

        let rewritten = 0, duplicates = 0;
        for (const ids of byText.values()) {
            if (ids.length < 2) continue;
            duplicates += ids.length;
            for (const id of ids) {
                locations[id].description = describe(id, locations[id]);
                rewritten += 1;
            }
        }

        // A final guard: if anything still collides, the unique name is the
        // strongest distinguishing sentence we have.
        const seen = new Map();
        for (const [id, location] of Object.entries(locations)) {
            let text = String(location.description || '').trim();
            if (seen.has(text)) {
                text = `${text} The map marks this place as ${id.replace(/_/g, ' ')}.`;
                location.description = text;
                rewritten += 1;
            }
            seen.set(text, id);
        }
        return { rewritten, duplicates };
    }

    let report = { rewritten: 0, duplicates: 0 };
    const boot = () => { report = apply(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();

    window.DistinctPlaces = { apply, describe, get report() { return { ...report }; } };
})();
