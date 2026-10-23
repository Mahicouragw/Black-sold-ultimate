import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { encryptHandoff } from './neon-crypto.mjs';

const API = 'https://claimable.neon.tech/v1';
const MARKER = '<!-- black-sword-neon-handoff-v1 -->';
const secret = JSON.parse(readFileSync(process.env.NEON_SECRET_FILE || '/tmp/black-sword-neon-secrets.json', 'utf8'));
const publicConfig = JSON.parse(readFileSync(process.env.NEON_PUBLIC_FILE || '/tmp/black-sword-neon-public.json', 'utf8'));
const wait = process.argv.includes('--wait');
const deadline = Date.now() + Number(process.env.NEON_CLAIM_WAIT_MS || 30 * 60 * 1000);

async function request(path, { method = 'GET', token } = {}) {
    const response = await fetch(`${API}${path}`, { method, headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : {}; } catch { result = {}; }
    if (!response.ok) {
        const error = new Error(result?.error?.message || `Neon claim request failed (${response.status}).`);
        error.code = result?.error?.code;
        throw error;
    }
    return result;
}

async function tokenFor(assertion) {
    const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion, resource: 'https://claimable.neon.tech/' });
    const response = await fetch(`${API}/oauth2/token`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });
    const result = await response.json();
    if (!response.ok || !result.access_token) throw new Error(result?.error?.message || 'Neon token exchange failed.');
    return result.access_token;
}

function pullRequestNumber() {
    if (process.env.NEON_HANDOFF_PR_NUMBER) return Number(process.env.NEON_HANDOFF_PR_NUMBER);
    const repo = process.env.GITHUB_REPOSITORY;
    const sha = process.env.GITHUB_SHA;
    if (!repo || !sha) throw new Error('GitHub repository/commit context is missing.');
    const output = execFileSync('gh', ['api', `repos/${repo}/commits/${sha}/pulls`], { encoding: 'utf8' });
    const pulls = JSON.parse(output);
    const number = pulls[0]?.number;
    if (!number) throw new Error('Could not locate the pull request for the Neon handoff.');
    return number;
}

async function publish(claim) {
    const pr = pullRequestNumber();
    const repo = process.env.GITHUB_REPOSITORY;
    const encrypted = encryptHandoff({ publicConfig, secret, claim });
    const body = [
        MARKER,
        '## Black Sword Neon handoff',
        '',
        'The JSON below is public browser configuration only. The claim URL and project-scoped credentials are encrypted for the workspace-held RSA key; they are not printed in Actions logs.',
        '',
        '```json',
        JSON.stringify(publicConfig, null, 2),
        '```',
        '',
        '```black-sword-neon-encrypted',
        JSON.stringify(encrypted),
        '```'
    ].join('\n');
    execFileSync('gh', ['api', `repos/${repo}/issues/${pr}/comments`, '-f', `body=${body}`], { stdio: ['ignore', 'ignore', 'pipe'] });
    console.log(`Published public Neon configuration and encrypted claim handoff to PR #${pr}.`);
}

async function mintClaim() {
    const token = await tokenFor(secret.identity_assertion);
    const claim = await request(`/projects/${encodeURIComponent(secret.project_id)}/claim`, { method: 'POST', token });
    if (!claim.verification_uri_complete || !claim.expires_in) throw new Error('Neon did not return a usable claim URL.');
    const enriched = { ...claim, minted_at: new Date().toISOString() };
    await publish(enriched);
    return { claim: enriched, mintedAt: Date.now() };
}

try {
    let current = await mintClaim();
    if (wait) {
        console.log('Waiting for the human claim; no database credentials will be logged.');
        let claimed = false;
        while (Date.now() < deadline && !claimed) {
            await new Promise(resolve => setTimeout(resolve, Math.max(5, Number(current.claim.interval || 5)) * 1000));
            try {
                const token = await tokenFor(secret.identity_assertion);
                const status = await request(`/projects/${encodeURIComponent(secret.project_id)}/claim`, { token });
                if (status.status === 'reconciled') { claimed = true; break; }
                if (status.status === 'pending' && Date.now() - current.mintedAt > 14 * 60 * 1000) {
                    current = await mintClaim();
                }
            } catch (error) {
                if (error.code === 'project_claimed') { claimed = true; break; }
                if (error.code === 'project_expired' || error.code === 'invalid_grant') throw error;
                console.log(`Claim status is temporarily unavailable: ${error.message}`);
            }
        }
        if (!claimed) throw new Error('Claim was not completed during this run; the unclaimed project remains subject to its 72-hour expiry.');
        console.log('Neon project claim reconciled successfully.');
    }
} catch (error) {
    console.error(`Neon handoff failed: ${String(error.message).replaceAll(secret.identity_assertion, '[identity assertion]').replaceAll(secret.database_url, '[database credentials]')}`);
    process.exitCode = 1;
}
