import axios from "axios";
import {
  encryptPayload,
  decryptPayload,
  EncryptedEnvelope,
  EncryptionInspectionLog,
  hasRuntimeDerivedKeys,
  setRuntimeDerivedKeys,
  clearRuntimeDerivedKeys,
  isWebCryptoAvailable,
} from "../security/payloadCrypto";

export type MediaCategoryType = "Movie" | "TvSeries" | "ComicBook";

export interface ExternalRatingSource {
  sourceId: string;
  sourceName: string;
  category: "Critic" | "Audience" | "ComicCommunity";
  rawScoreDisplay: string;
  normalizedScore: number; // 0 - 100
  voteCount: number;
  defaultWeight: number;
  accentColor: string;
  sourceUrl?: string;
  isVerifiedApi?: boolean;
}

export interface CumulativeRatingSummary {
  finalCumulativeAverage: number; // 0 - 100
  finalStarScoreOutOfTen: number; // 0 - 10.0
  simpleArithmeticAverage: number;
  bayesianWeightedScore: number;
  criticConsensusScore: number;
  audienceConsensusScore: number;
  comicCommunityScore: number;
  polarizationIndex: number;
  consensusTier: string;
  totalAggregatedVotes: number;
  activeSourceCount: number;
  sources: ExternalRatingSource[];
}

export interface AggregatedMediaItem {
  id: string;
  externalId: string;
  title: string;
  mediaType: MediaCategoryType;
  releaseYear: number;
  overview: string;
  posterUrl: string;
  backdropUrl: string;
  genres: string[];
  publisherOrStudio: string;
  creatorOrDirector: string;
  runtimeOrIssueCount: string;
  ageRating: string;
  cumulativeRating: CumulativeRatingSummary;
}

export interface UserReviewItem {
  id: string;
  userId: string;
  username: string;
  userAvatarUrl?: string;
  externalMediaId: string;
  mediaTitle: string;
  mediaType: MediaCategoryType;
  score: number;
  headline: string;
  reviewText: string;
  containsSpoilers: boolean;
  helpfulVotes: number;
  createdAt: string;
}

export interface WatchlistEntry {
  id: string;
  userId: string;
  externalMediaId: string;
  title: string;
  mediaType: MediaCategoryType;
  posterUrl: string;
  cumulativeAverage: number;
  userPersonalScore?: number | null;
  status:
    | "PlanToWatch"
    | "Watching"
    | "Reading"
    | "Completed"
    | "OnHold"
    | "Dropped";
  notes: string;
  updatedAt: string;
}

export interface CustomListEntry {
  id: string;
  userId: string;
  ownerUsername: string;
  name: string;
  description: string;
  isPublic: boolean;
  externalMediaIds: string[];
  createdAt: string;
}

