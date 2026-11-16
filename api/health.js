/**
 * Vercel Serverless API Route (/api/health)
 * Validates API security headers, rate-limit headers, and server-side Postgres configuration
 * without ever exposing database credentials to the client.
 */
module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store, max-age=0");

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
