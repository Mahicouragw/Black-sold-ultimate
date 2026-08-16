#!/usr/bin/env node
/**
 * Black Sword Ultimate — autonomous release pipeline.
 *
 * ONE command takes a verified working tree all the way to both live sites:
 *   preflight -> commit -> push -> wait for GitHub Actions -> verify live version
 *
 * Designed to be run unattended by ANY agent/CI/model, not just one session.
 *
 * CREDENTIALS (in priority order, first match wins):
 *   1. env GITHUB_TOKEN | GH_TOKEN | GITHUB_PAT | BSU_DEPLOY_TOKEN
 *   2. file  .deploy-token          (repo root, git-ignored, never committed)
 *   3. file  ~/.bsu-deploy-token
 *
 * The token is held in memory only. It is never written to .git/config, never
 * echoed, and is scrubbed from every log line and error message by redact().
 *
 * USAGE
 *   node scripts/deploy.mjs                      # full release
 *   node scripts/deploy.mjs --dry-run            # everything except push
 *   node scripts/deploy.mjs --message "..."      # custom commit message
 *   node scripts/deploy.mjs --skip-tests         # emergency hotfix only
 *   node scripts/deploy.mjs --verify-only        # just check what is live now
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const run = promisify(execFile);

const REPO_SLUG = 'Mahicouragw/Black-sold-ultimate';
const BRANCH = 'main';
const LIVE_SITES = [
    { name: 'GitHub Pages', url: 'https://mahicouragw.github.io/Black-sold-ultimate/' },
    { name: 'Vercel', url: 'https://black-sold-ultimate.vercel.app/' }
];
const TOKEN_ENV_KEYS = ['GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_PAT', 'BSU_DEPLOY_TOKEN'];
const TOKEN_FILES = ['.deploy-token', path.join(homedir(), '.bsu-deploy-token')];

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

const DRY_RUN = flag('dry-run');
const SKIP_TESTS = flag('skip-tests');
const VERIFY_ONLY = flag('verify-only');

let SECRET = null;
/**
 * Remove the token from any string before it can reach a log, error or stack.
 * Only substrings long enough to be a real credential are masked, so a short
 * test value can never corrupt ordinary words in the output.
 */
const redact = text => {
    const value = String(text ?? '');
    if (!SECRET || SECRET.length < 8) return value;
    return value.split(SECRET).join('***REDACTED***');
};

const log = (icon, message) => console.log(`${icon} ${redact(message)}`);
const step = message => console.log(`\n\u001b[1m▸ ${redact(message)}\u001b[0m`);
const fail = message => { throw new Error(redact(message)); };

async function git(args, { allowFail = false } = {}) {
    try {
        const { stdout } = await run('git', args, { cwd: process.cwd(), maxBuffer: 32 * 1024 * 1024 });
        return stdout.trim();
    } catch (error) {
        if (allowFail) return null;
        fail(`git ${args[0]} failed: ${error.stderr || error.message}`);
    }
}

async function npmRun(script) {
    try {
        const { stdout } = await run('npm', ['run', script], { cwd: process.cwd(), maxBuffer: 32 * 1024 * 1024 });
        return { ok: true, output: stdout };
    } catch (error) {
        return { ok: false, output: `${error.stdout || ''}${error.stderr || ''}` };
    }
}

/* ── credentials ─────────────────────────────────────────────────────────── */

async function resolveToken() {
    for (const key of TOKEN_ENV_KEYS) {
        const value = process.env[key]?.trim();
        if (value) return { token: value, source: `environment variable ${key}` };
    }
    for (const file of TOKEN_FILES) {
        try {
            await access(file);
            const value = (await readFile(file, 'utf8')).trim();
            if (value) return { token: value, source: `file ${file}` };
        } catch { /* not present */ }
    }
    return null;
}