export const RATING_SOURCE_DEFINITIONS: {
  sourceId: string;
  name: string;
  category: "Critic" | "Audience" | "ComicCommunity";
  defaultWeight: number;
  color: string;
  badge: string;
}[] = [
  {
    sourceId: "imdb",
    name: "IMDb (OMDb)",
    category: "Audience",
    defaultWeight: 1.25,
    color: "#f5c518",
    badge: "IMDb",
  },
  {
    sourceId: "rotten_tomatoes_critics",
    name: "Rotten Tomatoes (Critics)",
    category: "Critic",
    defaultWeight: 1.2,
    color: "#fa320a",
    badge: "RT Critics",
  },
  {
    sourceId: "rotten_tomatoes_audience",
    name: "Rotten Tomatoes (Audience)",
    category: "Audience",
    defaultWeight: 1.1,
    color: "#ff6b35",
    badge: "RT Popcorn",
  },
  {
    sourceId: "metacritic",
    name: "Metacritic",
    category: "Critic",
    defaultWeight: 1.2,
    color: "#ffcc33",
    badge: "Metacritic",
  },
  {
    sourceId: "tmdb",
    name: "TMDB API",
    category: "Audience",
    defaultWeight: 1.0,
    color: "#01b4e4",
    badge: "TMDB",
  },
  {
    sourceId: "tvmaze",
    name: "TVMaze API",
    category: "Audience",
    defaultWeight: 0.95,
    color: "#3c948b",
    badge: "TVMaze",
  },
  {
    sourceId: "trakt",
    name: "Trakt.tv",
    category: "Audience",
    defaultWeight: 0.95,
    color: "#ed1c24",
    badge: "Trakt",
  },
  {
    sourceId: "letterboxd",
    name: "Letterboxd",
    category: "Audience",
    defaultWeight: 1.1,
    color: "#00e054",
    badge: "Letterboxd",
  },
  {
    sourceId: "comicvine",
    name: "ComicVine API",
    category: "ComicCommunity",
    defaultWeight: 1.3,
    color: "#e62429",
    badge: "ComicVine",
  },
  {
    sourceId: "league_of_comic_geeks",
    name: "League of Comic Geeks",
    category: "ComicCommunity",
    defaultWeight: 1.25,
    color: "#00d1b2",
    badge: "LOCG",
  },
  {
    sourceId: "goodreads",
    name: "Goodreads Graphic Novels",
    category: "Audience",
    defaultWeight: 1.15,
    color: "#a16207",
    badge: "Goodreads",
  },
  {
    sourceId: "comicbookroundup_critics",
    name: "ComicBookRoundup Critics",
    category: "Critic",
    defaultWeight: 1.2,
    color: "#3b82f6",
    badge: "CBR Critics",
  },
  {
    sourceId: "anilist",
    name: "AniList",
    category: "ComicCommunity",
    defaultWeight: 1.2,
    color: "#02a9ff",
    badge: "AniList",
  },
  {
    sourceId: "myanimelist",
    name: "MyAnimeList",
    category: "ComicCommunity",
    defaultWeight: 1.2,
    color: "#2e51a2",
    badge: "MAL",
  },
  {
    sourceId: "hardcover",
    name: "Hardcover",
    category: "Audience",
    defaultWeight: 1.25,
    color: "#7c3aed",
    badge: "Hardcover",
  },
  {
    sourceId: "google_books",
    name: "Google Books",
    category: "Audience",
    defaultWeight: 1.0,
    color: "#4285f4",
    badge: "Google Books",
  },
  {
    sourceId: "openlibrary",
    name: "Open Library",
    category: "Audience",
    defaultWeight: 1.0,
    color: "#059669",
    badge: "Open Library",
  },
  {
    sourceId: "apple_books",
    name: "Apple Books",
    category: "Audience",
    defaultWeight: 1.0,
    color: "#9ca3af",
    badge: "Apple Books",
  },
  {
    sourceId: "comictraffic_community",
    name: "ComicTraffic Community",
    category: "ComicCommunity",
    defaultWeight: 1.15,
    color: "#a855f7",
    badge: "CT Verified",
  },
];

/**
 * Display helper: items no provider has rated yet show "N/R" instead of a misleading 0%.
 */
export function formatCumulativeScore(
  rating: { finalCumulativeAverage: number; activeSourceCount: number },
  digits: number = 1
): string {
  return rating.activeSourceCount > 0
    ? `${rating.finalCumulativeAverage.toFixed(digits)}%`
    : "N/R";
}

const GLOBAL_BAYESIAN_PRIOR = 74.0;
const BAYESIAN_MIN_VOTES = 2500.0;

/**
 * Pure Cumulative Rating Engine used for real-time weight slider tuning & score recalculation.
 */
