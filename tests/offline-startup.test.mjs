import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkOfflineStartup} from '../scripts/check-offline-startup.mjs';

test('built startup check rejects an uncached module dependency or a missing shipped script', async t=>{
    const dir=await mkdtemp(join(tmpdir(),'offline-build-'));
    t.after(()=>rm(dir,{recursive:true,force:true}));
    const put=(name,text)=>writeFile(join(dir,name),text);
    const worker=paths=>`self.addEventListener('install', e=>e.waitUntil(caches.open('test').then(c=>c.addAll(${JSON.stringify(paths)}.map(p=>new URL(p,self.registration.scope).href)))));`;
    await put('index.html','<script src="https://auth.example/sdk.js"></script><script type="module" src="main.js"></script><script src="classic.js"></script>');
    await put('main.js',"import './nested.js';"); await put('nested.js','console.log(1)'); await put('classic.js','');
    const paths=['main.js','classic.js','nested.js'];
    await put('sw.js',worker(paths)); await put('service-worker.js',worker(paths.slice(0,2)));
    await assert.rejects(checkOfflineStartup(dir),/service-worker.js.*nested.js/);
    await put('service-worker.js',worker(paths)); assert.equal(await checkOfflineStartup(dir),3);
    await rm(join(dir,'classic.js')); await assert.rejects(checkOfflineStartup(dir),/classic.js/);
});