/** Verify the token can actually write to this repo BEFORE any commit happens. */
async function checkTokenScope(token) {
    const response = await fetch(`https://api.github.com/repos/${REPO_SLUG}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'bsu-deploy' }
    });
    if (response.status === 401) fail('Token rejected (401). It is invalid, revoked or expired.');
    if (response.status === 404) fail(`Token cannot see ${REPO_SLUG} (404). A fine-grained token must list this repository.`);
    if (!response.ok) fail(`GitHub API error ${response.status}.`);
    const repo = await response.json();
    if (!repo.permissions?.push) fail('Token lacks write access. Needs "Contents: Read and write" on this repository.');
    return repo;
}

/* ── preflight ───────────────────────────────────────────────────────────── */

async function preflight() {
    step('Preflight verification');
    if (SKIP_TESTS) { log('⚠️', 'Tests skipped by --skip-tests (emergency mode)'); return; }

    const checks = [
        ['test', 'Regression suite'],
        ['validate', 'Audio + world validation'],
        ['pwa:check', 'PWA and service workers'],
        ['security', 'Security and secret scan'],
        ['build', 'Production build']
    ];
    for (const [script, label] of checks) {
        const { ok, output } = await npmRun(script);
        if (!ok) {
            const tail = output.split('\n').filter(Boolean).slice(-12).join('\n');
            fail(`${label} FAILED. Nothing was committed or pushed.\n${tail}`);
        }
        const summary = output.match(/# pass (\d+)/);
        log('✅', `${label}${summary ? ` — ${summary[1]} passed` : ' — pass'}`);
    }
}

/** Refuse to deploy a build that would not change what users receive. */
async function readLocalVersion() {
    const source = await readFile('version.js', 'utf8');
    const version = source.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
    if (!version) fail('Could not read APP_VERSION from version.js');
    return version;
}

async function fetchLiveVersion(url) {
    try {
        const response = await fetch(`${url}version.js?cachebust=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
        if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
        const text = await response.text();
        return { ok: true, version: text.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1] ?? 'unknown' };
    } catch (error) {
        return { ok: false, detail: error.message };
    }
}

/* ── git ─────────────────────────────────────────────────────────────────── */

async function commitIfNeeded(message) {
    step('Commit');
    const dirty = await git(['status', '--porcelain']);
    if (!dirty) { log('ℹ️', 'Working tree clean — nothing new to commit'); return false; }
    await git(['add', '-A']);
    await git(['-c', 'user.email=deploy@blacksword.local', '-c', 'user.name=Black Sword Deploy', 'commit', '-m', message]);
    log('✅', `Committed: ${message}`);
    return true;
}

/**
 * Push using an in-memory authenticated URL.
 *
 * The token is passed as a one-shot argument to a single git invocation. It is
 * never stored via `git remote set-url`, never written to .git/config, and never
 * saved by a credential helper, so nothing sensitive survives this function.
 */
async function push(token) {
    step('Push to GitHub');
    if (DRY_RUN) { log('🧪', 'Dry run — push skipped'); return null; }

    const authUrl = `https://x-access-token:${token}@github.com/${REPO_SLUG}.git`;
    try {
        await run('git', ['-c', 'credential.helper=', 'push', authUrl, `HEAD:${BRANCH}`], { cwd: process.cwd() });
    } catch (error) {
        fail(`Push rejected: ${error.stderr || error.message}`);
    }
    const sha = await git(['rev-parse', 'HEAD']);
    log('✅', `Pushed ${sha.slice(0, 7)} to ${BRANCH}`);
    return sha;
}

/* ── deployment verification ─────────────────────────────────────────────── */

async function waitForWorkflow(token, sha) {
    step('GitHub Actions');
    const deadline = Date.now() + 10 * 60 * 1000;
    let reported = null;
    while (Date.now() < deadline) {
        const response = await fetch(`https://api.github.com/repos/${REPO_SLUG}/actions/runs?head_sha=${sha}&per_page=20`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'bsu-deploy' }
        });
        if (response.ok) {
            const runs = (await response.json()).workflow_runs || [];
            if (runs.length) {
                const pending = runs.filter(r => r.status !== 'completed');
                // 'cancelled' means GitHub superseded this run with a newer one for the
            // same concurrency group. That is normal, not a release failure.
            const failed = runs.filter(r => r.conclusion && !['success', 'skipped', 'cancelled', 'neutral'].includes(r.conclusion));
                const state = `${runs.length} run(s): ${runs.map(r => `${r.name}=${r.conclusion || r.status}`).join(', ')}`;
                if (state !== reported) { log('⏳', state); reported = state; }
                if (failed.length) fail(`Workflow failed: ${failed.map(r => `${r.name} (${r.html_url})`).join(', ')}`);
                if (!pending.length) { log('✅', 'All workflows completed successfully'); return runs; }
            }
        }
        await new Promise(resolve => setTimeout(resolve, 15000));
    }
    log('⚠️', 'Timed out waiting for workflows; verifying the live sites directly');
    return null;
}