export function calculateCumulativeRating(
  sources: ExternalRatingSource[],
  customWeights?: Record<string, number>
): CumulativeRatingSummary {
  const active = (sources || []).filter(
    (s) => s.normalizedScore >= 0 && s.normalizedScore <= 100
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

  const totalVotes = active.reduce((acc, s) => acc + Math.max(0, s.voteCount), 0);
  const simpleAverage =
    active.reduce((acc, s) => acc + s.normalizedScore, 0) / active.length;

  let weightedNum = 0;
  let weightedDen = 0;

  for (const s of active) {
    let weight = s.defaultWeight > 0 ? s.defaultWeight : 1.0;
    if (customWeights && typeof customWeights[s.sourceId] === "number") {
      weight = Math.max(0, customWeights[s.sourceId]);
    }

    const voteConfidence =
      customWeights && Object.keys(customWeights).length > 0
        ? 1.0
        : 1.0 + Math.min(0.35, Math.log10(Math.max(10, s.voteCount)) / 18.0);

    const effectiveWeight = weight * voteConfidence;
    weightedNum += s.normalizedScore * effectiveWeight;
    weightedDen += effectiveWeight;
  }

  const weightedAverage =
    weightedDen > 0 ? weightedNum / weightedDen : simpleAverage;

  const v = Math.max(100, totalVotes);
  const m = BAYESIAN_MIN_VOTES;
  const bayesianScore =
    (v / (v + m)) * weightedAverage + (m / (v + m)) * GLOBAL_BAYESIAN_PRIOR;

  const hasCustomOverride =
    customWeights && Object.keys(customWeights).length > 0;
  const rawFinal = hasCustomOverride
    ? weightedAverage
    : weightedAverage * 0.68 + bayesianScore * 0.32;

  const finalCumulativeAverage =
    Math.round(Math.max(0, Math.min(100, rawFinal)) * 10) / 10;

  const byCategory = (cat: ExternalRatingSource["category"]) => {
    const sub = active.filter((s) => s.category === cat);
    if (sub.length === 0) return finalCumulativeAverage;
    return (
      Math.round(
        (sub.reduce((acc, s) => acc + s.normalizedScore, 0) / sub.length) * 10
      ) / 10
    );
  };

  const criticConsensusScore = byCategory("Critic");
  const audienceConsensusScore = byCategory("Audience");
  const comicCommunityScore = byCategory("ComicCommunity");

  const variance =
    active.reduce(
      (acc, s) => acc + Math.pow(s.normalizedScore - simpleAverage, 2),
      0
    ) / active.length;
  const stdDev = Math.round(Math.sqrt(variance) * 100) / 100;

  let consensusTier = "Generally Favorable";
  if (stdDev >= 12.5 && finalCumulativeAverage >= 60) {
    consensusTier = "Highly Polarizing / Cult Classic";
  } else if (finalCumulativeAverage >= 90) {
    consensusTier = "Universal Acclaim";
  } else if (finalCumulativeAverage >= 82) {
    consensusTier = "Certified Must-Experience";
  } else if (finalCumulativeAverage >= 72) {
    consensusTier = "Generally Favorable";
  } else if (finalCumulativeAverage >= 58) {
    consensusTier = "Mixed / Average Consensus";
  } else {
    consensusTier = "Generally Unfavorable";
  }

  return {
    finalCumulativeAverage,
    finalStarScoreOutOfTen:
      Math.round((finalCumulativeAverage / 10) * 100) / 100,
    simpleArithmeticAverage: Math.round(simpleAverage * 10) / 10,
    bayesianWeightedScore: Math.round(bayesianScore * 10) / 10,
    criticConsensusScore,
    audienceConsensusScore,
    comicCommunityScore,
    polarizationIndex: stdDev,
    consensusTier,
    totalAggregatedVotes: totalVotes,
    activeSourceCount: active.length,
    sources: active,
  };
}

/**
 * End-to-End Encrypted Backend Client
 * All comic/movie/series catalog items, external rating APIs, and keys live exclusively on the backend.
 */
const PRIMARY_BACKEND_URL = "/api";

let logSeq = 0;

function redactSensitivePreview(obj: unknown): string {
  try {
    const raw = JSON.stringify(obj, (key, value) => {
      const k = key.toLowerCase();
      if (
        k === "password" ||
        k === "newpassword" ||
        k === "token" ||
        k === "accesstoken" ||
        k === "passwordresettoken"
      ) {
        return "[REDACTED]";
      }
      return value;
    });
    return (raw || "").slice(0, 120);
  } catch {
    return "[unserializable]";
  }
}

function isPayloadKeyMismatchMessage(msg: unknown): boolean {
  const lower = String(msg || "").toLowerCase();
  return (
    lower.includes("payload decryption error") ||
    lower.includes("signature verification failed") ||
    lower.includes("tampered payload") ||
    lower.includes("unable to decrypt") ||
    lower.includes("unable to authenticate") ||
    lower.includes("authentication tag") ||
    lower.includes("encrypted gateway error")
  );
}

function stripHtmlLinear(input: string): string {
  let out = "";
  let inTag = false;
  let prevSpace = true;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "<") {
      inTag = true;
      continue;
    }
    if (ch === ">") {
      inTag = false;
      if (!prevSpace) {
        out += " ";
        prevSpace = true;
      }
      continue;
    }
    if (inTag) continue;
    const isSpace = ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
    if (isSpace) {
      if (!prevSpace) {
        out += " ";
        prevSpace = true;
      }
    } else {
      out += ch;
      prevSpace = false;
    }
  }
  return out.trim();
}

