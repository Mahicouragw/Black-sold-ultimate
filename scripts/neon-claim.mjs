/*
 * Mints a Claimable Neon claim link and PRINTS THE FULL URL to the operator in
 * the same run that creates or recovers the project.
 *
 * Claim codes last 15 minutes; the unclaimed project lasts 72 hours. An expired
 * code is never a reason to provision again: run this script (or
 * `npm run neon:claim`) and it mints a fresh link from the stored assertion.
 */
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { request, tokenFor, API } from './neon-api.mjs';
import { CLAIM_FILE, readSecrets, writeSecretJSON, redact } from './neon-secrets.mjs';

const CLAIM_TTL_MINUTES = 15;

function printClaim(claim, secrets) {
    const url = claim.verification_uri_complete;
    const minutes = Math.max(1, Math.round(Number(claim.expires_in || CLAIM_TTL_MINUTES * 60) / 60));
    const lines = [
        '',
        '============================================================',
        ' CLAIM THIS NEON PROJECT NOW',
        '============================================================',
        ` ${url}`,
        '',
        ` The link expires in about ${minutes} minutes.`,
        ' Unclaimed projects are deleted 72 hours after creation.',
        ' Open the link, sign in to Neon, and accept the project.',
        ' If it expires, run `npm run neon:claim` again — do NOT',
        ' provision a new project.',
        '============================================================',
        ''
    ];
    console.log(redact(lines.join('\n'), [secrets.identity_assertion, secrets.database_url]));
    if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
            '### Claim this Neon project now',
            '',
            `**${url}**`,
            '',
            `Expires in about ${minutes} minutes. Projects are deleted 72 hours after creation if unclaimed.`,
            'If it expires, re-run `node scripts/neon-claim.mjs`; never re-provision.',
            ''
        ].join('\n'));
    }
    return url;
}

export async function mintClaim({ secrets = readSecrets(), persist = true } = {}) {
    const projectId = secrets.project_id;
    if (!projectId) throw new Error('No Neon project id is stored. Provision the project first.');
    const token = await tokenFor(secrets.identity_assertion);
    let claim;
    try {
        claim = await request(`/projects/${encodeURIComponent(projectId)}/claim`, { method: 'POST', token });
    } catch (error) {
        if (error.code === 'project_claimed' || error.status === 409) {
            console.log(`Neon project ${projectId} is already claimed. No claim link is needed.`);
            return null;
        }
        throw error;
    }
    if (!claim?.verification_uri_complete) throw new Error('Neon did not return a claim URL.');
    const enriched = { ...claim, project_id: projectId, minted_at: new Date().toISOString() };
    if (persist) writeSecretJSON(CLAIM_FILE, enriched);
    printClaim(enriched, secrets);
    return enriched;
}

/** Poll until the human completes the claim; never prints credentials. */
export async function waitForClaim({ secrets = readSecrets(), timeoutMs = 30 * 60 * 1000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let claim = await mintClaim({ secrets });
    if (!claim) return true;
    let mintedAt = Date.now();
    console.log('Waiting for the human to claim the project. No credentials are printed.');
    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, Math.max(5, Number(claim.interval || 5)) * 1000));
        try {
            const token = await tokenFor(secrets.identity_assertion);
            const status = await request(`/projects/${encodeURIComponent(secrets.project_id)}/claim`, { token });
            if (status.status === 'reconciled' || status.status === 'claimed') return true;
            if (status.status === 'pending' && Date.now() - mintedAt > 14 * 60 * 1000) {
                claim = await mintClaim({ secrets });
                mintedAt = Date.now();
                if (!claim) return true;
            }
        } catch (error) {
            if (error.code === 'project_claimed') return true;
            if (['project_expired', 'invalid_grant'].includes(error.code)) throw error;
            console.log(`Claim status temporarily unavailable: ${redact(error.message, [secrets.identity_assertion])}`);
        }
    }
    throw new Error('The claim was not completed in time. The project is still yours until its 72-hour expiry; re-run neon:claim to mint a fresh link.');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
    try {
        if (process.argv.includes('--wait')) await waitForClaim();
        else await mintClaim();
    } catch (error) {
        console.error(`Neon claim failed: ${redact(error.message, [process.env.NEON_IDENTITY_ASSERTION])}`);
        process.exitCode = 1;
    }
}
