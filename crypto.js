/**
 * Mnemo Crypto Module — Blind Indexing
 * 
 * Client-side encryption with searchable blind indexes.
 * Mnemo server sees only encrypted content + hashes, never plaintext.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Key storage path
const KEY_PATH = path.join(require('os').homedir(), '.openclaw', 'mnemo.key');

/**
 * Generate or load encryption key
 * In production: use OS keychain, hardware security module, or user password
 */
function getOrCreateKey() {
  if (fs.existsSync(KEY_PATH)) {
    return fs.readFileSync(KEY_PATH);
  }
  
  // Generate new key
  const key = crypto.randomBytes(KEY_LENGTH);
  fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });
  fs.writeFileSync(KEY_PATH, key);
  fs.chmodSync(KEY_PATH, 0o600); // Owner read/write only
  console.log('[Mnemo Crypto] Generated new encryption key');
  return key;
}

/**
 * Derive HMAC key from encryption key
 */
function getHmacKey(encKey) {
  return crypto.createHmac('sha256', encKey).update('hmac-key-derivation').digest();
}

/**
 * Encrypt content and generate blind index
 * @param {string} content - Plaintext content
 * @param {Buffer} key - Encryption key
 * @returns {object} { ciphertext, iv, tag, blindIndexes }
 */
function encryptWithIndex(content, key) {
  // Encrypt content
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let ciphertext = cipher.update(content, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  // Generate blind indexes from keywords
  const keywords = extractKeywords(content);
  const hmacKey = getHmacKey(key);
  
  const blindIndexes = keywords.map(keyword => {
    return crypto.createHmac('sha256', hmacKey)
      .update(keyword.toLowerCase())
      .digest('hex');
  });
  
  return {
    ciphertext: ciphertext + tag.toString('hex'),
    iv: iv.toString('hex'),
    blindIndexes
  };
}

/**
 * Decrypt content
 * @param {string} ciphertext - Encrypted content + auth tag
 * @param {string} ivHex - IV as hex
 * @param {Buffer} key - Encryption key
 * @returns {string} Decrypted plaintext
 */
function decrypt(ciphertext, ivHex, key) {
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(ciphertext, 'hex');
  
  // Split ciphertext and auth tag
  const tag = encrypted.slice(-AUTH_TAG_LENGTH);
  const data = encrypted.slice(0, -AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  let plaintext = decipher.update(data, undefined, 'utf8');
  plaintext += decipher.final('utf8');
  
  return plaintext;
}

/**
 * Generate blind index for search query
 * @param {string} query - Search query
 * @param {Buffer} key - Encryption key
 * @returns {string} Blind index hash
 */
function generateQueryIndex(query, key) {
  const hmacKey = getHmacKey(key);
  return crypto.createHmac('sha256', hmacKey)
    .update(query.toLowerCase())
    .digest('hex');
}

/**
 * Extract keywords from content for indexing
 */
function extractKeywords(content) {
  const words = content.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);
  
  // Remove duplicates
  return [...new Set(words)];
}

/**
 * Check if encryption is enabled
 */
function isEncryptionEnabled() {
  return process.env.MNEMO_ENCRYPT === '1' || fs.existsSync(KEY_PATH);
}

/**
 * Enable encryption (generate key if needed)
 */
function enableEncryption() {
  process.env.MNEMO_ENCRYPT = '1';
  getOrCreateKey();
  console.log('[Mnemo Crypto] Encryption enabled');
}

module.exports = {
  getOrCreateKey,
  encryptWithIndex,
  decrypt,
  generateQueryIndex,
  extractKeywords,
  isEncryptionEnabled,
  enableEncryption
};