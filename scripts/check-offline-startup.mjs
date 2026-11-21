import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

// Inspect the shipped page and observe the actual worker install request, not a
// second list of expected filenames. A project subpath catches root-only URLs.
export async function checkOfflineStartup(dir) {
    const base = new URL('https://preview.invalid/game/');
    const html = await readFile(join(dir, 'index.html'), 'utf8');
    const dom = new JSDOM(html, { url: base.href });
    const required = new Set(), modules = [];
    try {
        for (const script of dom.window.document.querySelectorAll('script[src]')) {
            const url = new URL(script.src);
            if (url.origin !== base.origin) continue; // remote sign-in SDKs are online-only
            if (!url.href.startsWith(base.href)) throw Error(`Startup script outside app scope: ${url}`);
            url.hash = '';
            required.add(url.href);
            if (script.type === 'module') modules.push(decodeURIComponent(url.pathname.slice(base.pathname.length)));
        }
    } finally { dom.window.close(); }
    if (modules.length) {
        const { metafile } = await build({absWorkingDir:dir, entryPoints:modules, bundle:true, write:false,
            format:'esm', outdir:'unused', metafile:true, logLevel:'silent'});
        for (const path of Object.keys(metafile.inputs)) required.add(new URL(path, base).href);
    }
    for (const href of required) {
        const path = decodeURIComponent(new URL(href).pathname.slice(base.pathname.length));
        if (!(await stat(join(dir, path))).isFile()) throw Error(`Missing built script: ${path}`);
    }
    for (const file of ['sw.js','service-worker.js']) {
        const cached = new Set();
        let install, done;
        vm.runInNewContext(await readFile(join(dir,file),'utf8'), { URL,
            self:{registration:{scope:base.href},skipWaiting(){},addEventListener(type,fn){if(type==='install') install=fn;}},
            caches:{async open(){return {async addAll(urls){for(const url of urls) cached.add(url);}};}}
        });
        install({waitUntil(promise){done=promise;}}); await done;
        const missing = [...required].filter(url => !cached.has(url));
        if (missing.length) throw Error(`${file} install misses startup scripts: ${missing.map(url=>url.slice(base.href.length)).join(', ')}`);
    }
    return required.size;
}