function extractBackendErrorMessage(raw: any, status?: number): string {
  if (typeof raw === "string") {
    const stripped = stripHtmlLinear(raw);
    if (stripped.length > 0) {
      return stripped.slice(0, 240);
    }
  } else if (raw && typeof raw === "object") {
    if (typeof raw.responseMessage === "string" && raw.responseMessage.trim()) {
      return raw.responseMessage.trim();
    }
    if (typeof raw.message === "string" && raw.message.trim()) {
      return raw.message.trim();
    }
    if (raw.errors && typeof raw.errors === "object") {
      const fieldMessages = Object.values(raw.errors)
        .flatMap((v) => (Array.isArray(v) ? v : [v]))
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
      if (fieldMessages.length > 0) {
        return fieldMessages.join(" ");
      }
    }
    if (typeof raw.detail === "string" && raw.detail.trim()) {
      return raw.detail.trim();
    }
    if (typeof raw.title === "string" && raw.title.trim()) {
      return raw.title.trim();
    }
  }

  if (status === 429) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (status === 502 || status === 503 || status === 504) {
    return "The Comic Traffic server is temporarily unavailable. Please try again in a moment.";
  }
  if (status) {
    return `Server returned status ${status}. Please try again.`;
  }
  return "Request failed on the server.";
}

