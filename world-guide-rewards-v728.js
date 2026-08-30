/**
 * v7.25.8 — Real city routes, NPC play-guides (no spoilers), fair rewards,
 * dungeon wings. Does not replace music, combat, or the spell engine.
 */
(() => {
    const OPPOSITE = {
        north: 'south', south: 'north', east: 'west', west: 'east',
        northeast: 'southwest', southwest: 'northeast',
        northwest: 'southeast', southeast: 'northwest', up: 'down', down: 'up'
    };
    const CARDINALS = ['north', 'east', 'south', 'west', 'up', 'down'];
    const DIAGONALS = ['northeast', 'northwest', 'southeast', 'southwest'];

    function bfs(start, target, dirs) {
        if (start === target) return [];
        const queue = [start], seen = new Set([start]), parent = new Map();
        while (queue.length) {
            const id = queue.shift();
            const loc = WorldData.locations[id];
            for (const d of dirs) {
                const next = loc?.exits?.[d];
                if (!next || seen.has(next) || !WorldData.locations[next]) continue;
                seen.add(next);
                parent.set(next, [id, d]);
                if (next === target) {
                    const route = [];
                    let cur = next;
                    while (cur !== start) {
                        const [prev, dir] = parent.get(cur);
                        route.push(dir);
                        cur = prev;
                    }
                    return route.reverse();
                }
                queue.push(next);
            }
        }
        return null;
    }

    function groupSteps(route) {
        const groups = [];
        for (const d of route || []) {
            if (groups.length && groups[groups.length - 1].dir === d) groups[groups.length - 1].n++;
            else groups.push({ dir: d, n: 1 });
        }
        return groups.map(g => {
            const name = g.dir[0].toUpperCase() + g.dir.slice(1);
            if (g.n === 1) return name + ' once';
            if (g.n === 2) return name + ' twice';
            return `${name} ${g.n} times`;
        }).join(', then ');
    }

    function localGuide(question, game) {
        const t = String(question || '').toLowerCase();
        const locName = WorldData.locations[game?.state?.location]?.name || 'this place';

        const spoil = /reward|how much gold|what (do|will) i get|secret|hidden item|where is the black sword|exact loot/;
        if (spoil.test(t) && /quest|mission|achievement|dungeon|boss/.test(t)) {
            return 'I will not name the prize. Finish the work, then the realm pays you. Open your quest list and look in the area it names.';
        }

        if (/how to play|how do i play|controls|commands|tutorial/.test(t)) {
            return 'Type commands. Move with north, south, east, west, up, down. Look around, open inventory, type quests, and open City Directory for real step counts from where you stand. Talk or ask people here. Type tutorial for the lesson list.';
        }
        if (/car rac|auto rac|how (do i|to) rac/.test(t) && !/horse/.test(t)) {
            return 'Car racing lives in the Race District. From a city, type car racing or travel to car racing. Pick a car, then race. I will not name the purse — win the race to see it.';
        }
        if (/horse rac/.test(t)) {
            return 'Horse racing is its own hall. Type horse racing from town. Place a fair bet, then listen for the call. Look around the track, not in a dungeon.';
        }
        if (/game hall|ludo|chess|carrom|blackjack|board game/.test(t)) {
            return 'Each city park has an Accessible Game Hall upstairs. City Directory, then Game Hall. Play there; do not hunt loot in the hall.';
        }
        if (/kaliwasch|caliber|calibers|capital|main city/.test(t)) {
            return 'Kaliwasch is the capital. You start there. Other cities are Aurora, Ironspire, and Seabreeze. From Kaliwasch, go Up into the expanded streets, then use City Directory.';
        }
        if (/aurora|ironspire|seabreeze|other cit/.test(t)) {
            return 'Four cities: Kaliwasch, Aurora City, Ironspire City, and Seabreeze City. Seabreeze has the ferry to Stormcrown Island. Use City Directory inside each city for true steps from your current street.';
        }
        if (/where.*(temple|palace|guild|market|shop|park|tavern)/.test(t) || /how.*(get to|go to).*(temple|palace|guild|market)/.test(t)) {
            return `You are at ${locName}. Open City Directory and tap the place. It counts real steps from here, grouped so East three times is not listed as three separate Easts mixed with a diagonal.`;
        }
        if (/dungeon|depths|cave/.test(t)) {
            return 'Dungeons open south of the swamp, then east into the Royal Dungeon grid, and south into the Depths with north, east, south and west wings. Look, then move one cardinal at a time. I will not name what waits on the pedestal.';
        }
        if (/quest|mission|task|what should i do/.test(t)) {
            const q = (game.state.quests || [])[0];
            const hint = q ? `Your current task is ${q.name}. Search the area that name points to.` : 'Type quests. If none are listed, talk to the Guild Registrar.';
            return hint + ' One clue only: go there and look. I will not list the prize.';
        }
        if (/spell|heal|strike|summon/.test(t)) {
            return 'Every class starts with healing and Multi Strike. Guild Card Test, Palace hunt, and the Island hunt teach more. Cast during battle. Type spellbook.';
        }
        if (/daily|achievement|badge/.test(t)) {
            return 'Type daily to open today\'s chest, once per day. Type achievements to hear badges. Harder badges pay more. I will not quote the numbers here — open them yourself.';
        }
        return null;
    }

    function addDungeonWings() {
        const hub = WorldData.locations.depths;
        if (!hub || WorldData.locations.depths_north_wing) return;
        const wings = [
            ['depths_north_wing', 'north', 'North Wing — Frozen Reliquary', 'Ice-cut alcoves and a silent well. The air bites.'],
            ['depths_east_wing', 'east', 'East Wing — Ember Gallery', 'Warm stone, old torch-rings, and a cracked mural of a black blade.'],
            ['depths_south_wing', 'south', 'South Wing — Echo Vault', 'Your steps return twice. Bone dust on the floor.'],
            ['depths_west_wing', 'west', 'West Wing — Drip Cavern', 'Water ticks from the ceiling into a black pool.']
        ];
        hub.exits = hub.exits || {};
        wings.forEach(([id, dir, name, desc]) => {
            if (hub.exits[dir]) return;
            WorldData.locations[id] = {
                name, region: 'The Depths', description: desc,
                exits: { [OPPOSITE[dir]]: 'depths' },
                features: ['dungeon wing', dir + ' hall'],
                items: [], enemies: ['shadow archer', 'dark mage'],
                safe: false, music: 'dungeon'
            };
            hub.exits[dir] = id;
        });
    }

    const apply = () => {
        if (!window.Game || !window.WorldData || Game._v728Guide) return false;
        /* Dungeon cardinal grids already exist (royal_dungeon_*, depths). Do not
           inject extra rooms after world-navigation has sealed the schema. */

        Game.formatPhysicalRoute = function (route) {
            return groupSteps(route);
        };

        Game.findPhysicalRoute = function (start, target) {
            if (!start || !target) return null;
            if (start === target) return [];
            let route = bfs(start, target, CARDINALS);
            if (!route) route = bfs(start, target, CARDINALS.concat(DIAGONALS));
            return route;
        };

        const oldRoute = Game.routeToCityLandmark?.bind(Game);
        Game.routeToCityLandmark = function (key) {
            const city = this.currentCityDefinition?.();
            if (!city) {
                this.addNarrative('You are outside a city. Return through a city gate, then open the City Directory.', 'system');
                return;
            }
            const target = city.targets[key];
            if (!target) {
                this.addNarrative(`${city.label} has no listed ${key.replace('_', ' ')}.`, 'system');
                return;
            }
            const here = this.state.location;
            const route = this.findPhysicalRoute(here, target);
            if (route === null) {
                this.addNarrative('No current physical route was found. A closed house door may block the way.', 'system');
                return;
            }
            if (!route.length) {
                this.addNarrative(`You are already at ${WorldData.locations[target].name}.`, 'location');
                return;
            }
            const spoken = this.formatPhysicalRoute(route);
            this.addNarrative(`From ${WorldData.locations[here]?.name}: go ${spoken}. That is ${route.length} real step${route.length === 1 ? '' : 's'} to ${WorldData.locations[target].name}. No diagonal shortcut was used unless no cardinal path exists.`, 'location');
        };

        Game.worldGuideAnswer = function (question) {
            return localGuide(question, this);
        };

        const oldTalk = Game.talkToNPC.bind(Game);
        Game.talkToNPC = function (name) {
            oldTalk.call(this, name);
            const hint = localGuide('how to play', this);
            if (hint && Math.random() < 0.35) this.addNarrative('Tip: ask how to play, where the cities are, or how to race. I give one clue, never the prize.', 'system');
        };

        if (window.AiNpc && typeof window.AiNpc.ask === 'function') {
            const oldAsk = window.AiNpc.ask.bind(window.AiNpc);
            window.AiNpc.ask = async function (raw) {
                const guide = Game.worldGuideAnswer(raw);
                if (guide && /\bhow to play\b|\bcar rac|\bhorse rac|\bkaliwasch\b|\bcaliber|\bcity directory\b|\bwhere is\b|\bquests?\b|\bdungeon\b|\bdaily\b|\bachievement|\bgame hall\b|\baurora\b|\bironspire\b|\bseabreeze\b/.test(String(raw || '').toLowerCase())) {
                    const npc = this.resolveNpc(raw) || { name: 'A local' };
                    Game.addNarrative(`You ask ${npc.name}: "${raw}"`, 'npc');
                    Game.emitGameEvent?.(`${npc.name} says: ${guide}`, 'npc', { eventId: `guide:${Date.now()}` }) || Game.addNarrative(`${npc.name} says: ${guide}`, 'npc');
                    return true;
                }
                return oldAsk(raw);
            };
        }

        window.WorldGuideV728 = { groupSteps, bfs, CARDINALS };
        return true;
    };

    if (!apply()) {
        document.addEventListener('DOMContentLoaded', apply);
        let n = 0;
        const t = setInterval(() => { if (apply() || ++n > 50) clearInterval(t); }, 80);
    }
})();
