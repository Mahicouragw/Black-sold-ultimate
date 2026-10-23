/*
 * Optional secondary handoff channel.
 *
 * The claim URL is ALWAYS printed to the operator by scripts/neon-claim.mjs in
 * the run that creates the project. This script additionally publishes an
 * encrypted copy (claim URL + project-scoped credentials, sealed with the
 * committed RSA public key) to a pull request so a workspace that holds
 * ~/.black-sword-neon/handoff-private-key.pem can recover it later.
 *
 * The identity assertion and database password are never printed.
 */
import { execFileSync } from 'node:child_process';
import { encryptHandoff, publicKeyId } from './neon-crypto.mjs';
import { CLAIM_FILE, PUBLIC_FILE, SECRET_FILE, readJSONFile, readSecrets } from './neon-secrets.mjs';

const MARKER = '<!-- black-sword-neon-handoff-v1 -->';

function pullRequestNumber() {
    if (process.env.NEON_HANDOFF_PR_NUMBER) return Number(process.env.NEON_HANDOFF_PR_NUMBER);
    const repo = process.env.GITHUB_REPOSITORY;
    const sha = process.env.GITHUB_SHA;
    if (!repo || !sha) throw new Error('GitHub repository/commit context is missing.');
    const output = execFileSync('gh', ['api', `repos/${repo}/commits/${sha}/pulls`], { encoding: 'utf8' });
    const pulls = JSON.parse(output);
    const number = pulls.find(pull => pull.state === 'open')?.number || pulls[0]?.number;
    if (!number) throw new Error('Could not locate the pull request for the Neon handoff. Pass NEON_HANDOFF_PR_NUMBER.');
    return number;
}

const secret = readSecrets();
const publicConfig = readJSONFile(PUBLIC_FILE, 'Neon public configuration');
const claim = readJSONFile(CLAIM_FILE, 'Neon claim link');
const pr = pullRequestNumber();
const repo = process.env.GITHUB_REPOSITORY;
const keyId = publicKeyId();
const encrypted = encryptHandoff({ publicConfig, secret, claim });
const body = [
    MARKER,
    '## Black Sword Neon handoff',
    '',
    'The JSON below is public browser configuration only. The claim URL and project-scoped credentials are encrypted for the workspace-held RSA key. The claim link was printed in the provisioning run and is valid for 15 minutes.',
    '',
    `Handoff key id: \`${keyId}\` — decrypt with \`~/.black-sword-neon/handoff-private-key.pem\` using \`npm run neon:recover\`.`,
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
console.log(`Published public Neon configuration and the encrypted handoff to PR #${pr} (key id ${keyId}). ${SECRET_FILE} stays outside the repository.`);
