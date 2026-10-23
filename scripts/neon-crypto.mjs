import { createDecipheriv, createCipheriv, createHash, createPrivateKey, createPublicKey, privateDecrypt, publicEncrypt, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Stable, non-secret identifier for the committed handoff public key. */
export function keyIdFor(key) {
    let publicKey;
    if (typeof key === 'string' || Buffer.isBuffer(key)) {
        const text = key.toString();
        publicKey = text.includes('-----BEGIN')
            ? createPublicKey({ key: text, format: 'pem' })
            : createPublicKey({ key, format: 'der', type: 'spki' });
    } else if (key?.type === 'private') {
        publicKey = createPublicKey(key);
    } else if (key?.type === 'public') {
        publicKey = key;
    } else {
        publicKey = createPublicKey(key);
    }
    return createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('base64url').slice(0, 16);
}

export function publicKeyId(publicKeyPath = 'neon/handoff-public-key.pem') {
    return keyIdFor(readFileSync(publicKeyPath));
}

export function encryptHandoff(value, publicKeyPath = 'neon/handoff-public-key.pem') {
    let publicKey;
    try {
        publicKey = createPublicKey(readFileSync(publicKeyPath));
    } catch (error) {
        throw new Error(`The Neon handoff public key is unreadable at ${publicKeyPath}. Run "npm run neon:keygen" first. (${error.message})`);
    }
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
        version: 2,
        algorithm: 'RSA-OAEP-SHA256+A256GCM',
        key_id: keyIdFor(publicKey),
        key: publicEncrypt({ key: publicKey, oaepHash: 'sha256' }, key).toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: encrypted.toString('base64')
    };
}

export function decryptHandoff(payload, privateKeyPath = process.env.NEON_PRIVATE_KEY_FILE
    || join(homedir(), '.black-sword-neon', 'handoff-private-key.pem')) {
    if (payload?.version !== 2) throw new Error('Unsupported Neon handoff encryption version.');
    let privateKey;
    try {
        privateKey = createPrivateKey(readFileSync(privateKeyPath));
    } catch (error) {
        throw new Error(`The Neon handoff private key is missing at ${privateKeyPath}. Restore the key that matches key id ${payload.key_id}. (${error.message})`);
    }
    const keyId = keyIdFor(privateKey);
    if (payload.key_id && payload.key_id !== keyId) {
        throw new Error(`This handoff was encrypted for key ${payload.key_id}, but the local private key is ${keyId}.`);
    }
    const key = privateDecrypt({ key: privateKey, oaepHash: 'sha256' }, Buffer.from(payload.key, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
}
