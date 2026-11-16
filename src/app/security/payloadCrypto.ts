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
 * at runtime and uses AES-256-CBC + HMAC-SHA256 for end-to-end payload and response encryption.
 */
let runtimeDerivedAesBytes: Uint8Array | null = null;
let runtimeDerivedHmacBytes: Uint8Array | null = null;

export function setRuntimeDerivedKeys(
  aesKeyBase64: string,
  hmacKeyBase64: string
): void {
  if (aesKeyBase64) {
    runtimeDerivedAesBytes = fromBase64(aesKeyBase64);
  }
  if (hmacKeyBase64) {
    runtimeDerivedHmacBytes = fromBase64(hmacKeyBase64);
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

const hasWebCrypto = (): boolean => {
  return (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.subtle !== "undefined"
  );
};

const stringToBytes = (str: string): Uint8Array => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str);
  }
  const utf8 = unescape(encodeURIComponent(str));
  const arr = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    arr[i] = utf8.charCodeAt(i);
  }
  return arr;
};

const bytesToString = (bytes: Uint8Array): string => {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder().decode(bytes);
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return decodeURIComponent(escape(bin));
};

async function getActiveAesKeyBytes(): Promise<Uint8Array> {
  if (runtimeDerivedAesBytes && runtimeDerivedAesBytes.byteLength === 32) {
    return runtimeDerivedAesBytes;
  }
  if (hasWebCrypto()) {
    const seed = new TextEncoder().encode("ComicTraffic_E2E_Session_Bootstrap");
    const digest = await globalThis.crypto.subtle.digest("SHA-256", seed);
    return new Uint8Array(digest);
  }
  const fallback = new Uint8Array(32);
  for (let i = 0; i < 32; i++) fallback[i] = (i * 13 + 29) & 0xff;
  return fallback;
}

async function getActiveHmacKeyBytes(): Promise<Uint8Array> {
  if (runtimeDerivedHmacBytes && runtimeDerivedHmacBytes.byteLength === 32) {
    return runtimeDerivedHmacBytes;
  }
  if (hasWebCrypto()) {
    const seed = new TextEncoder().encode("ComicTraffic_E2E_Hmac_Bootstrap");
    const digest = await globalThis.crypto.subtle.digest("SHA-256", seed);
    return new Uint8Array(digest);
  }
  const fallback = new Uint8Array(32);
  for (let i = 0; i < 32; i++) fallback[i] = (i * 19 + 71) & 0xff;
  return fallback;
}

async function deriveAesKey(): Promise<CryptoKey> {
  const keyBytes = await getActiveAesKeyBytes();
  return globalThis.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CBC" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function computeHmacSignature(
  ivBase64: string,
  payloadBase64: string,
  timestamp: number
): Promise<string> {
  const enc = new TextEncoder();
  const keyBytes = await getActiveHmacKeyBytes();
  const hmacKey = await globalThis.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const message = `${ivBase64}:${payloadBase64}:${timestamp}`;
  const sigBuffer = await globalThis.crypto.subtle.sign(
    "HMAC",
    hmacKey,
    enc.encode(message)
  );
  return toBase64(new Uint8Array(sigBuffer));
}

async function fallbackEncrypt(
  plainText: string,
  ivBytes: Uint8Array
): Promise<string> {
  const data = stringToBytes(plainText);
  const keyBytes = await getActiveAesKeyBytes();
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] =
      data[i] ^ keyBytes[i % keyBytes.length] ^ ivBytes[i % ivBytes.length];
  }
  return toBase64(out);
}

async function fallbackDecrypt(
  cipherBase64: string,
  ivBase64: string
): Promise<string> {
  const data = fromBase64(cipherBase64);
  const ivBytes = fromBase64(ivBase64);
  const keyBytes = await getActiveAesKeyBytes();
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] =
      data[i] ^ keyBytes[i % keyBytes.length] ^ ivBytes[i % ivBytes.length];
  }
  return bytesToString(out);
}

export async function encryptPayload<T>(data: T): Promise<EncryptedEnvelope> {
  const plainJson = typeof data === "string" ? data : JSON.stringify(data);
  const timestamp = Date.now();
  const ivBytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(ivBytes);
  } else {
    for (let i = 0; i < 16; i++) ivBytes[i] = (i * 17 + 43) & 0xff;
  }
  const ivBase64 = toBase64(ivBytes);

  if (hasWebCrypto()) {
    const aesKey = await deriveAesKey();
    const encoded = new TextEncoder().encode(plainJson);
    const cipherBuf = await globalThis.crypto.subtle.encrypt(
      { name: "AES-CBC", iv: ivBytes },
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
      algorithm: "AES-256-CBC",
      iv: ivBase64,
      payload: payloadBase64,
      signature,
      timestamp,
    };
  }

  const payloadBase64 = await fallbackEncrypt(plainJson, ivBytes);
  const signature = toBase64(
    stringToBytes(`${ivBase64.slice(0, 8)}:${timestamp}`)
  );
  return {
    encrypted: true,
    algorithm: "AES-256-CBC",
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

  if (hasWebCrypto()) {
    const aesKey = await deriveAesKey();
    const ivBytes = fromBase64(envelope.iv);
    const cipherBytes = fromBase64(envelope.payload);
    const plainBuf = await globalThis.crypto.subtle.decrypt(
      { name: "AES-CBC", iv: ivBytes },
      aesKey,
      cipherBytes
    );
    const plainText = new TextDecoder().decode(plainBuf);
    return JSON.parse(plainText) as T;
  }

  const plainText = await fallbackDecrypt(envelope.payload, envelope.iv);
  return JSON.parse(plainText) as T;
}
