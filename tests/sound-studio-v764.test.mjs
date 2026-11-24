import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

/* 7.64.0 — the owner's studio in the game. The owner sees it after Google
 * sign-in, can publish a recording, and every player receives it. Anyone else
 * never sees a publish control, and the browser refuses obvious mistakes before
 * any request is made. */

const WAV = (() => {
    const bytes = new Uint8Array(4096);
    const put = (text, at) => { for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i); };
    put('RIFF', 0); put('WAVE', 8); put('fmt ', 12); put('data', 36);
    return bytes;
})();

async function ready(t, { owner = true, list = [] } = {}) {
    const runtime = await createRuntime();
    const w = runtime.window;
    t.after(() => runtime.dom.window.close());
    await wait(0);
    const calls = { posts: [], lists: 0 };
    w.fetch = async (url, options = {}) => {
        const target = String(url);
        if (target.includes('list=1')) {
            calls.lists += 1;
            return { ok: true, status: 200, json: async () => ({ data: { cues: list } }) };
        }
        const body = JSON.parse(options.body || '{}');
        calls.posts.push({ body, headers: options.headers || {} });
        if (body.action === 'who') return { ok: true, json: async () => ({ data: { admin: owner } }) };
        if (body.action === 'publish') {
            list.push({ cue: body.cue, kind: body.kind, url: `https://cdn.test/${body.cue}.wav`, bytes: 4096 });
            return { ok: true, json: async () => ({ data: { published: true, cue: body.cue } }) };
        }
        if (body.action === 'delete') {
            const at = list.findIndex(row => row.cue === body.cue);
            if (at >= 0) list.splice(at, 1);
            return { ok: true, json: async () => ({ data: { removed: true, cue: body.cue } }) };
        }
        return { ok: false, status: 400, json: async () => ({ error: { message: 'no' } }) };
    };
    w.Game.startNewHero();
    w.document.getElementById('char-name').value = 'Owner Hero';
    w.document.querySelector('[data-race="human"]').classList.add('selected');
    w.document.querySelector('[data-class="warrior"]').classList.add('selected');
    w.Game.createCharacter(false);
    w.OnlineSystem.linked = true;
    w.OnlineSystem.ready = true;
    w.OnlineSystem.user = {
        id: 'owner-uid', email: 'owner@example.com',
        getToken: async () => 'id-token', getIdToken: async () => 'id-token'
    };
    return { w, calls, list };
}

function chooseFile(w, name, type, bytes = WAV) {
    const input = w.document.getElementById('sound-studio-file');
    const file = new w.File([bytes], name, { type });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new w.Event('change'));
    return file;
}

test('published sounds replace the built-in recordings at start-up', async t => {
    const list = [
        { cue: 'door', kind: 'sfx', url: 'https://cdn.test/door.wav', bytes: 4096 },
        { cue: 'town', kind: 'music', url: 'https://cdn.test/town.mp3', bytes: 9000 },
        { cue: 'a-new-bell', kind: 'sfx', url: 'https://cdn.test/bell.wav', bytes: 512 }
    ];
    const { w } = await ready(t, { list });
    await w.CustomAudio.load();
    assert.deepEqual([...w.MusicSystem.sfx.door], ['https://cdn.test/door.wav']);
    assert.equal(w.MusicSystem.music.town.src, 'https://cdn.test/town.mp3');
    assert.deepEqual([...w.MusicSystem.sfx['a-new-bell']], ['https://cdn.test/bell.wav']);
    assert.equal(w.CustomAudio.status().count, 3);
});

test('a studio that cannot be reached leaves the built-in recordings alone', async t => {
    const { w } = await ready(t);
    const before = [...w.MusicSystem.sfx.door];
    w.fetch = async () => { throw new Error('offline'); };
    await w.CustomAudio.load();
    assert.deepEqual([...w.MusicSystem.sfx.door], before);
    assert.equal(w.CustomAudio.status().failed, true);
});

test('the studio stays hidden for a player who is not the owner', async t => {
    const { w, calls } = await ready(t, { owner: false });
    await w.SoundStudio.checkOwner();
    const section = w.document.getElementById('sound-studio-section');
    assert.equal(section.hidden, true);
    assert.equal(w.SoundStudio.isOwner, false);
    assert.match(w.document.getElementById('sound-studio-status').textContent, /not the owner/);
    assert.ok(calls.posts.some(call => call.body.action === 'who'), 'the owner check was asked');
});