export const encryptedBackendClient = {
  logs: [] as EncryptionInspectionLog[],
  handshakeInFlight: null as Promise<void> | null,
  handshakeLastFailureAt: 0,
  handshakeGeneration: 0,

  async ensureSessionKeys(forceRefresh: boolean = false): Promise<void> {
    if (!isWebCryptoAvailable()) return;

    // 1. Always await any handshake already in flight first so concurrent callers
    //    never race past it and encrypt with random client-only keys.
    if (this.handshakeInFlight) {
      const genBefore = this.handshakeGeneration;
      await this.handshakeInFlight;
      if (hasRuntimeDerivedKeys() && (!forceRefresh || this.handshakeGeneration !== genBefore)) {
        return;
      }
    }

    if (forceRefresh) {
      clearRuntimeDerivedKeys();
      this.handshakeLastFailureAt = 0;
    }

    if (hasRuntimeDerivedKeys()) return;

    // Only throttle rapid retries after a FAILED handshake, never while one is in flight.
    if (!forceRefresh && Date.now() - this.handshakeLastFailureAt < 1000) {
      return;
    }

    const request = (async () => {
      try {
        const res = await axios.get(
          `${PRIMARY_BACKEND_URL}/security/handshake`,
          { timeout: 8000 }
        );
        if (res.data?.derivedAesKey && res.data?.derivedHmacKey) {
          setRuntimeDerivedKeys(
            res.data.derivedAesKey,
            res.data.derivedHmacKey
          );
          this.handshakeGeneration += 1;
          this.handshakeLastFailureAt = 0;
        } else {
          this.handshakeLastFailureAt = Date.now();
        }
      } catch {
        // Offline / test fallback
        this.handshakeLastFailureAt = Date.now();
      }
    })();

    this.handshakeInFlight = request;
    try {
      await request;
    } finally {
      if (this.handshakeInFlight === request) {
        this.handshakeInFlight = null;
      }
    }
  },

  recordLog(entry: Omit<EncryptionInspectionLog, "id" | "timestamp">) {
    logSeq += 1;
    const newLog: EncryptionInspectionLog = {
      ...entry,
      id: `${Date.now()}-${logSeq}`,
      timestamp: new Date().toLocaleTimeString(),
    };
    this.logs = [newLog, ...this.logs.slice(0, 19)];
    return newLog;
  },

  async sendEncryptedGet<TRes>(
    endpoint: string,
    token?: string | null,
    hasRetriedOnKeyMismatch: boolean = false
  ): Promise<{ fromBackend: boolean; data?: TRes }> {
    const canEncrypt = isWebCryptoAvailable();
    await this.ensureSessionKeys();
    const useEncryption = canEncrypt && hasRuntimeDerivedKeys();
    try {
      const headers: Record<string, string> = {};
      if (useEncryption) {
        headers["X-Response-Encrypted"] = "true";
      }
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await axios.get(`${PRIMARY_BACKEND_URL}${endpoint}`, {
        headers,
        timeout: 2500,
      });
      if (res.data && res.data.encrypted && res.data.payload) {
        if (!canEncrypt) {
          return { fromBackend: false };
        }
        try {
          const decrypted = await decryptPayload<any>(
            res.data as EncryptedEnvelope
          );
          return {
            fromBackend: true,
            data: (decrypted.data ?? decrypted) as TRes,
          };
        } catch (decryptErr) {
          if (!hasRetriedOnKeyMismatch) {
            await this.ensureSessionKeys(true);
            if (hasRuntimeDerivedKeys()) {
              return this.sendEncryptedGet<TRes>(endpoint, token, true);
            }
          }
          throw decryptErr;
        }
      }
      return {
        fromBackend: true,
        data: (res.data?.data ?? res.data) as TRes,
      };
    } catch {
      return { fromBackend: false };
    }
  },

  async sendEncryptedPost<TReq, TRes>(
    endpoint: string,
    payload: TReq,
    token?: string | null,
    hasRetriedOnKeyMismatch: boolean = false,
    timeoutMs: number = 20000,
    signal?: AbortSignal
  ): Promise<{
    fromBackend: boolean;
    data?: TRes;
    envelope: EncryptedEnvelope;
    aborted?: boolean;
    fallback?: boolean;
    providers?: Record<string, any>;
    errorMessage?: string;
  }> {
    const canEncrypt = isWebCryptoAvailable();
    await this.ensureSessionKeys();
    // Never encrypt outbound requests with random client-only keys when the server
    // handshake has not succeeded; the server cannot verify an unknown client key.
    const useEncryption = canEncrypt && hasRuntimeDerivedKeys();

    const envelope: EncryptedEnvelope = useEncryption
      ? await encryptPayload(payload)
      : {
          encrypted: false,
          iv: "",
          payload: "",
          signature: "",
          timestamp: Date.now(),
        };
    const outboundBody: any = useEncryption ? envelope : payload;

    this.recordLog({
      direction: "REQUEST",
      endpoint,
      algorithm: useEncryption ? "Encrypted" : "HTTPS/JSON Fallback",
      ivPreview: envelope.iv || "none",
      cipherPreview: envelope.payload
        ? envelope.payload.slice(0, 64) + "..."
        : "(transport-only fallback)",
      signaturePreview: envelope.signature
        ? envelope.signature.slice(0, 32) + "..."
        : "none",
      plainPreview: redactSensitivePreview(payload),
    });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (useEncryption) {
        headers["X-Payload-Encrypted"] = "true";
        headers["X-Response-Encrypted"] = "true";
      }
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await axios.post(
        `${PRIMARY_BACKEND_URL}${endpoint}`,
        outboundBody,
        {
          headers,
          timeout: timeoutMs,
          signal,
        }
      );

      if (res.data && res.data.encrypted && res.data.payload) {
        if (!canEncrypt) {
          const insecureErr: any = new Error(
            "Unable to decrypt response because browser Web Crypto API requires HTTPS."
          );
          insecureErr.fromBackend = true;
          throw insecureErr;
        }
        let decrypted: any;
        try {
          decrypted = await decryptPayload<any>(res.data as EncryptedEnvelope);
        } catch (respDecryptErr: any) {
          if (!hasRetriedOnKeyMismatch) {
            await this.ensureSessionKeys(true);
            if (hasRuntimeDerivedKeys()) {
              return this.sendEncryptedPost<TReq, TRes>(
                endpoint,
                payload,
                token,
                true,
                timeoutMs,
                signal
              );
            }
          }
          const decryptFailErr: any = new Error(
            respDecryptErr?.message ||
              "Unable to decrypt server response. Please refresh and try again."
          );
          decryptFailErr.fromBackend = true;
          throw decryptFailErr;
        }
        this.recordLog({
          direction: "RESPONSE",
          endpoint,
          algorithm: "Encrypted",
          ivPreview: res.data.iv,
          cipherPreview: String(res.data.payload).slice(0, 64) + "...",
          signaturePreview:
            String(res.data.signature || "").slice(0, 32) + "...",
          plainPreview: redactSensitivePreview(decrypted),
        });
        return {
          fromBackend: true,
          data: (decrypted.data ?? decrypted) as TRes,
          envelope,
          fallback: Boolean(decrypted?.fallback),
          providers: decrypted?.providers,
        };
      }

      return {
        fromBackend: true,
        data: (res.data?.data ?? res.data) as TRes,
        envelope,
        fallback: Boolean(res.data?.fallback),
        providers: res.data?.providers,
      };
    } catch (err: any) {
      if (err?.fromBackend) {
        throw err;
      }
      if (
        axios.isCancel(err) ||
        err?.name === "CanceledError" ||
        err?.name === "AbortError" ||
        err?.code === "ERR_CANCELED"
      ) {
        return { fromBackend: false, envelope, aborted: true };
      }
      if (
        canEncrypt &&
        err?.response?.data &&
        err.response.data.encrypted &&
        err.response.data.payload
      ) {
        try {
          const decrypted = await decryptPayload<any>(
            err.response.data as EncryptedEnvelope
          );
          this.recordLog({
            direction: "RESPONSE",
            endpoint,
            algorithm: "Encrypted",
            ivPreview: err.response.data.iv,
            cipherPreview: String(err.response.data.payload).slice(0, 64) + "...",
            signaturePreview:
              String(err.response.data.signature || "").slice(0, 32) + "...",
            plainPreview: redactSensitivePreview(decrypted),
          });
          const message = extractBackendErrorMessage(
            decrypted,
            err.response.status
          );
          if (!hasRetriedOnKeyMismatch && isPayloadKeyMismatchMessage(message)) {
            await this.ensureSessionKeys(true);
            if (hasRuntimeDerivedKeys()) {
              return this.sendEncryptedPost<TReq, TRes>(
                endpoint,
                payload,
                token,
                true,
                timeoutMs,
                signal
              );
            }
          }
          const backendErr: any = new Error(message);
          backendErr.fromBackend = true;
          backendErr.response = err.response;
          backendErr.data = decrypted;
          throw backendErr;
        } catch (decryptErr: any) {
          if (decryptErr?.fromBackend) {
            throw decryptErr;
          }
          if (!hasRetriedOnKeyMismatch) {
            await this.ensureSessionKeys(true);
            if (hasRuntimeDerivedKeys()) {
              return this.sendEncryptedPost<TReq, TRes>(
                endpoint,
                payload,
                token,
                true,
                timeoutMs,
                signal
              );
            }
          }
          const fallbackErr: any = new Error(
            extractBackendErrorMessage(null, err.response?.status)
          );
          fallbackErr.fromBackend = true;
          fallbackErr.response = err.response;
          throw fallbackErr;
        }
      } else if (err?.response) {
        const raw = err.response.data;
        const message = extractBackendErrorMessage(raw, err.response.status);
        if (!hasRetriedOnKeyMismatch && isPayloadKeyMismatchMessage(message)) {
          await this.ensureSessionKeys(true);
          if (hasRuntimeDerivedKeys()) {
            return this.sendEncryptedPost<TReq, TRes>(
              endpoint,
              payload,
              token,
              true,
              timeoutMs,
              signal
            );
          }
        }
        const backendErr: any = new Error(message);
        backendErr.fromBackend = true;
        backendErr.response = err.response;
        backendErr.data = raw;
        throw backendErr;
      }
      const isTimeout =
        err?.code === "ECONNABORTED" ||
        String(err?.message || "").toLowerCase().includes("timeout");
      return {
        fromBackend: false,
        envelope,
        errorMessage: isTimeout
          ? "The server took too long to respond. Please try again."
          : "Unable to reach the Comic Traffic server. Please check your connection and try again.",
      };
    }
  },
};

