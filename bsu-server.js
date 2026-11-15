/* Black Sword Ultimate — game clock, rewards and the automatic cloud save.
 *
 * The game can talk to an optional game server (config.gameServerUrl) that
 * owns the clock, blessings, quests and board-game matches. No such server is
 * configured in this version: the project runs on the free Firebase plan,
 * which cannot run server code. So `call()` answers "offline" and every caller
 * uses its own rule on the device (prayer once a day, permanent blessing,
 * palace quests, board games against the computer).
 *
 * The cloud copy of the save does not need a server: it is written straight
 * to Cloud Firestore through OnlineSystem, at most once every 90 seconds.
 *
 * Nothing here throws when the network is missing.
 */
(function () {
    'use strict';
    const config = window.BLACK_SWORD_BACKEND_CONFIG || {};
    const listeners = new Set();
    const state = { offset: 0, synced: false, failures: 0, lastOk: 0, lastView: null, timer: null, inflight: null, lastCloudAt: 0, cloudTimer: null, lastInvites: 0 };

    const Server = {
        url: config.gameServerUrl || '',
        /** Tests and the local dev server can replace the network with a function. */
        transport: null,
        state,
        /** Milliseconds, corrected to the server clock once we have heard from it. */
        now() { return Date.now() + state.offset; },
        get synced() { return state.synced; },
        /** True while the server is answering; false when playing from the device. */
        get online() { return state.synced && state.failures < 2; },
        user() {
            try { return window.firebase?.auth?.().currentUser || null; } catch { return null; }
        },
        canCall() { return !!(this.transport || (this.url && this.user() && navigator.onLine !== false)); },
        heroId() { return window.Game?.state?.activeHeroId || null; },
        heroArgs(extra = {}) {
            const G = window.Game;
            return { hero_id: this.heroId(), name: String(G?.state?.player?.name || 'Hero').slice(0, 40), ...extra };
        },
        on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

        async call(action, args = {}, { timeout = 9000 } = {}) {
            if (!this.canCall()) return { ok: false, error: 'offline' };
            try {
                let result;
                if (this.transport) result = await this.transport(action, args);
                else {
                    const token = await this.user().getIdToken();
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), timeout);
                    try {
                        const response = await fetch(this.url, {
                            method: 'POST', signal: controller.signal,
                            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                            body: JSON.stringify({ action, args })
                        });
                        result = await response.json();
                    } finally { clearTimeout(timer); }
                }
                if (!result || typeof result !== 'object') throw new Error('bad response');
                if (Number.isFinite(result.server_now)) { state.offset = result.server_now - Date.now(); state.synced = true; }
                // A refusal is still an answer: the server is reachable.
                if (result.ok || !['server_error', 'unauthenticated', 'slow_down'].includes(result.error)) { state.failures = 0; state.lastOk = Date.now(); }
                else state.failures++;
                return result;
            } catch (error) {
                state.failures++;
                return { ok: false, error: 'network' };
            }
        },

        /** Health check used by Settings: is the server up and can it reach its rules? */
        async health() {
            if (this.transport) return { ok: true, database: true };
            if (!this.url) return { ok: false };
            try { return await (await fetch(this.url, { method: 'GET' })).json(); } catch { return { ok: false }; }
        },

        /** One heartbeat: presence, hunger, recovery minutes, blessings, quests, rewards. */
        async tick(extra = {}) {
            const G = window.Game;
            if (!G?.state?.player || !this.heroId()) return null;
            if (state.inflight) return state.inflight;
            const heroId = this.heroId();
            const run = (async () => {
                const args = this.heroArgs({ regen: 'claim', ...extra });
                window.dispatchEvent(new CustomEvent('bsu-before-tick', { detail: args }));
                const view = await this.call('tick', args);
                if (this.heroId() !== heroId) return null;          // the player switched heroes meanwhile
                state.lastView = view.ok ? view : state.lastView;
                for (const fn of listeners) { try { fn(view, args); } catch (error) { console.warn('bsu listener', error); } }
                if (view.ok) {
                    if (view.rewards_pending > 0) this.claimRewards();
                    if (view.invites > state.lastInvites) window.dispatchEvent(new CustomEvent('bsu-invites', { detail: view.invites }));
                    state.lastInvites = view.invites || 0;
                }
                return view;
            })();
            state.inflight = run;
            try { return await run; } finally { state.inflight = null; }
        },

        /** Rewards the server has decided (matches, quests). Each one is paid once. */
        async claimRewards() {
            const G = window.Game;
            if (!G?.state?.player || !this.heroId()) return [];
            const result = await this.call('rewards_claim', { hero_id: this.heroId() });
            if (!result.ok || !result.rewards?.length) return [];
            let gold = 0, xp = 0;
            for (const reward of result.rewards) { gold += Number(reward.gold) || 0; xp += Number(reward.xp) || 0; }
            this.pay(gold, xp);
            window.dispatchEvent(new CustomEvent('bsu-rewards', { detail: { rewards: result.rewards, gold, xp } }));
            return result.rewards;
        },

        /** Add gold and experience through the game's own rules (level-ups included). */
        pay(gold, xp) {
            const G = window.Game, p = G?.state?.player;
            if (!p) return;
            if (gold > 0) p.gold = (Number(p.gold) || 0) + gold;
            if (xp > 0) {
                p.xp = (Number(p.xp) || 0) + xp;
                let guard = 0;
                while (p.xp >= p.xpToNext && guard++ < 20) G.levelUp();
            }
            G.updateHUD?.();
            G.save?.();
        },

        start() {
            if (state.timer) return;
            const beat = () => {
                const G = window.Game;
                if (document.visibilityState === 'hidden') return;
                if (G?.state?.player && G.state.screen === 'game-screen') this.tick();
            };
            state.timer = setInterval(beat, 60000);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') beat();
                else this.flushCloud();
            });
            window.addEventListener('online', beat);
        },

        // ---- cloud copy of the save -------------------------------------
        async putSave(roster) {
            const result = await this.call('save_put', { save: roster }, { timeout: 15000 });
            if (result.ok) state.lastCloudAt = Date.now();
            return result.ok === true;
        },
        async getSave() {
            const result = await this.call('save_get', {}, { timeout: 15000 });
            if (!result.ok) throw new Error(result.error || 'cloud save unavailable');
            return result.save ? { save_data: result.save, updated_at: result.updated_at } : null;
        },
        /** True when a cloud copy can be written: through the game server, or straight to the database. */
        cloudReady() {
            const O = window.OnlineSystem;
            return this.canCall() || Boolean(O?.ready && O?.user && O?.client);
        },
        /** Called after local saves: at most one cloud write every 90 seconds. */
        scheduleCloud() {
            if (!this.cloudReady() || state.cloudTimer) return;
            const wait = Math.max(3000, 90000 - (Date.now() - state.lastCloudAt));
            state.cloudTimer = setTimeout(() => { state.cloudTimer = null; this.flushCloud(); }, wait);
        },
        flushCloud() {
            const G = window.Game;
            if (state.cloudTimer) { clearTimeout(state.cloudTimer); state.cloudTimer = null; }
            if (!G?.state?.player || !this.cloudReady() || Date.now() - state.lastCloudAt < 5000) return Promise.resolve(false);
            try {
                const snapshot = JSON.parse(JSON.stringify(G.getCloudData()));
                if (this.canCall()) return this.putSave(snapshot);
                state.lastCloudAt = Date.now();
                return Promise.resolve(window.OnlineSystem.saveGame(snapshot)).then(saved => saved === true, () => false);
            } catch { return Promise.resolve(false); }
        }
    };
    window.BSUServer = Server;

    function wire() {
        const G = window.Game, O = window.OnlineSystem;
        if (!G || G._bsuServerWired) return;
        G._bsuServerWired = true;

        // The old cloud-save path wrote to a table the current sign-in cannot
        // reach, so nothing was ever stored. Route it to the game server.
        if (O) {
            const oldSave = O.saveGame.bind(O), oldLoad = O.loadCloudSave.bind(O);
            O.saveGame = function (saveData) {
                if (!Server.canCall() || !saveData) return oldSave(saveData);
                let snapshot;
                try { snapshot = JSON.parse(JSON.stringify(saveData)); } catch { return Promise.resolve(false); }
                return Server.putSave(snapshot);
            };
            O.loadCloudSave = async function () {
                if (!Server.canCall()) return oldLoad();
                return Server.getSave();
            };
        }

        const oldSaveLocal = G.save.bind(G);
        G.save = function () {
            const result = oldSaveLocal();
            if (this.state.player) Server.scheduleCloud();
            return result;
        };

        const oldContinue = G.continueGame.bind(G);
        G.continueGame = function () {
            const result = oldContinue();
            Server.state.lastInvites = 0;
            if (this.state.player) { Server.start(); Server.tick({ first: true }); }
            return result;
        };
        const oldCreate = G.createCharacter?.bind(G);
        if (oldCreate) G.createCharacter = function (...args) {
            const result = oldCreate(...args);
            if (this.state.player) { Server.start(); setTimeout(() => Server.tick({ first: true }), 0); }
            return result;
        };

        window.addEventListener('bsu-rewards', event => {
            const { gold, xp } = event.detail;
            if (!gold && !xp) return;
            const text = window.Narration?.t('reward.received', { gold, xp }) || `You received ${gold} rupees and ${xp} experience.`;
            if (G.emitGameEvent) G.emitGameEvent(text, 'treasure', { sfx: ['coin'] }); else G.addNarrative(text, 'treasure');
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
    window.addEventListener('load', wire);
})();
