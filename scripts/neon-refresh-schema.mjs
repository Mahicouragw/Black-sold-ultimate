import { API, tokenFor } from './neon-api.mjs';
import { readSecrets, redact } from './neon-secrets.mjs';

const secret = readSecrets();
const database = new URL(secret.database_url).pathname.replace(/^\//, '');
if (!secret.project_id || !secret.branch_id || !database) throw new Error('Neon project, branch, or database name is missing.');


let lastError;
for (let attempt = 1; attempt <= 4; attempt++) {
    try {
        const token = await tokenFor(secret.identity_assertion);
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
throw new Error(`Neon Data API schema refresh failed: ${redact(lastError?.message || lastError, [secret.identity_assertion, secret.database_url])}`);
