/*
 * Generates the RSA key pair that protects the Claimable Neon handoff.
 *
 * The public key is committed (neon/handoff-public-key.pem) and used by the
 * GitHub Actions provisioning job to encrypt the claim URL and project-scoped
 * credentials. The private key stays in the gitignored workspace directory
 * (.neon/handoff-private-key.pem) and is required by `npm run neon:recover`.
 *
 * Rotating the key invalidates every previously published handoff, so this
 * script refuses to overwrite an existing pair unless --force is passed.
 */
import { generateKeyPairSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { keyIdFor } from './neon-crypto.mjs';

const PUBLIC_PATH = process.env.NEON_PUBLIC_KEY_FILE || 'neon/handoff-public-key.pem';
const PRIVATE_PATH = process.env.NEON_PRIVATE_KEY_FILE || '.neon/handoff-private-key.pem';
const force = process.argv.includes('--force');

if (existsSync(PUBLIC_PATH) || existsSync(PRIVATE_PATH)) {
    if (!force) {
        const keyId = existsSync(PUBLIC_PATH) ? keyIdFor(readFileSync(PUBLIC_PATH)) : 'unknown';
        console.error(`A Neon handoff key pair already exists (${PUBLIC_PATH}, key id ${keyId}).`);
        console.error('Refusing to replace it: rotating the key makes every published handoff unreadable.');
        console.error('Pass --force only if you intend to discard the previous claim links.');
        process.exit(1);
    }
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

mkdirSync(dirname(PUBLIC_PATH), { recursive: true });
mkdirSync(dirname(PRIVATE_PATH), { recursive: true, mode: 0o700 });
writeFileSync(PUBLIC_PATH, publicKey, { mode: 0o644 });
writeFileSync(PRIVATE_PATH, privateKey, { mode: 0o600 });
chmodSync(PRIVATE_PATH, 0o600);

console.log('Neon handoff key pair generated.');
console.log(`Public key:  ${PUBLIC_PATH}`);
console.log(`Private key: ${PRIVATE_PATH} (gitignored — keep it with the workspace)`);
console.log(`Key id:      ${keyIdFor(publicKey)}`);
