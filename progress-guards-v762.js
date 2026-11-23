/**
 * Durable blessings and palace quest history (v7.62).
 *
 * Why this file exists. Prayer blessings and palace quests live inside
 * `Game.state.sacred`, which travels inside one hero snapshot. Three very
 * ordinary things could still make the same thing happen twice:
 *
 *   1. an older cloud snapshot (or a snapshot written before `sacred` existed)
 *      winning a restore, so the hero came back with no record of the blessing
 *      or of the quest already accepted;
 *   2. a hero slot whose id changed during a Google merge, which made the
 *      per-id palace ledger of v7.60 invisible to the restored hero;
 *   3. a daily blessing restored without `lastTemporaryPrayer`, so the offline
 *      once-a-day rule thought no blessing had ever been given.
 *
 * This file keeps a small, append-only device record for each hero (by id and
 * by hero name), restores it into `sacred` before prayer or a palace quest can
 * answer, and teaches the cloud merge to union the progress fields instead of
 * letting one snapshot erase the other. Nothing here grants a stat bonus twice:
 * a recorded blessing is only ever *restored*, never re-applied.
 */
(function () {
    'use strict';

    const BKEY = 'black_sword_blessing_ledger_v1';
    const PKEY = 'black_sword_palace_ledger_by_name_v1';
    const DAY = 24 * 3600000;

    const readJson = (key) => {
        try {
            const value = JSON.parse(localStorage.getItem(key) || '{}');
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch { return {}; }
    };
    const writeJson = (key, value) => {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode or full */ }
    };
    const normName = name => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const unique = list => [...new Set(list.filter(Boolean))];

    const game = () => window.Game;

    function identityKeys(G) {
        const keys = [];
        if (G?.state?.activeHeroId) keys.push('id:' + G.state.activeHeroId);
        const name = normName(G?.state?.player?.name);
        if (name) keys.push('name:' + name);
        return keys;
    }

    /* ───────────────── blessing record ───────────────── */

    /**
     * A prayer blessing stands for a day. The short Battle Prayer guard lasts
     * fifteen minutes and must never be mistaken for the daily blessing.
     */
    function isDailyPrayerBlessing(blessing) {
        if (!blessing) return false;
        const left = Number(blessing.expiresAt) - Date.now();
        if (!(left > 0)) return false;
        if (blessing.source === 'prayer') return true;
        return !blessing.source && left > 60 * 60 * 1000;
    }

    const emptyBlessings = () => ({ permanent: null, permanentAt: 0, firstPrayerDone: false, daily: null, updatedAt: 0 });

    function mergeBlessings(base, extra) {
        const out = { ...emptyBlessings(), ...(base || {}) };
        const add = extra || {};
        if (!out.permanent && add.permanent) { out.permanent = add.permanent; out.permanentAt = Number(add.permanentAt) || 0; }
        out.permanentAt = Math.max(Number(out.permanentAt) || 0, Number(add.permanentAt) || 0);
        out.firstPrayerDone = Boolean(out.firstPrayerDone || add.firstPrayerDone);
        const yes = Number(out.daily?.nextAt) || 0, them = Number(add.daily?.nextAt) || 0;
        if (them > yes) out.daily = { ...add.daily };
        else if (!out.daily && them) out.daily = { ...add.daily };
        out.updatedAt = Math.max(Number(out.updatedAt) || 0, Number(add.updatedAt) || 0);
        return out;
    }

    function readBlessings(G) {
        const all = readJson(BKEY);
        let merged = emptyBlessings();
        for (const key of identityKeys(G)) merged = mergeBlessings(merged, all[key]);
        return merged;
    }

    /** Record what the hero really has. Called after every prayer and save. */
    function noteBlessings(G) {
        const s = G?.state?.sacred;
        if (!s || !G.state.player) return null;
        const record = {
            permanent: s.permanentTempleBlessing || s.permanentBlessingChoice || s.permanentBlessingClaimed || null,
            permanentAt: Number(s.permanentBlessingAt) || 0,
            firstPrayerDone: Boolean(s.firstPrayerDone || s.lastTemporaryPrayer || s.dailyBattleBlessing),
            daily: isDailyPrayerBlessing(s.dailyBattleBlessing)
                ? {
                    grantedAt: Number(s.lastTemporaryPrayer) || 0,
                    nextAt: Number(s.dailyBattleBlessing.expiresAt) || 0,
                    type: s.dailyBattleBlessing.type || null,
                    prayer: s.dailyBattleBlessing.prayer || null
                }
                : null,
            updatedAt: Date.now()
        };
        const all = readJson(BKEY);
        for (const key of identityKeys(G)) all[key] = mergeBlessings(all[key], record);
        writeJson(BKEY, all);
        return mergeBlessings(emptyBlessings(), record);
    }

    /**
     * Put recorded blessings back into `sacred` when a snapshot lost them.
     * No stat is applied here: the hero already received it when it was granted.
     */
    function restoreBlessings(G) {
        if (!G?.state?.player) return false;
        const s = G.state.sacred || (G.state.sacred = {});
        const record = readBlessings(G);
        let changed = false;

        if (!s.permanentTempleBlessing) {
            const choice = s.permanentBlessingChoice || s.permanentBlessingClaimed || record.permanent;
            if (choice) {
                s.permanentTempleBlessing = choice;
                s.permanentBlessingChoice = s.permanentBlessingChoice || choice;
                changed = true;
            }
        }
        if (!s.firstPrayerDone && (record.firstPrayerDone || s.permanentTempleBlessing)) {
            s.firstPrayerDone = true;
            changed = true;
        }

        const now = Date.now();
        const daily = record.daily;
        if (daily && Number(daily.nextAt) > now) {
            const expiresAt = Number(daily.nextAt);
            if (!s.dailyBattleBlessing || Number(s.dailyBattleBlessing.expiresAt) <= now) {
                s.dailyBattleBlessing = { type: daily.type || 'guard', value: 5, expiresAt, source: 'prayer', prayer: daily.prayer || undefined };
                changed = true;
            }
            // The offline rule counts from lastTemporaryPrayer. Restoring the
            // blessing without it made the same day's blessing grantable again.
            let since = Number(daily.grantedAt) || 0;
            if (!since || since > now) since = Math.min(now - 1, expiresAt - DAY);
            if (!Number(s.lastTemporaryPrayer) || Number(s.lastTemporaryPrayer) < since) {
                s.lastTemporaryPrayer = since;
                changed = true;
            }
        }
        if (changed) noteBlessings(G);
        return changed;
    }

    /* ───────────────── palace history record ───────────────── */

    function bestQuest(a, b) {
        if (!a || !a.quest_id) return b || null;
        if (!b || !b.quest_id) return a;
        if (a.quest_id !== b.quest_id) return (Number(a.progress) || 0) >= (Number(b.progress) || 0) ? a : b;
        return (Number(a.progress) || 0) >= (Number(b.progress) || 0) ? { ...b, ...a } : { ...a, ...b };
    }

    function palaceOf(holder) {
        const source = holder && typeof holder === 'object' ? holder : {};
        const palace = source.palace && typeof source.palace === 'object' ? source.palace : { active: null, completed: [] };
        if (!Array.isArray(palace.completed)) palace.completed = [];
        return palace;
    }

    function recordPalaceByName(G) {
        const palace = G?.state?.sacred?.palace;
        if (!palace) return null;
        const name = normName(G.state.player?.name);
        if (!name) return null;
        const all = readJson(PKEY);
        const previous = all[name] && typeof all[name] === 'object' ? all[name] : { active: null, completed: [] };
        const record = {
            completed: unique([...(previous.completed || []), ...(palace.completed || [])]),
            active: bestQuest(palace.active, previous.active),
            updatedAt: Date.now()
        };
        if (record.active && record.completed.includes(record.active.quest_id)) record.active = null;
        all[name] = record;
        writeJson(PKEY, all);
        return record;
    }

    function readPalaceByName(G) {
        const all = readJson(PKEY), name = normName(G?.state?.player?.name);
        const record = name ? all[name] : null;
        return record && typeof record === 'object' ? record : { active: null, completed: [] };
    }

    /** Union every durable palace record back into the live quest state. */
    function restorePalace(G) {
        if (!G?.state?.player) return false;
        const s = G.state.sacred || (G.state.sacred = {});
        const palace = s.palace = palaceOf(s);
        const byId = window.QuestLedger?.read?.(G.state.activeHeroId) || { active: null, completed: [] };
        const byName = readPalaceByName(G);
        const completed = unique([...(palace.completed || []), ...(byId.completed || []), ...(byName.completed || [])]);
        let changed = completed.length !== (palace.completed || []).length;
        palace.completed = completed;
        if (!palace.active) {
            const candidate = bestQuest(byId.active, byName.active);
            if (candidate) { palace.active = { ...candidate }; changed = true; }
        }
        if (palace.active && palace.completed.includes(palace.active.quest_id)) {
            palace.active = null;
            changed = true;
        }
        if (palace.active) palace.active.progress = Number(palace.active.progress) || 0;
        if (changed) {
            window.QuestLedger && G.recordPalaceLedger?.();
            recordPalaceByName(G);
        }
        return changed;
    }

    /* ───────────────── cloud merge that cannot erase progress ───────────────── */

    function mergeQuestLists(keep, other) {
        const byId = new Map();
        for (const quest of [...(other || []), ...(keep || [])]) {
            if (!quest || !quest.id) continue;
            const previous = byId.get(quest.id);
            if (!previous) { byId.set(quest.id, quest); continue; }
            const a = Number(previous.objectives?.[0]?.current) || 0;
            const b = Number(quest.objectives?.[0]?.current) || 0;
            byId.set(quest.id, b >= a ? quest : previous);
        }
        return [...byId.values()];
    }

    function mergeLedgerShape(keep, other) {
        const base = { completed: [], active: null, updatedAt: 0, ...(keep || {}) };
        base.completed = unique([...(base.completed || []), ...((other && other.completed) || [])]);
        base.active = bestQuest(base.active, other?.active);
        if (base.active && base.completed.includes(base.active.quest_id)) base.active = null;
        base.updatedAt = Math.max(Number(base.updatedAt) || 0, Number(other?.updatedAt) || 0);
        return base;
    }

    /** Union the progress fields of two snapshots of the same hero into `keep`. */
    function mergeHeroProgress(keep, other) {
        if (!keep || !other || typeof keep !== 'object' || typeof other !== 'object') return false;
        let changed = false;
        const ks = keep.sacred && typeof keep.sacred === 'object' ? keep.sacred : null;
        const os = other.sacred && typeof other.sacred === 'object' ? other.sacred : null;
        if (os) {
            if (!ks) { keep.sacred = { ...os }; changed = true; }
            else {
                const before = JSON.stringify([ks.permanentTempleBlessing, ks.firstPrayerDone, ks.palace, ks.lastTemporaryPrayer, ks.dailyBattleBlessing]);
                if (!ks.permanentTempleBlessing) {
                    const choice = os.permanentTempleBlessing || os.permanentBlessingChoice || os.permanentBlessingClaimed;
                    if (choice) { ks.permanentTempleBlessing = choice; ks.permanentBlessingChoice = ks.permanentBlessingChoice || choice; }
                }
                ks.firstPrayerDone = Boolean(ks.firstPrayerDone || os.firstPrayerDone);
                ks.lastTemporaryPrayer = Math.max(Number(ks.lastTemporaryPrayer) || 0, Number(os.lastTemporaryPrayer) || 0);
                ks.lastDailyBlessing = Math.max(Number(ks.lastDailyBlessing) || 0, Number(os.lastDailyBlessing) || 0);
                const kd = Number(ks.dailyBattleBlessing?.expiresAt) || 0, od = Number(os.dailyBattleBlessing?.expiresAt) || 0;
                if (od > kd) ks.dailyBattleBlessing = { ...os.dailyBattleBlessing };
                const created = [Number(ks.createdAt) || 0, Number(os.createdAt) || 0].filter(Boolean);
                if (created.length) ks.createdAt = Math.min(...created);

                const kp = palaceOf(ks), op = palaceOf(os);
                kp.completed = unique([...(kp.completed || []), ...(op.completed || [])]);
                kp.active = bestQuest(kp.active, op.active);
                if (kp.active && kp.completed.includes(kp.active.quest_id)) kp.active = null;
                ks.palace = kp;
                if (JSON.stringify([ks.permanentTempleBlessing, ks.firstPrayerDone, ks.palace, ks.lastTemporaryPrayer, ks.dailyBattleBlessing]) !== before) changed = true;
            }
        }
        keep.completedQuests = unique([...(keep.completedQuests || []), ...(other.completedQuests || [])]);
        keep.quests = mergeQuestLists(keep.quests, other.quests);
        keep.palaceLedger = mergeLedgerShape(keep.palaceLedger, other.palaceLedger);
        keep.palaceByName = mergeLedgerShape(keep.palaceByName, other.palaceByName);
        keep.blessings = mergeBlessings(keep.blessings, other.blessings);
        const a = Number(keep.savedAt) || 0, b = Number(other.savedAt) || 0;
        if (b > a) keep.savedAt = b;
        return changed;
    }

    function unionRosterProgress(merged, cloudRoster, localRoster) {
        if (!merged?.heroes) return false;
        let repaired = false;
        const heroes = merged.heroes;
        for (const [id, hero] of Object.entries(heroes)) {
            const cloud = cloudRoster?.heroes?.[id];
            const local = localRoster?.heroes?.[id];
            if (cloud) repaired = mergeHeroProgress(hero, cloud) || repaired;
            if (local && local !== hero) repaired = mergeHeroProgress(hero, local) || repaired;
        }
        // A hero whose slot id changed during a Google merge still carries the
        // same name. Union that progress into the surviving slot.
        const byName = new Map(Object.entries(heroes).map(([id, hero]) => [normName(hero?.player?.name), id]).filter(([name]) => name));
        for (const [id, hero] of Object.entries(localRoster?.heroes || {})) {
            if (heroes[id]) continue;
            const target = byName.get(normName(hero?.player?.name));
            if (target && heroes[target]) repaired = mergeHeroProgress(heroes[target], hero) || repaired;
        }
        return repaired;
    }

    /* ───────────────── guards ───────────────── */

    function speak(text) {
        try { window.GestureAccessibility?.speak?.(text, false, 'system'); } catch { /* gesture layer absent */ }
    }

    const G = game();
    if (!G) return;

    // 1. Recorded blessings are restored before prayer can answer.
    if (typeof G.pray === 'function') {
        const previousPray = G.pray.bind(G);
        G.pray = async function (choice = '') {
            try { restoreBlessings(this); } catch (error) { console.warn('Blessing restore:', error?.message); }
            const result = await previousPray(choice);
            try { noteBlessings(this); this.save?.(); } catch (error) { console.warn('Blessing record:', error?.message); }
            return result;
        };
    }

    if (typeof G.claimPermanentTempleBlessing === 'function') {
        const previousClaim = G.claimPermanentTempleBlessing.bind(G);
        G.claimPermanentTempleBlessing = async function (choice) {
            try { restoreBlessings(this); } catch { /* the claim still answers honestly */ }
            const result = await previousClaim(choice);
            try {
                if (result === true) this.state.sacred.permanentBlessingAt = Date.now();
                noteBlessings(this);
                if (result === true) this.save?.();
            } catch (error) { console.warn('Blessing record:', error?.message); }
            return result;
        };
    }

    // 2. A palace quest is never re-issued because a snapshot lost the ledger.
    if (typeof G.palaceQuest === 'function') {
        const previousQuest = G.palaceQuest.bind(G);
        G.palaceQuest = async function (...args) {
            let repaired = false;
            try { repaired = restorePalace(this); } catch (error) { console.warn('Palace restore:', error?.message); }
            if (repaired) this.save?.();
            const result = await previousQuest(...args);
            try { recordPalaceByName(this); window.QuestLedger && this.recordPalaceLedger?.(); } catch (error) { console.warn('Palace record:', error?.message); }
            return result;
        };
    }

    // 3. Every save and every load carries the durable records.
    const previousGet = G.getSaveData.bind(G);
    G.getSaveData = function () {
        const data = previousGet();
        try {
            data.blessings = noteBlessings(this) || readBlessings(this);
            data.palaceByName = recordPalaceByName(this) || readPalaceByName(this);
        } catch (error) { console.warn('Progress record:', error?.message); }
        return data;
    };

    const previousContinue = G.continueGame.bind(G);
    G.continueGame = function () {
        const result = previousContinue();
        if (!result || !this.state.player) return result;
        let repaired = false;
        try { repaired = restoreBlessings(this); } catch (error) { console.warn('Blessing restore:', error?.message); }
        try { repaired = restorePalace(this) || repaired; } catch (error) { console.warn('Palace restore:', error?.message); }
        if (repaired) this.save?.();
        return result;
    };

    // 4. A cloud restore unions progress instead of picking one snapshot.
    const online = window.OnlineSystem;
    if (online && typeof online.mergeNewestRoster === 'function') {
        const previousMerge = online.mergeNewestRoster.bind(online);
        online.mergeNewestRoster = function (cloudRoster, localRoster) {
            const result = previousMerge(cloudRoster, localRoster);
            const merged = result?.merged;
            if (!merged) return result;
            let repaired = false;
            try { repaired = unionRosterProgress(merged, cloudRoster, localRoster); } catch (error) { console.warn('Progress merge:', error?.message); }
            return { merged, repaired: Boolean(result.repaired || repaired) };
        };
    }

    // 5. Any load that bypasses continueGame still repairs before the first save.
    window.addEventListener('bsu-hero-loaded', () => {
        try { restoreBlessings(G); restorePalace(G); } catch { /* diagnostics only */ }
    });

    window.ProgressGuard = {
        readBlessings, noteBlessings, restoreBlessings,
        restorePalace, recordPalaceByName, readPalaceByName,
        mergeHeroProgress, unionRosterProgress, mergeBlessings,
        keys: { blessings: BKEY, palaceByName: PKEY }
    };
})();
