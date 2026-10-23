import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SECRET_FILE = process.env.NEON_SECRET_FILE || '/tmp/black-sword-neon-secrets.json';
const PUBLIC_FILE = process.env.NEON_PUBLIC_FILE || '/tmp/black-sword-neon-public.json';
const secret = JSON.parse(readFileSync(SECRET_FILE, 'utf8'));
const publicConfig = JSON.parse(readFileSync(PUBLIC_FILE, 'utf8'));

function gh(args, input) {
    execFileSync('gh', args, {
        input,
        stdio: ['pipe', 'ignore', 'pipe'],
        env: { ...process.env, GH_PROMPT_DISABLED: '1' }
    });
}

try {
    gh(['secret', 'set', 'NEON_DATABASE_URL'], secret.database_url);
    gh(['secret', 'set', 'NEON_IDENTITY_ASSERTION'], secret.identity_assertion);
    for (const [name, value] of Object.entries({
        NEON_PROJECT_ID: publicConfig.project_id,
        NEON_BRANCH_ID: publicConfig.branch_id,
        NEON_PROJECT_EXPIRES_AT: publicConfig.expires_at,
        NEON_AUTH_BASE_URL: publicConfig.auth_url,
        NEON_DATA_API_URL: publicConfig.data_api_url,
        NEON_AUTH_JWKS_URL: publicConfig.jwks_url,
        NEON_PUBLIC_BASE_URL: publicConfig.public_base_url
    })) {
        if (value) gh(['variable', 'set', name], String(value));
    }
    console.log(`Stored project-scoped Neon credentials for ${publicConfig.project_id}. Secret values were not printed.`);
} catch (error) {
    console.error(`Could not store Neon credentials: ${error.message}`);
    process.exitCode = 1;
}
