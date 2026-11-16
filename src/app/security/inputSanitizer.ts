/**
 * Client-Side Input Sanitization & URL Validation Utilities
 * Prevents DOM XSS, javascript:/data: URI injection, and oversized input payloads.
 */
export function sanitizeUserText(input: string, maxLength: number = 1000): string {
  if (!input || typeof input !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
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
  if (trimmed.startsWith("/")) return trimmed;
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