test('the owner sees the studio and publishes a recording', async t => {
    const { w, calls, list } = await ready(t);
    assert.equal(await w.SoundStudio.checkOwner(), true);
    const section = w.document.getElementById('sound-studio-section');
    assert.equal(section.hidden, false);
    w.document.getElementById('sound-studio-cue').value = 'door';
    w.document.getElementById('sound-studio-kind').value = 'sfx';
    chooseFile(w, 'My Door.wav', 'audio/wav');
    await w.SoundStudio.publish();
    await wait(30);
    const publish = calls.posts.find(call => call.body.action === 'publish');
    assert.ok(publish, 'a publish request was sent');
    assert.equal(publish.body.cue, 'door');
    assert.equal(publish.body.kind, 'sfx');
    assert.equal(publish.body.mime, 'audio/wav');
    assert.equal(publish.body.filename, 'My Door.wav');
    assert.ok(publish.body.data.length > 100, 'the recording was sent');
    assert.equal(publish.headers.Authorization, 'Bearer id-token');
    assert.match(w.document.getElementById('sound-studio-status').textContent, /Published door/);
    assert.equal(list.length, 1);
    assert.deepEqual([...w.MusicSystem.sfx.door], ['https://cdn.test/door.wav'], 'the new recording is used immediately');
});

test('a wrong name, wrong type or oversized file never reaches the server', async t => {
    const { w, calls } = await ready(t);
    await w.SoundStudio.checkOwner();
    const cue = w.document.getElementById('sound-studio-cue');
    cue.value = 'Door!';
    chooseFile(w, 'door.wav', 'audio/wav');
    await w.SoundStudio.publish();
    assert.equal(calls.posts.filter(call => call.body.action === 'publish').length, 0);
    assert.match(w.document.getElementById('sound-studio-status').textContent, /lowercase|cannot|could not/i);

    cue.value = 'door';
    chooseFile(w, 'door.txt', 'text/plain');
    await w.SoundStudio.publish();
    assert.equal(calls.posts.filter(call => call.body.action === 'publish').length, 0);

    const big = new Uint8Array(3 * 1024 * 1024 + 16);
    big.set([...WAV.subarray(0, 16)], 0);
    chooseFile(w, 'big.wav', 'audio/wav', big);
    await w.SoundStudio.publish();
    assert.equal(calls.posts.filter(call => call.body.action === 'publish').length, 0);
});

test('the owner can stop serving a published sound', async t => {
    const list = [{ cue: 'door', kind: 'sfx', url: 'https://cdn.test/door.wav', bytes: 4096 }];
    const { w, calls } = await ready(t, { list });
    await w.SoundStudio.checkOwner();
    await w.SoundStudio.remove('door');
    const removal = calls.posts.find(call => call.body.action === 'delete');
    assert.equal(removal.body.cue, 'door');
    assert.match(w.document.getElementById('sound-studio-status').textContent, /Removed door/);
});

test('the cue name is filled from the recording file name', async t => {
    const { w } = await ready(t);
    await w.SoundStudio.checkOwner();
    chooseFile(w, 'Bell At Dusk.wav', 'audio/wav');
    assert.equal(w.document.getElementById('sound-studio-cue').value, 'bell-at-dusk');
});

/* 7.68.0 — the studio is reachable with one word, and it asks for a specific
 * sound of the game rather than a name typed from memory. */

