/**
 * v7.25.9 — Yearly seasonal windows. Reversible: when a window ends, fog,
 * lantern, and climax flags drop unless that year was completed. NPCs never
 * name rewards. Halloween climax is cemetery-only and examine is refused.
 */
(() => {
    'use strict';

    const TZ = 'Asia/Kolkata';

    function parts(date) {
        const fmt = new Intl.DateTimeFormat('en-GB', {
            timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const map = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
        return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
    }

    function westernEaster(y) {
        const a = y % 19, b = Math.floor(y / 100), c = y % 100;
        const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4), k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return { m: month, d: day };
    }

    function addDays(y, m, d, n) {
        const dt = new Date(Date.UTC(y, m - 1, d + n));
        return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
    }

    function ymd(p) { return p.y * 10000 + p.m * 100 + p.d; }

    function inRange(p, start, end) {
        const x = ymd(p);
        return x >= ymd(start) && x <= ymd(end);
    }

    function activeEvents(date = new Date()) {
        const p = parts(date);
        const out = [];
        if (p.m === 10) {
            out.push({
                id: 'halloween',
                title: 'Night of Unspoken Names',
                climax: p.d === 31,
                hint: p.d === 31
                    ? 'October 31. The cemetery procession cannot be looked at. Listen, then hunt.'
                    : 'October. Cemetery lanterns burn. Fragments drop only in cemetery fights.'
            });
        }
        const xmasStart = { y: p.y, m: 11, d: 25 };
        const xmasEnd = { y: p.y, m: 12, d: 31 };
        if (inRange(p, xmasStart, xmasEnd)) {
            out.push({
                id: 'christmas',
                title: 'Starlight Watch',
                climax: p.m === 12 && p.d === 25,
                hint: 'From 25 November through 31 December the city keeps a quiet starlight watch.'
            });
        }
        const nyA = p.m === 12 && p.d === 31;
        const nyB = p.m === 1 && p.d <= 26;
        if (nyA || nyB) {
            out.push({
                id: 'newyear',
                title: 'Dawn of First Light',
                climax: p.m === 1 && p.d === 1,
                hint: 'From 31 December through 26 January the first-light vigil is open.'
            });
        }
        const easter = westernEaster(p.y);
        const eStart = { y: p.y, m: 4, d: 1 };
        const eEnd = addDays(p.y, easter.m, easter.d, 3);
        if (inRange(p, eStart, eEnd)) {
            out.push({
                id: 'easter',
                title: 'Three Dawns After Spring',
                climax: p.m === easter.m && p.d === easter.d,
                hint: 'From 1 April through three days after Easter the spring vigil is open.'
            });
        }
        if (p.m === 8 && p.d >= 1 && p.d <= 15) {
            out.push({
                id: 'independence',
                title: 'Saffron Vigil',
                climax: p.d === 15,
                hint: '1–15 August. Independence Day climax is 15 August.'
            });
        }
        if (p.m === 1 && p.d >= 20 && p.d <= 26) {
            out.push({
                id: 'republic',
                title: 'Republic Watch',
                climax: p.d === 26,
                hint: '20–26 January. Republic Day climax is 26 January.'
            });
        }
        return out;
    }

    function seasonalState(game) {
        game.state.flags = game.state.flags || {};
        game.state.flags.seasonal = game.state.flags.seasonal || {};
        return game.state.flags.seasonal;
    }

    function syncWindows(game, date = new Date()) {
        const p = parts(date);
        const st = seasonalState(game);
        const live = new Set(activeEvents(date).map(e => e.id));
        const yearKey = String(p.y);
        ['halloween', 'christmas', 'newyear', 'easter', 'independence', 'republic'].forEach(id => {
            const slot = st[id] || {};
            if (!live.has(id) && slot.year !== yearKey) {
                delete slot.lanterns;
                delete slot.fog;
                delete slot.climaxOpen;
                delete slot.kills;
            }
            if (live.has(id)) {
                slot.year = yearKey;
                if (id === 'halloween') slot.fog = true;
            } else {
                slot.fog = false;
                slot.climaxOpen = false;
            }
            st[id] = slot;
        });
        return st;
    }

    function onEnter(game, locId) {
        const events = activeEvents();
        const hall = events.find(e => e.id === 'halloween');
        if (!hall) return;
        if (!/cemetery/i.test(String(locId || game.state.location || ''))) return;
        const st = seasonalState(game).halloween || {};
        
        // Halloween voice narration
        if (window.HalloweenNarration) {
            if (hall.climax && !st.narratedClimax) {
                window.HalloweenNarration.narrateClimaxIntro();
                st.narratedClimax = true;
            } else if (!hall.climax && !st.narratedIntro) {
                window.HalloweenNarration.narrateEnterCemetery();
                st.narratedIntro = true;
            }
        }
        
        game.addNarrative?.(hall.climax
            ? 'The cemetery is loud with unseen steps. Do not look. Listen for the last bell.'
            : 'October fog hangs in the cemetery. Lantern fragments only fall here.', 'system');
        if (hall.climax) st.climaxOpen = true;
    }

    function afterKill(game, enemy) {
        const hall = activeEvents().find(e => e.id === 'halloween');
        if (!hall) return;
        const loc = String(game.state.location || '');
        if (!/cemetery/i.test(loc)) return;
        const st = seasonalState(game);
        st.halloween = st.halloween || {};
        st.halloween.kills = (st.halloween.kills || 0) + 1;
        
        // Halloween voice narration for kills
        if (window.HalloweenNarration) {
            window.HalloweenNarration.narrateKill(hall.climax, st.halloween.kills);
        }
        
        if (!hall.climax && Math.random() < 0.35) {
            st.halloween.lanterns = (st.halloween.lanterns || 0) + 1;
            
            // Narrate fragment collection
            if (window.HalloweenNarration) {
                window.HalloweenNarration.narrateFragmentCollected();
            }
            
            game.addNarrative?.('A lantern fragment rings once, then goes dark. You keep it without naming it.', 'treasure');
        }
        if (hall.climax && st.halloween.kills >= 8 && !st.halloween.completedYear) {
            const p = game.state.player;
            if (p) {
                p.gold = (p.gold || 0) + 900;
                p.xp = (p.xp || 0) + 420;
            }
            st.halloween.completedYear = parts(new Date()).y;
            
            // Narrate victory
            if (window.HalloweenNarration) {
                window.HalloweenNarration.narrateVictory();
            }
            
            game.addNarrative?.('The last bell falls silent. The procession has passed. You kept the year.', 'treasure');
            game.save?.();
        }
    }

    function refuseExamine(game, raw) {
        const hall = activeEvents().find(e => e.id === 'halloween');
        if (!hall?.climax) return false;
        if (!/cemetery/i.test(String(game.state.location || ''))) return false;
        if (!/^(look|examine|inspect|see)\b/i.test(String(raw || '').trim())) return false;
        
        // Narrate refusal to look
        if (window.HalloweenNarration) {
            window.HalloweenNarration.narrateRefuseLook();
        }
        
        game.addNarrative?.('The lantern blinds the living eye. Listen. Do not look.', 'system');
        return true;
    }

    function banner() {
        const events = activeEvents();
        if (!events.length) return '';
        return events.map(e => e.hint).join(' ');
    }

    function bind() {
        const G = window.Game;
        if (!G || G._v729Seasonal) return false;
        G._v729Seasonal = true;

        const prevEnter = G.enterLocation.bind(G);
        G.enterLocation = function (locId) {
            prevEnter(locId);
            syncWindows(this);
            onEnter(this, locId);
        };

        const prevDefeat = G.enemyDefeated?.bind(G);
        if (prevDefeat) {
            G.enemyDefeated = async function () {
                const enemy = this.state.enemy;
                const result = await prevDefeat();
                afterKill(this, enemy);
                return result;
            };
        }

        const prevCmd = G.processCommand.bind(G);
        G.processCommand = function (raw) {
            syncWindows(this);
            if (refuseExamine(this, raw)) return;
            const c = String(raw || '').trim().toLowerCase();
            if (c === 'events' || c === 'calendar' || c === 'season') {
                const line = banner() || 'No yearly vigil is open today.';
                this.addNarrative?.(line, 'system');
                return;
            }
            return prevCmd(raw);
        };

        window.SeasonalEvents = { activeEvents, westernEaster, parts, syncWindows, banner, TZ };
        console.log('v7.25.9 seasonal calendar ready');
        return true;
    }

    if (!bind()) {
        document.addEventListener('DOMContentLoaded', bind);
        let n = 0;
        const t = setInterval(() => { if (bind() || ++n > 40) clearInterval(t); }, 80);
    }
})();
