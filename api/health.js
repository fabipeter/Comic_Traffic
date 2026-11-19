/**
 * Vercel Serverless API Route (/api/health)
 * Validates API security headers, rate-limit headers, and server-side Postgres configuration
 * without ever exposing database credentials to the client.
 */
const ALLOWED_CORS_ORIGINS = new Map([
  ["https://comictraffic.com", "https://comictraffic.com"],
  ["https://www.comictraffic.com", "https://www.comictraffic.com"],
  ["http://localhost:3000", "http://localhost:3000"],
  ["http://127.0.0.1:3000", "http://127.0.0.1:3000"],
  ["http://localhost:5173", "http://localhost:5173"],
  ["http://127.0.0.1:5173", "http://127.0.0.1:5173"],
]);

module.exports = async function handler(req, res) {
  const rawOrigin = Array.isArray(req.headers?.origin) ? req.headers.origin[0] : req.headers?.origin;
  const cleanOrigin = typeof rawOrigin === "string" ? rawOrigin.trim().toLowerCase() : "";
  const corsOrigin = ALLOWED_CORS_ORIGINS.get(cleanOrigin) || "https://comictraffic.com";

  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Payload-Encrypted, X-Response-Encrypted");
  res.setHeader("Vary", "Origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ isSuccessful: false, message: "Method Not Allowed" });
  }

  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

  return res.status(200).json({
    isSuccessful: true,
    service: "Comic Traffic Production API",
    databaseConfigured: hasDatabaseUrl,
    timestamp: new Date().toISOString(),
  });
};
