import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { decryptHandoff } from './neon-crypto.mjs';

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
console.log(JSON.stringify({
    project_id: handoff.publicConfig.project_id,
    branch_id: handoff.publicConfig.branch_id,
    project_expires_at: handoff.publicConfig.expires_at,
    claim_url: handoff.claim.verification_uri_complete,
    claim_minted_at: handoff.claim.minted_at,
    claim_expires_in: handoff.claim.expires_in,
    source_comment: comment.html_url
}, null, 2));
