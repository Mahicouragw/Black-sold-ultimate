import {readFile,access} from 'node:fs/promises';
for(const file of ['index.html','manifest.webmanifest','service-worker.js','sw.js','icons/icon-192.png','icons/icon-512.png'])await access(file);
const manifest=JSON.parse(await readFile('manifest.webmanifest','utf8'));if(manifest.display!=='standalone'||manifest.icons.length<2)throw Error('Invalid PWA manifest');
const html=await readFile('index.html','utf8');if(!html.includes('manifest.webmanifest')||!html.includes('pwa.js'))throw Error('PWA not linked');
for(const swFile of ['sw.js', 'service-worker.js']){
  const content = await readFile(swFile, 'utf8');
  const matches = content.match(/['"]\/[^'"]+['"]/g) || [];
  for(const match of matches){
    const cleanPath = match.slice(2, -1);
    if(cleanPath && !cleanPath.startsWith('api/') && !cleanPath.includes('http') && cleanPath !== ''){
      await access(cleanPath);
    }
  }
}
console.log('PWA manifest, icons, precache assets, registration and service worker: PASS');
