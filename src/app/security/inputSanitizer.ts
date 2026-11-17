/**
 * Client-Side Input Sanitization & URL Validation Utilities
 * Prevents DOM XSS, javascript:/data: URI injection, and oversized input payloads
 * while preserving active keystroke whitespace for search inputs.
 */
function stripHtmlTagsLinear(input: string): string {
  let result = "";
  let inTag = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "<") {
      inTag = true;
      continue;
    }
    if (ch === ">") {
      inTag = false;
      continue;
    }
    if (!inTag) {
      result += ch;
    }
  }
  return result.split("<").join("").split(">").join("");
}

function stripUnsafeSchemes(text: string): string {
  let out = text;
  for (const scheme of ["javascript:", "vbscript:"]) {
    let lower = out.toLowerCase();
    let idx = lower.indexOf(scheme);
    while (idx !== -1) {
      out = out.slice(0, idx) + out.slice(idx + scheme.length);
      lower = out.toLowerCase();
      idx = lower.indexOf(scheme);
    }
  }
  return out;
}

export function sanitizeUserText(
  input: string,
  maxLength: number = 1000,
  trimWhitespace: boolean = false
): string {
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
  const withoutTags = stripHtmlTagsLinear(cleaned);
  const sanitized = stripUnsafeSchemes(withoutTags).slice(0, maxLength);

  return trimWhitespace ? sanitized.trim() : sanitized;
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
  const compact = lower.split(" ").join("").split("\t").join("");
  if (
    compact.startsWith("javascript:") ||
    compact.startsWith("vbscript:") ||
    compact.startsWith("data:") ||
    lower.includes("<script") ||
    lower.includes(":")
  ) {
    return fallback;
  }
  return trimmed;
}
