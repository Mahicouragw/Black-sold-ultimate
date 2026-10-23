/*
 * Provisions a Claimable Neon project (Postgres + Data API + Auth) without a
 * signup, stores the durable identity assertion and database password outside
 * the git tree, and hands the operator a live claim URL in this same run.
 *
 * Re-running with NEON_IDENTITY_ASSERTION + NEON_PROJECT_ID resumes the
 * existing project instead of creating a second one.
 */
import { request, tokenFor } from './neon-api.mjs';
import { PUBLIC_FILE, SECRET_FILE, assertSafeSecretPath, redact, writeSecretJSON } from './neon-secrets.mjs';
import { mintClaim } from './neon-claim.mjs';

const REGION = process.env.NEON_REGION || 'aws-ap-southeast-1';
const CAPABILITIES = ['postgres', 'data_api', 'auth'];

async function main() {
    assertSafeSecretPath(SECRET_FILE);
    assertSafeSecretPath(PUBLIC_FILE);

    let assertion = process.env.NEON_IDENTITY_ASSERTION || '';
    let projectId = process.env.NEON_PROJECT_ID || '';
    let project = null;
    let capabilities = [];

    if (!assertion || !projectId) {
        const registration = await request('/agent/identity', {
            method: 'POST',
            body: {
                type: 'anonymous',
                capabilities: CAPABILITIES,
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
        for (const required of CAPABILITIES) {
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
    writeSecretJSON(SECRET_FILE, secret);
    writeSecretJSON(PUBLIC_FILE, publicConfig);

    console.log(`Neon project ${projectId} is ready (branch ${secret.branch_id}, expires ${secret.expires_at || 'after claim'}).`);
    console.log(JSON.stringify(publicConfig, null, 2));

    // Requirement: the claim link is minted and printed in the same run that
    // creates the project. Schema work happens only after the human claims.
    const claim = await mintClaim({ secrets: secret });

    if (process.env.GITHUB_OUTPUT) {
        const { appendFileSync } = await import('node:fs');
        appendFileSync(process.env.GITHUB_OUTPUT, [
            `project_id=${projectId}`,
            `claim_url=${claim?.verification_uri_complete || ''}`,
            `project_expires_at=${secret.expires_at || ''}`,
            ''
        ].join('\n'));
    }
    console.log(`Stored the identity assertion and database password at ${SECRET_FILE} (0600) and the public configuration at ${PUBLIC_FILE}.`);
    console.log('Next: claim the project with the URL above, then run `npm run neon:migrate` and `npm run neon:verify`.');
}

main().catch(error => {
    console.error(`Neon provisioning failed: ${redact(error.message, [process.env.NEON_IDENTITY_ASSERTION])}`);
    process.exitCode = 1;
});