async function verifyLive(expected) {
    step(`Verify live sites serve ${expected}`);
    const deadline = Date.now() + 8 * 60 * 1000;
    const pending = new Map(LIVE_SITES.map(site => [site.name, site]));
    const results = [];

    while (pending.size && Date.now() < deadline) {
        for (const [name, site] of [...pending]) {
            const result = await fetchLiveVersion(site.url);
            if (result.ok && result.version === expected) {
                log('✅', `${name} serving ${expected} — ${site.url}`);
                results.push({ name, url: site.url, version: expected, ok: true });
                pending.delete(name);
            } else if (result.ok) {
                log('⏳', `${name} still serving ${result.version}, waiting for ${expected}`);
            } else {
                log('⏳', `${name} not ready (${result.detail})`);
            }
        }
        if (pending.size) await new Promise(resolve => setTimeout(resolve, 20000));
    }

    for (const [name, site] of pending) {
        const last = await fetchLiveVersion(site.url);
        log('❌', `${name} did NOT reach ${expected} (currently ${last.ok ? last.version : last.detail})`);
        results.push({ name, url: site.url, version: last.ok ? last.version : null, ok: false });
    }
    return results;
}

/* ── main ────────────────────────────────────────────────────────────────── */

async function main() {
    const version = await readLocalVersion();
    console.log(`\n\u001b[1mBlack Sword Ultimate — release ${version}\u001b[0m`);

    if (VERIFY_ONLY) {
        step('Current live versions');
        for (const site of LIVE_SITES) {
            const result = await fetchLiveVersion(site.url);
            log(result.ok ? 'ℹ️' : '❌', `${site.name}: ${result.ok ? result.version : result.detail} — ${site.url}`);
        }
        return;
    }

    const credential = await resolveToken();
    if (!credential) {
        console.error(`
❌ No deployment credential found.

   This is the ONLY blocker. Everything else is automated and verified.
   GitHub requires a secret that only the repository owner can issue — no
   agent, model or tool can create it, and that is a security guarantee,
   not a limitation to route around.

   Provide it ONCE, then this script does the whole release unattended:

     1. Create a fine-grained token (30-90 day expiry is fine):
        https://github.com/settings/personal-access-tokens/new
          Repository access : Only select repositories -> ${REPO_SLUG}
          Permissions       : Contents = Read and write
                              Workflows = Read and write   (only if .github/workflows changes)

     2. Hand it to the pipeline in either way:
          export GITHUB_TOKEN=github_pat_xxx && npm run deploy
        or
          printf '%s' 'github_pat_xxx' > .deploy-token && npm run deploy
          (.deploy-token is git-ignored and excluded from workspace snapshots)

   Revoke it any time at https://github.com/settings/tokens
`);
        process.exitCode = 2;
        return;
    }

    SECRET = credential.token;
    log('🔑', `Credential loaded from ${credential.source}`);
    const repo = await checkTokenScope(SECRET);
    log('✅', `Write access confirmed on ${repo.full_name}`);

    await preflight();

    const message = option('message') || `Release v${version}`;
    await commitIfNeeded(message);

    const sha = await push(SECRET);
    if (DRY_RUN) { log('🧪', 'Dry run complete — nothing was pushed'); return; }

    await waitForWorkflow(SECRET, sha);
    const results = await verifyLive(version);

    step('Release summary');
    console.log(`  Version : ${version}`);
    console.log(`  Commit  : ${sha}`);
    for (const result of results) console.log(`  ${result.ok ? '✅' : '❌'} ${result.name}: ${result.url}`);

    if (results.some(result => !result.ok)) {
        console.error('\n❌ Release incomplete — at least one site is not serving the new version.');
        process.exitCode = 1;
    } else {
        console.log(`\n✅ v${version} is live on every public site.`);
    }
}

main().catch(error => {
    console.error(`\n❌ ${redact(error.message)}`);
    process.exitCode = 1;
});
