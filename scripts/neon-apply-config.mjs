/*
 * Writes the public Neon configuration (Auth URL, Data API URL, public base
 * URL) from a recovered handoff into backend-config.js. These values are
 * public by design: the browser uses them to reach Neon Auth and the Data API.
 * No database password, identity assertion, or provider secret is written.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const publicFile = process.env.NEON_PUBLIC_FILE || '.neon/public.json';
const configFile = process.env.NEON_CONFIG_FILE || 'backend-config.js';
const write = process.argv.includes('--write');

if (!existsSync(publicFile)) {
    console.error(`No recovered Neon public configuration at ${publicFile}. Run "npm run neon:recover" first.`);
    process.exit(1);
}

const publicConfig = JSON.parse(readFileSync(publicFile, 'utf8'));
for (const field of ['auth_url', 'data_api_url']) {
    let url;
    try { url = new URL(publicConfig[field]); } catch { throw new Error(`Neon ${field} is missing or invalid.`); }
    if (url.protocol !== 'https:') throw new Error(`Neon ${field} must use HTTPS.`);
}

const existing = readFileSync(configFile, 'utf8');
const googleClientId = existing.match(/googleClientId:\s*'([^']+)'/)?.[1]
    || '667382471552-n4du4avspd36504ne6226c6mlium6uko.apps.googleusercontent.com';
const config = {
    provider: 'neon',
    authUrl: publicConfig.auth_url,
    dataApiUrl: publicConfig.data_api_url,
    publicBaseUrl: publicConfig.public_base_url || '',
    authMode: 'redirect',
    googleClientId
};

for (const [field, value] of Object.entries(config)) {
    if (String(value).includes("'")) throw new Error(`Neon configuration field ${field} contains an unsupported quote character.`);
}
const source = `/* Public Neon browser configuration. Never put a database password or identity assertion here. */
window.BLACK_SWORD_BACKEND_CONFIG = Object.freeze({
    provider: '${config.provider}',
    authUrl: '${config.authUrl}',
    dataApiUrl: '${config.dataApiUrl}',
    publicBaseUrl: '${config.publicBaseUrl}',
    authMode: '${config.authMode}',
    googleClientId: '${config.googleClientId}'
});
`;
if (!write) {
    console.log(source);
    console.log('Dry run. Pass --write to update backend-config.js.');
} else {
    writeFileSync(configFile, source);
    console.log(`Updated ${configFile} with the Neon Auth and Data API URLs (project ${publicConfig.project_id || 'unknown'}).`);
}
