/**
 * 7.64.0 — the owner's Sound Studio.
 *
 * The owner signs in with the same Google account used to play. The studio asks
 * the server whether this player is the owner; only then does the section
 * appear. The owner can choose a recorded file, hear it back, name the cue and
 * publish it. Publishing stores the recording and every player receives it on
 * the next start-up through `CustomAudio`.
 *
 * Nothing is generated here. The server refuses anything that is not a real
 * wav, mp3, ogg, m4a, aac or flac recording, and refuses every player who is
 * not on the owner list.
 */
(() => {
    'use strict';

    const MAX_BYTES = 3 * 1024 * 1024;
    const TYPES = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/flac'];

    const state = { checked: false, admin: false, busy: false, file: null };

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

    const api = () => window.BLACK_SWORD_BACKEND_CONFIG?.audioUrl || window.CustomAudio?.api?.() || '';
    const token = async () => {
        try { return await window.OnlineSystem?.user?.getToken?.(true) || null; } catch { return null; }
    };

    async function call(body) {
        const bearer = await token();
        if (!bearer) return { error: { code: 'unauthenticated', message: 'Sign in with Google first.' } };
        try {
            const response = await fetch(api(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearer },
                body: JSON.stringify(body)
            });
            return await response.json();
        } catch {
            return { error: { code: 'offline', message: 'The studio could not be reached. Check the connection.' } };
        }
    }

    function show(visible) {
        const section = el('sound-studio-section');
        if (!section) return;
        section.hidden = !visible;
        section.classList.toggle('hidden', !visible);
    }

    async function checkOwner({ announce = false } = {}) {
        const section = el('sound-studio-section');
        if (!section) return false;
        if (!window.OnlineSystem?.linked) {
            show(false);
            state.checked = true;
            state.admin = false;
            return false;
        }
        status('Checking owner access…');
        const answer = await call({ action: 'who' });
        state.checked = true;
        state.admin = Boolean(answer?.data?.admin);
        show(state.admin);
        if (state.admin) {
            status('Owner studio ready. Choose a recording to publish.');
            renderList();
            if (announce) speak('Sound Studio ready. Owner access confirmed.', true);
        } else {
            status('This account is not the owner, so publishing is closed.');
            if (announce) speak('This account can play but cannot publish sounds.', true);
        }
        return state.admin;
    }

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
                status(answer.error.message || 'Publishing failed.');
                speak(answer.error.message || 'Publishing failed.', true);
                return;
            }
            status(`Published ${cue}. Every player hears it from now on.`);
            speak(`Published ${cue}. Every player hears it from now on.`, true);
            await window.CustomAudio?.load?.({ announce: true });
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
        renderList();
    }

    function renderList() {
        const box = el('sound-studio-list');
        if (!box) return;
        const cues = window.CustomAudio?.status?.().cues || [];
        box.textContent = '';
        const heading = document.createElement('p');
        heading.className = 'settings-note';
        heading.textContent = cues.length
            ? `Published sounds (${cues.length}). Each one replaces the built-in sound with your recording.`
            : 'No sounds published yet. The built-in recordings are playing.';
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

    function wire() {
        el('sound-studio-file')?.addEventListener('change', () => preview(chosenFile()));
        el('sound-studio-publish')?.addEventListener('click', publish);
        el('sound-studio-kind')?.addEventListener('change', () => {
            const kind = el('sound-studio-kind')?.value;
            const hint = el('sound-studio-cue');
            if (hint && kind === 'music' && !hint.value.trim()) hint.placeholder = 'battle-theme';
        });
        // The settings panel can be opened before sign-in finishes.
        document.getElementById('settings-panel')?.addEventListener('transitionend', () => { if (!state.checked) checkOwner(); });
        const observer = new MutationObserver(() => {
            const panel = el('settings-panel');
            if (panel && !panel.classList.contains('hidden') && !state.checked) checkOwner();
        });
        const panel = el('settings-panel');
        if (panel) observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
        renderList();
    }

    window.SoundStudio = {
        checkOwner,
        publish,
        remove,
        renderList,
        preview,
        get isOwner() { return state.admin; }
    };

    const start = () => { wire(); checkOwner(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
    window.addEventListener('online', () => { if (!state.checked) checkOwner(); });
})();
