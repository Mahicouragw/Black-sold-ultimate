/*
 * Single source of truth for where provisioning secrets live.
 *
 * The identity assertion and the project database password are the only way to
 * reach a Claimable Neon project before it is claimed and to recover an
 * unclaimed one afterwards. They therefore live OUTSIDE the git tree, in
 * ~/.black-sword-neon (0700), in a 0600 file. They are never written to the
 * repository, to .neon/, or to /tmp.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

export const REPO_ROOT = process.cwd();
export const SECRET_DIR = resolve(process.env.NEON_SECRET_DIR || join(homedir(), '.black-sword-neon'));
export const SECRET_FILE = resolve(process.env.NEON_SECRET_FILE || join(SECRET_DIR, 'secrets.json'));
export const PUBLIC_FILE = resolve(process.env.NEON_PUBLIC_FILE || join(SECRET_DIR, 'public.json'));
export const CLAIM_FILE = resolve(process.env.NEON_CLAIM_FILE || join(SECRET_DIR, 'claim.json'));
export const PRIVATE_KEY_FILE = resolve(process.env.NEON_PRIVATE_KEY_FILE || join(SECRET_DIR, 'handoff-private-key.pem'));

/** Refuse any path that would leak a credential into the repository or /tmp. */
export function assertSafeSecretPath(path) {
    const absolute = resolve(path);
    if (absolute === REPO_ROOT || absolute.startsWith(REPO_ROOT + sep)) {
        throw new Error(`Refusing to store Neon credentials inside the git tree (${absolute}). Use ~/.black-sword-neon/.`);
    }
    if (absolute === '/tmp' || absolute.startsWith('/tmp/') || absolute === '/var/tmp' || absolute.startsWith('/var/tmp/')) {
        throw new Error(`Refusing to store Neon credentials in a temporary directory (${absolute}). Use ~/.black-sword-neon/.`);
    }
    return absolute;
}

export function ensureSecretDir() {
    assertSafeSecretPath(SECRET_DIR);
    mkdirSync(SECRET_DIR, { recursive: true, mode: 0o700 });
    chmodSync(SECRET_DIR, 0o700);
}

export function writeSecretJSON(path, value) {
    assertSafeSecretPath(path);
    ensureSecretDir();
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    chmodSync(path, 0o600);
}

export function writeSecretFile(path, contents) {
    assertSafeSecretPath(path);
    ensureSecretDir();
    writeFileSync(path, contents, { mode: 0o600 });
    chmodSync(path, 0o600);
}

export function readJSONFile(path, label) {
    if (!existsSync(path)) throw new Error(`${label} not found at ${path}. Run "npm run neon:provision" (or neon:recover) first.`);
    return JSON.parse(readFileSync(path, 'utf8'));
}

export function readSecrets() {
    assertSafeSecretPath(SECRET_FILE);
    return readJSONFile(SECRET_FILE, 'Neon project credentials');
}

export function readPublicConfig() {
    return readJSONFile(PUBLIC_FILE, 'Neon public configuration');
}

/** Remove every copy of a known credential from a message before it is printed. */
export function redact(text, secrets = []) {
    let output = String(text ?? '');
    for (const value of secrets) {
        if (typeof value !== 'string' || value.length < 8) continue;
        output = output.split(value).join('[redacted]');
    }
    return output;
}
