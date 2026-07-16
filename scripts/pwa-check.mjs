import {readFile,access} from 'node:fs/promises';
for(const file of ['index.html','manifest.webmanifest','service-worker.js','icons/icon-192.png','icons/icon-512.png'])await access(file);
const manifest=JSON.parse(await readFile('manifest.webmanifest','utf8'));if(manifest.display!=='standalone'||manifest.icons.length<2)throw Error('Invalid PWA manifest');
const html=await readFile('index.html','utf8');if(!html.includes('manifest.webmanifest')||!html.includes('pwa.js'))throw Error('PWA not linked');
console.log('PWA manifest, icons, registration and service worker: PASS');
