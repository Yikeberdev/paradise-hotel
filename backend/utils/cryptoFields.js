const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const KEY = crypto
    .createHash('sha256')
    .update(String(process.env.ACCOUNT_ENCRYPTION_KEY || process.env.JWT_SECRET || 'paradise-hotel-account-key'))
    .digest();

function encryptField(plain) {
    if (plain === null || plain === undefined) return null;
    const text = String(plain);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, KEY, iv);
    const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // iv:tag:ciphertext in base64
    return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptField(payload) {
    if (payload === null || payload === undefined || payload === '') return null;
    try {
        const buf = Buffer.from(String(payload), 'base64');
        if (buf.length < 28) return String(payload); // not encrypted (legacy plain)
        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        const data = buf.subarray(28);
        const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
        decipher.setAuthTag(tag);
        const dec = Buffer.concat([decipher.update(data), decipher.final()]);
        return dec.toString('utf8');
    } catch (e) {
        // Legacy plaintext values
        return String(payload);
    }
}

function encryptBalance(n) {
    return encryptField(Number(n || 0).toFixed(2));
}

function decryptBalance(payload) {
    const v = decryptField(payload);
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
}

module.exports = { encryptField, decryptField, encryptBalance, decryptBalance };
