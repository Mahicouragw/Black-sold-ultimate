import { createCipheriv, createDecipheriv, privateDecrypt, publicEncrypt, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function encryptHandoff(value, publicKeyPath = 'neon/handoff-public-key.pem') {
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
        version: 1,
        algorithm: 'RSA-OAEP-SHA256+A256GCM',
        key: publicEncrypt({ key: readFileSync(publicKeyPath), oaepHash: 'sha256' }, key).toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: encrypted.toString('base64')
    };
}

export function decryptHandoff(payload, privateKeyPath = '.neon/handoff-private-key.pem') {
    if (payload?.version !== 1) throw new Error('Unsupported Neon handoff encryption version.');
    const key = privateDecrypt({ key: readFileSync(privateKeyPath), oaepHash: 'sha256' }, Buffer.from(payload.key, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
}
