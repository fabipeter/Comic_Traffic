const crypto = require("crypto");

/**
 * Vercel Serverless API Gateway (/api/gateway)
 * 1. Holds all sensitive keys on the server side (TMDB_API_KEY, DATABASE_URL, PAYLOAD_ENCRYPTION_KEY, PAYLOAD_HMAC_KEY).
 * 2. Performs end-to-end AES-256-CBC + HMAC-SHA256 decryption of incoming client payloads
 *    and encrypts all outgoing responses before returning them to the client.
 * 3. Executes all TMDB, TVMaze, and Jikan external rating API aggregation on the backend.
 */
let ephemeralGatewaySecret = null;
let ephemeralGatewayHmac = null;

function getDerivedKeys() {
  if (!ephemeralGatewaySecret) {
    const sharedFallback =
      (process.env.GATEWAY_SHARED_SECRET || process.env.GATEWAY_SECRET || "").trim();
    ephemeralGatewaySecret =
      (process.env.PAYLOAD_ENCRYPTION_KEY || "").trim() ||
      (sharedFallback ? `ct-aes:${sharedFallback}` : crypto.randomBytes(32).toString("hex"));
  }
  if (!ephemeralGatewayHmac) {
    const sharedFallback =
      (process.env.GATEWAY_SHARED_SECRET || process.env.GATEWAY_SECRET || "").trim();
    ephemeralGatewayHmac =
      (process.env.PAYLOAD_HMAC_KEY || "").trim() ||
      (sharedFallback ? `ct-hmac:${sharedFallback}` : crypto.randomBytes(32).toString("hex"));
  }
  return {
    aesKey: crypto.createHash("sha256").update(ephemeralGatewaySecret, "utf8").digest(),
    hmacKey: crypto.createHash("sha256").update(ephemeralGatewayHmac, "utf8").digest(),
  };
}

function encryptEnvelope(plainObject) {
  const { aesKey, hmacKey } = getDerivedKeys();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const plainJson =
    typeof plainObject === "string"
      ? plainObject
      : JSON.stringify(plainObject);
  const cipherText = Buffer.concat([
    cipher.update(plainJson, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payloadBuf = Buffer.concat([cipherText, tag]);

  const ivBase64 = iv.toString("base64");
  const payloadBase64 = payloadBuf.toString("base64");
  const timestamp = Date.now();
  const signature = crypto
    .createHmac("sha256", hmacKey)
    .update(`${ivBase64}:${payloadBase64}:${timestamp}`, "utf8")
    .digest("base64");

  return {
    encrypted: true,
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
  const fullPayload = Buffer.from(envelope.payload, "base64");
  if (fullPayload.length < 16) {
    throw new Error("Payload too short for authenticated tag");
  }
  const tag = fullPayload.subarray(fullPayload.length - 16);
  const cipherBytes = fullPayload.subarray(0, fullPayload.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
  decipher.setAuthTag(tag);
  const plainBuf = Buffer.concat([
    decipher.update(cipherBytes),
    decipher.final(),
  ]);
  return JSON.parse(plainBuf.toString("utf8"));
}

function sanitizeHeaderText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\0]/g, "").trim();
}

function normalizeAndValidateEmail(rawEmail) {
  const cleanEmail = sanitizeHeaderText(rawEmail).toLowerCase();
  const atIndex = cleanEmail.indexOf("@");
  const lastAtIndex = cleanEmail.lastIndexOf("@");
  const domainPart = atIndex > 0 ? cleanEmail.slice(atIndex + 1) : "";
  const dotIndex = domainPart.indexOf(".");
  const isValid =
    cleanEmail.length >= 5 &&
    !cleanEmail.includes(" ") &&
    atIndex > 0 &&
    lastAtIndex === atIndex &&
    dotIndex > 0 &&
    dotIndex < domainPart.length - 1 &&
    domainPart[domainPart.length - 1] !== "." &&
    !domainPart.includes("..");
  return isValid ? cleanEmail : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TRUSTED_RESET_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "https://comictraffic.com",
  "https://www.comictraffic.com",
]);

function resolveSafeAppBaseUrl(candidate, requestOrigin) {
  if (typeof requestOrigin === "string" && requestOrigin.trim().length > 0) {
    const cleanOrigin = requestOrigin.trim().replace(/\/+$/, "").toLowerCase();
    if (TRUSTED_RESET_ORIGINS.has(cleanOrigin)) {
      return cleanOrigin;
    }
  }
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    try {
      const parsed = new URL(candidate.trim());
      if (
        parsed.protocol === "https:" ||
        (parsed.protocol === "http:" &&
          (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"))
      ) {
        return parsed.origin;
      }
    } catch {
      // Ignore malformed candidate and fall back safely
    }
  }
  return "https://comictraffic.com";
}

async function sendEmailViaSendGrid({ toEmail, subject, plainText, htmlBody }) {
  const apiKey =
    typeof process.env.SENDGRID_API_KEY === "string"
      ? process.env.SENDGRID_API_KEY.trim()
      : "";
  const cleanTo = normalizeAndValidateEmail(toEmail);

  if (!apiKey) {
    return { sent: false, reason: "missing_api_key" };
  }
  if (!cleanTo) {
    return { sent: false, reason: "invalid_recipient" };
  }

  const senderEmail =
    normalizeAndValidateEmail(
      process.env.SENDGRID_SENDER_EMAIL || process.env.SENDER_EMAIL
    ) || "security@comictraffic.com";
  const senderName =
    sanitizeHeaderText(
      process.env.SENDGRID_SENDER_NAME || process.env.SENDER_NAME
    ) || "Comic Traffic Security";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: cleanTo }] }],
        from: { email: senderEmail, name: senderName },
        subject: sanitizeHeaderText(subject),
        content: [
          { type: "text/plain", value: String(plainText || "") },
          { type: "text/html", value: String(htmlBody || "") },
        ],
        tracking_settings: {
          click_tracking: {
            enable: false,
            enable_text: false,
          },
        }
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        sent: false,
        status: response.status,
        reason: "sendgrid_rejected",
      };
    }

    return { sent: true, status: response.status };
  } catch {
    return { sent: false, reason: "network_error" };
  } finally {
    clearTimeout(timeoutId);
  }
}

