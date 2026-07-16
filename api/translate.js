const cache = new Map();
const requests = new Map();
const languages = new Set(['en','de','fr','es','hi','it','pt','ja','ko','zh','ar','bn','ta','te','mr','ru','nl','pl','tr','uk','vi']);

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
  if(req.method!=='POST'){res.statusCode=405;return res.end(JSON.stringify({error:'POST required'}));}
  const ip=(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
  const now=Date.now(),bucket=(requests.get(ip)||[]).filter(t=>now-t<60000);if(bucket.length>=40){res.statusCode=429;return res.end(JSON.stringify({error:'Translation rate limit reached'}));}bucket.push(now);requests.set(ip,bucket);
  let body={};try{body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});}catch{res.statusCode=400;return res.end(JSON.stringify({error:'Invalid JSON'}));}const text=String(body.text||'').trim().slice(0,450),source=String(body.source||'en').slice(0,2).toLowerCase(),target=String(body.target||'en').slice(0,2).toLowerCase();
  if(!text||!languages.has(source)||!languages.has(target)){res.statusCode=400;return res.end(JSON.stringify({error:'Invalid text or language'}));}
  if(source===target)return res.end(JSON.stringify({text,translated:false,provider:'same-language'}));
  const key=`${source}|${target}|${text}`;if(cache.has(key))return res.end(JSON.stringify({...cache.get(key),cached:true}));
  let translated='';let provider='';
  try{const params=new URLSearchParams({q:text,langpair:`${source}|${target}`});const r=await fetch(`https://api.mymemory.translated.net/get?${params}`,{signal:AbortSignal.timeout(6000)});const d=await r.json();if(r.ok&&d.responseStatus===200&&d.responseData?.translatedText){translated=d.responseData.translatedText;provider='mymemory';}}catch{}
  if(!translated||translated.toLowerCase()===text.toLowerCase())try{const params=new URLSearchParams({client:'gtx',sl:source,tl:target,dt:'t',q:text});const r=await fetch(`https://translate.googleapis.com/translate_a/single?${params}`,{signal:AbortSignal.timeout(6000)});const d=await r.json();if(r.ok&&Array.isArray(d?.[0])){translated=d[0].map(x=>x?.[0]||'').join('');provider='google-fallback';}}catch{}
  const result={text:translated||text,translated:Boolean(translated&&translated!==text),provider:provider||'original-fallback'};cache.set(key,result);if(cache.size>2000)cache.delete(cache.keys().next().value);return res.end(JSON.stringify(result));
};
