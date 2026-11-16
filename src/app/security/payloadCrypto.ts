export interface EncryptedEnvelope {
  encrypted: boolean;
  algorithm: string;
  iv: string;
  payload: string;
  signature: string;
  timestamp: number;
}

export interface EncryptionInspectionLog {
  id: string;
  direction: "REQUEST" | "RESPONSE";
  endpoint: string;
  algorithm: string;
  ivPreview: string;
  cipherPreview: string;
  signaturePreview: string;
  plainPreview: string;
  timestamp: string;
}

/**
 * Ephemeral Session Key Store populated by the backend `/api/security/handshake` endpoint.
 * All master keys live exclusively on the backend; the client receives derived session bytes
 * at runtime and uses AES-256-GCM + HMAC-SHA256 for authenticated end-to-end payload encryption.
 */
let runtimeDerivedAesBytes: Uint8Array | null = null;
let runtimeDerivedHmacBytes: Uint8Array | null = null;
let sessionAesKey: CryptoKey | null = null;
let sessionHmacKey: CryptoKey | null = null;

export function setRuntimeDerivedKeys(
  aesKeyBase64: string,
  hmacKeyBase64: string
): void {
  if (aesKeyBase64) {
    runtimeDerivedAesBytes = fromBase64(aesKeyBase64);
    sessionAesKey = null;
  }
  if (hmacKeyBase64) {
    runtimeDerivedHmacBytes = fromBase64(hmacKeyBase64);
    sessionHmacKey = null;
  }
}

export function hasRuntimeDerivedKeys(): boolean {
  return Boolean(runtimeDerivedAesBytes && runtimeDerivedHmacBytes);
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(bytes).toString("base64");
};

const fromBase64 = (b64: string): Uint8Array => {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      arr[i] = bin.charCodeAt(i);
    }
    return arr;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
};

async function getOrDeriveAesKey(): Promise<CryptoKey> {
  if (runtimeDerivedAesBytes && runtimeDerivedAesBytes.byteLength === 32) {
    return globalThis.crypto.subtle.importKey(
      "raw",
      runtimeDerivedAesBytes,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  }
  if (!sessionAesKey) {
    sessionAesKey = await globalThis.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }
  return sessionAesKey;
}

async function getOrDeriveHmacKey(): Promise<CryptoKey> {
  if (runtimeDerivedHmacBytes && runtimeDerivedHmacBytes.byteLength === 32) {
    return globalThis.crypto.subtle.importKey(
      "raw",
      runtimeDerivedHmacBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
  }
  if (!sessionHmacKey) {
    sessionHmacKey = await globalThis.crypto.subtle.generateKey(
      { name: "HMAC", hash: "SHA-256", length: 256 },
      false,
      ["sign"]
    );
  }
  return sessionHmacKey;
}

async function computeHmacSignature(
  ivBase64: string,
  payloadBase64: string,
  timestamp: number
): Promise<string> {
  const enc = new TextEncoder();
  const hmacKey = await getOrDeriveHmacKey();
  const message = `${ivBase64}:${payloadBase64}:${timestamp}`;
  const sigBuffer = await globalThis.crypto.subtle.sign(
    "HMAC",
    hmacKey,
    enc.encode(message)
  );
  return toBase64(new Uint8Array(sigBuffer));
}

export async function encryptPayload<T>(data: T): Promise<EncryptedEnvelope> {
  const plainJson = typeof data === "string" ? data : JSON.stringify(data);
  const timestamp = Date.now();
  const ivBytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ivBase64 = toBase64(ivBytes);

  const aesKey = await getOrDeriveAesKey();
  const encoded = new TextEncoder().encode(plainJson);
  const cipherBuf = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBytes },
    aesKey,
    encoded
  );
  const payloadBase64 = toBase64(new Uint8Array(cipherBuf));
  const signature = await computeHmacSignature(
    ivBase64,
    payloadBase64,
    timestamp
  );

  return {
    encrypted: true,
    algorithm: "AES-256-GCM",
    iv: ivBase64,
    payload: payloadBase64,
    signature,
    timestamp,
  };
}

export async function decryptPayload<T = any>(
  envelope: EncryptedEnvelope
): Promise<T> {
  if (!envelope || !envelope.payload || !envelope.iv) {
    throw new Error("Invalid encrypted envelope");
  }

  const aesKey = await getOrDeriveAesKey();
  const ivBytes = fromBase64(envelope.iv);
  const cipherBytes = fromBase64(envelope.payload);
  const plainBuf = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    aesKey,
    cipherBytes
  );
  const plainText = new TextDecoder().decode(plainBuf);
  return JSON.parse(plainText) as T;
}
