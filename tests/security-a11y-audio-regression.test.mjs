import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const require=createRequire(import.meta.url);
const safe=require('../lib/safe-page.js'),dns=require('node:dns');

test('SSRF: IPv4, mapped IPv6, reserved networks and private DNS are rejected',async t=>{
 for(const host of ['127.0.0.1','10.1.2.3','169.254.169.254','[::1]','[::ffff:127.0.0.1]','fc00::1','fe80::1','100.64.0.1','192.0.2.1','224.0.0.1'])assert.equal(safe.publicAddress(host),false,host);
 assert.equal(safe.publicAddress('93.184.216.34'),true);
 t.mock.method(dns,'lookup',(host,opts,cb)=>cb(null,[{address:'10.0.0.2',family:4}]));
 await new Promise(resolve=>safe.safeLookup('rebind.example',{all:true},error=>{assert.ok(error);resolve();}));
});
test('SSRF: safe DNS result is the address supplied directly to the connector',async t=>{
 t.mock.method(dns,'lookup',(host,opts,cb)=>cb(null,[{address:'93.184.216.34',family:4}]));
 await new Promise(resolve=>safe.safeLookup('public.example',{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'93.184.216.34');assert.equal(family,4);resolve();}));
});
test('URL fetch blocks private redirects, credentials, oversized streams and failures',async t=>{
 let calls=0;
 t.mock.method(global,'fetch',async(url,opts)=>{calls++;assert.equal(opts.redirect,'manual');assert.ok(opts.dispatcher);return new Response(null,{status:302,headers:{location:'http://[::ffff:127.0.0.1]/secret'}});});
 assert.equal(await safe.safePage('https://example.com'),null);assert.equal(calls,1);
 assert.equal(await safe.safePage('https://user:pass@example.com'),null);assert.equal(calls,1);
 global.fetch=async()=>new Response('x'.repeat(safe.MAX_BYTES+1),{headers:{'content-type':'text/html'}});
 assert.equal(await safe.safePage('https://example.com'),null);
 global.fetch=async()=>{throw new Error('network unavailable');};assert.equal(await safe.safePage('https://example.com'),null);
});
test('API null payloads fail safely and private translations are not CDN-cached',async()=>{
 for(const file of ['npc','translate']){const handler=require('../api/'+file+'.js'),headers={};const res={setHeader:(k,v)=>headers[k]=v,end(s){this.body=s;}};await handler({method:'POST',headers:{},socket:{remoteAddress:'test-null'},body:'null'},res);assert.equal(res.statusCode,400);assert.equal(headers['Cache-Control'],'no-store');}
});
test('modal focus is contained, Escape calls cancel, and opener is restored',async()=>{
 const dom=new JSDOM('<body><button id="open">Open</button><main id="bg"><input></main><div id="dlg" role="dialog" aria-modal="true" hidden><button id="first">First</button><button data-dialog-cancel id="last">Cancel</button></div></body>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document,dlg=d.getElementById('dlg');d.getElementById('open').focus();
 w.eval(await readFile('accessible-dialogs.js','utf8'));d.getElementById('last').onclick=()=>dlg.hidden=true;dlg.hidden=false;await new Promise(r=>setTimeout(r,0));
 assert.equal(d.activeElement.id,'first');assert.equal(d.getElementById('bg').getAttribute('aria-hidden'),'true');
 d.getElementById('last').focus();d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(d.activeElement.id,'first');
 d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(d.activeElement.id,'open');assert.equal(d.getElementById('bg').hasAttribute('aria-hidden'),false);dom.window.close();
});
test('recorded transition replaces the old synthesized file and cache versions agree',async()=>{
 const credit=await readFile('AUDIO_CREDITS.md','utf8'),wav=await readFile('assets/audio/sfx/music-transition.wav');
 const row=credit.split('\n').find(l=>l.startsWith('| `assets/audio/sfx/music-transition.wav`'));
 assert.match(row,/artisticdude/);assert.match(row,/Not AI generated/);assert.ok(wav.length>10000);assert.equal(wav.subarray(0,4).toString(),'RIFF');assert.equal(await readFile('sw.js','utf8'),await readFile('service-worker.js','utf8'));
});
