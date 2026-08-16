import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const phase = (process.argv[2] || 'after').toLowerCase();
if (!['before', 'after'].includes(phase)) throw new Error('Usage: node scripts/generate-audio-inventory.mjs before|after');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = async path => {
    const bytes = await readFile(path);
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
};

const musicDir = 'assets/audio/music';
const musicFiles = [];
for (const name of (await readdir(musicDir)).sort()) {
    const path = join(musicDir, name).replaceAll('\\', '/');
    if ((await stat(path)).isFile()) musicFiles.push(await hashFile(path));
}

const manifestBytes = await readFile('assets/audio/audio-manifest.json');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const creditsBytes = await readFile('AUDIO_CREDITS.md');
const credits = creditsBytes.toString('utf8');
const musicSourceBytes = await readFile('music.js');
const musicSource = musicSourceBytes.toString('utf8');

const registry = [];
for (const match of musicSource.matchAll(/^\s{12}([A-Za-z][A-Za-z0-9]*): \{ src: '([^']+)', title: '([^']+)' \}/gm)) {
    registry.push({ key: match[1], path: match[2], title: match[3] });
}
const playlists = {};
const playlistBlock = musicSource.match(/this\.playlists = \{([\s\S]*?)\n        \};/)?.[1] || '';
for (const match of playlistBlock.matchAll(/^\s{12}([A-Z0-9_]+): \[([^\]]+)\]/gm)) {
    playlists[match[1]] = [...match[2].matchAll(/'([^']+)'/g)].map(item => item[1]);
}

const musicManifest = (manifest.assets || []).filter(asset => asset.kind === 'music');
const creditEntries = credits.split('\n').filter(line => line.includes('`assets/audio/music/'));
const output = {
    schemaVersion: 1,
    phase,
    generatedAt: new Date().toISOString(),
    generatedFor: manifest.generatedFor || null,
    totals: {
        files: musicFiles.length,
        bytes: musicFiles.reduce((sum, file) => sum + file.bytes, 0),
        manifestRecords: musicManifest.length,
        registryTracks: registry.length,
        playlists: Object.keys(playlists).length,
        creditEntries: creditEntries.length
    },
    hashes: {
        audioManifestSha256: sha256(manifestBytes),
        audioCreditsSha256: sha256(creditsBytes),
        musicSourceSha256: sha256(musicSourceBytes)
    },
    files: musicFiles,
    registry,
    playlists,
    manifestRecords: musicManifest,
    creditEntries
};

await mkdir('reports', { recursive: true });
const destination = `reports/audio-music-${phase}-v7.21.1.json`;
await writeFile(destination, JSON.stringify(output, null, 2) + '\n');
console.log(`${phase} music inventory: ${musicFiles.length} files, ${musicManifest.length} manifest records, ${Object.keys(playlists).length} playlists -> ${destination}`);
