import axios from "axios";
import {
  encryptPayload,
  decryptPayload,
  EncryptedEnvelope,
  EncryptionInspectionLog,
  hasRuntimeDerivedKeys,
  setRuntimeDerivedKeys,
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
    sourceId: "comictraffic_community",
    name: "ComicTraffic Community",
    category: "ComicCommunity",
    defaultWeight: 1.15,
    color: "#a855f7",
    badge: "CT Verified",
  },
];

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
const isLocalCraDevServer =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1") &&
  window.location.port === "3000";

const PRIMARY_BACKEND_URL = isLocalCraDevServer
  ? "http://localhost:5120/api"
  : "/api";

export const encryptedBackendClient = {
  logs: [] as EncryptionInspectionLog[],
  handshakeInFlight: null as Promise<void> | null,
  handshakeAttempted: false,

  async ensureSessionKeys(): Promise<void> {
    if (hasRuntimeDerivedKeys() || this.handshakeAttempted) return;
    if (this.handshakeInFlight) {
      await this.handshakeInFlight;
      return;
    }
    this.handshakeInFlight = (async () => {
      this.handshakeAttempted = true;
      try {
        const res = await axios.get(
          `${PRIMARY_BACKEND_URL}/security/handshake`,
          { timeout: 1500 }
        );
        if (res.data?.derivedAesKey && res.data?.derivedHmacKey) {
          setRuntimeDerivedKeys(
            res.data.derivedAesKey,
            res.data.derivedHmacKey
          );
        }
      } catch {
        // Offline / test fallback uses session bootstrap keys
      }
    })();
    try {
      await this.handshakeInFlight;
    } finally {
      this.handshakeInFlight = null;
    }
  },

  recordLog(entry: Omit<EncryptionInspectionLog, "id" | "timestamp">) {
    const newLog: EncryptionInspectionLog = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
    };
    this.logs = [newLog, ...this.logs.slice(0, 19)];
    return newLog;
  },

  async sendEncryptedGet<TRes>(
    endpoint: string,
    token?: string | null
  ): Promise<{ fromBackend: boolean; data?: TRes }> {
    await this.ensureSessionKeys();
    try {
      const headers: Record<string, string> = {
        "X-Response-Encrypted": "true",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await axios.get(`${PRIMARY_BACKEND_URL}${endpoint}`, {
        headers,
        timeout: 2500,
      });
      if (res.data && res.data.encrypted && res.data.payload) {
        const decrypted = await decryptPayload<any>(
          res.data as EncryptedEnvelope
        );
        return {
          fromBackend: true,
          data: (decrypted.data ?? decrypted) as TRes,
        };
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
    token?: string | null
  ): Promise<{ fromBackend: boolean; data?: TRes; envelope: EncryptedEnvelope }> {
    await this.ensureSessionKeys();
    const envelope = await encryptPayload(payload);
    this.recordLog({
      direction: "REQUEST",
      endpoint,
      algorithm: envelope.algorithm,
      ivPreview: envelope.iv,
      cipherPreview: envelope.payload.slice(0, 64) + "...",
      signaturePreview: envelope.signature.slice(0, 32) + "...",
      plainPreview: JSON.stringify(payload).slice(0, 120),
    });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Payload-Encrypted": "true",
        "X-Response-Encrypted": "true",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await axios.post(`${PRIMARY_BACKEND_URL}${endpoint}`, envelope, {
        headers,
        timeout: 2500,
      });

      if (res.data && res.data.encrypted && res.data.payload) {
        const decrypted = await decryptPayload<any>(
          res.data as EncryptedEnvelope
        );
        this.recordLog({
          direction: "RESPONSE",
          endpoint,
          algorithm: res.data.algorithm || "AES-256-GCM",
          ivPreview: res.data.iv,
          cipherPreview: String(res.data.payload).slice(0, 64) + "...",
          signaturePreview:
            String(res.data.signature || "").slice(0, 32) + "...",
          plainPreview: JSON.stringify(decrypted).slice(0, 120),
        });
        return {
          fromBackend: true,
          data: (decrypted.data ?? decrypted) as TRes,
          envelope,
        };
      }

      return {
        fromBackend: true,
        data: (res.data?.data ?? res.data) as TRes,
        envelope,
      };
    } catch {
      return { fromBackend: false, envelope };
    }
  },
};

/**
 * Dispatches an encrypted search command to the Backend API (/api/media/search-live).
 */
export async function searchLiveMultiApis(
  query: string
): Promise<AggregatedMediaItem[]> {
  if (!query || query.trim().length < 2) return [];
  const cleanQuery = query.trim();

  try {
    const res = await encryptedBackendClient.sendEncryptedPost<
      { query: string },
      AggregatedMediaItem[]
    >("/media/search-live", { query: cleanQuery });
    if (Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  } catch {
    return [];
  }
}
