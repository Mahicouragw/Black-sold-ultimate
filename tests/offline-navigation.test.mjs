import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

for (const worker of ['sw.js','service-worker.js']) {
    test(`${worker}: only the game entry can replace the offline shell`, async () => {
        const scope='https://example.test/game/', index=scope+'index.html';
        const entries=new Map([[index,'installed game'],[scope+'privacy.html','installed privacy']]);
        let handler, network, failWrite=false;
        const html=(body,status=200)=>new Response(body,{status,headers:{'content-type':'text/html; charset=utf-8'}});
        const cache={match:async key=>entries.has(key)?html(entries.get(key)):undefined,
            put:async(key,response)=>{if(failWrite)throw Error('quota');entries.set(key,await response.text());}};
        vm.runInNewContext(await readFile(new URL('../'+worker,import.meta.url),'utf8'),{
            URL,Response,caches:{open:async()=>cache},fetch:async()=>{if(!network)throw Error('offline');return network;},
            self:{registration:{scope},addEventListener(name,cb){if(name==='fetch')handler=cb;}}
        });
        function navigate(path){let result;handler({request:{url:new URL(path,scope).href,method:'GET',mode:'navigate'},respondWith(p){result=p;}});return result;}
        network=html('online privacy');assert.equal(await (await navigate('privacy.html')).text(),'online privacy');
        network=html('missing',404);assert.equal((await navigate('missing.html')).status,404);
        await navigate('index.html');
        network=new Response('not HTML');await navigate('./');
        network=html('login');Object.defineProperty(network,'redirected',{value:true});await navigate('./');
        network=null;assert.equal(await (await navigate('./?source=pwa')).text(),'installed game');
        assert.equal(await (await navigate('privacy.html?reader=1')).text(),'installed privacy');
        network=html('updated game');await navigate('./?source=pwa');
        network=null;assert.equal(await (await navigate('missing.html')).text(),'updated game');
        failWrite=true;network=html('online game');assert.equal(await (await navigate('index.html')).text(),'online game');
    });
}
