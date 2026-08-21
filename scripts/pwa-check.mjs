import { readFile, access } from 'node:fs/promises';

for (const file of ['index.html', 'manifest.webmanifest', 'service-worker.js', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) await access(file);
const manifest = JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
if (manifest.display !== 'standalone' || manifest.icons.length < 2) throw Error('Invalid PWA manifest');
if (!manifest.start_url.startsWith('./') || manifest.scope !== './') throw Error('Manifest must use a relative GitHub Pages-safe start URL and scope');
const pagesBase = new URL('https://mahicouragw.github.io/Black-sold-ultimate/');
if (!new URL(manifest.start_url, pagesBase).pathname.startsWith('/Black-sold-ultimate/')) throw Error('Manifest escapes the GitHub Pages project base path');

const html = await readFile('index.html', 'utf8');
if (!html.includes('manifest.webmanifest') || !html.includes('pwa.js')) throw Error('PWA not linked');
if (!html.includes('world-navigation-v27.js')) throw Error('Final world graph normalizer is not deployed');
if (!html.includes('stabilization-v7211.js')) throw Error('v7.21.1 stabilization module is not deployed');
if (!html.includes('chat-notice-feedback-v7221.js')) throw Error('v7.22.1 chat notice / feedback module is not deployed');
const version = await readFile('version.js', 'utf8');
if (!version.includes("APP_VERSION = '7.24.1'")) throw Error('Application version is stale');
const registration = await readFile('pwa.js', 'utf8');
if (registration.includes("register('/") || !registration.includes("new URL('sw.js',document.baseURI)")) throw Error('Service worker registration is not base-path safe');

for (const swFile of ['sw.js', 'service-worker.js']) {
    const content = await readFile(swFile, 'utf8');
    if (content.includes("const CORE=['/")) throw Error(`${swFile} contains root-absolute precache paths`);
    const block = content.match(/const CORE=\[([\s\S]*?)\];/)?.[1];
    if (!block) throw Error(`${swFile} has no static CORE list`);
    const paths = [...block.matchAll(/'([^']*)'/g)].map(match => match[1]);
    for (const path of paths) {
        if (path.startsWith('/')) throw Error(`${swFile} escapes deployment base: ${path}`);
        if (path) await access(path);
    }
    for (const required of ['world-navigation-v27.js', 'stabilization-v7211.js', 'chat-notice-feedback-v7221.js', 'assets/audio/audio-manifest.json', 'AUDIO_CREDITS.md', 'music.js', 'assets/audio/music/town-theme-rpg.mp3', 'assets/audio/music/natural-forest-theme.mp3', 'assets/audio/music/battle-theme-a.mp3', 'assets/audio/music/boss-battle-theme.mp3', 'assets/audio/music/final-boss-theme.ogg']) {
        if (!paths.includes(required)) throw Error(`${swFile} does not precache ${required}`);
    }
    if (!content.includes("black-sword-v7.24.1")) throw Error(`${swFile} cache version is stale`);
}
console.log('PWA manifest, relative GitHub Pages base, Vercel root, icons, precache assets, registration and service workers: PASS');
