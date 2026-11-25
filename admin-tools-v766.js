/* 7.66.0 — the owner's admin tools, inside Settings.
 *
 * The owner asked for an admin area with the Sound Studio, the story clips, the
 * Christmas event state and the player list. Nothing here is shown to a guest
 * or an ordinary player: `bsu-audio` answers `who` with `admin: true` only for
 * the account listed in `audio_admins`.
 *
 * Privacy rules kept from earlier rounds: a player is shown by hero name only.
 * No email address, no account link and no Google identifier is ever printed.
 */
(function () {
    'use strict';

    const el = id => document.getElementById(id);
    const state = { checked: false, admin: false, busy: false };

    const api = () => window.BLACK_SWORD_BACKEND_CONFIG?.audioUrl || window.CustomAudio?.api?.() || '';
    const token = async () => {
        try { return await window.OnlineSystem?.user?.getToken?.(true) || null; } catch { return null; }
    };

    const say = (text, focus = false) => {
        try { window.GestureAccessibility?.speak?.(text, focus, 'system'); } catch { /* optional */ }
    };
    const line = (id, text) => { const node = el(id); if (node) node.textContent = text; };

    async function call(body) {
        const bearer = await token();
        if (!bearer) return { error: { code: 'unauthenticated' } };
        let response;
        try {
            response = await fetch(api(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearer },
                body: JSON.stringify(body)
            });
        } catch { return { error: { code: 'offline', message: 'You lost internet. Please try again.' } }; }
        let payload = null;
        try { payload = await response.json(); } catch { payload = null; }
        if (payload && (payload.error || payload.data)) return payload;
        if (payload && typeof payload === 'object') return { data: payload };
        const status = Number(response?.status) || 0;
        const reason = status === 404 ? 'the owner gateway is not deployed on the server'
            : status === 401 || status === 403 ? 'this account is not the owner'
            : status >= 500 ? 'the server storage or database did not answer'
            : `the server answered with code ${status || 'none'}`;
        return { error: { code: 'http-' + status, status, message: `Owner tools are closed because ${reason}.` } };
    }

    function show(visible) {
        const section = el('admin-section');
        if (!section) return;
        section.hidden = !visible;
        section.classList.toggle('hidden', !visible);
    }

    /* ── story clips ─────────────────────────────────────────────────────── */

    function renderStory() {
        const box = el('admin-story-list');
        if (!box) return;
        const story = window.StoryIntro;
        if (!story) { box.textContent = 'The story module is not loaded.'; return; }
        const status = story.status();
        const rows = [...status.intro, ...status.quests].map(entry => {
            const where = entry.published ? 'published recording' : 'bundled recording';
            return `${entry.cue} — ${where} — “${entry.text}”`;
        });
        box.innerHTML = '';
        const list = document.createElement('ul');
        list.className = 'admin-list';
        for (const row of rows) {
            const item = document.createElement('li');
            item.textContent = row;
            list.append(item);
        }
        box.append(list);
        const playButton = document.createElement('button');
        playButton.type = 'button';
        playButton.className = 'menu-btn';
        playButton.textContent = '▶︎ Play the opening story now';
        playButton.addEventListener('click', () => window.StoryIntro?.play({ announce: true }));
        box.append(playButton);
    }

    async function publishStory() {
        const cue = String(el('admin-story-cue')?.value || '').trim().toLowerCase();
        const file = el('admin-story-file')?.files?.[0];
        const status = el('admin-story-status');
        if (!cue || !file) { if (status) status.textContent = 'Choose a story line and a recorded file first.'; return false; }
        if (state.busy) return false;
        state.busy = true;
        if (status) status.textContent = 'Uploading the recording…';
        try {
            const data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('read'));
                reader.readAsDataURL(file);
            });
            const answer = await call({ action: 'publish', cue, kind: 'story', mime: file.type || 'audio/mpeg', filename: file.name, data });
            if (answer?.error) {
                if (status) status.textContent = `The recording was not published: ${answer.error.code}.`;
                return false;
            }
            if (status) status.textContent = 'Published. Every player hears this recording for that line.';
            await window.CustomAudio?.load?.({ announce: false });
            renderStory();
            return true;
        } finally {
            state.busy = false;
        }
    }

    /* ── Christmas event ─────────────────────────────────────────────────── */

    function renderChristmas() {
        const box = el('admin-christmas-status');
        if (!box) return;
        const out = [];
        const india = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
        out.push(`India time now: ${india}.`);
        let christmas = null;
        try { christmas = (window.SeasonalEvents?.activeEvents?.() || []).find(event => event.id === 'christmas') || null; } catch { christmas = null; }
        out.push(christmas ? 'Christmas City is OPEN right now.' : 'Christmas City is closed right now.');
        out.push('The season runs December 1 to December 25, India time; door N opens only on December N.');
        const advent = window.Game?.state?.player?.advent;
        const done = Object.keys(advent?.done || {}).length;
        const secrets = Object.keys(advent?.secret || {}).length;
        out.push(`This hero has finished ${done} of 25 doors and found ${secrets} of 25 secret words.`);
        out.push('Commands for players: christmas map, christmas doors, christmas story, christmas open, christmas present.');
        box.textContent = out.join(' ');
    }

    /* ── player list (hero names only) ───────────────────────────────────── */

    async function renderPlayers() {
        const box = el('admin-players-list');
        if (!box) return;
        box.textContent = 'Reading the player list…';
        const client = window.OnlineSystem?.client;
        if (!client) { box.textContent = 'The database is not reachable right now.'; return; }
        try {
            const { data, error } = await client.from('profiles')
                .select('display_name,level,current_location,last_seen')
                .order('last_seen', { ascending: false })
                .limit(50);
            if (error) { box.textContent = 'The player list could not be read.'; return; }
            const rows = Array.isArray(data) ? data : [];
            if (!rows.length) { box.textContent = 'No players are recorded yet.'; return; }
            const list = document.createElement('ul');
            list.className = 'admin-list';
            for (const row of rows) {
                const item = document.createElement('li');
                const seen = row.last_seen ? new Date(row.last_seen).toLocaleDateString() : 'unknown';
                item.textContent = `${row.display_name || 'Unnamed hero'} — level ${row.level || 1} — ${row.current_location || 'unknown place'} — last seen ${seen}`;
                list.append(item);
            }
            box.innerHTML = '';
            box.append(list);
            box.append(Object.assign(document.createElement('p'), {
                className: 'settings-note',
                textContent: `${rows.length} heroes shown, newest first. Names only: no email or account identifier is ever shown.`
            }));
        } catch { box.textContent = 'The player list could not be read.'; }
    }

    /* ── owner check ─────────────────────────────────────────────────────── */

    async function checkOwner() {
        if (!window.OnlineSystem?.linked) { show(false); state.admin = false; return false; }
        const answer = await call({ action: 'who' });
        state.checked = true;
        state.admin = Boolean(answer?.data?.admin);
        show(state.admin);
        if (state.admin) {
            line('admin-status', 'Owner access confirmed. These tools are not shown to other players.');
            renderStory();
            renderChristmas();
            renderPlayers();
        }
        return state.admin;
    }

    function wire() {
        const section = el('admin-section');
        if (!section) return;
        el('admin-story-publish')?.addEventListener('click', publishStory);
        el('admin-story-refresh')?.addEventListener('click', () => { renderStory(); renderChristmas(); renderPlayers(); });
        el('admin-christmas-read')?.addEventListener('click', () => {
            renderChristmas();
            say(el('admin-christmas-status')?.textContent || 'Christmas status is not available.', true);
        });
        // The cue list is read from the story module, so it can never drift.
        const select = el('admin-story-cue');
        if (select && window.StoryIntro) {
            select.innerHTML = '';
            const status = window.StoryIntro.status();
            for (const entry of [...status.intro, ...status.quests]) {
                const option = document.createElement('option');
                option.value = entry.cue;
                option.textContent = `${entry.cue} — ${entry.text.slice(0, 60)}`;
                select.append(option);
            }
        }
        window.addEventListener('black-sword-auth-change', () => { checkOwner().catch(() => {}); });
        document.addEventListener('click', event => {
            if (event.target?.id === 'btn-account-signout' || event.target?.closest?.('#settings-panel')) {
                // Keep the owner panel honest whenever Settings is opened.
                if (document.getElementById('settings-panel') && !document.getElementById('settings-panel').classList.contains('hidden')) {
                    checkOwner().catch(() => {});
                }
            }
        });
        setTimeout(() => { checkOwner().catch(() => {}); }, 2500);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true });
    else wire();

    window.AdminTools = { checkOwner, renderStory, renderChristmas, renderPlayers, publishStory, state };
})();
