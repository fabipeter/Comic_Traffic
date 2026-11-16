/**
 * Client-Side Input Sanitization & URL Validation Utilities
 * Prevents DOM XSS, javascript:/data: URI injection, and oversized input payloads.
 */
export function sanitizeUserText(input: string, maxLength: number = 1000): string {
  if (!input || typeof input !== "string") return "";
  let cleaned = "";
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    // Keep printable characters and standard whitespace (tab=9, LF=10, CR=13)
    if (code >= 32 || code === 9 || code === 10 || code === 13) {
      if (code !== 127) {
        cleaned += input[i];
      }
    }
  }
  return cleaned
    .replace(/<\s*\/?\s*(script|iframe|object|embed|svg|link|style|meta)[^>]*>/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/vbscript\s*:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeImageUrl(url: string, fallback: string = "/comic-traffic-logo.svg"): string {
  if (!url || typeof url !== "string") return fallback;
  const trimmed = url.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Validates internal navigation paths (`returnTo` / `redirect`) to prevent Open Redirect
 * and `javascript:` / `data:` / `vbscript:` URI execution.
 */
export function sanitizeReturnToPath(
  candidate: string | null | undefined,
  fallback: string = "/dashboard"
): string {
  if (!candidate || typeof candidate !== "string") return fallback;
  const trimmed = candidate.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }
  const lower = trimmed.toLowerCase();
  if (
    /^(javascript|vbscript|data)\s*:/i.test(lower) ||
    lower.includes("<script") ||
    lower.includes(":")
  ) {
    return fallback;
  }
  return trimmed;
}
