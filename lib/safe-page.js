'use strict';
// Public-web retrieval only. DNS is validated inside the socket lookup so there
// is no second, unchecked resolution between validation and connection.
const dns = require('node:dns');
const ipaddr = require('ipaddr.js');
const { Agent } = require('undici');
const MAX_BYTES = 256 * 1024;
function publicAddress(value) {
  try { const a=ipaddr.process(String(value).replace(/^\[|\]$/g,'')); return a.range()==='unicast'; } catch { return false; }
}
function blockedHost(host) {
  const h=String(host||'').toLowerCase().replace(/\.$/,'').replace(/^\[|\]$/g,'');
  if(!h||h==='localhost'||/\.(localhost|local|internal|test|invalid)$/.test(h))return true;
  if(ipaddr.isValid(h))return !publicAddress(h);
  return false;
}
function safeLookup(host, options, callback) {
  if(blockedHost(host))return callback(new Error('Destination not permitted'));
  dns.lookup(host,{all:true,verbatim:true},(error,addresses)=>{
    if(error)return callback(error);
    if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))return callback(new Error('Destination not permitted'));
    const filtered=options?.family?addresses.filter(a=>a.family===options.family):addresses;
    if(!filtered.length)return callback(new Error('No permitted address'));
    if(options?.all)return callback(null,filtered);
    callback(null,filtered[0].address,filtered[0].family);
  });
}
const dispatcher=new Agent({connect:{lookup:safeLookup},connections:4,keepAliveTimeout:1000,keepAliveMaxTimeout:1000});
async function safePage(url) {
  const signal=AbortSignal.timeout(8000);
  try{
    let parsed=new URL(url);
    for(let hops=0;hops<=3;hops++){
      if((parsed.protocol!=='http:'&&parsed.protocol!=='https:')||parsed.username||parsed.password||blockedHost(parsed.hostname)|| (parsed.port&&!['80','443'].includes(parsed.port)))return null;
      const response=await fetch(parsed.href,{signal,dispatcher,redirect:'manual',headers:{'User-Agent':'BlackSoulUltimate/7.25 (player-directed retrieval)','Accept':'text/html,text/plain;q=0.9'}});
      if([301,302,303,307,308].includes(response.status)){
        const location=response.headers.get('location');await response.body?.cancel();
        if(!location||hops===3)return null;
        parsed=new URL(location,parsed);continue;
      }
      const type=(response.headers.get('content-type')||'').toLowerCase();
      const length=Number(response.headers.get('content-length'));
      if(!response.ok||!['text/html','text/plain','application/xhtml+xml'].some(t=>type.startsWith(t))||length>MAX_BYTES){await response.body?.cancel();return null;}
      const reader=response.body?.getReader();if(!reader)return null;
      const chunks=[];let total=0;
      try {while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BYTES){await reader.cancel();return null;}chunks.push(Buffer.from(value));}}
      finally{reader.releaseLock();}
      return {url:parsed.href,html:Buffer.concat(chunks,total).toString('utf8')};
    }
  }catch{return null;}
  return null;
}
module.exports={safePage,blockedHost,publicAddress,safeLookup,MAX_BYTES};
