import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { decryptHandoff, publicKeyId } from './neon-crypto.mjs';

const MARKER = '<!-- black-sword-neon-handoff-v1 -->';
const repo = process.env.GITHUB_REPOSITORY || 'Mahicouragw/Black-sold-ultimate';
const output = execFileSync('gh', ['api', `repos/${repo}/issues/comments?per_page=100&sort=created&direction=desc`], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const comments = JSON.parse(output);
const comment = comments.find(item => item.body?.includes(MARKER));
if (!comment) throw new Error('No encrypted Neon handoff comment was found.');
const match = comment.body.match(/```black-sword-neon-encrypted\s*([\s\S]*?)```/);
if (!match) throw new Error('The Neon handoff comment has no encrypted payload.');
const handoff = decryptHandoff(JSON.parse(match[1]));
mkdirSync('.neon', { recursive: true, mode: 0o700 });
writeFileSync('.neon/credentials.json', `${JSON.stringify(handoff.secret, null, 2)}\n`, { mode: 0o600 });
writeFileSync('.neon/public.json', `${JSON.stringify(handoff.publicConfig, null, 2)}\n`, { mode: 0o600 });
writeFileSync('.neon/claim.json', `${JSON.stringify(handoff.claim, null, 2)}\n`, { mode: 0o600 });

const mintedAt = Date.parse(handoff.claim.minted_at || '');
const claimSecondsLeft = Number.isFinite(mintedAt)
    ? Math.round((mintedAt + Number(handoff.claim.expires_in || 0) * 1000 - Date.now()) / 1000)
    : null;
console.log(JSON.stringify({
    key_id: publicKeyId(),
    project_id: handoff.publicConfig.project_id,
    branch_id: handoff.publicConfig.branch_id,
    project_expires_at: handoff.publicConfig.expires_at,
    auth_url: handoff.publicConfig.auth_url,
    data_api_url: handoff.publicConfig.data_api_url,
    claim_url: handoff.claim.verification_uri_complete,
    claim_minted_at: handoff.claim.minted_at,
    claim_expires_in_seconds: handoff.claim.expires_in,
    claim_seconds_left: claimSecondsLeft,
    claim_expired: claimSecondsLeft !== null && claimSecondsLeft <= 0,
    source_comment: comment.html_url
}, null, 2));
if (claimSecondsLeft !== null && claimSecondsLeft <= 0) {
    console.warn('The published claim code has expired. Mint a new one with the stored identity assertion before the project expiry.');
}
console.log('Saved .neon/credentials.json, .neon/public.json, and .neon/claim.json. Run "npm run neon:apply-config" to write the public configuration into backend-config.js.');
