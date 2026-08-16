import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, join } from 'node:path';

const manifest = JSON.parse(await readFile('assets/audio/audio-manifest.json', 'utf8'));
const credits = await readFile('AUDIO_CREDITS.md', 'utf8');
const musicSource = await readFile('music.js', 'utf8');
const supported = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac']);
const required = ['path', 'kind', 'title', 'creator', 'source', 'sourcePage', 'license', 'licenseUrl', 'licenseRequirements', 'attributionRequirements', 'attribution', 'dateAccessed'];
const issues = [];
const assets = manifest.assets || [];
const paths = new Set();
const basenames = new Set();

const signatureValid = async path => {
    const bytes = await readFile(path);
    const extension = extname(path).toLowerCase();
    if (extension === '.wav') return bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE';
    if (extension === '.ogg') return bytes.length >= 4 && bytes.subarray(0, 4).toString() === 'OggS';
    if (extension === '.mp3') return bytes.length >= 3 && (bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
    return bytes.length > 0;
};

for (const asset of assets) {
    for (const field of required) if (!String(asset[field] ?? '').trim()) issues.push({ check: 'missing-metadata', path: asset.path || '(unknown)', detail: field });
    if (paths.has(asset.path)) issues.push({ check: 'duplicate-path', path: asset.path });
    paths.add(asset.path);
    const filename = asset.path?.split('/').pop();
    if (basenames.has(filename)) issues.push({ check: 'duplicate-filename', path: asset.path, detail: filename });
    basenames.add(filename);
    if (!supported.has(extname(asset.path || '').toLowerCase())) issues.push({ check: 'unsupported-format', path: asset.path });
    try {
        const info = await stat(asset.path);
        if (!info.isFile() || info.size < 128) issues.push({ check: 'empty-or-invalid-file', path: asset.path, detail: `${info.size} bytes` });
        if (!(await signatureValid(asset.path))) issues.push({ check: 'invalid-file-signature', path: asset.path });
        if (asset.kind === 'music') {
            const bytes = await readFile(asset.path), digest = createHash('sha256').update(bytes).digest('hex');
            if (asset.bytes !== bytes.length) issues.push({ check: 'music-byte-count-mismatch', path: asset.path, detail: `${asset.bytes} != ${bytes.length}` });
            if (!/^[a-f0-9]{64}$/.test(asset.sha256 || '') || asset.sha256 !== digest) issues.push({ check: 'music-checksum-mismatch', path: asset.path, detail: digest });
        }
    } catch { issues.push({ check: 'missing-file', path: asset.path }); }
    if (!credits.includes(`\`${asset.path}\``)) issues.push({ check: 'missing-credit-entry', path: asset.path });
    if (!/^https:\/\//.test(asset.sourcePage || '') || !/^https:\/\//.test(asset.licenseUrl || '')) issues.push({ check: 'invalid-source-or-license-url', path: asset.path });
    if (!/CC0|CC BY|CC BY-SA/.test(asset.license || '')) issues.push({ check: 'unverified-license-label', path: asset.path, detail: asset.license });
}

const actual = [];
for (const directory of ['assets/audio/music', 'assets/audio/sfx']) {
    for (const name of await readdir(directory)) actual.push(join(directory, name).replaceAll('\\', '/'));
}
for (const path of actual) if (!paths.has(path)) issues.push({ check: 'orphaned-file-without-manifest', path });
for (const path of paths) if (!actual.includes(path)) issues.push({ check: 'orphaned-manifest-record', path });

// Every literal audio reference in shipped JS/HTML must resolve and be licensed.
const sourceFiles = (await readdir('.')).filter(name => /\.(js|html)$/.test(name));
const references = new Set();
for (const file of sourceFiles) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(/assets\/audio\/(?:music|sfx)\/[A-Za-z0-9._-]+/g)) references.add(match[0]);
}
for (const reference of references) {
    if (!paths.has(reference)) issues.push({ check: 'unlicensed-orphaned-reference', path: reference });
    try { await stat(reference); } catch { issues.push({ check: 'broken-audio-reference', path: reference }); }
}

// Playlist validation: parse the manager in a minimal VM-like browser and make
// sure each declared context has multiple unique, registered real tracks.
const musicKeys = new Set([...musicSource.matchAll(/^\s{12}([A-Za-z][A-Za-z0-9]*): \{ src: 'assets\/audio\/music\//gm)].map(match => match[1]));
const playlistBlock = musicSource.match(/this\.playlists = \{([\s\S]*?)\n        \};/);
if (!playlistBlock) issues.push({ check: 'missing-playlist-library', path: 'music.js' });
else {
    for (const match of playlistBlock[1].matchAll(/^\s{12}([A-Z0-9_]+): \[([^\]]+)\]/gm)) {
        const context = match[1];
        const tracks = [...match[2].matchAll(/'([^']+)'/g)].map(item => item[1]);
        if (new Set(tracks).size < 2) issues.push({ check: 'playlist-needs-multiple-tracks', path: `music.js#${context}` });
        for (const track of tracks) if (!musicKeys.has(track)) issues.push({ check: 'playlist-unknown-track', path: `music.js#${context}`, detail: track });
    }
}

const report = {
    status: issues.length ? 'FAIL' : 'PASS',
    generatedAt: new Date().toISOString(),
    manifestAssets: assets.length,
    actualAssets: actual.length,
    referencedAssets: references.size,
    musicAssets: assets.filter(asset => asset.kind === 'music').length,
    sfxAssets: assets.filter(asset => asset.kind === 'sfx').length,
    issues
};
await mkdir('reports', { recursive: true });
await writeFile('reports/audio-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Audio validation: ${report.status}`);
console.log(`${report.musicAssets} music files and ${report.sfxAssets} SFX files; ${report.referencedAssets} shipped references checked.`);
if (issues.length) {
    for (const issue of issues) console.error(`- ${issue.check}: ${issue.path}${issue.detail ? ` (${issue.detail})` : ''}`);
    process.exitCode = 1;
}
