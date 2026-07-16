import {cp,mkdir,rm,readdir,copyFile} from 'node:fs/promises';
import {extname,join} from 'node:path';
const root=new URL('../',import.meta.url),out=new URL('../www/',import.meta.url);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const allowed=new Set(['.html','.css','.js','.webmanifest']);
for(const entry of await readdir(root,{withFileTypes:true})){
  if(entry.isFile()&&allowed.has(extname(entry.name))&&!['capacitor.config.json'].includes(entry.name))await copyFile(new URL(`../${entry.name}`,import.meta.url),new URL(`../www/${entry.name}`,import.meta.url));
}
for(const dir of ['assets','icons'])await cp(new URL(`../${dir}`,import.meta.url),new URL(`../www/${dir}`,import.meta.url),{recursive:true});
console.log('Capacitor web assets prepared in www/');
