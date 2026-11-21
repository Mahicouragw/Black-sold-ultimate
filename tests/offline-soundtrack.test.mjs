import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
for(const file of ['sw.js','service-worker.js'])test(`${file}: failed music is optional and retryable`,async()=>{
    const listeners={},saved=new Set(),attempts=[],messages=[];
    let fail=true,job;
    const scope='https://game.test/play/';
    const cache={async addAll(urls){assert.ok(urls.some(u=>u.includes('/sfx/')));assert.ok(!urls.some(u=>u.includes('/music/')));},
        match:url=>saved.has(url),async add(url){attempts.push(url);if(fail&&url.endsWith('battle.ogg'))throw Error('offline');saved.add(url);}};
    vm.runInNewContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),{URL,caches:{open:async()=>cache},
        self:{registration:{scope},addEventListener:(n,f)=>listeners[n]=f,skipWaiting(){}}});
    const waitUntil=p=>job=p;
    listeners.install({waitUntil});await job;assert.equal(attempts.length,0);
    const request=async()=>{listeners.message({waitUntil,data:'download-soundtrack',ports:[{postMessage:m=>messages.push(m)}]});await job;};
    await request();const {total,saved:count,done}=messages.at(-1);assert.ok(done);assert.equal(count,total-1);
    const manifest=JSON.parse(await readFile(new URL('../assets/audio/audio-manifest.json',import.meta.url)));
    assert.deepEqual(new Set(attempts),new Set(manifest.assets.filter(a=>a.kind==='music').map(a=>scope+a.path)));
    attempts.length=0;fail=false;await request();assert.deepEqual(attempts,[scope+'assets/audio/music/battle.ogg']);assert.equal(messages.at(-1).saved,total);
});

for(const file of ['sw.js','service-worker.js'])test(`${file}: checking storage works offline and never downloads tracks`,async()=>{
    const scope='https://game.test/play/', listeners={}, replies=[];
    let exists=false, broken=false;
    const keys=new Set([scope+'assets/audio/music/battle.ogg',scope+'unrelated.ogg']);
    const caches={has:async()=>exists,open:async()=>{
        assert.ok(exists,'must not create an empty cache');
        if(broken)throw Error('unavailable');
        return {keys:async()=>[...keys].map(url=>({url}))};
    }};
    vm.runInNewContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),{URL,caches,self:{registration:{scope},addEventListener:(n,f)=>listeners[n]=f}});
    const check=async()=>{let job;listeners.message({data:'check-soundtrack',ports:[{postMessage:m=>replies.push(m)}],waitUntil:p=>job=p});await job;return replies.at(-1);};
    assert.equal((await check()).saved,0);
    exists=true;assert.equal((await check()).saved,1);
    keys.clear();assert.equal((await check()).saved,0);
    broken=true;assert.equal((await check()).error,'storage');
});

for(const file of ['sw.js','service-worker.js'])test(`${file}: removing music preserves other apps and the game shell`,async()=>{
    const scope='https://game.test/play/', music=`black-sword:${scope}:music-v1`;
    const retained=[`black-sword:${scope}:shell:current`,'black-sword:https://game.test/other/:music-v1'];
    const names=new Set([...retained,music]),listeners={};
    vm.runInNewContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),{URL,
        caches:{delete:async key=>names.delete(key)},self:{registration:{scope},addEventListener:(n,f)=>listeners[n]=f}});
    for(let i=0;i<2;i++){
        let job,reply;
        listeners.message({data:'remove-soundtrack',ports:[{postMessage:m=>reply=m}],waitUntil:p=>job=p});
        await job;assert.equal(reply.saved,0);assert.ok(reply.done);assert.deepEqual([...names],retained);
    }
});
