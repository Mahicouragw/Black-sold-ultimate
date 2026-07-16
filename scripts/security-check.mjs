import {readdir,readFile} from 'node:fs/promises';import {join} from 'node:path';
const excluded=new Set(['node_modules','.git','android','ios','www']);const findings=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(excluded.has(e.name))continue;const p=join(dir,e.name);if(e.isDirectory())await walk(p);else if(/\.(js|json|html|sql|md)$/.test(e.name)){const s=await readFile(p,'utf8');for(const pattern of [/sb_secret_[A-Za-z0-9_-]+/g,/service_role["'\s:=]+[A-Za-z0-9._-]{20,}/gi,/-----BEGIN PRIVATE KEY-----/g,/ghp_[A-Za-z0-9]{20,}/g])for(const m of s.matchAll(pattern))findings.push(`${p}: ${m[0].slice(0,18)}…`);}}}
await walk('.');if(findings.length){console.error(findings.join('\n'));process.exit(1);}console.log('Secret scan: PASS');