test('the studio lists every sound of the game and fills the name in', async t => {
    const { w } = await ready(t);
    await w.SoundStudio.checkOwner();
    const target = w.document.getElementById('sound-studio-target');
    const cues = [...target.options].map(option => option.value);
    assert.ok(cues.includes('door'), 'a sound effect is offered');
    assert.ok(cues.includes('coin'), 'another sound effect is offered');
    assert.ok(cues.includes('battle'), 'a music track is offered');
    assert.equal(cues.includes('__new'), true, 'a new sound of the owner’s own can still be named');
    assert.ok(target.querySelectorAll('optgroup').length >= 2, 'sounds and music are grouped apart');

    // Choosing "door" fills the name and the kind in.
    target.value = 'door';
    target.dispatchEvent(new w.Event('change'));
    assert.equal(w.document.getElementById('sound-studio-cue').value, 'door');
    assert.equal(w.document.getElementById('sound-studio-kind').value, 'sfx');
    assert.match(w.document.getElementById('sound-studio-target-note').textContent, /built-in door/i);

    // Choosing a music track switches the kind too.
    target.value = 'battle';
    target.dispatchEvent(new w.Event('change'));
    assert.equal(w.document.getElementById('sound-studio-cue').value, 'battle');
    assert.equal(w.document.getElementById('sound-studio-kind').value, 'music');

    // "A new sound of my own" clears the name so the owner types their own.
    w.document.getElementById('sound-studio-cue').value = 'battle';
    target.value = '__new';
    target.dispatchEvent(new w.Event('change'));
    assert.equal(w.document.getElementById('sound-studio-cue').value, '');
    assert.match(w.document.getElementById('sound-studio-target-note').textContent, /new sound/i);
});

test('the studio command opens Settings and lands on the Sound Studio', async t => {
    const { w } = await ready(t);
    w.document.getElementById('settings-panel').classList.add('hidden');
    w.Game.processCommand('studio');
    await wait(60);
    const panel = w.document.getElementById('settings-panel');
    const section = w.document.getElementById('sound-studio-section');
    assert.equal(panel.classList.contains('hidden'), false, 'Settings opened');
    assert.equal(section.hidden, false, 'the studio is visible to the owner');
    assert.equal(w.SoundStudio.isOwner, true, 'the owner check passed');
    assert.match(w.document.getElementById('sound-studio-status').textContent, /Sound Studio\. Choose the sound/i);
});

test('signing in after opening Settings brings the studio out without a reload', async t => {
    const { w } = await ready(t);
    // A guest has no studio yet.
    w.OnlineSystem.linked = false;
    w.OnlineSystem.user = null;
    await w.SoundStudio.checkOwner();
    assert.equal(w.document.getElementById('sound-studio-section').hidden, true);
    assert.match(w.document.getElementById('sound-studio-status').textContent, /[Ss]ign in with Google/);

    // The same page, now signed in with the owner account, asks again.
    w.OnlineSystem.linked = true;
    w.OnlineSystem.user = { id: 'owner-uid', getToken: async () => 'id-token' };
    const opened = await w.SoundStudio.open();
    assert.equal(opened, true);
    assert.equal(w.document.getElementById('sound-studio-section').hidden, false);
});

test('hearing the chosen sound speaks about that sound', async t => {
    const { w } = await ready(t);
    await w.SoundStudio.checkOwner();
    const target = w.document.getElementById('sound-studio-target');
    target.value = 'door';
    target.dispatchEvent(new w.Event('change'));
    w.document.getElementById('sound-studio-audition').click();
    await wait(30);
    assert.match(w.document.getElementById('sound-studio-status').textContent, /door/i);
});

test('a declined publish keeps the studio open and says what to fix', async t => {
    const { w } = await ready(t);
    await w.SoundStudio.checkOwner();
    w.document.getElementById('sound-studio-publish').click();
    await wait(30);
    assert.match(w.document.getElementById('sound-studio-status').textContent, /Choose a recorded file/i);
    assert.equal(w.document.getElementById('sound-studio-section').hidden, false);
    assert.equal(w.SoundStudio.isOwner, true);
});

test('the owner gets a one-press shortcut at the top of Settings, and nobody else does', async t => {
    const owner = await ready(t);
    await owner.w.SoundStudio.checkOwner();
    const shortcut = owner.w.document.getElementById('btn-open-sound-studio');
    assert.equal(shortcut.hidden, false, 'the owner sees the shortcut');
    assert.match(shortcut.textContent, /Sound Studio/);
    owner.w.document.getElementById('settings-panel').classList.add('hidden');
    shortcut.click();
    await wait(40);
    assert.equal(owner.w.document.getElementById('settings-panel').classList.contains('hidden'), false, 'the shortcut opens Settings');

    const guest = await ready(t, { owner: false });
    await guest.w.SoundStudio.checkOwner();
    assert.equal(guest.w.document.getElementById('btn-open-sound-studio').hidden, true, 'a non-owner never sees it');
});