/**
 * Active AbortController for live multi-API search to supersede stale in-flight typing searches.
 */
let activeLiveSearchController: AbortController | null = null;

export interface LiveSearchDetailedResult {
  items: AggregatedMediaItem[];
  aborted: boolean;
  failed: boolean;
  fallback: boolean;
  providers?: Record<string, any>;
}

/**
 * Dispatches an encrypted search command to the Backend API (/api/media/search-live)
 * and preserves abort / offline / fallback metadata.
 */
export async function searchLiveMultiApisDetailed(
  query: string
): Promise<LiveSearchDetailedResult> {
  if (!query || query.trim().length < 2) {
    return { items: [], aborted: false, failed: false, fallback: false };
  }
  const cleanQuery = query.trim();

  // Abort any previous pending search before starting a fresh search
  if (activeLiveSearchController) {
    try {
      activeLiveSearchController.abort();
    } catch {
      // Abort is best-effort
    }
  }
  activeLiveSearchController = new AbortController();
  const signal = activeLiveSearchController.signal;

  try {
    const res = await encryptedBackendClient.sendEncryptedPost<
      { query: string },
      AggregatedMediaItem[]
    >(
      "/media/search-live",
      { query: cleanQuery },
      undefined,
      false,
      15000,
      signal
    );
    if (res.aborted) {
      return { items: [], aborted: true, failed: false, fallback: false };
    }
    if (!res.fromBackend) {
      return { items: [], aborted: false, failed: true, fallback: true };
    }
    return {
      items: Array.isArray(res.data) ? res.data : [],
      aborted: false,
      failed: false,
      fallback: Boolean(res.fallback),
      providers: res.providers,
    };
  } catch (err: any) {
    if (
      axios.isCancel(err) ||
      err?.name === "CanceledError" ||
      err?.name === "AbortError" ||
      err?.code === "ERR_CANCELED"
    ) {
      return { items: [], aborted: true, failed: false, fallback: false };
    }
    return { items: [], aborted: false, failed: true, fallback: true };
  }
}

/**
 * Dispatches an encrypted search command to the Backend API (/api/media/search-live).
 */
export async function searchLiveMultiApis(
  query: string
): Promise<AggregatedMediaItem[]> {
  const res = await searchLiveMultiApisDetailed(query);
  return res.items;
}
