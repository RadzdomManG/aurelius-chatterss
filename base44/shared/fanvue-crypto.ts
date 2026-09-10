// Shared AES-256-GCM encryption/decryption for Fanvue tokens
// Used by fanvue-auth, fanvue-sync, fanvue-webhook, send-message

const ENCRYPTION_ALGO = "AES-GCM";
const KEY_HASH_ALGO = "SHA-256";

function bufToHex(buf) {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

async function deriveKey(keyString) {
  const keyBytes = await crypto.subtle.digest(KEY_HASH_ALGO, new TextEncoder().encode(keyString));
  return crypto.subtle.importKey("raw", keyBytes, { name: ENCRYPTION_ALGO }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptToken(plaintext, encryptionKey) {
  const key = await deriveKey(encryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGO, iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return JSON.stringify({
    iv: bufToHex(iv),
    data: bufToHex(new Uint8Array(encrypted)),
  });
}

export async function decryptToken(ciphertext, encryptionKey) {
  const key = await deriveKey(encryptionKey);
  const { iv, data } = JSON.parse(ciphertext);
  const ivBytes = hexToBuf(iv);
  const dataBytes = hexToBuf(data);
  const decrypted = await crypto.subtle.decrypt(
    { name: ENCRYPTION_ALGO, iv: ivBytes },
    key,
    dataBytes
  );
  return new TextDecoder().decode(decrypted);
}