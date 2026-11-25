/**
 * 7.68.0 — the owner's Sound Studio.
 *
 * The owner signs in with the same Google account used to play. The studio asks
 * the server whether this player is the owner; only then does the section
 * appear. The owner picks one of the game's own sounds (or names a new one),
 * hears how it sounds now, chooses a recorded file, hears it back and publishes
 * it. Publishing stores the recording and every player receives it on the next
 * start-up through `CustomAudio`.
 *
 * Nothing is generated here. The server refuses anything that is not a real
 * wav, mp3, ogg, m4a, aac or flac recording, and refuses every player who is
 * not on the owner list.
 *
 * `studio` anywhere in the game opens this panel directly (`SoundStudio.open`).
 */
(() => {
    'use strict';

    const MAX_BYTES = 3 * 1024 * 1024;
    const TYPES = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/flac'];

    const state = { checked: false, admin: false, busy: false, file: null, lastCheck: 0, lastUid: '' };

    const el = id => document.getElementById(id);
    const status = text => {
        const node = el('sound-studio-status');
        if (node) node.textContent = text;
    };
    const speak = (text, focus = false) => {
        // The visible line always matches what is spoken, so a sighted helper
        // and the player hear and read the same thing.
        status(text);
        try {
            if (window.GestureAccessibility?.speak) window.GestureAccessibility.speak(text, focus, 'system');
        } catch { /* narration is optional */ }
    };
    const note = text => {
        const node = el('sound-studio-target-note');
        if (node) node.textContent = text;
    };

    const api = () => window.BLACK_SWORD_BACKEND_CONFIG?.audioUrl || window.CustomAudio?.api?.() || '';
    const token = async () => {
        try { return await window.OnlineSystem?.user?.getToken?.(true) || null; } catch { return null; }
    };
    const currentUid = () => {
        const user = window.OnlineSystem?.user;
        return String(user?.uid || user?.id || user?.email || '');
    };

    /** Plain words for a status code the studio itself answered with. */
    function httpReason(status) {
        if (status === 404) return 'the studio gateway is not answering at this address, so it has not been deployed on the server yet';
        if (status === 401 || status === 403) return 'the studio refused this account';
        if (status === 413) return 'the recording is too large for the server to accept; try a shorter clip';
        if (status === 429) return 'too many attempts just now; wait a minute and try again';
        if (status >= 500) return 'the studio is running, but its storage or database did not answer';
        return status ? `the studio answered with code ${status}` : 'the studio did not answer';
    }

    async function call(body) {
        const bearer = await token();
        if (!bearer) return { error: { code: 'unauthenticated', message: 'Sign in with Google first.' } };
        let response;
        try {
            response = await fetch(api(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearer },
                body: JSON.stringify(body)
            });
        } catch {
            return { error: { code: 'offline', message: 'You lost internet. Please try again.' } };
        }
        // A gateway that fails in front of the function answers with a page, not
        // JSON. That must be reported as a reason, never as a silent failure.
        let payload = null;
        try { payload = await response.json(); } catch { payload = null; }
        if (payload && (payload.error || payload.data)) return payload;
        if (payload && typeof payload === 'object') return { data: payload };
        const status = Number(response?.status) || 0;
        return { error: { code: 'http-' + status, status, message: `Publishing is closed because ${httpReason(status)}.` } };
    }

    function show(visible) {
        const section = el('sound-studio-section');
        const shortcut = el('btn-open-sound-studio');
        if (shortcut) shortcut.hidden = !visible;
        if (!section) return;
        section.hidden = !visible;
        section.classList.toggle('hidden', !visible);
    }

    /* ─────────────── which sound of the game is being changed ─────────────── */

    const system = () => window.MusicSystem || {};

    function human(cue) {
        const words = String(cue || '').replace(/[-_]+/g, ' ').trim();
        return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
    }

    function kindOf(cue) {
        if (system().music?.[cue]) return 'music';
        if (/^story[-:]/.test(String(cue))) return 'story';
        return 'sfx';
    }

    function publishedCues() {
        try { return new Map((window.CustomAudio?.status?.().cues || []).map(row => [row.cue, row])); }
        catch { return new Map(); }
    }

    function renderTargets() {
        const select = el('sound-studio-target');
        if (!select) return;
        const chosen = select.value;
        const published = publishedCues();
        const label = (cue, extra = '') => {
            const own = published.has(cue) ? ' — your recording' : '';
            return `${human(cue)}${extra ? ' — ' + extra : ''} (${cue})${own}`;
        };
        const group = (title, rows) => {
            if (!rows.length) return;
            const box = document.createElement('optgroup');
            box.label = title;
            for (const row of rows) {
                const option = document.createElement('option');
                option.value = row.cue;
                option.textContent = label(row.cue, row.extra);
                box.appendChild(option);
            }
            select.appendChild(box);
        };

        select.replaceChildren();
        const head = document.createElement('option');
        head.value = '';
        head.textContent = 'Every sound of the game…';
        select.appendChild(head);

        const sfx = Object.keys(system().sfx || {}).sort();
        const music = Object.keys(system().music || {}).sort();
        group('Sound effects', sfx.map(cue => ({ cue })));
        group('Music tracks', music.map(cue => ({ cue, extra: system().music[cue]?.title || '' })));

        const own = document.createElement('option');
        own.value = '__new';
        own.textContent = 'A new sound of my own';
        select.appendChild(own);

        if (chosen && [...select.options].some(option => option.value === chosen)) select.value = chosen;
    }

    function describeTarget() {
        const target = String(el('sound-studio-target')?.value || '');
        if (!target) { note('Choose a sound above and its name fills itself in below.'); return ''; }
        if (target === '__new') {
            note('Type a name of your own below — a new sound is added to the game.');
            return '';
        }
        const own = publishedCues().has(target);
        note(own
            ? `The game is already playing your recording of ${target}. Publish again to replace it.`
            : `The built-in ${target} is playing now. Your recording replaces it for every player.`);
        return target;
    }

    function audition() {
        const target = describeTarget() || String(el('sound-studio-cue')?.value || '').trim().toLowerCase();
        if (!target) { speak('Choose a sound first, then you can hear it.', true); el('sound-studio-target')?.focus(); return; }
        const track = system().music?.[target];
        let played = false;
        try {
            played = track ? Boolean(window.MusicSystem?.playTrack?.(target)) : Boolean(window.MusicSystem?.playSFX?.(target));
        } catch { played = false; }
        if (played) speak(`Playing ${target} as the game has it now.`, true);
        else speak(`${target} could not be played here. It is still the sound you would replace.`, true);
    }

    /* ───────────────────────────── owner access ───────────────────────────── */

    const SIGN_IN_FIRST = 'The studio opens for the owner’s own Google account. Sign in with Google above and it appears here.';

    async function checkOwner({ announce = false } = {}) {
        const section = el('sound-studio-section');
        if (!section) return false;
        state.checked = true;
        state.lastCheck = Date.now();
        state.lastUid = currentUid();
        // The owner is decided by the server from the signed-in token — never by
        // a local flag. `OnlineSystem.linked` is still false for a moment after
        // start-up, and keying the studio on it hid the panel from its own owner.
        if (!(await token())) {
            state.admin = false;
            show(false);
            status(SIGN_IN_FIRST);
            if (announce) speak(SIGN_IN_FIRST, true);
            return false;
        }
        status('Checking owner access…');
        let answer = await call({ action: 'who' });
        if (answer?.error?.code === 'offline') {
            // One quiet retry: a phone that has just woken up often fails once.
            await new Promise(resolve => setTimeout(resolve, 1200));
            answer = await call({ action: 'who' });
        }
        if (answer?.error) {
            state.admin = false;
            show(false);
            const message = answer.error.code === 'unauthenticated'
                ? 'The studio could not confirm this account. Sign in with Google again and it will open.'
                : answer.error.message || 'The studio could not be reached just now.';
            status(message);
            if (announce) speak(message, true);
            return false;
        }
        state.admin = Boolean(answer?.data?.admin);
        show(state.admin);
        if (state.admin) {
            renderTargets();
            renderList();
            const who = String(answer?.data?.name || '').trim();
            status(`Owner access confirmed${who ? ` for ${who}` : ''}. Choose the sound you want to change.`);
            if (announce) speak('Sound Studio ready. Owner access confirmed.', true);
        } else {
            status('This Google account plays the game, but it is not the owner of the studio, so publishing stays closed.');
            if (announce) speak('This account can play but cannot publish sounds.', true);
        }
        return state.admin;
    }

    /** The `studio` command: open Settings, settle access, land on the studio. */
    async function open() {
        try {
            if (window.OnlineSystem?.showSettings) window.OnlineSystem.showSettings();
            else el('settings-panel')?.classList.remove('hidden');
        } catch { el('settings-panel')?.classList.remove('hidden'); }
        const allowed = state.admin || await checkOwner({ announce: false });
        if (!allowed) {
            const signIn = el('btn-settings-google-signin');
            if (signIn && !signIn.hidden) {
                speak(window.OnlineSystem?.linked
                    ? 'This account is not the studio owner, so publishing stays closed.'
                    : 'Sign in with Google to open the Sound Studio. The button is focused now.', true);
                try { signIn.focus(); } catch { /* focus is a courtesy */ }
            }
            return false;
        }
        const section = el('sound-studio-section');
        if (section) {
            try { section.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch { /* older browsers */ }
            try { section.focus?.(); } catch { /* not focusable everywhere */ }
        }
        speak('Sound Studio. Choose the sound you want to change, add your recording, then publish. Every player hears it from their next start-up.', true);
        return true;
    }

    /* ─────────────────────────────── publishing ─────────────────────────────── */

    function chosenFile() {
        const input = el('sound-studio-file');
        return input?.files?.[0] || null;
    }

    function preview(file) {
        state.file = file || null;
        const player = el('sound-studio-preview');
        if (!player) return;
        if (!file) { player.hidden = true; player.removeAttribute('src'); return; }
        const reader = new FileReader();
        reader.onload = () => {
            player.src = String(reader.result);
            player.hidden = false;
        };
        reader.readAsDataURL(file);
        const name = el('sound-studio-cue');
        if (name && !name.value.trim()) {
            name.value = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        }
    }

    const readBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^;]+;base64,/, ''));
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(file);
    });

    async function publish() {
        if (state.busy) return;
        if (!state.admin) { speak('Only the owner can publish sounds.', true); return; }
        const file = chosenFile();
        const cue = String(el('sound-studio-cue')?.value || '').trim().toLowerCase();
        const kind = String(el('sound-studio-kind')?.value || 'sfx');
        if (!file) { speak('Choose a recorded file first.', true); el('sound-studio-file')?.focus(); return; }
        if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(cue)) { speak('Use 2 to 41 lowercase letters, numbers or dashes for the sound name.', true); el('sound-studio-cue')?.focus(); return; }
        if (!TYPES.includes(file.type)) { speak('That file type cannot be published. Use wav, mp3, ogg, m4a, aac or flac.', true); return; }
        if (file.size > MAX_BYTES) { speak('The recording must be 3 megabytes or smaller.', true); return; }

        state.busy = true;
        const button = el('sound-studio-publish');
        if (button) button.disabled = true;
        status(`Publishing ${cue}…`);
        speak(`Publishing ${cue}. Please wait.`);
        try {
            const data = await readBase64(file);
            const answer = await call({ action: 'publish', cue, kind, mime: file.type, filename: file.name, data });
            if (answer?.error) {
                const message = answer.error.message || `Publishing failed: ${httpReason(answer.error.status)}.`;
                if (answer.error.code === 'unauthenticated') {
                    state.admin = false;
                    show(false);
                    speak('The studio lost track of your account. Sign in with Google again, then publish.', true);
                    return;
                }
                status(message);
                speak(message, true);
                return;
            }
            status(`Published ${cue}. Every player hears it from their next start-up.`);
            speak(`Published ${cue}. Every player hears it from their next start-up.`, true);
            await window.CustomAudio?.load?.({ announce: false });
            renderTargets();
            renderList();
        } finally {
            state.busy = false;
            if (button) button.disabled = false;
        }
    }

    async function remove(cue) {
        if (!state.admin) return;
        const answer = await call({ action: 'delete', cue });
        if (answer?.error) { speak(answer.error.message || 'That sound could not be removed.', true); return; }
        status(`Removed ${cue}. The built-in recording is used again.`);
        speak(`Removed ${cue}. The built-in recording is used again.`, true);
        await window.CustomAudio?.load?.();
        renderTargets();
        renderList();
    }

    /**
     * "Check publishing" — the one button that answers the owner's question
     * without a console. It says whether the gateway answers at all, which
     * account this device is signed in as, and whether that account is on the
     * owner list yet. Three failures look identical from the outside; this
     * separates them and names the fix for each.
     */
    async function checkPublishing() {
        if (state.busy) return;
        state.busy = true;
        const button = el('sound-studio-check');
        if (button) button.disabled = true;
        speak('Checking the studio…');
        try {
            let reachable = false, published = 0;
            try {
                const response = await fetch(`${api()}?list=1`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
                if (response.ok) {
                    reachable = true;
                    const body = await response.json().catch(() => null);
                    published = Array.isArray(body?.data?.cues) ? body.data.cues.length : 0;
                }
            } catch { reachable = false; }
            if (!reachable) {
                speak('The studio gateway does not answer. It has to be deployed on the server once; until then nothing can be published. Every player keeps hearing the built-in recordings.', true);
                return false;
            }
            const answer = await call({ action: 'who' });
            if (answer?.error) {
                if (answer.error.code === 'unauthenticated') {
                    speak('The studio is reachable, but this device is not signed in with Google. Sign in above, then check again.', true);
                    return false;
                }
                speak(`The studio is reachable, but the owner check failed: ${answer.error.message}`, true);
                return false;
            }
            const uid = String(answer?.data?.uid || currentUid() || 'unknown');
            const admin = Boolean(answer?.data?.admin);
            state.admin = admin;
            show(admin);
            if (admin) {
                renderTargets(); renderList();
                speak(`The studio is reachable and publishing is open. ${published} sound${published === 1 ? '' : 's'} published so far. This account is ${uid}.`, true);
            } else {
                speak(`The studio is reachable, but this account is not on the owner list yet, so publishing stays closed. This account is ${uid}. Add that id to the studio owner list in the server database, then check again.`, true);
            }
            return admin;
        } finally {
            state.busy = false;
            if (button) button.disabled = false;
        }
    }

    function renderList() {
        const box = el('sound-studio-list');
        if (!box) return;
        const cues = window.CustomAudio?.status?.().cues || [];
        box.textContent = '';
        const heading = document.createElement('p');
        heading.className = 'settings-note';
        heading.textContent = cues.length
            ? `Your published sounds (${cues.length}). Each one replaces the built-in sound with your recording for every player.`
            : 'No sounds published yet. The built-in recordings are playing everywhere.';
        box.appendChild(heading);
        for (const row of cues) {
            const line = document.createElement('div');
            line.className = 'stat-row';
            const label = document.createElement('span');
            label.textContent = `${row.cue} — ${row.kind === 'music' ? 'music' : 'sound effect'}, ${Math.max(1, Math.round(Number(row.bytes || 0) / 1024))} KB`;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'menu-btn danger-btn';
            button.textContent = 'Remove';
            button.setAttribute('aria-label', `Remove published sound ${row.cue}`);
            button.addEventListener('click', () => remove(row.cue));
            line.append(label, button);
            box.appendChild(line);
        }
    }

    /* ───────────────────────────────── wiring ───────────────────────────────── */

    function wire() {
        el('sound-studio-file')?.addEventListener('change', () => preview(chosenFile()));
        el('sound-studio-publish')?.addEventListener('click', publish);
        el('sound-studio-check')?.addEventListener('click', checkPublishing);
        el('sound-studio-audition')?.addEventListener('click', audition);
        el('btn-open-sound-studio')?.addEventListener('click', () => open());
        el('sound-studio-target')?.addEventListener('change', () => {
            const target = describeTarget();
            if (!target) {
                const cueField = el('sound-studio-cue');
                if (cueField && el('sound-studio-target')?.value === '__new') { cueField.value = ''; cueField.focus(); }
                return;
            }
            const cueField = el('sound-studio-cue');
            if (cueField) cueField.value = target;
            const kindField = el('sound-studio-kind');
            if (kindField) kindField.value = kindOf(target);
            const fileField = el('sound-studio-file');
            try { fileField?.focus(); } catch { /* focus is a courtesy */ }
        });
        el('sound-studio-kind')?.addEventListener('change', () => {
            const kind = el('sound-studio-kind')?.value;
            const hint = el('sound-studio-cue');
            if (hint && kind === 'music' && !hint.value.trim()) hint.placeholder = 'battle-theme';
        });
        // Settings can be opened before the sign-in has finished, and the signed
        // account can change while the panel stands there. Access is therefore
        // settled again on every opening, on every touch of Settings, on a
        // sign-in change, and twice more while the account is not yet the owner.
        let settling = false;
        const settle = (force = false) => {
            // The owner panel beside the studio asks the same server the same
            // question. If it has already confirmed the owner, the studio is his
            // too — no second wait, and no chance of the two disagreeing.
            if (!state.admin && window.AdminTools?.state?.admin === true) {
                state.admin = true;
                show(true);
                renderTargets();
                renderList();
                status('Owner access confirmed. Choose the sound you want to change.');
            }
            if (settling) return;
            const uid = currentUid();
            const quiet = !force && Date.now() - state.lastCheck < 2500;
            const unchanged = !force && state.admin && uid === state.lastUid;
            if (quiet || unchanged) return;
            settling = true;
            Promise.resolve()
                .then(() => checkOwner())
                .catch(() => {})
                .finally(() => { settling = false; });
        };
        document.getElementById('settings-panel')?.addEventListener('transitionend', () => settle());
        const observer = new MutationObserver(() => {
            const panel = el('settings-panel');
            if (panel && !panel.classList.contains('hidden')) settle();
        });
        const panel = el('settings-panel');
        if (panel) observer.observe(panel, { attributes: true, attributeFilter: ['class'] });

        // A touch anywhere in Settings keeps the answer honest, exactly as the
        // owner panel beside it does — but never mid-way through a publish.
        document.addEventListener('click', event => {
            const panelNow = el('settings-panel');
            if (!panelNow || panelNow.classList.contains('hidden')) return;
            if (event.target?.closest?.('#sound-studio-section')) return;
            settle();
        });
        window.addEventListener('black-sword-auth-change', () => settle(true));
        setTimeout(() => { if (!state.admin) settle(true); }, 2500);
        setTimeout(() => { if (!state.admin) settle(true); }, 9000);
        renderTargets();
        renderList();
    }

    window.SoundStudio = {
        checkOwner,
        open,
        publish, checkPublishing,
        remove,
        renderList,
        renderTargets,
        preview,
        audition,
        get isOwner() { return state.admin; }
    };

    const start = () => {
        // One broken listener must never take the whole studio down with it.
        try { wire(); } catch { /* the panel still opens below */ }
        Promise.resolve().then(() => checkOwner()).catch(() => {});
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
    window.addEventListener('online', () => { if (!state.checked) checkOwner(); });
})();
