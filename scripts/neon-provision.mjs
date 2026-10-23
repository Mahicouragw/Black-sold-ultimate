import { writeFileSync } from 'node:fs';

const API = 'https://claimable.neon.tech/v1';
const SECRET_FILE = process.env.NEON_SECRET_FILE || '/tmp/black-sword-neon-secrets.json';
const PUBLIC_FILE = process.env.NEON_PUBLIC_FILE || '/tmp/black-sword-neon-public.json';
const REGION = process.env.NEON_REGION || 'aws-ap-southeast-1';

async function request(path, { method = 'GET', token, body, form = false } = {}) {
    const response = await fetch(`${API}${path}`, {
        method,
        headers: {
            accept: 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {})
        },
        body: body ? (form ? body.toString() : JSON.stringify(body)) : undefined
    });
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : {}; } catch { result = { error: { message: 'Neon returned an invalid response.' } }; }
    if (!response.ok) {
        const error = new Error(result?.error?.message || `Neon request failed (${response.status}).`);
        error.code = result?.error?.code;
        error.retryable = Boolean(result?.error?.retryable);
        throw error;
    }
    return result;
}

async function tokenFor(assertion) {
    const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
        resource: 'https://claimable.neon.tech/'
    });
    const result = await request('/oauth2/token', { method: 'POST', body, form: true });
    if (!result.access_token) throw new Error('Neon did not return an access token.');
    return result.access_token;
}

async function main() {
    let assertion = process.env.NEON_IDENTITY_ASSERTION || '';
    let projectId = process.env.NEON_PROJECT_ID || '';
    let project = null;
    let capabilities = [];

    if (!assertion || !projectId) {
        const registration = await request('/agent/identity', {
            method: 'POST',
            body: {
                type: 'anonymous',
                capabilities: ['postgres', 'data_api', 'auth'],
                source: 'black-sword-ultimate-arena',
                region_id: REGION
            }
        });
        assertion = registration.identity_assertion;
        project = registration.project;
        projectId = project?.id;
        capabilities = registration.capabilities || [];
        if (!assertion || !projectId || !project?.branch_id || !project?.expires_at) {
            throw new Error('Neon registration was incomplete; no project credentials were retained.');
        }
        for (const required of ['postgres', 'data_api', 'auth']) {
            const capability = capabilities.find(item => item.capability === required);
            if (!capability?.granted) throw new Error(`Neon did not grant the required ${required} capability.`);
        }
    }

    const accessToken = await tokenFor(assertion);
    const credentials = await request(`/projects/${encodeURIComponent(projectId)}/credentials`, { token: accessToken });
    const authUrl = credentials?.services?.auth?.base_url;
    const dataApiUrl = credentials?.services?.data_api?.url;
    const jwksUrl = credentials?.services?.auth?.jwks_url;
    if (!credentials.database_url || !authUrl || !dataApiUrl || !jwksUrl) {
        throw new Error('Neon credentials are missing the database, Auth, or Data API URL.');
    }
    const database = new URL(credentials.database_url);
    const publicBaseUrl = `https://${database.hostname}${database.pathname}`;
    const secret = {
        project_id: projectId,
        branch_id: project?.branch_id || process.env.NEON_BRANCH_ID || credentials.branch_id,
        expires_at: project?.expires_at || process.env.NEON_PROJECT_EXPIRES_AT || credentials.expires_at,
        identity_assertion: assertion,
        database_url: credentials.database_url
    };
    const publicConfig = {
        project_id: secret.project_id,
        branch_id: secret.branch_id,
        expires_at: secret.expires_at,
        region_id: project?.region_id || process.env.NEON_REGION || REGION,
        auth_url: authUrl,
        data_api_url: dataApiUrl,
        jwks_url: jwksUrl,
        public_base_url: publicBaseUrl,
        capabilities
    };
    writeFileSync(SECRET_FILE, `${JSON.stringify(secret, null, 2)}\n`, { mode: 0o600 });
    writeFileSync(PUBLIC_FILE, `${JSON.stringify(publicConfig, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(publicConfig, null, 2));
}

main().catch(error => {
    console.error(`Neon provisioning failed: ${error.message}`);
    process.exitCode = 1;
});
