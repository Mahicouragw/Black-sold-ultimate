#!/usr/bin/env node
/**
 * GitHub OAuth Device Flow — browserless authorization for agents/CI.
 *
 * Solves the "an AI agent cannot push" problem without anyone hand-crafting a
 * personal access token. The agent asks GitHub for a device code, shows the user
 * ONE clickable link plus a short code, and polls while the user authorizes in
 * their own browser. GitHub then hands the agent a real access token.
 *
 * Why this is the correct mechanism (RFC 8628):
 *   - The agent never sees the password, 2FA, or session cookie.
 *   - The user authorizes on github.com, under their own eyes, and sees exactly
 *     which scopes are being granted.
 *   - Authorization can be revoked instantly at any time.
 *   - The token lands in the sandbox only AFTER an explicit human approval.
 *
 * Uses the GitHub CLI's public client_id. Device-flow clients are public by
 * design (RFC 8628 §5.6): there is no client secret, and the code is worthless
 * until a human approves it on github.com.
 *
 * USAGE
 *   node scripts/github-auth.mjs            # authorize, save token, print status
 *   node scripts/github-auth.mjs --json     # machine-readable handoff
 *   node scripts/github-auth.mjs --status   # is a saved token still valid?
 *   node scripts/github-auth.mjs --logout   # delete the saved token
 */

import { writeFile, readFile, unlink, chmod } from 'node:fs/promises';
import path from 'node:path';

// GitHub CLI's public device-flow client. No secret exists for this client type.
const CLIENT_ID = process.env.BSU_OAUTH_CLIENT_ID || '178c6fc778ccc68e1d6a';
const SCOPES = 'repo workflow';
const TOKEN_FILE = path.resolve(process.cwd(), '.deploy-token');

const args = process.argv.slice(2);
const has = name => args.includes(`--${name}`);
const JSON_MODE = has('json');

const out = (...parts) => { if (!JSON_MODE) console.log(...parts); };

async function githubPost(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'bsu-deploy' },
        body: JSON.stringify(body)
    });
    return response.json();
}

async function tokenIdentity(token) {
    const response = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'bsu-deploy' }
    });
    if (!response.ok) return null;
    return {
        login: (await response.json()).login,
        scopes: response.headers.get('x-oauth-scopes') || ''
    };
}

async function saveToken(token) {
    await writeFile(TOKEN_FILE, token, { mode: 0o600 });
    await chmod(TOKEN_FILE, 0o600).catch(() => {});
}

/* ── modes ───────────────────────────────────────────────────────────────── */

async function status() {
    let token = process.env.GITHUB_TOKEN?.trim();
    let source = 'environment';
    if (!token) {
        try { token = (await readFile(TOKEN_FILE, 'utf8')).trim(); source = TOKEN_FILE; } catch { /* none */ }
    }
    if (!token) {
        if (JSON_MODE) console.log(JSON.stringify({ authorized: false }));
        else out('Not authorized. Run: npm run auth');
        return 1;
    }
    const identity = await tokenIdentity(token);
    if (!identity) {
        if (JSON_MODE) console.log(JSON.stringify({ authorized: false, reason: 'token rejected' }));
        else out('Saved token is no longer valid. Run: npm run auth');
        return 1;
    }
    if (JSON_MODE) console.log(JSON.stringify({ authorized: true, user: identity.login, scopes: identity.scopes, source }));
    else out(`Authorized as ${identity.login} (scopes: ${identity.scopes || 'device-flow default'})`);
    return 0;
}

async function logout() {
    await unlink(TOKEN_FILE).catch(() => {});
    out('Saved token deleted. Also revoke the grant at:');
    out('  https://github.com/settings/connections/applications/' + CLIENT_ID);
    return 0;
}

async function authorize() {
    const start = await githubPost('https://github.com/login/device/code', { client_id: CLIENT_ID, scope: SCOPES });
    if (start.error || !start.device_code) {
        const message = start.error_description || start.error || 'unknown error';
        if (JSON_MODE) console.log(JSON.stringify({ ok: false, error: message }));
        else console.error(`Could not start device authorization: ${message}`);
        return 1;
    }

    const { device_code, user_code, verification_uri, expires_in } = start;
    // Prefilled link: the code is already filled in, so one click is enough.
    const directLink = `${verification_uri}?skip_account_picker=true&user_code=${encodeURIComponent(user_code)}`;

    if (JSON_MODE) {
        console.log(JSON.stringify({ ok: true, user_code, verification_uri, direct_link: directLink, expires_in }));
    } else {
        out('');
        out('  ┌──────────────────────────────────────────────┐');
        out(`  │   CODE:  ${user_code.padEnd(36)}│`);
        out('  └──────────────────────────────────────────────┘');
        out('');
        out(`  Open: ${directLink}`);
        out(`  Expires in ${Math.floor(expires_in / 60)} minutes. Waiting for approval...`);
        out('');
    }

    const deadline = Date.now() + expires_in * 1000;
    let interval = (start.interval || 5) * 1000;

    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, interval));
        const result = await githubPost('https://github.com/login/oauth/access_token', {
            client_id: CLIENT_ID,
            device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        });

        if (result.access_token) {
            await saveToken(result.access_token);
            const identity = await tokenIdentity(result.access_token);
            if (JSON_MODE) console.log(JSON.stringify({ ok: true, authorized: true, user: identity?.login }));
            else {
                out(`  Authorized as ${identity?.login ?? 'user'}.`);
                out(`  Token saved to ${TOKEN_FILE} (git-ignored, mode 600).`);
            }
            return 0;
        }

        switch (result.error) {
            case 'authorization_pending': break;                 // user has not finished yet
            case 'slow_down': interval += 5000; break;           // back off as instructed
            case 'expired_token':
                if (JSON_MODE) console.log(JSON.stringify({ ok: false, error: 'expired' }));
                else console.error('  Code expired before approval. Run the command again.');
                return 1;
            case 'access_denied':
                if (JSON_MODE) console.log(JSON.stringify({ ok: false, error: 'denied' }));
                else console.error('  Authorization was denied.');
                return 1;
            default:
                if (result.error) {
                    if (JSON_MODE) console.log(JSON.stringify({ ok: false, error: result.error }));
                    else console.error(`  ${result.error_description || result.error}`);
                    return 1;
                }
        }
    }

    if (JSON_MODE) console.log(JSON.stringify({ ok: false, error: 'timeout' }));
    else console.error('  Timed out waiting for approval.');
    return 1;
}

const mode = has('status') ? status : has('logout') ? logout : authorize;
process.exitCode = await mode();
