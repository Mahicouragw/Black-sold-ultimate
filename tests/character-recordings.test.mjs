import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime} from '../scripts/load-world.mjs';

test('talk selects the named actor, keeps the transcript and respects mute', async t => {
    const {window:w,dom} = await createRuntime(); t.after(()=>dom.window.close());
    const g=w.Game, clips=[];
    w.Audio=class { constructor(src){this.src=src;} play(){clips.push(this);return Promise.resolve();} pause(){this.paused=true;} };
    const lines=[['Merchant Aldric','Welcome to my shop, traveler!'],['Palace Courier','I carry dispatches between the entrance hall and the library.']];
    g.roomNpcs=()=>lines.map(([name,line])=>({name,dialog:[line]}));
    g.npcDialog=n=>n.dialog[0]; w.CharacterRecordings.bind();
    for(const [name,line] of lines){g.talkToNPC(name);assert.ok(w.document.querySelector('#narrative').textContent.includes(line));}
    assert.deepEqual(clips.map(c=>c.src),['assets/voices/aldric-welcome.mp3','assets/voices/courier-route.mp3']);
    assert.equal(clips[0].paused,true);
    w.document.querySelector('#setting-character-recordings').click();g.talkToNPC('Merchant Aldric');
    assert.equal(clips[1].paused,true);assert.equal(clips.length,2);
});

test('every named world speaker has its own playable scripted lines, including the reputation suffix', async t => {
    const {window:w,dom}=await createRuntime();t.after(()=>dom.window.close());
    const {readFile}=await import('node:fs/promises');
    const actors=new Map();let clip;
    w.Audio=class {constructor(src){this.src=src;clip=this;} play(){return Promise.resolve();} pause(){} };
    w.CharacterRecordings.bind();
    for(const npc of Object.values(w.WorldData.npcs).flat()) for(const text of npc.dialog){
        assert.equal(w.CharacterRecordings.play(npc.name,text+' Your deeds are already spoken of across the city.'),true,`${npc.name}: ${text}`);
        const prefix=clip.src.slice(0,clip.src.lastIndexOf('-'));
        assert.ok(!actors.has(prefix)||actors.get(prefix)===npc.name,'actor shared between characters');actors.set(prefix,npc.name);
        assert.ok((await readFile(clip.src)).length>1000);
        clip.onended();assert.equal(clip.src,prefix+'-deeds.mp3');assert.ok((await readFile(clip.src)).length>1000);
    }
    assert.ok(actors.size>=55);
});
