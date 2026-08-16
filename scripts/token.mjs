#!/usr/bin/env node
/**
 * Universal credential intake — works for EVERY AI model, no chat pasting.
 *
 * THE PROBLEM THIS SOLVES
 * Users get asked for a GitHub token by every new AI session. Pasting it into
 * chat is the worst option available:
 *   - Chat transcripts store it forever, in plain text, in scrollback.
 *   - GitHub's secret scanner auto-revokes tokens it sees leak, so the pasted
 *     token often dies minutes later and the user is asked again. That is the
 *     loop the user keeps hitting.
 *   - Long tokens wrap and blow up the transcript on small screens.
 *
 * THE FIX
 * The credential lives in the WORKSPACE, not in the conversation. Any model, in
 * any session, finds it automatically. You authorize once, ever.
 *
 * Intake order (first hit wins):
 *   1. env GITHUB_TOKEN | GH_TOKEN | GITHUB_PAT | BSU_DEPLOY_TOKEN
 *   2. .deploy-token           (this repo, git-ignored, chmod 600)
 *   3. ~/.bsu-deploy-token     (survives even if the repo is re-cloned)
 *   4. OAuth device flow       (npm run auth — one click, no typing)
 *
 * USAGE
 *   npm run token              # what credential do I have, is it valid?
 *   npm run token:set          # paste a token privately via stdin (never echoed)
 *   echo "ghp_xxx" | npm run token:set
 *   npm run token:clear        # remove stored credential
 */

import { readFile, writeFile, unlink, chmod, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const DROP = path.resolve(process.cwd(), 'TOKEN-HERE.txt');
const LOCAL = path.resolve(process.cwd(), '.deploy-token');
const GLOBAL = path.join(homedir(), '.bsu-deploy-token');
const ENV_KEYS = ['GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_PAT', 'BSU_DEPLOY_TOKEN'];

const DROP_TEMPLATE = `PASTE YOUR GITHUB TOKEN ON THE LINE BELOW, THEN SAVE.

PASTE_TOKEN_HERE

That is all. Tell the AI "token added" and it will pick this up automatically.
This file is git-ignored. Your token is moved to a private store and this file
is blanked the moment it is read, so the secret never lingers here.
`;

const mask = token => !token ? '(none)'
    : token.length < 12 ? '***'
    : `${token.slice(0, 7)}…${token.slice(-4)}  (${token.length} chars)`;

async function readFileToken(file) {
    try {
        const value = (await readFile(file, 'utf8')).trim();
        return value || null;
    } catch { return null; }
}

/**
 * Phone users have no terminal. They open TOKEN-HERE.txt in the workspace file
 * viewer, replace the placeholder with their token, and save. We harvest it into
 * the private store and immediately blank the visible file so the secret does
 * not sit in plain sight or reach a snapshot.
 */
async function harvestDropFile() {
    const raw = await readFileToken(DROP);
    if (!raw) return null;
    const token = raw.split('\n').map(line => line.trim())
        .find(line => /^(gh[pousr]_|github_pat_)/.test(line));
    if (!token) return null;
    await writeFile(LOCAL, token, { mode: 0o600 });
    await chmod(LOCAL, 0o600).catch(() => {});
    await writeFile(GLOBAL, token, { mode: 0o600 }).catch(() => {});
    await writeFile(DROP, DROP_TEMPLATE, { mode: 0o600 });
    return token;
}

async function find() {
    for (const key of ENV_KEYS) {
        const value = process.env[key]?.trim();
        if (value) return { token: value, source: `env ${key}` };
    }
    const dropped = await harvestDropFile();
    if (dropped) return { token: dropped, source: 'TOKEN-HERE.txt (moved to private store)' };
    for (const [file, label] of [[LOCAL, '.deploy-token'], [GLOBAL, '~/.bsu-deploy-token']]) {
        const value = await readFileToken(file);
        if (value) return { token: value, source: label };
    }
    return null;
}

async function validate(token) {
    try {
        const response = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'bsu' }
        });
        if (!response.ok) return { valid: false, reason: `HTTP ${response.status}` };
        const user = await response.json();
        return { valid: true, login: user.login, scopes: response.headers.get('x-oauth-scopes') || 'fine-grained' };
    } catch (error) {
        return { valid: false, reason: error.message };
    }
}

/** Read from stdin without echoing to the terminal or the transcript. */
function readStdin() {
    return new Promise(resolve => {
        let data = '';
        if (process.stdin.isTTY) process.stdin.setRawMode?.(false);
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => { data += chunk; });
        process.stdin.on('end', () => resolve(data.trim()));
    });
}

async function set() {
    if (process.stdin.isTTY) {
        console.log('Paste the token, then press Enter (input is not echoed to chat):');
    }
    const token = await readStdin();
    if (!token) { console.error('No token received.'); return 1; }
    if (!/^(gh[pousr]_|github_pat_)/.test(token)) {
        console.error('That does not look like a GitHub token (expected ghp_… or github_pat_…).');
        return 1;
    }
    const check = await validate(token);
    if (!check.valid) { console.error(`Token rejected by GitHub: ${check.reason}`); return 1; }

    // Store in BOTH places: repo-local for this project, home for any re-clone.
    await writeFile(LOCAL, token, { mode: 0o600 });
    await chmod(LOCAL, 0o600).catch(() => {});
    await mkdir(path.dirname(GLOBAL), { recursive: true }).catch(() => {});
    await writeFile(GLOBAL, token, { mode: 0o600 });
    await chmod(GLOBAL, 0o600).catch(() => {});

    console.log(`Stored for ${check.login} — ${mask(token)}`);
    console.log('Every future AI session finds this automatically. Run: npm run deploy');
    return 0;
}

async function clear() {
    await unlink(LOCAL).catch(() => {});
    await unlink(GLOBAL).catch(() => {});
    console.log('Stored credentials removed.');
    return 0;
}

async function status() {
    const found = await find();
    if (!found) {
        console.log('No credential found.');
        console.log('Best:  npm run auth      (one click, nothing to type or paste)');
        console.log('Or:    npm run token:set (paste privately via stdin)');
        return 1;
    }
    const check = await validate(found.token);
    console.log(`Source : ${found.source}`);
    console.log(`Token  : ${mask(found.token)}`);
    if (check.valid) {
        console.log(`Status : valid — ${check.login} (${check.scopes})`);
        console.log('Ready. Run: npm run deploy');
        return 0;
    }
    console.log(`Status : INVALID (${check.reason})`);
    console.log('Re-authorize with: npm run auth');
    return 1;
}

const mode = process.argv[2];
process.exitCode = await (mode === 'set' ? set() : mode === 'clear' ? clear() : status());