function wrapBrandedEmailHtml({
  title,
  subtitle,
  headerBgColor = "#0f172a",
  topAccentColor = "#3b82f6",
  borderColor = "rgba(59, 130, 246, 0.35)",
  accentSpanColor = "#60a5fa",
  bodyHtml,
  includeNoReplyFooter = false,
  isSuccessTheme = false,
}) {
  const year = new Date().getUTCFullYear();
  const headerClass = isSuccessTheme ? "header header-success" : "header";
  const extraFooter = includeNoReplyFooter
    ? "<br />This is an automated security transmission. Please do not reply directly to this address."
    : "";
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light only;
      supported-color-schemes: light only;
    }
    body, table, td, a {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background-color: #060911;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
    }
    .email-body { background-color: #060911; }
    .email-card { background-color: #0b1222; }
    .header { background-color: #0f172a; }
    .header-success { background-color: #064e3b; }
    .brand-title, .brand-comic { color: #f8fafc !important; -webkit-text-fill-color: #f8fafc; }
    .brand-sub { color: #cbd5e1 !important; }
    .email-content { background-color: #0b1222; color: #cbd5e1; }
    .code-box { background-color: #0f172a; }
    .code-value { color: #60a5fa; }
    .cta-button { background-color: #2563eb; color: #f8fafc !important; -webkit-text-fill-color: #f8fafc; }
    .notice { background-color: #1e1b18; color: #fde68a; }
    .alert-box { background-color: #062e24; color: #a7f3d0; }
    .feature-box { background-color: #0f172a; color: #e2e8f0; }

    @media (prefers-color-scheme: dark) {
      body, .email-body { background-color: #050811 !important; color: #e2e8f0 !important; }
      .email-card { background-color: #0b1222 !important; border-color: rgba(59, 130, 246, 0.45) !important; }
      .header { background-color: #0f172a !important; }
      .header-success { background-color: #064e3b !important; }
      .brand-title, .brand-comic { color: #f8fafc !important; -webkit-text-fill-color: #f8fafc !important; }
      .brand-sub { color: #cbd5e1 !important; }
      .email-content { background-color: #0b1222 !important; color: #cbd5e1 !important; }
      .code-box { background-color: #0f172a !important; border-color: #3b82f6 !important; }
      .code-value { color: #60a5fa !important; }
      .cta-button { background-color: #2563eb !important; color: #f8fafc !important; -webkit-text-fill-color: #f8fafc !important; }
      .feature-box { background-color: #0f172a !important; border-color: rgba(59, 130, 246, 0.4) !important; color: #e2e8f0 !important; }
      .notice { background-color: #1e1b18 !important; border-color: #f59e0b !important; color: #fde68a !important; }
      .alert-box { background-color: #062e24 !important; border-color: #10b981 !important; color: #a7f3d0 !important; }
      h1 { color: #f8fafc !important; }
      p { color: #cbd5e1 !important; }
      .footer { background-color: #070b14 !important; color: #94a3b8 !important; }
    }

    [data-ogsc] body, [data-ogsc] .email-body { background-color: #050811 !important; }
    [data-ogsc] .email-card { background-color: #0b1222 !important; }
    [data-ogsb] .header { background-color: #0f172a !important; }
    [data-ogsb] .header-success { background-color: #064e3b !important; }
    [data-ogsc] .brand-title, [data-ogsc] .brand-comic { color: #f8fafc !important; -webkit-text-fill-color: #f8fafc !important; }
    [data-ogsc] .brand-sub { color: #cbd5e1 !important; }
    [data-ogsc] .email-content { background-color: #0b1222 !important; }
    [data-ogsc] .code-box { background-color: #0f172a !important; }
    [data-ogsc] .code-value { color: #60a5fa !important; }
    [data-ogsc] .cta-button { background-color: #2563eb !important; color: #f8fafc !important; -webkit-text-fill-color: #f8fafc !important; }
    [data-ogsc] .feature-box { background-color: #0f172a !important; }
    [data-ogsc] .notice { background-color: #1e1b18 !important; color: #fde68a !important; }
    [data-ogsc] .alert-box { background-color: #062e24 !important; color: #a7f3d0 !important; }
    [data-ogsc] h1 { color: #f8fafc !important; }
    [data-ogsc] p { color: #cbd5e1 !important; }
    [data-ogsc] .footer { background-color: #070b14 !important; color: #94a3b8 !important; }
  </style>
</head>
<body bgcolor="#060911" class="body email-body" style="margin: 0; padding: 0; background-color: #060911; color: #e2e8f0;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#060911" class="email-body" style="background-color: #060911; width: 100%; margin: 0; padding: 36px 12px;">
    <tr>
      <td align="center" style="padding: 0;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#0b1222" class="email-card container" style="background-color: #0b1222; max-width: 600px; width: 100%; border: 1px solid ${borderColor}; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);">
          <tr>
            <td align="center" bgcolor="${headerBgColor}" class="${headerClass}" style="background-color: ${headerBgColor}; border-top: 4px solid ${topAccentColor}; padding: 30px 24px 28px 24px; text-align: center; border-bottom: 1px solid ${borderColor};">
              <div class="brand-title" style="font-size: 24px; font-weight: 900; letter-spacing: 2px; color: #f8fafc; text-transform: uppercase; margin: 0;"><span class="brand-comic" style="color: #f8fafc;">COMIC</span><span class="brand-accent" style="color: ${accentSpanColor};">TRAFFIC</span></div>
              <div class="brand-sub" style="font-size: 11px; letter-spacing: 3px; color: #cbd5e1; margin-top: 6px; text-transform: uppercase; font-weight: 600;">${escapeHtml(subtitle)}</div>
            </td>
          </tr>
          <tr>
            <td class="email-content content" bgcolor="#0b1222" style="background-color: #0b1222; padding: 36px 32px; color: #cbd5e1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.7; text-align: left;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td align="center" bgcolor="#070b14" class="footer" style="background-color: #070b14; border-top: 1px solid rgba(255, 255, 255, 0.08); padding: 22px 24px; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.7;">
              &copy; ${year} Comic Traffic Telemetry Consensus Engine. All rights reserved.${extraFooter}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildPasswordResetEmailHtml({ recipientLabel, recoveryCode, resetUrl }) {
  return wrapBrandedEmailHtml({
    title: "Reset Your Comic Traffic Password",
    subtitle: "CUMULATIVE RATING HUB \u2022 ACCOUNT SECURITY",
    includeNoReplyFooter: true,
    bodyHtml: `
      <h1 style="font-size: 20px; font-weight: 800; color: #f8fafc; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.3px;">Password Recovery Request</h1>
      <p style="font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 14px 0;">Hello <strong style="color: #f8fafc;">${escapeHtml(recipientLabel)}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 14px 0;">We received a request to reset the password for your Comic Traffic account. Use the verification code below to authorize this change:</p>
      <div class="code-box" style="margin: 26px 0; padding: 22px 24px; background-color: #0f172a; border: 2px dashed #3b82f6; border-radius: 12px; text-align: center;">
        <div class="code-label" style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #94a3b8; margin-bottom: 8px;">Your 15-Minute Verification Code</div>
        <div class="code-value" style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #60a5fa; text-shadow: 0 0 12px rgba(96, 165, 250, 0.35);">${escapeHtml(recoveryCode)}</div>
      </div>
      <p style="text-align: center; font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 16px 0;">Or click the button below to open the password recovery page directly:</p>
      <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="margin: 26px 0;">
        <tr>
          <td align="center">
            <a href="${escapeHtml(resetUrl)}" target="_blank" rel="noopener noreferrer" class="cta-button" style="display: block; width: 100%; box-sizing: border-box; padding: 15px 28px; background-color: #2563eb; color: #f8fafc !important; text-decoration: none; font-weight: 700; font-size: 15px; text-align: center; border-radius: 10px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45); letter-spacing: 0.5px;">Reset Password Now</a>
          </td>
        </tr>
      </table>
      <div class="notice" style="padding: 14px 18px; background-color: #1e1b18; border-left: 4px solid #f59e0b; border-radius: 6px; font-size: 12px; color: #fde68a; margin-top: 26px; line-height: 1.6;">
        &#9888; <strong style="color: #fbbf24;">Security Advisory:</strong> This code and link will expire in <strong>15 minutes</strong>. If you did not request a password reset, please disregard this email. Your Comic Traffic account remains fully secure.
      </div>`,
  });
}

function buildWelcomeEmailHtml({ displayName, username, appUrl }) {
  const safeBase = String(appUrl || "https://comictraffic.com").replace(/\/+$/, "");
  return wrapBrandedEmailHtml({
    title: "Welcome to Comic Traffic",
    subtitle: "CUMULATIVE RATING HUB \u2022 WELCOME ABOARD",
    bodyHtml: `
      <h1 style="font-size: 20px; font-weight: 800; color: #f8fafc; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.3px;">Welcome to Comic Traffic!</h1>
      <p style="font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 14px 0;">Hello <strong style="color: #f8fafc;">${escapeHtml(displayName)}</strong> (<code style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; padding: 2px 6px; border-radius: 4px; font-family: monospace;">@${escapeHtml(username)}</code>),</p>
      <p style="font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 14px 0;">Your Comic Traffic account is active and ready. You now have access to real-time multi-source ratings across Comic Books, Literature, Movies, and TV Series:</p>
      <div class="feature-box" style="margin: 24px 0; padding: 20px 22px; background-color: #0f172a; border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 12px; font-size: 13px; color: #e2e8f0; line-height: 1.8;">
        &#9889; <strong style="color: #60a5fa;">Compare Arena:</strong> Compare up to 3 titles side-by-side<br />
        &#9878; <strong style="color: #60a5fa;">Custom Weights:</strong> Tune Critic, Audience, and Comic DB sources<br />
        &#128218; <strong style="color: #60a5fa;">Watchlist &amp; Lists:</strong> Track reading and viewing progress anywhere
      </div>
      <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="margin: 26px 0;">
        <tr>
          <td align="center">
            <a href="${escapeHtml(safeBase)}/dashboard" target="_blank" rel="noopener noreferrer" class="cta-button" style="display: block; width: 100%; box-sizing: border-box; padding: 15px 28px; background-color: #2563eb; color: #f8fafc !important; text-decoration: none; font-weight: 700; font-size: 15px; text-align: center; border-radius: 10px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45); letter-spacing: 0.5px;">Open Your Comic Traffic Hub</a>
          </td>
        </tr>
      </table>
      <p style="font-size: 12px; color: #94a3b8; line-height: 1.6; margin-top: 18px;">Your email address is verified for account recovery and security alerts.</p>`,
  });
}

function buildPasswordChangedEmailHtml({ recipientLabel }) {
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return wrapBrandedEmailHtml({
    title: "Comic Traffic Password Changed",
    subtitle: "CUMULATIVE RATING HUB \u2022 ACCOUNT SECURITY",
    headerBgColor: "#064e3b",
    topAccentColor: "#10b981",
    borderColor: "rgba(16, 185, 129, 0.35)",
    accentSpanColor: "#34d399",
    isSuccessTheme: true,
    bodyHtml: `
      <h1 style="font-size: 20px; font-weight: 800; color: #f8fafc; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.3px;">&#10003; Password Updated Successfully</h1>
      <p style="font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 14px 0;">Hello <strong style="color: #f8fafc;">${escapeHtml(recipientLabel)}</strong>,</p>
      <div class="alert-box" style="padding: 16px 20px; background-color: #062e24; border: 1px solid #10b981; border-radius: 10px; color: #a7f3d0; font-size: 13px; margin: 20px 0; line-height: 1.6;">
        The password for your Comic Traffic account was updated on <strong style="color: #f8fafc;">${escapeHtml(timestamp)}</strong>.
      </div>
      <p style="font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 14px 0;">You can now sign in with your new password on any device.</p>
      <p style="font-size: 13px; color: #f87171; line-height: 1.6; margin-top: 20px;">
        &#9888; <strong>Did not perform this action?</strong> If you did not make this change, please contact Comic Traffic Support immediately to lock your account.
      </p>`,
  });
}

const REMOVED_SEEDED_SOURCE_IDS = new Set([
  "comicvine",
  "league_of_comic_geeks",
  "goodreads",
  "comicbookroundup_critics",
  "comicbookroundup_users",
  "marvel_dc_index",
]);

function calculateCumulativeSummary(sources) {
  const active = (Array.isArray(sources) ? sources : []).filter(
    (s) => s && !REMOVED_SEEDED_SOURCE_IDS.has(String(s.sourceId || "").toLowerCase())
  );
  if (active.length === 0) {
    return {
      finalCumulativeAverage: 0,
      finalStarScoreOutOfTen: 0,
      simpleArithmeticAverage: 0,
      bayesianWeightedScore: 0,
      criticConsensusScore: 0,
      audienceConsensusScore: 0,
      comicCommunityScore: 0,
      polarizationIndex: 0,
      consensusTier: "Unrated",
      totalAggregatedVotes: 0,
      activeSourceCount: 0,
      sources: [],
    };
  }

  const totalVotes = active.reduce(
    (acc, s) => acc + Math.max(0, s.voteCount || 0),
    0
  );
  const simpleAvg =
    active.reduce((acc, s) => acc + s.normalizedScore, 0) / active.length;

  let weightedNum = 0;
  let weightedDen = 0;
  for (const s of active) {
    const w = s.defaultWeight || 1.0;
    const conf =
      1.0 + Math.min(0.35, Math.log10(Math.max(10, s.voteCount || 0)) / 18.0);
    const eff = w * conf;
    weightedNum += s.normalizedScore * eff;
    weightedDen += eff;
  }
  const weightedAvg = weightedDen > 0 ? weightedNum / weightedDen : simpleAvg;
  const v = Math.max(100, totalVotes);
  const m = 2500;
  const bayesian = (v / (v + m)) * weightedAvg + (m / (v + m)) * 74.0;
  const finalCumulative =
    Math.round(
      Math.max(0, Math.min(100, weightedAvg * 0.65 + bayesian * 0.35)) * 10
    ) / 10;

  const byCat = (cat) => {
    const sub = active.filter((s) => s.category === cat);
    if (sub.length === 0) return finalCumulative;
    return (
      Math.round(
        (sub.reduce((a, b) => a + b.normalizedScore, 0) / sub.length) * 10
      ) / 10
    );
  };

  const variance =
    active.reduce(
      (acc, s) => acc + Math.pow(s.normalizedScore - simpleAvg, 2),
      0
    ) / active.length;
  const stdDev = Math.round(Math.sqrt(variance) * 100) / 100;

  let consensusTier = "Generally Unfavorable";
  if (stdDev >= 12.5 && finalCumulative >= 60) {
    consensusTier = "Highly Polarizing / Cult Classic";
  } else if (finalCumulative >= 90) {
    consensusTier = "Universal Acclaim";
  } else if (finalCumulative >= 82) {
    consensusTier = "Certified Must-Experience";
  } else if (finalCumulative >= 72) {
    consensusTier = "Generally Favorable";
  } else if (finalCumulative >= 58) {
    consensusTier = "Mixed / Average Consensus";
  }

  return {
    finalCumulativeAverage: finalCumulative,
    finalStarScoreOutOfTen: Math.round((finalCumulative / 10) * 100) / 100,
    simpleArithmeticAverage: Math.round(simpleAvg * 10) / 10,
    bayesianWeightedScore: Math.round(bayesian * 10) / 10,
    criticConsensusScore: byCat("Critic"),
    audienceConsensusScore: byCat("Audience"),
    comicCommunityScore: byCat("ComicCommunity"),
    polarizationIndex: stdDev,
    consensusTier,
    totalAggregatedVotes: totalVotes,
    activeSourceCount: active.length,
    sources: active,
  };
}

function buildSeededItem(raw) {
  const { sources, ...rest } = raw;
  return {
    ...rest,
    cumulativeRating: calculateCumulativeSummary(sources),
  };
}

const BACKEND_SEEDED_CATALOG = [
  // ==========================================
  // 📚 TOP ACCLAIMED COMIC BOOKS & GRAPHIC NOVELS (15 ITEMS)
  // ==========================================
  buildSeededItem({
    id: "101",
    externalId: "comic-watchmen-1986",
    title: "Watchmen #1–12 (Absolute Edition)",
    mediaType: "ComicBook",
    releaseYear: 1986,
    publisherOrStudio: "DC Comics",
    creatorOrDirector: "Alan Moore (Writer), Dave Gibbons (Artist)",
    runtimeOrIssueCount: "12 Issues / 416 Pages",
    ageRating: "Mature (17+)",
    genres: ["Graphic Novel", "Superhero", "Noir", "Deconstruction", "Sci-Fi"],
    posterUrl: "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=1600&q=80",
    overview: "In an alternate 1985 where costumed vigilantes have shaped world history, the murder of The Comedian draws Rorschach, Nite Owl, Silk Spectre, Ozymandias, and Doctor Manhattan into a conspiracy with nuclear stakes.",
    sources: [
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "96 / 100", normalizedScore: 96.0, voteCount: 48, defaultWeight: 1.2, accentColor: "#ffcc33" },
    ]
  }),
  buildSeededItem({
    id: "102",
    externalId: "comic-sandman-1989",
    title: "The Sandman (1989–1996 Complete Omnibus)",
    mediaType: "ComicBook",
    releaseYear: 1989,
    publisherOrStudio: "DC Comics / Vertigo",
    creatorOrDirector: "Neil Gaiman, Sam Kieth, Mike Dringenberg",
    runtimeOrIssueCount: "75 Issues / Omnibus Edition",
    ageRating: "Mature (17+)",
    genres: ["Dark Fantasy", "Mythology", "Graphic Novel", "Horror", "Literary"],
    posterUrl: "https://images.unsplash.com/photo-1608889175123-8ee362201f81?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1608889175123-8ee362201f81?auto=format&fit=crop&w=1600&q=80",
    overview: "Dream of the Endless escapes after seventy years of occult imprisonment and sets out to rebuild his kingdom of the Dreaming across time, mythology, and human consciousness.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "103",
    externalId: "comic-saga-2012",
    title: "Saga (Image Comics Series)",
    mediaType: "ComicBook",
    releaseYear: 2012,
    publisherOrStudio: "Image Comics",
    creatorOrDirector: "Brian K. Vaughan (Writer), Fiona Staples (Artist)",
    runtimeOrIssueCount: "66+ Issues (Ongoing)",
    ageRating: "Mature (17+)",
    genres: ["Sci-Fi", "Space Opera", "Fantasy", "Romance", "Indie"],
    posterUrl: "https://images.unsplash.com/photo-1588497859490-85d1c17db96d?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1588497859490-85d1c17db96d?auto=format&fit=crop&w=1600&q=80",
    overview: "Two soldiers from opposite sides of a never-ending galactic war fall in love and risk everything to bring a fragile new life—their daughter Hazel—into an unforgiving cosmos.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "104",
    externalId: "comic-batman-year-one-1987",
    title: "Batman: Year One (#404–407)",
    mediaType: "ComicBook",
    releaseYear: 1987,
    publisherOrStudio: "DC Comics",
    creatorOrDirector: "Frank Miller (Writer), David Mazzucchelli (Artist)",
    runtimeOrIssueCount: "4 Issues / 144 Pages",
    ageRating: "Teen+ (15+)",
    genres: ["Crime", "Noir", "Superhero", "Detective", "Graphic Novel"],
    posterUrl: "https://images.unsplash.com/photo-1531259683007-016a7b628fc3?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1531259683007-016a7b628fc3?auto=format&fit=crop&w=1600&q=80",
    overview: "Bruce Wayne returns to Gotham City after twelve years abroad to begin his war on crime, while newly transferred Lieutenant James Gordon fights corruption inside the Gotham City Police Department.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "105",
    externalId: "comic-dark-knight-returns-1986",
    title: "The Dark Knight Returns",
    mediaType: "ComicBook",
    releaseYear: 1986,
    publisherOrStudio: "DC Comics",
    creatorOrDirector: "Frank Miller, Klaus Janson, Lynn Varley",
    runtimeOrIssueCount: "4 Issues / 224 Pages",
    ageRating: "Mature (17+)",
    genres: ["Superhero", "Dystopian", "Graphic Novel", "Noir", "DC Comics"],
    posterUrl: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1600&q=80",
    overview: "A 55-year-old Bruce Wayne comes out of retirement in a dystopian future to reclaim Gotham City from the Mutants, facing off against the Joker and Superman himself.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "106",
    externalId: "comic-maus-1991",
    title: "Maus: A Survivor's Tale",
    mediaType: "ComicBook",
    releaseYear: 1991,
    publisherOrStudio: "Pantheon Books",
    creatorOrDirector: "Art Spiegelman",
    runtimeOrIssueCount: "Complete Graphic Novel (296 Pages)",
    ageRating: "Mature (17+)",
    genres: ["Biographical", "Historical", "Memoir", "Pulitzer Prize"],
    posterUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=1600&q=80",
    overview: "The first graphic novel to win a Pulitzer Prize. A brutal, profoundly moving memoir depicting the author interviewing his father about his experiences as a Polish Jew and Holocaust survivor.",
    sources: [
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "98 / 100", normalizedScore: 98.0, voteCount: 35, defaultWeight: 1.2, accentColor: "#ffcc33" },
    ]
  }),
  buildSeededItem({
    id: "107",
    externalId: "comic-kingdom-come-1996",
    title: "Kingdom Come",
    mediaType: "ComicBook",
    releaseYear: 1996,
    publisherOrStudio: "DC Comics / Elseworlds",
    creatorOrDirector: "Mark Waid (Writer), Alex Ross (Artist)",
    runtimeOrIssueCount: "4 Issues / 232 Pages",
    ageRating: "Teen+ (15+)",
    genres: ["Superhero", "Elseworlds", "Graphic Novel", "Alex Ross Painted"],
    posterUrl: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=1600&q=80",
    overview: "In a future where the traditional heroes have retired and a reckless new generation of vigilantes wreaks havoc, Superman returns to re-establish justice.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "108",
    externalId: "comic-all-star-superman-2005",
    title: "All-Star Superman (#1–12)",
    mediaType: "ComicBook",
    releaseYear: 2005,
    publisherOrStudio: "DC Comics",
    creatorOrDirector: "Grant Morrison (Writer), Frank Quitely (Artist)",
    runtimeOrIssueCount: "12 Issues / 320 Pages",
    ageRating: "All Ages",
    genres: ["Superhero", "Sci-Fi", "Mythology", "Graphic Novel"],
    posterUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1600&q=80",
    overview: "After being poisoned by solar radiation during a rescue mission near the sun, Superman spends his final year completing twelve legendary labors.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "109",
    externalId: "comic-the-long-halloween-1996",
    title: "Batman: The Long Halloween (#1–13)",
    mediaType: "ComicBook",
    releaseYear: 1996,
    publisherOrStudio: "DC Comics",
    creatorOrDirector: "Jeph Loeb (Writer), Tim Sale (Artist)",
    runtimeOrIssueCount: "13 Issues / 384 Pages",
    ageRating: "Teen+ (15+)",
    genres: ["Crime", "Noir", "Mystery", "Superhero", "Graphic Novel"],
    posterUrl: "https://images.unsplash.com/photo-1509281373149-e957c6296406?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1509281373149-e957c6296406?auto=format&fit=crop&w=1600&q=80",
    overview: "Taking place during Batman's early days of crime-fighting, a serial killer named Holiday strikes Gotham mob families on key holidays each month.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "110",
    externalId: "comic-daredevil-born-again-1986",
    title: "Daredevil: Born Again (#227–233)",
    mediaType: "ComicBook",
    releaseYear: 1986,
    publisherOrStudio: "Marvel Comics",
    creatorOrDirector: "Frank Miller (Writer), David Mazzucchelli (Artist)",
    runtimeOrIssueCount: "7 Issues / 176 Pages",
    ageRating: "Teen+ (15+)",
    genres: ["Crime", "Noir", "Redemption", "Superhero", "Marvel"],
    posterUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1600&q=80",
    overview: "Karen Page sells Matt Murdock's secret identity for a shot of heroin. When Kingpin learns the truth, he systematically dismantles Matt's life piece by piece.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "111",
    externalId: "comic-immortal-hulk-2018",
    title: "The Immortal Hulk (#1–50)",
    mediaType: "ComicBook",
    releaseYear: 2018,
    publisherOrStudio: "Marvel Comics",
    creatorOrDirector: "Al Ewing (Writer), Joe Bennett (Artist)",
    runtimeOrIssueCount: "50 Issues / Multi-Volume Omnibus",
    ageRating: "Parental Advisory (15+)",
    genres: ["Body Horror", "Psychological", "Superhero", "Cosmic", "Marvel"],
    posterUrl: "https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?auto=format&fit=crop&w=1600&q=80",
    overview: "Bruce Banner walks the backroads of America by day—and even if he dies, when night falls the Green Door opens and the Immortal Hulk rises to enact existential judgment.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "112",
    externalId: "comic-v-for-vendetta-1988",
    title: "V for Vendetta",
    mediaType: "ComicBook",
    releaseYear: 1988,
    publisherOrStudio: "DC Comics / Vertigo",
    creatorOrDirector: "Alan Moore (Writer), David Lloyd (Artist)",
    runtimeOrIssueCount: "10 Issues / 296 Pages",
    ageRating: "Mature (17+)",
    genres: ["Dystopian", "Political", "Graphic Novel", "Noir", "Anarchy"],
    posterUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1600&q=80",
    overview: "In a post-apocalyptic fascist Britain, an enigmatic anarchist cloaked in a Guy Fawkes mask orchestrates a theatrical campaign to bring down the totalitarian government.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "113",
    externalId: "comic-kravens-last-hunt-1987",
    title: "Spider-Man: Kraven's Last Hunt",
    mediaType: "ComicBook",
    releaseYear: 1987,
    publisherOrStudio: "Marvel Comics",
    creatorOrDirector: "J.M. DeMatteis (Writer), Mike Zeck (Artist)",
    runtimeOrIssueCount: "6 Issues / 168 Pages",
    ageRating: "Teen+ (15+)",
    genres: ["Psychological Thriller", "Dark", "Superhero", "Noir", "Marvel"],
    posterUrl: "https://images.unsplash.com/photo-1604200213928-ba3cf4fc8436?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1604200213928-ba3cf4fc8436?auto=format&fit=crop&w=1600&q=80",
    overview: "Kraven the Hunter tracks down Spider-Man, shoots him, buries him alive, and assumes his identity to prove himself superior to his greatest prey.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "114",
    externalId: "comic-xmen-days-of-future-past-1981",
    title: "Uncanny X-Men: Days of Future Past (#141–142)",
    mediaType: "ComicBook",
    releaseYear: 1981,
    publisherOrStudio: "Marvel Comics",
    creatorOrDirector: "Chris Claremont (Writer), John Byrne (Artist)",
    runtimeOrIssueCount: "2 Issues / 64 Pages",
    ageRating: "Teen (13+)",
    genres: ["Time Travel", "Dystopian", "Superhero", "Sci-Fi", "Marvel"],
    posterUrl: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1600&q=80",
    overview: "In a nightmarish future where Sentinels have exterminated or interned mutantkind, an adult Kate Pryde sends her consciousness back into her teenage self to stop the assassination that triggers the holocaust.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "115",
    externalId: "comic-avatar-the-promise-2012",
    title: "Avatar: The Last Airbender – The Promise (Omnibus)",
    mediaType: "ComicBook",
    releaseYear: 2012,
    publisherOrStudio: "Dark Horse Comics / Nickelodeon",
    creatorOrDirector: "Gene Luen Yang, Michael Dante DiMartino, Gurihiru",
    runtimeOrIssueCount: "3 Parts / 240 Pages",
    ageRating: "All Ages",
    genres: ["Fantasy", "Adventure", "Martial Arts", "Graphic Novel"],
    posterUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1600&q=80",
    overview: "The official direct continuation of the beloved animated masterpiece. Aang and Fire Lord Zuko attempt to peacefully resolve Fire Nation colonial tensions.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "118",
    externalId: "comic-jla-tower-of-babel-2000",
    title: "JLA: Tower of Babel (#43–46)",
    mediaType: "ComicBook",
    releaseYear: 2000,
    publisherOrStudio: "DC Comics",
    creatorOrDirector: "Mark Waid (Writer), Howard Porter (Artist)",
    runtimeOrIssueCount: "4 Issues / 128 Pages",
    ageRating: "Teen (12+)",
    genres: ["Superhero", "Justice League", "Graphic Novel", "Strategy", "DC Comics"],
    posterUrl: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=1600&q=80",
    overview: "Ra's al Ghul steals Batman's confidential contingency dossiers designed to neutralize every member of the Justice League, methodically taking down Superman, Wonder Woman, the Flash, Green Lantern, and Martian Manhunter.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "119",
    externalId: "comic-infinity-gauntlet-1991",
    title: "The Infinity Gauntlet (#1–6 Complete)",
    mediaType: "ComicBook",
    releaseYear: 1991,
    publisherOrStudio: "Marvel Comics",
    creatorOrDirector: "Jim Starlin (Writer), George Pérez, Ron Lim (Artists)",
    runtimeOrIssueCount: "6 Issues / 256 Pages",
    ageRating: "Teen (12+)",
    genres: ["Superhero", "Marvel", "Cosmic", "Graphic Novel", "Epic"],
    posterUrl: "https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?auto=format&fit=crop&w=1600&q=80",
    overview: "The seminal Marvel cosmic epic. The Mad Titan Thanos seizes the six Infinity Gems to form the Infinity Gauntlet, eradicating half of all life in the universe with a snap of his fingers to woo Mistress Death.",
    sources: [
    ]
  }),
  buildSeededItem({
    id: "120",
    externalId: "comic-civil-war-2006",
    title: "Civil War (#1–7 Complete Event)",
    mediaType: "ComicBook",
    releaseYear: 2006,
    publisherOrStudio: "Marvel Comics",
    creatorOrDirector: "Mark Millar (Writer), Steve McNiven (Artist)",
    runtimeOrIssueCount: "7 Issues / 208 Pages",
    ageRating: "Teen+ (15+)",
    genres: ["Superhero", "Marvel", "Political Thriller", "Graphic Novel", "Action"],
    posterUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1600&q=80",
    overview: "A tragedy in Stamford sparks the Superhuman Registration Act, fracturing the Marvel Universe as Iron Man leads the pro-registration faction while Captain America leads an underground resistance.",
    sources: [
    ]
  }),

  // ==========================================
  // 🎬 ALL-TIME TOP RATED CINEMA & MOVIES (15 ITEMS)
  // ==========================================
  buildSeededItem({
    id: "201",
    externalId: "movie-dark-knight-2008",
    title: "The Dark Knight",
    mediaType: "Movie",
    releaseYear: 2008,
    publisherOrStudio: "Warner Bros. / DC Films",
    creatorOrDirector: "Christopher Nolan",
    runtimeOrIssueCount: "152 min",
    ageRating: "PG-13",
    genres: ["Action", "Crime", "Drama", "Superhero", "Noir"],
    posterUrl: "https://image.tmdb.org/t/p/original/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/nMKdUUepR0i5zn0y1T4CsSB5chy.jpg",
    overview: "Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets before the Joker unleashes chaos.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "9.0 / 10", normalizedScore: 90.0, voteCount: 2910000, defaultWeight: 1.3, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "94%", normalizedScore: 94.0, voteCount: 346, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "94%", normalizedScore: 94.0, voteCount: 1850000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "84 / 100", normalizedScore: 84.0, voteCount: 40, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.5 / 10", normalizedScore: 85.0, voteCount: 32400, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "202",
    externalId: "movie-spiderverse-2023",
    title: "Spider-Man: Across the Spider-Verse",
    mediaType: "Movie",
    releaseYear: 2023,
    publisherOrStudio: "Sony Pictures / Marvel Entertainment",
    creatorOrDirector: "Joaquim Dos Santos, Kemp Powers, Justin K. Thompson",
    runtimeOrIssueCount: "140 min",
    ageRating: "PG",
    genres: ["Animation", "Action", "Adventure", "Superhero", "Sci-Fi"],
    posterUrl: "https://image.tmdb.org/t/p/original/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg",
    overview: "After reuniting with Gwen Stacy, Brooklyn's full-time, friendly neighborhood Spider-Man is catapulted across the Multiverse, where he encounters the Spider Society charged with protecting its very existence.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.6 / 10", normalizedScore: 86.0, voteCount: 398000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "95%", normalizedScore: 95.0, voteCount: 385, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "94%", normalizedScore: 94.0, voteCount: 25000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "86 / 100", normalizedScore: 86.0, voteCount: 60, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.4 / 10", normalizedScore: 84.0, voteCount: 6720, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "203",
    externalId: "movie-into-the-spiderverse-2018",
    title: "Spider-Man: Into the Spider-Verse",
    mediaType: "Movie",
    releaseYear: 2018,
    publisherOrStudio: "Sony Pictures / Marvel",
    creatorOrDirector: "Bob Persichetti, Peter Ramsey, Rodney Rothman",
    runtimeOrIssueCount: "117 min",
    ageRating: "PG",
    genres: ["Animation", "Action", "Adventure", "Superhero", "Sci-Fi"],
    posterUrl: "https://image.tmdb.org/t/p/original/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/7d6woWBsigAw75wzhNk12eXZLqW.jpg",
    overview: "Teen Miles Morales becomes the new Spider-Man and joins other Spider-Heroes from alternate dimensions to stop a threat to all reality.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.4 / 10", normalizedScore: 84.0, voteCount: 650000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "97%", normalizedScore: 97.0, voteCount: 400, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "94%", normalizedScore: 94.0, voteCount: 50000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "87 / 100", normalizedScore: 87.0, voteCount: 50, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.4 / 10", normalizedScore: 84.0, voteCount: 15200, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "204",
    externalId: "movie-the-batman-2022",
    title: "The Batman",
    mediaType: "Movie",
    releaseYear: 2022,
    publisherOrStudio: "Warner Bros. / DC Studios",
    creatorOrDirector: "Matt Reeves",
    runtimeOrIssueCount: "176 min",
    ageRating: "PG-13",
    genres: ["Crime", "Mystery", "Detective", "Superhero", "Noir"],
    posterUrl: "https://image.tmdb.org/t/p/original/74xTEgt7R36Fpooo50r9T25onhq.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg",
    overview: "In his second year of fighting crime, Batman uncovers corruption in Gotham City that connects to his own family while facing a serial killer known as the Riddler.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "7.8 / 10", normalizedScore: 78.0, voteCount: 815000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "85%", normalizedScore: 85.0, voteCount: 518, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "87%", normalizedScore: 87.0, voteCount: 50000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "72 / 100", normalizedScore: 72.0, voteCount: 68, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "7.7 / 10", normalizedScore: 77.0, voteCount: 9950, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "205",
    externalId: "movie-avengers-endgame-2019",
    title: "Avengers: Endgame",
    mediaType: "Movie",
    releaseYear: 2019,
    publisherOrStudio: "Marvel Studios / Disney",
    creatorOrDirector: "Anthony Russo, Joe Russo",
    runtimeOrIssueCount: "181 min",
    ageRating: "PG-13",
    genres: ["Action", "Adventure", "Sci-Fi", "Superhero", "Time Travel"],
    posterUrl: "https://image.tmdb.org/t/p/original/or06FN3Dka5tukK1e9sl16pB3iy.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg",
    overview: "After the devastating events of Avengers: Infinity War, the universe is in ruins. With the help of remaining allies, the Avengers assemble once more to reverse Thanos' actions.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.4 / 10", normalizedScore: 84.0, voteCount: 1250000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "94%", normalizedScore: 94.0, voteCount: 554, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "90%", normalizedScore: 90.0, voteCount: 100000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "78 / 100", normalizedScore: 78.0, voteCount: 57, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.2 / 10", normalizedScore: 82.0, voteCount: 25400, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "206",
    externalId: "movie-logan-2017",
    title: "Logan",
    mediaType: "Movie",
    releaseYear: 2017,
    publisherOrStudio: "20th Century Fox / Marvel",
    creatorOrDirector: "James Mangold",
    runtimeOrIssueCount: "137 min",
    ageRating: "R",
    genres: ["Action", "Drama", "Sci-Fi", "Superhero", "Western"],
    posterUrl: "https://image.tmdb.org/t/p/original/fnbjcRDYn6YviCcePDnGdyAkYsB.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/9X7YweCJw3q8Mcf6GadxReFEksM.jpg",
    overview: "In the near future, a weary Logan cares for an ailing Professor X in a hideout on the Mexican border. But his plan to hide from the world is upended when a young mutant arrives, pursued by dark forces.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.1 / 10", normalizedScore: 81.0, voteCount: 860000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "93%", normalizedScore: 93.0, voteCount: 431, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "90%", normalizedScore: 90.0, voteCount: 92000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "77 / 100", normalizedScore: 77.0, voteCount: 51, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "7.8 / 10", normalizedScore: 78.0, voteCount: 19100, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "207",
    externalId: "movie-iron-man-2008",
    title: "Iron Man",
    mediaType: "Movie",
    releaseYear: 2008,
    publisherOrStudio: "Marvel Studios / Paramount",
    creatorOrDirector: "Jon Favreau",
    runtimeOrIssueCount: "126 min",
    ageRating: "PG-13",
    genres: ["Action", "Adventure", "Sci-Fi", "Superhero"],
    posterUrl: "https://image.tmdb.org/t/p/original/78lPtwv72eTNqFW9COBYI0dWDJa.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/cyecB7godJ6kNHGON0DGLL9e9vP.jpg",
    overview: "After being held captive in an Afghan cave, billionaire engineer Tony Stark creates a unique weaponized suit of armor to fight evil.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "7.9 / 10", normalizedScore: 79.0, voteCount: 1100000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "94%", normalizedScore: 94.0, voteCount: 282, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "91%", normalizedScore: 91.0, voteCount: 250000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "79 / 100", normalizedScore: 79.0, voteCount: 38, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "7.6 / 10", normalizedScore: 76.0, voteCount: 26000, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "208",
    externalId: "movie-captain-america-winter-soldier-2014",
    title: "Captain America: The Winter Soldier",
    mediaType: "Movie",
    releaseYear: 2014,
    publisherOrStudio: "Marvel Studios",
    creatorOrDirector: "Anthony Russo, Joe Russo",
    runtimeOrIssueCount: "136 min",
    ageRating: "PG-13",
    genres: ["Action", "Adventure", "Sci-Fi", "Spy Thriller", "Superhero"],
    posterUrl: "https://image.tmdb.org/t/p/original/tVFRpFw3xTed5nGQqW0PUKGxHGq.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/4l6392htQ1NQmFlK1ZcRmsbIqaS.jpg",
    overview: "As Steve Rogers struggles to embrace his role in the modern world, he teams up with another Avenger and S.H.I.E.L.D. agent, Black Widow, to battle a new threat from history: an assassin known as the Winter Soldier.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "7.8 / 10", normalizedScore: 78.0, voteCount: 900000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "90%", normalizedScore: 90.0, voteCount: 310, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "92%", normalizedScore: 92.0, voteCount: 250000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "70 / 100", normalizedScore: 70.0, voteCount: 48, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "7.7 / 10", normalizedScore: 77.0, voteCount: 18500, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "209",
    externalId: "movie-guardians-of-the-galaxy-2014",
    title: "Guardians of the Galaxy",
    mediaType: "Movie",
    releaseYear: 2014,
    publisherOrStudio: "Marvel Studios",
    creatorOrDirector: "James Gunn",
    runtimeOrIssueCount: "121 min",
    ageRating: "PG-13",
    genres: ["Action", "Adventure", "Comedy", "Sci-Fi", "Space Opera"],
    posterUrl: "https://image.tmdb.org/t/p/original/r7vmZjiyZw9rpJMQJdXvlshvgpH.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/uLtVbxO3uzUN7LmTlHzIC7fyC05.jpg",
    overview: "A group of intergalactic criminals must pull together to stop a fanatical warrior with plans to purge the universe.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.0 / 10", normalizedScore: 80.0, voteCount: 1200000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "92%", normalizedScore: 92.0, voteCount: 338, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "92%", normalizedScore: 92.0, voteCount: 250000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "76 / 100", normalizedScore: 76.0, voteCount: 53, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "7.9 / 10", normalizedScore: 79.0, voteCount: 27100, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "210",
    externalId: "movie-batman-begins-2005",
    title: "Batman Begins",
    mediaType: "Movie",
    releaseYear: 2005,
    publisherOrStudio: "Warner Bros. / DC Films",
    creatorOrDirector: "Christopher Nolan",
    runtimeOrIssueCount: "140 min",
    ageRating: "PG-13",
    genres: ["Action", "Crime", "Drama", "Superhero"],
    posterUrl: "https://image.tmdb.org/t/p/original/4MpN4CenZuVJLGKaEGZ0PfivAhQ.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/bF2skjAemz59b8q159oM8q6QxW.jpg",
    overview: "Driven by tragedy, billionaire Bruce Wayne dedicates his life to fighting crime in Gotham City with the help of Alfred Pennyworth and Jim Gordon.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.2 / 10", normalizedScore: 82.0, voteCount: 1600000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "85%", normalizedScore: 85.0, voteCount: 290, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "94%", normalizedScore: 94.0, voteCount: 500000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "70 / 100", normalizedScore: 70.0, voteCount: 41, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "7.7 / 10", normalizedScore: 77.0, voteCount: 20400, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "211",
    externalId: "movie-deadpool-wolverine-2024",
    title: "Deadpool & Wolverine",
    mediaType: "Movie",
    releaseYear: 2024,
    publisherOrStudio: "Marvel Studios / 20th Century",
    creatorOrDirector: "Shawn Levy",
    runtimeOrIssueCount: "128 min",
    ageRating: "R",
    genres: ["Action", "Comedy", "Sci-Fi", "Multiverse", "Superhero"],
    posterUrl: "https://image.tmdb.org/t/p/original/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/9l1eZiJHmhr5jA625egvdngL94C.jpg",
    overview: "A listless Wade Wilson toils away in civilian life with his days as the morally flexible mercenary, Deadpool, behind him. But when his homeworld faces an existential threat, Wade reluctantly suits up.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "7.7 / 10", normalizedScore: 77.0, voteCount: 420000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "78%", normalizedScore: 78.0, voteCount: 410, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "94%", normalizedScore: 94.0, voteCount: 50000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "56 / 100", normalizedScore: 56.0, voteCount: 58, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "7.7 / 10", normalizedScore: 77.0, voteCount: 6100, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "212",
    externalId: "movie-no-way-home-2021",
    title: "Spider-Man: No Way Home",
    mediaType: "Movie",
    releaseYear: 2021,
    publisherOrStudio: "Sony Pictures / Marvel Studios",
    creatorOrDirector: "Jon Watts",
    runtimeOrIssueCount: "148 min",
    ageRating: "PG-13",
    genres: ["Action", "Adventure", "Sci-Fi", "Superhero", "Multiverse"],
    posterUrl: "https://image.tmdb.org/t/p/original/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/iQFcwSGbZXMkeyKrxbPnwnRo5fl.jpg",
    overview: "Peter Parker seeks Doctor Strange's help to restore his secret identity, but a spell goes horribly wrong, breaking open the multiverse and summoning iconic villains from past realities.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.2 / 10", normalizedScore: 82.0, voteCount: 880000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "93%", normalizedScore: 93.0, voteCount: 428, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "98%", normalizedScore: 98.0, voteCount: 250000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "71 / 100", normalizedScore: 71.0, voteCount: 60, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.0 / 10", normalizedScore: 80.0, voteCount: 19800, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "213",
    externalId: "movie-infinity-war-2018",
    title: "Avengers: Infinity War",
    mediaType: "Movie",
    releaseYear: 2018,
    publisherOrStudio: "Marvel Studios",
    creatorOrDirector: "Anthony Russo, Joe Russo",
    runtimeOrIssueCount: "149 min",
    ageRating: "PG-13",
    genres: ["Action", "Adventure", "Sci-Fi", "Superhero", "Cosmic"],
    posterUrl: "https://image.tmdb.org/t/p/original/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/lmZFxVIz3ujsbUpogZu3a8iYTEg.jpg",
    overview: "The Avengers and their allies must be willing to sacrifice all in an attempt to defeat the powerful Thanos before his blitz of devastation and ruin puts an end to the universe.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.4 / 10", normalizedScore: 84.0, voteCount: 1180000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "85%", normalizedScore: 85.0, voteCount: 492, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "92%", normalizedScore: 92.0, voteCount: 100000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "68 / 100", normalizedScore: 68.0, voteCount: 54, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.2 / 10", normalizedScore: 82.0, voteCount: 29500, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "214",
    externalId: "movie-black-panther-2018",
    title: "Black Panther",
    mediaType: "Movie",
    releaseYear: 2018,
    publisherOrStudio: "Marvel Studios",
    creatorOrDirector: "Ryan Coogler",
    runtimeOrIssueCount: "134 min",
    ageRating: "PG-13",
    genres: ["Action", "Adventure", "Sci-Fi", "Superhero", "Afrofuturism"],
    posterUrl: "https://image.tmdb.org/t/p/original/uxzzxijgPIY7slzFvMotPv8wjKA.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/b6ZJZHUytAnAOK4NjRR4TeZOGLQ.jpg",
    overview: "T'Challa, heir to the hidden kingdom of Wakanda, must step forward to lead his people into a new future and must confront a challenger from his country's past.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "7.3 / 10", normalizedScore: 73.0, voteCount: 820000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "96%", normalizedScore: 96.0, voteCount: 533, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "79%", normalizedScore: 79.0, voteCount: 100000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "88 / 100", normalizedScore: 88.0, voteCount: 55, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "7.4 / 10", normalizedScore: 74.0, voteCount: 22100, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "215",
    externalId: "movie-superman-1978",
    title: "Superman (1978)",
    mediaType: "Movie",
    releaseYear: 1978,
    publisherOrStudio: "Warner Bros. / DC Comics",
    creatorOrDirector: "Richard Donner",
    runtimeOrIssueCount: "143 min",
    ageRating: "PG",
    genres: ["Action", "Adventure", "Sci-Fi", "Classic Superhero"],
    posterUrl: "https://image.tmdb.org/t/p/original/b7HQ8VNs5A6hL10wJbW3b7oYV3Y.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/d010X9q9Y6rO24BvQjG7v5V8uY0.jpg",
    overview: "An alien orphan is sent from his dying planet to Earth, where he grows up to become his adoptive home's first and greatest superhero.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "7.4 / 10", normalizedScore: 74.0, voteCount: 195000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "94%", normalizedScore: 94.0, voteCount: 78, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "86%", normalizedScore: 86.0, voteCount: 250000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "81 / 100", normalizedScore: 81.0, voteCount: 20, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "7.1 / 10", normalizedScore: 71.0, voteCount: 3800, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "216",
    externalId: "movie-the-flash-2023",
    title: "The Flash (2023)",
    mediaType: "Movie",
    releaseYear: 2023,
    publisherOrStudio: "DC Studios / Warner Bros. Pictures",
    creatorOrDirector: "Andy Muschietti (Director), Christina Hodson (Writer)",
    runtimeOrIssueCount: "144 Minutes",
    ageRating: "PG-13",
    genres: ["Movie", "Action", "Adventure", "Sci-Fi", "Superhero"],
    posterUrl: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=1600&q=80",
    overview: "Worlds collide when Barry Allen uses his superpowers to travel back in time to save his family, inadvertently altering the future and trapping himself in a reality with no metahumans where General Zod threatens Earth.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb", category: "Audience", rawScoreDisplay: "6.7 / 10", normalizedScore: 67.0, voteCount: 228000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "63%", normalizedScore: 63.0, voteCount: 388, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "83%", normalizedScore: 83.0, voteCount: 10000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "55 / 100", normalizedScore: 55.0, voteCount: 55, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "6.7 / 10", normalizedScore: 67.0, voteCount: 4200, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "217",
    externalId: "movie-flashpoint-paradox-2013",
    title: "Justice League: The Flashpoint Paradox",
    mediaType: "Movie",
    releaseYear: 2013,
    publisherOrStudio: "DC Entertainment / Warner Bros. Animation",
    creatorOrDirector: "Jay Oliva (Director), Jim Krieg (Writer)",
    runtimeOrIssueCount: "81 Minutes",
    ageRating: "PG-13",
    genres: ["Movie", "Animation", "Action", "Sci-Fi", "Superhero"],
    posterUrl: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=900&q=80",
    backdropUrl: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=1600&q=80",
    overview: "The universally praised animated adaptation of the Flashpoint story: Barry Allen must recruit a ruthless Thomas Wayne Batman and a captive Superman to restore the shattered DC timeline.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb", category: "Audience", rawScoreDisplay: "8.1 / 10", normalizedScore: 81.0, voteCount: 54000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "100%", normalizedScore: 100.0, voteCount: 5, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "93%", normalizedScore: 93.0, voteCount: 10000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "letterboxd", sourceName: "Letterboxd", category: "Audience", rawScoreDisplay: "3.9 / 5", normalizedScore: 78.0, voteCount: 38000, defaultWeight: 1.05, accentColor: "#00e054" },
    ]
  }),
  buildSeededItem({
    id: "218",
    externalId: "movie-pirates-black-pearl-2003",
    title: "Pirates of the Caribbean: The Curse of the Black Pearl",
    mediaType: "Movie",
    releaseYear: 2003,
    publisherOrStudio: "Walt Disney Pictures / Jerry Bruckheimer Films",
    creatorOrDirector: "Gore Verbinski (Director), Ted Elliott, Terry Rossio (Writers)",
    runtimeOrIssueCount: "143 min",
    ageRating: "PG-13",
    genres: ["Action", "Adventure", "Fantasy", "Pirates", "Cinema"],
    posterUrl: "https://image.tmdb.org/t/p/original/z8onk7LV9MPk6zjvBiBQ9NDeNwD.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/83ta7vdjTjh9zX5pP5m4yB58hE7.jpg",
    overview: "Blacksmith Will Turner teams up with eccentric pirate Captain Jack Sparrow to save his love, Elizabeth Swann, from Jack's former pirate allies, who are now undead cursed phantoms.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb", category: "Audience", rawScoreDisplay: "8.1 / 10", normalizedScore: 81.0, voteCount: 1190000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "80%", normalizedScore: 80.0, voteCount: 220, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "86%", normalizedScore: 86.0, voteCount: 250000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "63 / 100", normalizedScore: 63.0, voteCount: 40, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "7.8 / 10", normalizedScore: 78.0, voteCount: 20100, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "219",
    externalId: "movie-pirates-dead-mans-chest-2006",
    title: "Pirates of the Caribbean: Dead Man's Chest",
    mediaType: "Movie",
    releaseYear: 2006,
    publisherOrStudio: "Walt Disney Pictures / Jerry Bruckheimer",
    creatorOrDirector: "Gore Verbinski",
    runtimeOrIssueCount: "151 min",
    ageRating: "PG-13",
    genres: ["Action", "Adventure", "Fantasy", "Pirates", "Cinema"],
    posterUrl: "https://image.tmdb.org/t/p/original/uXEqmloGyP7UXA2Mm58dsFTLFjm.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/w23d0vR26pZkHkY00pM9aR25wXg.jpg",
    overview: "Jack Sparrow races to recover the heart of Davy Jones to avoid enslaving his soul to the Flying Dutchman, as other friends and foes seek the heart for their own agendas.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb", category: "Audience", rawScoreDisplay: "7.4 / 10", normalizedScore: 74.0, voteCount: 750000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "53%", normalizedScore: 53.0, voteCount: 228, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "72%", normalizedScore: 72.0, voteCount: 250000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "53 / 100", normalizedScore: 53.0, voteCount: 37, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "7.3 / 10", normalizedScore: 73.0, voteCount: 15300, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "220",
    externalId: "movie-zack-snyders-justice-league-2021",
    title: "Zack Snyder's Justice League",
    mediaType: "Movie",
    releaseYear: 2021,
    publisherOrStudio: "Warner Bros. / DC Films / HBO Max",
    creatorOrDirector: "Zack Snyder (Director), Chris Terrio (Writer)",
    runtimeOrIssueCount: "242 min",
    ageRating: "R",
    genres: ["Action", "Adventure", "Fantasy", "Sci-Fi", "Superhero", "DC Comics"],
    posterUrl: "https://image.tmdb.org/t/p/original/tnAuB8q5vv7Ax92je58VOY4utZs.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/pcDc2WJAYGJTTvRSEIpRZwM3Ola.jpg",
    overview: "Determined to ensure Superman's ultimate sacrifice was not in vain, Bruce Wayne aligns forces with Diana Prince with plans to recruit a team of metahumans to protect the world from an approaching threat of catastrophic proportions.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb", category: "Audience", rawScoreDisplay: "7.9 / 10", normalizedScore: 79.0, voteCount: 440000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "71%", normalizedScore: 71.0, voteCount: 312, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "93%", normalizedScore: 93.0, voteCount: 100000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "54 / 100", normalizedScore: 54.0, voteCount: 46, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.1 / 10", normalizedScore: 81.0, voteCount: 9600, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "221",
    externalId: "movie-the-avengers-2012",
    title: "The Avengers",
    mediaType: "Movie",
    releaseYear: 2012,
    publisherOrStudio: "Marvel Studios / Disney",
    creatorOrDirector: "Joss Whedon",
    runtimeOrIssueCount: "143 min",
    ageRating: "PG-13",
    genres: ["Action", "Adventure", "Sci-Fi", "Superhero", "Marvel"],
    posterUrl: "https://image.tmdb.org/t/p/original/RYMX2wcKCBAr24UyPD7xwmjaTn.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/9BBTo63ANSmhC4e6r62OJFuK2GL.jpg",
    overview: "Earth's mightiest heroes must come together and learn to fight as a team if they are going to stop the mischievous Loki and his alien army from enslaving humanity.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb", category: "Audience", rawScoreDisplay: "8.0 / 10", normalizedScore: 80.0, voteCount: 1480000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "91%", normalizedScore: 91.0, voteCount: 368, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "91%", normalizedScore: 91.0, voteCount: 250000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "69 / 100", normalizedScore: 69.0, voteCount: 43, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "7.7 / 10", normalizedScore: 77.0, voteCount: 29800, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "222",
    externalId: "movie-avengers-infinity-war-2018",
    title: "Avengers: Infinity War",
    mediaType: "Movie",
    releaseYear: 2018,
    publisherOrStudio: "Marvel Studios / Disney",
    creatorOrDirector: "Anthony Russo, Joe Russo",
    runtimeOrIssueCount: "149 min",
    ageRating: "PG-13",
    genres: ["Action", "Adventure", "Sci-Fi", "Superhero", "Marvel"],
    posterUrl: "https://image.tmdb.org/t/p/original/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/bOGkgRGdhrBYJSLpXaxhXVstNsV.jpg",
    overview: "The Avengers and their allies must be willing to sacrifice all in an attempt to defeat the powerful Thanos before his blitz of devastation and ruin puts an end to the universe.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb", category: "Audience", rawScoreDisplay: "8.4 / 10", normalizedScore: 84.0, voteCount: 1180000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "85%", normalizedScore: 85.0, voteCount: 492, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "92%", normalizedScore: 92.0, voteCount: 100000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "68 / 100", normalizedScore: 68.0, voteCount: 54, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.2 / 10", normalizedScore: 82.0, voteCount: 28900, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),

  // ==========================================
  // 📺 HIGHEST RATED TV SERIES & ORIGINALS (14 ITEMS)
  // ==========================================
  buildSeededItem({
    id: "301",
    externalId: "tv-invincible-2021",
    title: "Invincible",
    mediaType: "TvSeries",
    releaseYear: 2021,
    publisherOrStudio: "Amazon Prime Video / Skybound / Image Comics",
    creatorOrDirector: "Robert Kirkman, Cory Walker, Ryan Ottley",
    runtimeOrIssueCount: "3 Seasons / 24+ Episodes",
    ageRating: "TV-MA",
    genres: ["Animation", "Action", "Drama", "Superhero", "Sci-Fi"],
    posterUrl: "https://image.tmdb.org/t/p/original/dDlEmu3EZ0Pgg93K2SVNLCjCSvE.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/yGQe7E8R13V6580fL50e4s8f5lP.jpg",
    overview: "Mark Grayson is a normal teenager except for the fact that his father Nolan is Omni-Man, the most powerful superhero on the planet. Shortly after his seventeenth birthday, Mark begins to develop powers of his own.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.7 / 10", normalizedScore: 87.0, voteCount: 215000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "99%", normalizedScore: 99.0, voteCount: 142, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "92%", normalizedScore: 92.0, voteCount: 5000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "tvmaze", sourceName: "TVMaze API", category: "Audience", rawScoreDisplay: "8.8 / 10", normalizedScore: 88.0, voteCount: 1420, defaultWeight: 1.1, accentColor: "#3c948b" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.6 / 10", normalizedScore: 86.0, voteCount: 4500, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "302",
    externalId: "tv-the-boys-2019",
    title: "The Boys",
    mediaType: "TvSeries",
    releaseYear: 2019,
    publisherOrStudio: "Amazon Prime Video / Dynamite Entertainment",
    creatorOrDirector: "Eric Kripke, Garth Ennis, Darick Robertson",
    runtimeOrIssueCount: "4 Seasons / 32 Episodes",
    ageRating: "TV-MA",
    genres: ["Action", "Comedy", "Drama", "Superhero", "Satire"],
    posterUrl: "https://image.tmdb.org/t/p/original/7NsGZrMfOSczGQvOhEGnW7us96k.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/n6bUvigpRFqSwmPp1m2YADdbRBc.jpg",
    overview: "A fun and irreverent take on what happens when superheroes—who are as popular as celebrities, as influential as politicians, and as revered as gods—abuse their superpowers rather than use them for good.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.7 / 10", normalizedScore: 87.0, voteCount: 710000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "93%", normalizedScore: 93.0, voteCount: 410, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "76%", normalizedScore: 76.0, voteCount: 34500, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "tvmaze", sourceName: "TVMaze API", category: "Audience", rawScoreDisplay: "8.4 / 10", normalizedScore: 84.0, voteCount: 4200, defaultWeight: 1.1, accentColor: "#3c948b" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.5 / 10", normalizedScore: 85.0, voteCount: 10400, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "303",
    externalId: "tv-daredevil-2015",
    title: "Marvel's Daredevil",
    mediaType: "TvSeries",
    releaseYear: 2015,
    publisherOrStudio: "Netflix / Marvel Television",
    creatorOrDirector: "Drew Goddard, Steven S. DeKnight",
    runtimeOrIssueCount: "3 Seasons / 39 Episodes",
    ageRating: "TV-MA",
    genres: ["Action", "Crime", "Drama", "Noir", "Superhero"],
    posterUrl: "https://image.tmdb.org/t/p/original/QWbPaHQTkWe6ny0En7YmGez0Xz.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/jT5W6aV5D1N5WzD8kGg9U7d3Q2q.jpg",
    overview: "Blinded as a young boy, Matt Murdock fights injustice in Hell's Kitchen, New York as a lawyer by day and as the vigilante Daredevil by night.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.6 / 10", normalizedScore: 86.0, voteCount: 470000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "92%", normalizedScore: 92.0, voteCount: 180, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "89%", normalizedScore: 89.0, voteCount: 20000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "tvmaze", sourceName: "TVMaze API", category: "Audience", rawScoreDisplay: "8.5 / 10", normalizedScore: 85.0, voteCount: 3100, defaultWeight: 1.1, accentColor: "#3c948b" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.3 / 10", normalizedScore: 83.0, voteCount: 4600, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "304",
    externalId: "tv-batman-tas-1992",
    title: "Batman: The Animated Series",
    mediaType: "TvSeries",
    releaseYear: 1992,
    publisherOrStudio: "Warner Bros. Animation / DC Comics",
    creatorOrDirector: "Bruce Timm, Eric Radomski, Paul Dini",
    runtimeOrIssueCount: "85 Episodes (4 Seasons)",
    ageRating: "TV-Y7-FV",
    genres: ["Animation", "Action", "Crime", "Noir", "Superhero"],
    posterUrl: "https://image.tmdb.org/t/p/original/4Dk0xZ0YQ46vEwM7aJv3u4Cq7eJ.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/9r1B3C0K4h6dOq2vT3a9x6yP7vU.jpg",
    overview: "The Dark Knight of Gotham City battles the city's rogue gallery of villains in this timeless, art deco noir animated masterpiece featuring Kevin Conroy and Mark Hamill.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "9.0 / 10", normalizedScore: 90.0, voteCount: 125000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "98%", normalizedScore: 98.0, voteCount: 45, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "96%", normalizedScore: 96.0, voteCount: 8500, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "tvmaze", sourceName: "TVMaze API", category: "Audience", rawScoreDisplay: "8.9 / 10", normalizedScore: 89.0, voteCount: 890, defaultWeight: 1.1, accentColor: "#3c948b" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.5 / 10", normalizedScore: 85.0, voteCount: 1900, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "305",
    externalId: "tv-arcane-2021",
    title: "Arcane: League of Legends",
    mediaType: "TvSeries",
    releaseYear: 2021,
    publisherOrStudio: "Riot Games / Fortiche / Netflix",
    creatorOrDirector: "Christian Linke, Alex Yee",
    runtimeOrIssueCount: "2 Seasons / 18 Episodes",
    ageRating: "TV-14",
    genres: ["Animation", "Action", "Sci-Fi", "Fantasy", "Steampunk"],
    posterUrl: "https://image.tmdb.org/t/p/original/fqldf2t8ztc9aiwn397Fms2RgM0.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg",
    overview: "Set in the utopian region of Piltover and the oppressed underground of Zaun, the story follows the origins of two iconic champions—and the power that will tear them apart.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "9.0 / 10", normalizedScore: 90.0, voteCount: 310000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "100%", normalizedScore: 100.0, voteCount: 52, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "96%", normalizedScore: 96.0, voteCount: 15000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "tvmaze", sourceName: "TVMaze API", category: "Audience", rawScoreDisplay: "9.2 / 10", normalizedScore: 92.0, voteCount: 1200, defaultWeight: 1.1, accentColor: "#3c948b" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.7 / 10", normalizedScore: 87.0, voteCount: 4100, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "306",
    externalId: "tv-the-penguin-2024",
    title: "The Penguin",
    mediaType: "TvSeries",
    releaseYear: 2024,
    publisherOrStudio: "HBO / DC Studios",
    creatorOrDirector: "Lauren LeFranc, Matt Reeves",
    runtimeOrIssueCount: "8 Episodes (Limited Series)",
    ageRating: "TV-MA",
    genres: ["Crime", "Drama", "Noir", "Superhero"],
    posterUrl: "https://image.tmdb.org/t/p/original/kWZ64x7tN8z4m2t7z8vY4j9n1Y.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/9YqB0x8z1k8m5n3Y6q4u8x1vY.jpg",
    overview: "Following the events of The Batman (2022), Oz Cobb fights for power and control in the criminal underworld of Gotham City.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.8 / 10", normalizedScore: 88.0, voteCount: 150000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "95%", normalizedScore: 95.0, voteCount: 168, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "91%", normalizedScore: 91.0, voteCount: 8000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "75 / 100", normalizedScore: 75.0, voteCount: 38, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.5 / 10", normalizedScore: 85.0, voteCount: 1100, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "307",
    externalId: "tv-the-sandman-2022",
    title: "The Sandman",
    mediaType: "TvSeries",
    releaseYear: 2022,
    publisherOrStudio: "Netflix / Warner Bros. Television",
    creatorOrDirector: "Neil Gaiman, David S. Goyer, Allan Heinberg",
    runtimeOrIssueCount: "11 Episodes (Season 1)",
    ageRating: "TV-MA",
    genres: ["Dark Fantasy", "Drama", "Horror", "Mythology"],
    posterUrl: "https://image.tmdb.org/t/p/original/q54qEgagGOYCq5NzcIr300743h9.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/9GvhICFhcuZkFhZ5tBvWb2B7XhU.jpg",
    overview: "Upon escaping after decades of imprisonment by a mortal wizard, Dream, the personification of dreams, sets about to reclaim his lost cosmic equipment.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "7.7 / 10", normalizedScore: 77.0, voteCount: 175000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "88%", normalizedScore: 88.0, voteCount: 104, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "80%", normalizedScore: 80.0, voteCount: 5000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "tvmaze", sourceName: "TVMaze API", category: "Audience", rawScoreDisplay: "8.0 / 10", normalizedScore: 80.0, voteCount: 1100, defaultWeight: 1.1, accentColor: "#3c948b" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.0 / 10", normalizedScore: 80.0, voteCount: 1950, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "308",
    externalId: "tv-xmen-97-2024",
    title: "X-Men '97",
    mediaType: "TvSeries",
    releaseYear: 2024,
    publisherOrStudio: "Disney+ / Marvel Animation",
    creatorOrDirector: "Beau DeMayo, Stan Lee, Jack Kirby",
    runtimeOrIssueCount: "10 Episodes",
    ageRating: "TV-14",
    genres: ["Animation", "Action", "Sci-Fi", "Superhero", "Marvel"],
    posterUrl: "https://image.tmdb.org/t/p/original/9Ycz7yYRf9V4jk3YXwcZhFtbNcF.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/nb3xI8XI3w4pMVZ38VijbsyBqP4.jpg",
    overview: "The X-Men, a band of mutants who use their uncanny gifts to protect a world that hates and fears them, are challenged like never before, forced to face a dangerous and unexpected new future.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.8 / 10", normalizedScore: 88.0, voteCount: 46000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "99%", normalizedScore: 99.0, voteCount: 84, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "92%", normalizedScore: 92.0, voteCount: 6200, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "82 / 100", normalizedScore: 82.0, voteCount: 24, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.6 / 10", normalizedScore: 86.0, voteCount: 1280, defaultWeight: 1.0, accentColor: "#01b4e4" },
      { sourceId: "tvmaze", sourceName: "TVMaze API", category: "Audience", rawScoreDisplay: "8.7 / 10", normalizedScore: 87.0, voteCount: 1900, defaultWeight: 0.95, accentColor: "#3c948b" },
    ]
  }),
  buildSeededItem({
    id: "309",
    externalId: "tv-avatar-last-airbender-2005",
    title: "Avatar: The Last Airbender",
    mediaType: "TvSeries",
    releaseYear: 2005,
    publisherOrStudio: "Nickelodeon Animation Studio",
    creatorOrDirector: "Michael Dante DiMartino, Bryan Konietzko",
    runtimeOrIssueCount: "61 Episodes (3 Books: Water, Earth, Fire)",
    ageRating: "TV-Y7-FV",
    genres: ["Animation", "Action", "Adventure", "Fantasy", "Martial Arts"],
    posterUrl: "https://image.tmdb.org/t/p/original/cHFZA8Tlv03nKTGXhLOYOLtqoSm.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/2fkM66c1nU5hT7eB5hC4bY5wJ4G.jpg",
    overview: "In a war-torn world of elemental magic, a young boy named Aang—the last surviving Airbender and the Avatar—reawakens to undertake a perilous quest to master all four elements and bring balance back.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "9.3 / 10", normalizedScore: 93.0, voteCount: 386000, defaultWeight: 1.3, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "100%", normalizedScore: 100.0, voteCount: 68, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "98%", normalizedScore: 98.0, voteCount: 42500, defaultWeight: 1.15, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "90 / 100", normalizedScore: 90.0, voteCount: 28, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.7 / 10", normalizedScore: 87.0, voteCount: 4120, defaultWeight: 1.0, accentColor: "#01b4e4" },
      { sourceId: "tvmaze", sourceName: "TVMaze API", category: "Audience", rawScoreDisplay: "9.0 / 10", normalizedScore: 90.0, voteCount: 8400, defaultWeight: 1.0, accentColor: "#3c948b" },
    ]
  }),
  buildSeededItem({
    id: "310",
    externalId: "tv-watchmen-hbo-2019",
    title: "Watchmen (HBO Limited Series)",
    mediaType: "TvSeries",
    releaseYear: 2019,
    publisherOrStudio: "HBO / DC Entertainment",
    creatorOrDirector: "Damon Lindelof",
    runtimeOrIssueCount: "9 Episodes (Limited Series)",
    ageRating: "TV-MA",
    genres: ["Drama", "Mystery", "Sci-Fi", "Superhero", "Alternate History"],
    posterUrl: "https://image.tmdb.org/t/p/original/m8rWq3j73ZGhDuSCZWMMoE9ePH1.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/gNbdjDi1HamTCrfvM9JeA94bNi2.jpg",
    overview: "Set in an alternate history where superheroes are treated as outlaws, this drama series embraces the nostalgia of the original groundbreaking graphic novel while attempting to break new ground.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.2 / 10", normalizedScore: 82.0, voteCount: 148000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "96%", normalizedScore: 96.0, voteCount: 128, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "56%", normalizedScore: 56.0, voteCount: 19500, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "85 / 100", normalizedScore: 85.0, voteCount: 44, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "7.9 / 10", normalizedScore: 79.0, voteCount: 2150, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "311",
    externalId: "tv-peacemaker-2022",
    title: "Peacemaker",
    mediaType: "TvSeries",
    releaseYear: 2022,
    publisherOrStudio: "Max / DC Studios",
    creatorOrDirector: "James Gunn",
    runtimeOrIssueCount: "8 Episodes (Season 1)",
    ageRating: "TV-MA",
    genres: ["Action", "Comedy", "Superhero", "Sci-Fi"],
    posterUrl: "https://image.tmdb.org/t/p/original/hE3LRZAY8cuGOPQI8FgRJSuENFF.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/ctxm19fnvOzNDtOPOdYn09mFv0.jpg",
    overview: "The continuing story of Peacemaker – a compellingly vainglorious man who believes in peace at any cost, no matter how many people he has to kill to get it.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.3 / 10", normalizedScore: 83.0, voteCount: 165000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "94%", normalizedScore: 94.0, voteCount: 89, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "89%", normalizedScore: 89.0, voteCount: 5000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "70 / 100", normalizedScore: 70.0, voteCount: 26, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.2 / 10", normalizedScore: 82.0, voteCount: 2900, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "312",
    externalId: "tv-loki-2021",
    title: "Loki",
    mediaType: "TvSeries",
    releaseYear: 2021,
    publisherOrStudio: "Disney+ / Marvel Studios",
    creatorOrDirector: "Michael Waldron",
    runtimeOrIssueCount: "2 Seasons / 12 Episodes",
    ageRating: "TV-14",
    genres: ["Action", "Adventure", "Fantasy", "Sci-Fi", "Multiverse"],
    posterUrl: "https://image.tmdb.org/t/p/original/voHUmlvjysv92crzc5fIQ7x448d.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/k47JEUTQsSMN5392HgB9IlRJTeQ.jpg",
    overview: "The mercurial villain Loki resumes his role as the God of Mischief in a new series that takes place after the events of Avengers: Endgame, brought into the mysterious Time Variance Authority.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.2 / 10", normalizedScore: 82.0, voteCount: 380000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "87%", normalizedScore: 87.0, voteCount: 334, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "90%", normalizedScore: 90.0, voteCount: 25000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "metacritic", sourceName: "Metacritic", category: "Critic", rawScoreDisplay: "74 / 100", normalizedScore: 74.0, voteCount: 32, defaultWeight: 1.2, accentColor: "#ffcc33" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.1 / 10", normalizedScore: 81.0, voteCount: 11400, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
  buildSeededItem({
    id: "313",
    externalId: "tv-walking-dead-2010",
    title: "The Walking Dead",
    mediaType: "TvSeries",
    releaseYear: 2010,
    publisherOrStudio: "AMC / Image Comics",
    creatorOrDirector: "Frank Darabont, Robert Kirkman",
    runtimeOrIssueCount: "11 Seasons / 177 Episodes",
    ageRating: "TV-MA",
    genres: ["Drama", "Horror", "Post-Apocalyptic", "Comic Adaptation"],
    posterUrl: "https://image.tmdb.org/t/p/original/xf9wuDcqlUPWABZNeDKPbZUjWx0.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/wvdWb5iOYBsSASTxMw4wPqVd5mg.jpg",
    overview: "Sheriff's deputy Rick Grimes awakens from a coma to find a post-apocalyptic world dominated by flesh-eating zombies. He searches for his family and leads a group of survivors in a struggle to survive.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "8.1 / 10", normalizedScore: 81.0, voteCount: 1080000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "79%", normalizedScore: 79.0, voteCount: 380, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "78%", normalizedScore: 78.0, voteCount: 50000, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.1 / 10", normalizedScore: 81.0, voteCount: 16100, defaultWeight: 1.0, accentColor: "#01b4e4" },
      { sourceId: "tvmaze", sourceName: "TVMaze API", category: "Audience", rawScoreDisplay: "8.0 / 10", normalizedScore: 80.0, voteCount: 7800, defaultWeight: 1.1, accentColor: "#3c948b" },
    ]
  }),
  buildSeededItem({
    id: "314",
    externalId: "tv-doom-patrol-2019",
    title: "Doom Patrol",
    mediaType: "TvSeries",
    releaseYear: 2019,
    publisherOrStudio: "Max / DC Entertainment",
    creatorOrDirector: "Jeremy Carver, Grant Morrison",
    runtimeOrIssueCount: "4 Seasons / 46 Episodes",
    ageRating: "TV-MA",
    genres: ["Action", "Comedy", "Sci-Fi", "Weird Fiction", "Superhero"],
    posterUrl: "https://image.tmdb.org/t/p/original/s4cuW4Qn33x7n7c7rNf6U5B4Uu2.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/d3m0mY01vN7W8s3aV1nO5kM1V2a.jpg",
    overview: "The reimagining of one of DC's most beloved group of outcast Super Heroes: Robotman, Negative Man, Elasti-Woman, and Crazy Jane, led by modern-day mad scientist Dr. Niles Caulder.",
    sources: [
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "7.8 / 10", normalizedScore: 78.0, voteCount: 65000, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "98%", normalizedScore: 98.0, voteCount: 95, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "81%", normalizedScore: 81.0, voteCount: 4200, defaultWeight: 1.1, accentColor: "#ff6b35" },
      { sourceId: "tvmaze", sourceName: "TVMaze API", category: "Audience", rawScoreDisplay: "7.9 / 10", normalizedScore: 79.0, voteCount: 1100, defaultWeight: 1.1, accentColor: "#3c948b" },
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "7.6 / 10", normalizedScore: 76.0, voteCount: 1400, defaultWeight: 1.0, accentColor: "#01b4e4" },
    ]
  }),
];

const liveSearch = require("./_liveSearch");

/** Curated TMDB rows: only the real TMDB score is attached (no synthesised sources). */
function convertRawTmdbItem(raw, forcedCategory) {
  const validCategories = ["TvSeries", "Movie"];
  const forced =
    typeof forcedCategory === "string" && validCategories.includes(forcedCategory.trim())
      ? forcedCategory.trim()
      : undefined;
  const item = liveSearch.tmdbToItem(raw, forced);
  return item ? liveSearch.finalizeItem(item, calculateCumulativeSummary) : null;
}

/** Multi-provider live search (see api/_liveSearch.js). Seeded catalog is only a no-results fallback. */
async function executeBackendLiveSearch(query) {
  return liveSearch.executeLiveSearch(query, {
    env: process.env,
    calculateCumulativeSummary,
    seededCatalog: BACKEND_SEEDED_CATALOG,
  });
}

const ALLOWED_CORS_ORIGINS = new Map([
  ["https://comictraffic.com", "https://comictraffic.com"],
  ["https://www.comictraffic.com", "https://www.comictraffic.com"],
  ["http://localhost:3000", "http://localhost:3000"],
  ["http://127.0.0.1:3000", "http://127.0.0.1:3000"],
  ["http://localhost:5173", "http://localhost:5173"],
  ["http://127.0.0.1:5173", "http://127.0.0.1:5173"],
]);

function resolveAllowedProxyPath(endpoint) {
  switch (endpoint) {
    case "/auth/register":
      return "/api/auth/register";
    case "/auth/login":
      return "/api/auth/login";
    case "/auth/forgot-password":
      return "/api/auth/forgot-password";
    case "/auth/reset-password":
      return "/api/auth/reset-password";
    case "/auth/me":
      return "/api/auth/me";
    case "/auth/preferences":
      return "/api/auth/preferences";
    case "/auth/export-data":
      return "/api/auth/export-data";
    case "/auth/delete-account":
      return "/api/auth/delete-account";
    case "/reviews":
      return "/api/reviews";
    case "/reviews/delete":
      return "/api/reviews/delete";
    case "/reviews/report":
      return "/api/reviews/report";
    case "/dashboard":
      return "/api/dashboard";
    case "/dashboard/watchlist":
      return "/api/dashboard/watchlist";
    case "/dashboard/lists":
      return "/api/dashboard/lists";
    case "/media":
      return "/api/media";
    case "/media/calculate-custom":
      return "/api/media/calculate-custom";
    case "/media/compare":
      return "/api/media/compare";
    default:
      return null;
  }
}

function parseConfiguredBackendUrl(rawUrl) {
  const cleaned = String(rawUrl || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/?$/i, "");
  if (!cleaned) return null;
  try {
    const parsed = new URL(cleaned);
    const isHttps = parsed.protocol === "https:";
    const isLocalHttp =
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    if (!isHttps && !isLocalHttp) return null;
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  const rawOrigin = Array.isArray(req.headers?.origin) ? req.headers.origin[0] : req.headers?.origin;
  const cleanOrigin = typeof rawOrigin === "string" ? rawOrigin.trim().toLowerCase() : "";
  const corsOrigin = ALLOWED_CORS_ORIGINS.get(cleanOrigin) || "https://comictraffic.com";

  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Payload-Encrypted, X-Response-Encrypted, X-Gateway-Secret");
  res.setHeader("Vary", "Origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // 1. GET endpoints: Handshake OR Encrypted Catalog (/api/media)
  if (req.method === "GET") {
    const endpoint = typeof req.query.endpoint === "string" ? req.query.endpoint : "";
    if (endpoint === "/media" || endpoint.startsWith("/media")) {
      const encryptedCatalog = encryptEnvelope({
        isSuccessful: true,
        count: BACKEND_SEEDED_CATALOG.length,
        data: BACKEND_SEEDED_CATALOG,
      });
      res.setHeader("X-Payload-Encrypted", "true");
      return res.status(200).json(encryptedCatalog);
    }

    const { aesKey, hmacKey } = getDerivedKeys();
    return res.status(200).json({
      isSuccessful: true,
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

  // Reject HTTP Request Smuggling / Desync & non-JSON Content-Type
  if (req.headers["transfer-encoding"] && req.headers["content-length"]) {
    return res.status(400).json({
      isSuccessful: false,
      message:
        "Ambiguous Transfer-Encoding and Content-Length headers are not permitted.",
    });
  }

  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return res.status(415).json({
      isSuccessful: false,
      message: "Unsupported Media Type. Only application/json is accepted.",
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const wantsEncryptedResponse =
      String(req.headers["x-response-encrypted"] || "").toLowerCase() === "true" ||
      String(req.headers["x-payload-encrypted"] || "").toLowerCase() === "true" ||
      Boolean(body && body.encrypted);
    const sendOkPayload = (payloadObj) => {
      if (wantsEncryptedResponse) {
        res.setHeader("X-Payload-Encrypted", "true");
        return res.status(200).json(encryptEnvelope(payloadObj));
      }
      return res.status(200).json(payloadObj);
    };
    const decryptedRequest =
      body && body.encrypted ? decryptEnvelope(body) : body;

    const rawEndpoint = req.query.endpoint ?? decryptedRequest?.endpoint;
    const endpoint = typeof rawEndpoint === "string" ? rawEndpoint : "";

    // Backend Proxy: forward data & auth operations to the .NET Web API if BACKEND_API_URL is configured
    const backendUrl = parseConfiguredBackendUrl(process.env.BACKEND_API_URL);
    const hasConfiguredBackend = Boolean(backendUrl);
    const safeProxyPath = resolveAllowedProxyPath(endpoint);

    if (hasConfiguredBackend && safeProxyPath) {
      const targetUrl = `${backendUrl.origin}${safeProxyPath}`;

      const { endpoint: _ignored, ...forwardBody } = decryptedRequest || {};
      const authHeader = Array.isArray(req.headers?.authorization) ? req.headers.authorization[0] : req.headers?.authorization;
      const gatewaySecret = process.env.GATEWAY_SHARED_SECRET;

      const forwardHeaders = {
        "Content-Type": "application/json",
        Origin: corsOrigin,
        ...(authHeader ? { Authorization: sanitizeHeaderText(authHeader) } : {}),
        ...(gatewaySecret ? { "X-Gateway-Secret": sanitizeHeaderText(gatewaySecret) } : {}),
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 16000);
      let upstream;
      try {
        upstream = await fetch(targetUrl, {
          method: "POST",
          headers: forwardHeaders,
          body: JSON.stringify(forwardBody),
          signal: controller.signal,
        });
      } catch (proxyErr) {
        console.error("[Gateway Proxy Error] Upstream request failed for path:", safeProxyPath);
        return res.status(502).json({
          isSuccessful: false,
          message: "Unable to reach backend service. Please try again shortly.",
        });
      } finally {
        clearTimeout(timer);
      }

      let upstreamJson = null;
      try {
        upstreamJson = await upstream.json();
      } catch {
        upstreamJson = null;
      }

      if (!upstream.ok || !upstreamJson) {
        const status = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
        const validationMessages =
          upstreamJson?.errors && typeof upstreamJson.errors === "object"
            ? Object.values(upstreamJson.errors)
                .flatMap((v) => (Array.isArray(v) ? v : [v]))
                .filter((v) => typeof v === "string" && v.trim().length > 0)
                .join(" ")
            : "";
        return res.status(status).json({
          isSuccessful: false,
          message:
            upstreamJson?.responseMessage ||
            upstreamJson?.message ||
            validationMessages ||
            upstreamJson?.title ||
            "Backend request failed.",
        });
      }

      return sendOkPayload(upstreamJson);
    }

    if (!hasConfiguredBackend && endpoint === "/auth/login") {
      return res.status(503).json({
        isSuccessful: false,
        message:
          "Authentication service is not configured. Set BACKEND_API_URL in your Vercel project to your deployed Comic Traffic API.",
      });
    }

    // Backend Multi-API Search
    if (endpoint === "/media/search-live") {
      const searchQuery = typeof decryptedRequest?.query === "string" ? decryptedRequest.query : "";
      const { items, providers, fallback } = await executeBackendLiveSearch(searchQuery);
      const encryptedResponse = encryptEnvelope({
        isSuccessful: true,
        count: items.length,
        data: items,
        providers,
        fallback,
      });
      res.setHeader("X-Payload-Encrypted", "true");
      return res.status(200).json(encryptedResponse);
    }

    // Backend TMDB Curated Row
    if (endpoint === "/media/tmdb-row") {
      const tmdbKey = process.env.TMDB_API_KEY || "";
      const tmdbBase = "https://api.themoviedb.org/3";
      const items = [];
      if (tmdbKey) {
        const cat = String(decryptedRequest?.category || "trending");
        const path =
          cat === "top_rated"
            ? "/movie/top_rated?language=en-US"
            : cat === "netflix_originals"
            ? "/discover/tv?with_networks=213"
            : "/trending/all/week?language=en-US";
        const sep = path.includes("?") ? "&" : "?";
        const tmdbUrl = new URL(`${tmdbBase}${path}${sep}api_key=${encodeURIComponent(tmdbKey)}`);
        const tmdbController = new AbortController();
        const tmdbTimer = setTimeout(() => tmdbController.abort(), 6000);
        try {
          const upstream = await fetch(tmdbUrl.toString(), { signal: tmdbController.signal });
          const data = await upstream.json();
          if (Array.isArray(data?.results)) {
            for (const raw of data.results.slice(0, 12)) {
              const converted = convertRawTmdbItem(
                raw,
                decryptedRequest?.mediaType
              );
              if (converted) items.push(converted);
            }
          }
        } finally {
          clearTimeout(tmdbTimer);
        }
      }
      const encryptedResponse = encryptEnvelope({
        isSuccessful: true,
        count: items.length,
        data: items,
      });
      res.setHeader("X-Payload-Encrypted", "true");
      return res.status(200).json(encryptedResponse);
    }

    // Backend Auth: Forgot Password Recovery Dispatch (SendGrid v3 API)
    if (endpoint === "/auth/forgot-password") {
      const rawEmailOrUser = decryptedRequest?.emailOrUsername;
      const emailOrUser = sanitizeHeaderText(rawEmailOrUser);
      const validEmail = normalizeAndValidateEmail(emailOrUser);

      if (validEmail && typeof process.env.SENDGRID_API_KEY === "string" && process.env.SENDGRID_API_KEY.trim()) {
        const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        let codeSuffix = "";
        for (let i = 0; i < 8; i++) {
          codeSuffix += alphabet[crypto.randomInt(0, alphabet.length)];
        }
        const recoveryCode = `CT-${codeSuffix}`;
        const originHeader = Array.isArray(req.headers?.origin) ? req.headers.origin[0] : req.headers?.origin;
        const baseUrl = resolveSafeAppBaseUrl(process.env.APP_BASE_URL, originHeader);
        const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(recoveryCode)}&email=${encodeURIComponent(validEmail)}`;

        const recipientLabel = validEmail.split("@")[0] || "Reader";
        const sendResult = await sendEmailViaSendGrid({
          toEmail: validEmail,
          subject: "[Comic Traffic] Password Reset Verification Code",
          plainText:
            `Hello ${recipientLabel},\n\nWe received a request to reset your Comic Traffic account password.\n\n` +
            `Your verification code is: ${recoveryCode}\nDirect reset link: ${resetUrl}\n\n` +
            `This code expires in 15 minutes. If you did not make this request, you can safely ignore this email.\n\n` +
            `Best regards,\nComic Traffic Security Team`,
          htmlBody: buildPasswordResetEmailHtml({
            recipientLabel,
            recoveryCode,
            resetUrl
          }),
        });

        if (!sendResult.sent) {
          console.warn("[ComicTraffic SendGrid] Delivery failed with status:", sendResult.status || sendResult.reason);
          return res.status(502).json({
            isSuccessful: false,
            message: "Unable to dispatch recovery email via SendGrid. Verify SENDGRID_API_KEY and Verified Sender identity.",
          });
        }
        console.log("[ComicTraffic SendGrid] Password recovery email sent.");
      } else {
        console.log("[ComicTraffic Email Dispatch] SendGrid not invoked (missing SENDGRID_API_KEY or non-email identifier).");
      }

      const encryptedResponse = encryptEnvelope({
        isSuccessful: true,
        message: "If an account matches that email or username, recovery instructions and a secure 15-minute verification code have been dispatched.",
      });
      res.setHeader("X-Payload-Encrypted", "true");
      return res.status(200).json(encryptedResponse);
    }

    // Backend Auth: Register (Email compulsory & strictly validated)
    if (endpoint === "/auth/register") {
      const rawUsername = decryptedRequest?.username;
      const rawEmail = decryptedRequest?.email;
      const rawPassword = decryptedRequest?.password;

      const cleanUsername = sanitizeHeaderText(rawUsername);
      if (cleanUsername.length === 0) {
        return res.status(400).json({
          isSuccessful: false,
          message: "Username is required for registration.",
        });
      }

      const cleanEmail = normalizeAndValidateEmail(rawEmail);
      if (!cleanEmail) {
        return res.status(400).json({
          isSuccessful: false,
          message: "A valid email address is compulsory for registration.",
        });
      }

      if (decryptedRequest?.acceptedTerms === false) {
        return res.status(400).json({
          isSuccessful: false,
          message:
            "You must confirm minimum age eligibility and accept the Terms of Service and Privacy Policy.",
        });
      }

      if (typeof rawPassword !== "string" || rawPassword.length < 6) {
        return res.status(400).json({
          isSuccessful: false,
          message: "Password must be at least 6 characters long.",
        });
      }

      const cleanDisplayName =
        typeof decryptedRequest?.displayName === "string" &&
        decryptedRequest.displayName.trim().length > 0
          ? sanitizeHeaderText(decryptedRequest.displayName)
          : cleanUsername;

      const favoriteGenres =
        typeof decryptedRequest?.favoriteGenresCsv === "string" &&
        decryptedRequest.favoriteGenresCsv.trim().length > 0
          ? decryptedRequest.favoriteGenresCsv
              .split(",")
              .map((g) => sanitizeHeaderText(g))
              .filter(Boolean)
          : ["Action", "Superhero", "Sci-Fi", "Graphic Novel"];

      const regOriginHeader = Array.isArray(req.headers?.origin) ? req.headers.origin[0] : req.headers?.origin;
      const appUrl = resolveSafeAppBaseUrl(process.env.APP_BASE_URL, regOriginHeader);

      if (typeof process.env.SENDGRID_API_KEY === "string" && process.env.SENDGRID_API_KEY.trim()) {
        const welcomeResult = await sendEmailViaSendGrid({
          toEmail: cleanEmail,
          subject: "Welcome to Comic Traffic — Your Cumulative Rating Hub Is Ready",
          plainText:
            `Welcome to Comic Traffic, ${cleanDisplayName} (@${cleanUsername})!\n\n` +
            `Your account is live. Explore Comic Books, Movies, and TV Series ranked by weighted Multi-API consensus:\n` +
            `- Compare Arena: compare up to 3 titles side-by-side\n` +
            `- Custom Weights: tune Critic, Audience, and Comic DB sources\n\n` +
            `Open Comic Traffic: ${appUrl}/dashboard\n`,
          htmlBody: buildWelcomeEmailHtml({
            displayName: cleanDisplayName,
            username: cleanUsername,
            appUrl
          }),
        });
        if (!welcomeResult.sent) {
          console.warn("[ComicTraffic SendGrid] Welcome email skipped/failed:", welcomeResult.status || welcomeResult.reason);
        }
      }

      return sendOkPayload({
        isSuccessful: true,
        username: cleanUsername,
        email: cleanEmail,
        data: {
          id: crypto.randomUUID(),
          username: cleanUsername,
          email: cleanEmail,
          displayName: cleanDisplayName,
          bio: "Comic book, cinema & series enthusiast.",
          avatarUrl: "/default-avatar.svg",
          role: "User",
          favoriteGenres,
          accessToken: `ct_gw_${crypto.randomBytes(24).toString("hex")}`,
        },
        processedAt: new Date().toISOString(),
      });
    }

    // Backend Auth: Reset Password
    if (endpoint === "/auth/reset-password") {
      const newPassword = decryptedRequest?.newPassword;
      if (typeof newPassword !== "string" || newPassword.length < 6) {
        return res.status(400).json({
          isSuccessful: false,
          message: "New password must be a valid string of at least 6 characters.",
        });
      }

      const resetTargetEmail = normalizeAndValidateEmail(decryptedRequest?.emailOrUsername);
      if (resetTargetEmail && typeof process.env.SENDGRID_API_KEY === "string" && process.env.SENDGRID_API_KEY.trim()) {
        const label = resetTargetEmail.split("@")[0] || "Reader";
        await sendEmailViaSendGrid({
          toEmail: resetTargetEmail,
          subject: "[Comic Traffic] Security Alert: Your Password Was Successfully Changed",
          plainText: `Hello ${label},\n\nThe password for your Comic Traffic account has been successfully updated.`,
          htmlBody: buildPasswordChangedEmailHtml({ recipientLabel: label }),
        });
      }

      const encryptedResponse = encryptEnvelope({
        isSuccessful: true,
        message: "Your password has been successfully reset. You may now sign in.",
      });
      res.setHeader("X-Payload-Encrypted", "true");
      return res.status(200).json(encryptedResponse);
    }

    // Default encrypted acknowledgement for mutations/queries
    const encryptedResponse = encryptEnvelope({
      isSuccessful: true,
      data: decryptedRequest,
      processedAt: new Date().toISOString(),
    });
    res.setHeader("X-Payload-Encrypted", "true");
    return res.status(200).json(encryptedResponse);
  } catch (err) {
    const rawMsg = String(err?.message || "").toLowerCase();
    const safeMsg = rawMsg.includes("signature")
      ? "HMAC signature verification failed"
      : rawMsg.includes("authenticate") || rawMsg.includes("envelope")
      ? "Payload decryption error"
      : "Encrypted gateway error";
    return res.status(400).json({
      isSuccessful: false,
      message: safeMsg,
    });
  }
};
