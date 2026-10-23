import { readFileSync } from 'node:fs';

const API = 'https://claimable.neon.tech/v1';
const secret = JSON.parse(readFileSync(process.env.NEON_SECRET_FILE || '/tmp/black-sword-neon-secrets.json', 'utf8'));
const database = new URL(secret.database_url).pathname.replace(/^\//, '');
if (!secret.project_id || !secret.branch_id || !database) throw new Error('Neon project, branch, or database name is missing.');

async function accessToken() {
    const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: secret.identity_assertion, resource: 'https://claimable.neon.tech/' });
    const response = await fetch(`${API}/oauth2/token`, {
        method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString()
    });
    const result = await response.json();
    if (!response.ok || !result.access_token) throw new Error(result?.error?.message || 'Neon token exchange failed.');
    return result.access_token;
}

let lastError;
for (let attempt = 1; attempt <= 4; attempt++) {
    try {
        const token = await accessToken();
        const path = `/projects/${encodeURIComponent(secret.project_id)}/branches/${encodeURIComponent(secret.branch_id)}/data-api/${encodeURIComponent(database)}`;
        const response = await fetch(`${API}${path}`, {
            method: 'PATCH',
            headers: { accept: 'application/json', authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: '{}'
        });
        const text = await response.text();
        let result;
        try { result = text ? JSON.parse(text) : {}; } catch { result = {}; }
        if (response.ok) {
            console.log(`Neon Data API schema cache refreshed for ${database}.`);
            process.exit(0);
        }
        lastError = new Error(result?.error?.message || `Schema refresh failed (${response.status}).`);
        if (!result?.error?.retryable && ![423, 503].includes(response.status)) break;
    } catch (error) {
        lastError = error;
    }
    if (attempt < 4) await new Promise(resolve => setTimeout(resolve, attempt * 2000));
}
throw new Error(`Neon Data API schema refresh failed: ${String(lastError?.message || lastError).replaceAll(secret.identity_assertion, '[identity assertion]')}`);
