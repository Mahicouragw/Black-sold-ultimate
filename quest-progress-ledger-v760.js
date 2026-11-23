/**
 * Palace quest progress ledger (v7.60).
 *
 * Why this file exists: palace quests live in `Game.state.sacred.palace`, which
 * travels inside the hero save. If a cloud restore is older than the device (a
 * reload right after a completed quest, a deploy that reloads the page, an
 * offline completion that never reached the server), the hero came back with
 * `palace.completed` empty and the King handed out the *same first quest again*.
 *
 * The ledger is an append-only device record of:
 *   - every palace quest the hero has ever completed, and
 *   - the quest currently accepted, with the highest progress ever reached.
 *
 * It is written the moment progress changes (not only on save), kept in
 * localStorage, saved inside the hero data so another device can recover it, and
 * merged back as a union. Completed quests are never removed, so a stale cloud
 * snapshot cannot resurrect an old quest.
 */
(function () {
    'use strict';
    const KEY = 'black_sword_palace_ledger_v1';

    const readAll = () => {
        try {
            const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch { return {}; }
    };
    const writeAll = all => {
        try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full or private mode */ }
    };
    const heroKey = Game => String(Game.state.activeHeroId || 'hero_local');

    const emptyLedger = () => ({ completed: [], active: null, updatedAt: 0 });

    function ledger(Game) {
        const all = readAll();
        const key = heroKey(Game);
        const stored = all[key];
        const value = stored && typeof stored === 'object' ? stored : emptyLedger();
        if (!Array.isArray(value.completed)) value.completed = [];
        if (!value.active || typeof value.active !== 'object') value.active = null;
        all[key] = value;
        return { all, key, value };
    }

    /** Merge the live quest state into the durable ledger. Never loses an entry. */
    Game.recordPalaceLedger = function () {
        const palace = this.state?.sacred?.palace;
        if (!palace) return null;
        const { all, key, value } = ledger(this);
        const completed = new Set([...(value.completed || []), ...(palace.completed || [])]);
        value.completed = [...completed];
        if (palace.active && palace.active.quest_id) {
            const previous = value.active?.quest_id === palace.active.quest_id ? value.active : null;
            const progress = Math.max(Number(palace.active.progress) || 0, Number(previous?.progress) || 0);
            value.active = { ...palace.active, progress };
        } else if (!palace.active) {
            // A finished quest must not come back as "accepted".
            value.active = null;
        }
        value.updatedAt = Date.now();
        all[key] = value;
        writeAll(all);
        this.state.palaceLedger = value;
        return value;
    };

    /** Union the ledger back into the live quest state after any load. */
    Game.applyPalaceLedger = function (savedLedger) {
        if (!this.state.player) return null;
        // A cloud snapshot from before the palace existed, or a wiped sacred
        // block, must still receive the durable quest history.
        this.state.sacred = this.state.sacred && typeof this.state.sacred === 'object' ? this.state.sacred : {};
        const palace = this.state.sacred.palace && typeof this.state.sacred.palace === 'object'
            ? this.state.sacred.palace
            : (this.state.sacred.palace = { active: null, completed: [] });
        if (!Array.isArray(palace.completed)) palace.completed = [];
        const { all, key, value } = ledger(this);
        const durable = { ...emptyLedger(), ...value };
        const fromSave = savedLedger && typeof savedLedger === 'object' ? savedLedger : null;
        const completed = new Set([
            ...palace.completed,
            ...(durable.completed || []),
            ...(Array.isArray(fromSave?.completed) ? fromSave.completed : [])
        ]);
        palace.completed = [...completed];

        const candidates = [durable.active, fromSave?.active].filter(a => a && a.quest_id);
        if (!palace.active && candidates.length) {
            // The accepted quest still exists; restore it instead of re-offering
            // the first quest of the catalogue to a hero who already advanced.
            const best = candidates.sort((a, b) => (Number(b.progress) || 0) - (Number(a.progress) || 0))[0];
            palace.active = { ...best };
        } else if (palace.active && candidates.length) {
            const same = candidates.find(a => a.quest_id === palace.active.quest_id);
            if (same) palace.active.progress = Math.max(Number(palace.active.progress) || 0, Number(same.progress) || 0);
        }

        // A restored active quest whose target was already reached stays
        // reportable; it is never re-issued as a new acceptance.
        if (palace.active) palace.active.progress = Number(palace.active.progress) || 0;
        value.completed = [...completed];
        if (palace.active) value.active = { ...palace.active };
        value.updatedAt = Date.now();
        all[key] = value;
        writeAll(all);
        this.state.palaceLedger = value;
        return value;
    };

    // Progress is written the instant it happens, not only when the hero saves.
    const oldCheckQuests = Game.checkQuests?.bind(Game);
    if (oldCheckQuests) {
        Game.checkQuests = function (type, target) {
            const result = oldCheckQuests(type, target);
            try { this.recordPalaceLedger(); } catch (error) { console.warn('Palace ledger:', error?.message); }
            return result;
        };
    }

    // survival-v755.js installs palaceQuest during its own startup, which can be
    // later than this file. Wrap it whenever it appears, exactly once.
    function installPalaceQuestWrapper() {
        const current = Game.palaceQuest;
        if (typeof current !== 'function' || current._ledgerWrapped) return;
        const wrapped = async function (...args) {
            try {
                return await current.apply(this, args);
            } finally {
                try { this.recordPalaceLedger(); this.save?.(); } catch (error) { console.warn('Palace ledger:', error?.message); }
            }
        };
        wrapped._ledgerWrapped = true;
        Game.palaceQuest = wrapped;
    }
    installPalaceQuestWrapper();
    setTimeout(installPalaceQuestWrapper, 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installPalaceQuestWrapper);

    // Every save carries the ledger, so another device can recover progress even
    // when the quest system itself has not synced yet.
    const oldSave = Game.getSaveData.bind(Game);
    Game.getSaveData = function () {
        const data = oldSave();
        try {
            const value = this.recordPalaceLedger() || ledger(this).value;
            data.palaceLedger = JSON.parse(JSON.stringify(value));
        } catch { data.palaceLedger = { completed: [], active: null }; }
        return data;
    };

    // Restore after the sacred/quest modules have finished their own loading.
    const oldContinue = Game.continueGame.bind(Game);
    Game.continueGame = function () {
        let loaded = null;
        try {
            const roster = this.getRoster();
            loaded = roster.heroes[roster.activeHeroId] || JSON.parse(localStorage.getItem(this.state.saveKey) || 'null');
        } catch { /* fresh hero */ }
        const result = oldContinue();
        try {
            if (this.state.player) {
                const restored = this.applyPalaceLedger(loaded?.palaceLedger);
                this.recordPalaceLedger();
                if (restored && (restored.completed?.length || restored.active)) this.save?.();
            }
        } catch (error) { console.warn('Palace ledger restore:', error?.message); }
        return result;
    };

    // A reload, a deploy or a backgrounded tab must not leave the newest quest
    // state only in memory. The local save is synchronous; the cloud save that
    // follows is reconciled by savedAt when the page loads again.
    const flush = () => {
        try {
            if (!Game.state?.player) return;
            Game.recordPalaceLedger();
            Game.save?.();
        } catch { /* page is going away */ }
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

    window.QuestLedger = {
        key: KEY,
        readAll,
        /** The durable ledger for one hero (used by tests and diagnostics). */
        read(heroId) {
            const value = readAll()[String(heroId || 'hero_local')];
            return value && typeof value === 'object'
                ? { completed: [...(value.completed || [])], active: value.active || null, updatedAt: value.updatedAt || 0 }
                : { completed: [], active: null, updatedAt: 0 };
        }
    };
})();
