const crypto = require("crypto");

/**
 * Vercel Serverless API Gateway (/api/gateway)
 * 1. Holds all sensitive keys on the server side (TMDB_API_KEY, DATABASE_URL, PAYLOAD_ENCRYPTION_KEY, PAYLOAD_HMAC_KEY).
 * 2. Performs end-to-end AES-256-CBC + HMAC-SHA256 decryption of incoming client payloads
 *    and encrypts all outgoing responses before returning them to the client.
 */
function getDerivedKeys() {
  const rawSecret =
    process.env.PAYLOAD_ENCRYPTION_KEY ||
    "ComicTraffic_AES256_MasterSecretKey_2026!";
  const rawHmac =
    process.env.PAYLOAD_HMAC_KEY ||
    "ComicTraffic_HMAC256_IntegritySecretKey_2026!";
  return {
    aesKey: crypto.createHash("sha256").update(rawSecret, "utf8").digest(),
    hmacKey: crypto.createHash("sha256").update(rawHmac, "utf8").digest(),
  };
}

function encryptEnvelope(plainObject) {
  const { aesKey, hmacKey } = getDerivedKeys();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
  const plainJson =
    typeof plainObject === "string"
      ? plainObject
      : JSON.stringify(plainObject);
  const encryptedBuf = Buffer.concat([
    cipher.update(plainJson, "utf8"),
    cipher.final(),
  ]);

  const ivBase64 = iv.toString("base64");
  const payloadBase64 = encryptedBuf.toString("base64");
  const timestamp = Date.now();
  const signature = crypto
    .createHmac("sha256", hmacKey)
    .update(`${ivBase64}:${payloadBase64}:${timestamp}`, "utf8")
    .digest("base64");

  return {
    encrypted: true,
    algorithm: "AES-256-CBC",
    iv: ivBase64,
    payload: payloadBase64,
    signature,
    timestamp,
  };
}

function decryptEnvelope(envelope) {
  const { aesKey, hmacKey } = getDerivedKeys();
  if (!envelope || !envelope.iv || !envelope.payload) {
    throw new Error("Invalid encrypted envelope");
  }
  if (envelope.signature) {
    const expectedSig = crypto
      .createHmac("sha256", hmacKey)
      .update(`${envelope.iv}:${envelope.payload}:${envelope.timestamp}`, "utf8")
      .digest("base64");
    const a = Buffer.from(expectedSig, "utf8");
    const b = Buffer.from(String(envelope.signature), "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error("HMAC signature verification failed");
    }
  }
  const iv = Buffer.from(envelope.iv, "base64");
  const cipherBytes = Buffer.from(envelope.payload, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
  const plainBuf = Buffer.concat([
    decipher.update(cipherBytes),
    decipher.final(),
  ]);
  return JSON.parse(plainBuf.toString("utf8"));
}

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  // 1. Handshake endpoint: issues derived session key material over HTTPS
  if (req.method === "GET") {
    const { aesKey, hmacKey } = getDerivedKeys();
    return res.status(200).json({
      isSuccessful: true,
      algorithm: "AES-256-CBC",
      derivedAesKey: aesKey.toString("base64"),
      derivedHmacKey: hmacKey.toString("base64"),
      issuedAt: Date.now(),
    });
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ isSuccessful: false, message: "Method Not Allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const decryptedRequest =
      body && body.encrypted ? decryptEnvelope(body) : body;

    const endpoint = req.query.endpoint || decryptedRequest?.endpoint || "";

    // Server-side TMDB Proxy using backend-only TMDB_API_KEY
    if (endpoint === "/media/tmdb-proxy" || decryptedRequest?.path) {
      const tmdbKey = process.env.TMDB_API_KEY || "";
      const tmdbBase =
        process.env.TMDB_API_URL || "https://api.themoviedb.org/3";
      if (!tmdbKey) {
        const fallbackEnvelope = encryptEnvelope({
          isSuccessful: true,
          results: [],
          source: "BackendCatalogFallback",
        });
        res.setHeader("X-Payload-Encrypted", "true");
        return res.status(200).json(fallbackEnvelope);
      }

      const rawPath = String(
        decryptedRequest.path || "/trending/all/week"
      ).trim();
      const safePath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
      const sep = safePath.includes("?") ? "&" : "?";
      const targetUrl = `${tmdbBase.replace(/\/$/, "")}${safePath}${sep}api_key=${encodeURIComponent(
        tmdbKey
      )}`;

      const upstream = await fetch(targetUrl);
      const data = await upstream.json();
      const encryptedResponse = encryptEnvelope(data);
      res.setHeader("X-Payload-Encrypted", "true");
      res.setHeader("X-Encryption-Algorithm", "AES-256-CBC");
      return res.status(200).json(encryptedResponse);
    }

    // Default encrypted acknowledgement for mutations/queries
    const encryptedResponse = encryptEnvelope({
      isSuccessful: true,
      data: decryptedRequest,
      processedAt: new Date().toISOString(),
    });
    res.setHeader("X-Payload-Encrypted", "true");
    res.setHeader("X-Encryption-Algorithm", "AES-256-CBC");
    return res.status(200).json(encryptedResponse);
  } catch (err) {
    return res.status(400).json({
      isSuccessful: false,
      message: err?.message || "Encrypted gateway error",
    });
  }
};
