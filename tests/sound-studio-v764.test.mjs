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
