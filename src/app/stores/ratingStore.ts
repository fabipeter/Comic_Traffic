import { makeAutoObservable, runInAction } from "mobx";
import { INITIAL_CUMULATIVE_CATALOG } from "../api/catalogData";
import {
  AggregatedMediaItem,
  calculateCumulativeRating,
  CustomListEntry,
  encryptedBackendClient,
  ExternalRatingSource,
  fetchLiveMediaSnapshot,
  MediaCategoryType,
  RATING_SOURCE_DEFINITIONS,
  searchLiveMultiApisDetailed,
  UserReviewItem,
  WatchlistEntry,
} from "../api/ratingApis";
import { EncryptionInspectionLog } from "../security/payloadCrypto";
import { sanitizeUserText } from "../security/inputSanitizer";

const DEFAULT_REVIEWS: UserReviewItem[] = [];

const DEFAULT_WATCHLIST: WatchlistEntry[] = [
  {
    id: "wl-1",
    userId: "11111111-1111-1111-1111-111111111111",
    externalMediaId: "comic-watchmen-1986",
    title: "Watchmen #1–12 (Absolute Edition)",
    mediaType: "ComicBook",
    posterUrl:
      "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=900&q=80",
    cumulativeAverage: 95.6,
    userPersonalScore: 98,
    status: "Completed",
    notes: "Re-read the Absolute Edition with Dave Gibbons' annotations.",
    updatedAt: "2026-11-12T10:00:00Z",
  },
  {
    id: "wl-2",
    userId: "11111111-1111-1111-1111-111111111111",
    externalMediaId: "movie-spiderverse-2023",
    title: "Spider-Man: Across the Spider-Verse",
    mediaType: "Movie",
    posterUrl:
      "https://image.tmdb.org/t/p/original/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg",
    cumulativeAverage: 89.2,
    userPersonalScore: 95,
    status: "Completed",
    notes: "Watched in IMAX Dolby Vision.",
    updatedAt: "2026-11-13T16:00:00Z",
  },
  {
    id: "wl-3",
    userId: "11111111-1111-1111-1111-111111111111",
    externalMediaId: "comic-saga-2012",
    title: "Saga (Image Comics Series)",
    mediaType: "ComicBook",
    posterUrl:
      "https://images.unsplash.com/photo-1588497859490-85d1c17db96d?auto=format&fit=crop&w=900&q=80",
    cumulativeAverage: 93.2,
    userPersonalScore: 94,
    status: "Reading",
    notes: "Currently on Compendium One, Issue #42.",
    updatedAt: "2026-11-14T20:00:00Z",
  },
  {
    id: "wl-4",
    userId: "11111111-1111-1111-1111-111111111111",
    externalMediaId: "tv-invincible-2021",
    title: "Invincible",
    mediaType: "TvSeries",
    posterUrl:
      "https://image.tmdb.org/t/p/original/dMOpdkrDC5dQxqNydgKxXjBKyAc.jpg",
    cumulativeAverage: 90.1,
    userPersonalScore: 93,
    status: "Watching",
    notes: "Caught up through Season 3.",
    updatedAt: "2026-11-15T11:30:00Z",
  },
];

const DEFAULT_LISTS: CustomListEntry[] = [
  {
    id: "list-1",
    userId: "11111111-1111-1111-1111-111111111111",
    ownerUsername: "comicwarden",
    name: "Essential 90+ Cumulative Score Masterpieces",
    description:
      "Comics, movies, and series that achieved Universal Acclaim across Critic, Audience, and ComicVine indices.",
    isPublic: true,
    externalMediaIds: [
      "comic-watchmen-1986",
      "comic-sandman-1989",
      "movie-dark-knight-2008",
      "movie-spiderverse-2023",
      "tv-xmen-97-2024",
    ],
    createdAt: "2026-11-01T12:00:00Z",
  },
  {
    id: "list-2",
    userId: "11111111-1111-1111-1111-111111111111",
    ownerUsername: "comicwarden",
    name: "Gotham Noir: Page to Screen",
    description:
      "Comparing Frank Miller's Batman: Year One with Christopher Nolan and Matt Reeves' adaptations.",
    isPublic: true,
    externalMediaIds: [
      "comic-batman-year-one-1987",
      "movie-dark-knight-2008",
      "movie-the-batman-2022",
    ],
    createdAt: "2026-11-05T15:00:00Z",
  },
];

export type AnimeDexSkinId =
  | "navy_blue"
  | "sky_blue"
  | "daylight"
  | "diablo"
  | "oled"
  | "tokyo_night"
  | "dracula"
  | "nord"
  | "catppuccin"
  | "sakura";

export type ExplorerViewMode = "grid" | "list" | "thumbnail";

export interface AnimeDexSkinOption {
  id: AnimeDexSkinId;
  name: string;
  tagline: string;
  accent: string;
  bgPreview: string;
}

export const ANIMEDEX_SKINS: AnimeDexSkinOption[] = [
  {
    id: "navy_blue",
    name: "Navy Blue",
    tagline: "Primary Theme • Deep Navy, Black & Slate Grey",
    accent: "#2563eb",
    bgPreview: "#060913",
  },
  {
    id: "sky_blue",
    name: "Sky Blue",
    tagline: "Luminous Sky Cyan, Midnight & Cool Grey",
    accent: "#38bdf8",
    bgPreview: "#07101c",
  },
  {
    id: "daylight",
    name: "Daylight Ivory",
    tagline: "Crisp Light Mode • Alabaster, Slate & Royal Navy",
    accent: "#1d4ed8",
    bgPreview: "#f8fafc",
  },
  {
    id: "diablo",
    name: "Diablo Crimson",
    tagline: "Blood-Red Glassmorphism & Obsidian",
    accent: "#e11d48",
    bgPreview: "#08060a",
  },
  {
    id: "oled",
    name: "Abyss OLED",
    tagline: "Pitch-Black Contrast • Neon Edge",
    accent: "#3b82f6",
    bgPreview: "#000000",
  },
  {
    id: "tokyo_night",
    name: "Tokyo Night",
    tagline: "Cyber Indigo & Electric Magenta",
    accent: "#7aa2f7",
    bgPreview: "#1a1b26",
  },
  {
    id: "dracula",
    name: "Dracula",
    tagline: "Gothic Purple & Vampire Pink",
    accent: "#ff79c6",
    bgPreview: "#282a36",
  },
  {
    id: "nord",
    name: "Nord Frost",
    tagline: "Arctic Slate & Glacial Cyan",
    accent: "#88c0d0",
    bgPreview: "#2e3440",
  },
  {
    id: "catppuccin",
    name: "Catppuccin Mocha",
    tagline: "Warm Espresso & Mauve Pastel",
    accent: "#cba6f7",
    bgPreview: "#1e1e2e",
  },
  {
    id: "sakura",
    name: "Sakura Blossom",
    tagline: "Cherry-Blossom Glassmorphism",
    accent: "#fb7185",
    bgPreview: "#160c14",
  },
];

const SEARCH_STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "in",
  "to",
  "for",
]);

export function normalizeSearchString(val: string): string {
  if (!val) return "";
  return val
    .toLowerCase()
    .replace(/[-_:.!?',"()#–—’“”/&+=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreSearchMatch(
  item: AggregatedMediaItem,
  rawQuery: string
): number {
  if (!rawQuery) return 1;
  const clean = rawQuery.trim();
  if (!clean) return 1;

  const normalizedQuery = normalizeSearchString(clean);
  if (!normalizedQuery) return 1;

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  if (queryTokens.length === 0) return 1;

  // Filter out non-discriminative stop words when multiple tokens are entered
  const nonStopTokens = queryTokens.filter((t) => !SEARCH_STOP_WORDS.has(t));
  const tokensToCheck = nonStopTokens.length > 0 ? nonStopTokens : queryTokens;

  const normalizedTitle = normalizeSearchString(item.title || "");
  const normalizedMeta = normalizeSearchString(
    [
      item.publisherOrStudio,
      item.creatorOrDirector,
      item.mediaType,
      item.mediaType === "ComicBook" ? "comic comic book graphic novel" : "",
      item.mediaType === "TvSeries" ? "tv television series streaming show" : "",
      item.mediaType === "Movie" ? "movie cinema film blockbuster" : "",
      item.mediaType === "Game" ? "game video game mobile game pc console board game tabletop" : "",
      String(item.releaseYear),
      item.cumulativeRating?.consensusTier || "",
      ...(item.genres || []),
    ].join(" ")
  );
  const normalizedOverview = normalizeSearchString(item.overview || "");

  const rawPool = [
    item.title,
    item.publisherOrStudio,
    item.creatorOrDirector,
    item.overview,
    item.mediaType,
    String(item.releaseYear),
    ...(item.genres || []),
  ]
    .join(" ")
    .toLowerCase();
  const normalizedPool = `${normalizedTitle} ${normalizedMeta} ${normalizedOverview}`;
  const compactPool = rawPool.replace(/[\s\-_:.!?',"()#–—’“”/&+=]/g, "");

  let matchedCount = 0;
  let score = 0;

  for (const token of tokensToCheck) {
    const compactToken = token.replace(/[\s\-_:.!?',"()#–—’“”/&+=]/g, "");
    const inTitle = normalizedTitle.includes(token);
    const inMeta = normalizedMeta.includes(token);
    const inOverview = normalizedOverview.includes(token);
    const inFallback =
      rawPool.includes(token) ||
      (compactToken.length >= 3 && compactPool.includes(compactToken));

    if (inTitle || inMeta || inOverview || inFallback) {
      matchedCount++;
      if (inTitle) score += 90;
      if (inMeta) score += 45;
      if (inOverview) score += 15;
      if (!inTitle && !inMeta && !inOverview && inFallback) score += 20;
    }
  }

  // Short queries (1-2 tokens) require all tokens; longer phrases allow >= 65% overlap
  const minRequired =
    tokensToCheck.length <= 2
      ? tokensToCheck.length
      : Math.max(2, Math.ceil(tokensToCheck.length * 0.65));

  if (matchedCount < minRequired) {
    return 0;
  }

  // Strong relevance boosts for exact, prefix, and multi-token title matches
  if (normalizedTitle === normalizedQuery) score += 1000;
  else if (normalizedTitle.startsWith(normalizedQuery)) score += 650;
  else if (normalizedTitle.includes(normalizedQuery)) score += 420;
  else if (normalizedPool.includes(normalizedQuery)) score += 180;

  if (matchedCount === tokensToCheck.length) {
    score += 240;
  }

  return score;
}

export function matchesSearchItem(
  item: AggregatedMediaItem,
  rawQuery: string
): boolean {
  return scoreSearchMatch(item, rawQuery) > 0;
}

const LIVE_EXTERNAL_ID_PREFIXES = [
  "tmdb-",
  "omdb-",
  "tvmaze-",
  "movie-itunes-",
  "anilist-",
  "comic-jikan-",
  "comicvine-",
  "hardcover-",
  "googlebooks-",
  "applebooks-",
  "book-ol-",
  "rawg-",
  "cheapshark-",
  "appstore-game-",
  "bgg-",
];

export function isLiveExternalId(externalId: string): boolean {
  const lower = String(externalId || "").toLowerCase();
  return LIVE_EXTERNAL_ID_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function cleanTitleForLiveLookup(title: string): string {
  return String(title || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/#\d+(?:\s*[–-]\s*\d+)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalTitleKey(title: string): string {
  const cleaned = cleanTitleForLiveLookup(title)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (cleaned.startsWith("the ")) return cleaned.slice(4);
  if (cleaned.startsWith("an ")) return cleaned.slice(3);
  if (cleaned.startsWith("a ")) return cleaned.slice(2);
  return cleaned;
}

function itemsMatchCanonical(
  a: AggregatedMediaItem,
  b: AggregatedMediaItem
): boolean {
  if (a.mediaType !== b.mediaType) return false;
  const ka = canonicalTitleKey(a.title);
  const kb = canonicalTitleKey(b.title);
  if (!ka || ka !== kb) return false;
  if (a.mediaType === "ComicBook" || a.mediaType === "Game") return true;
  if (!a.releaseYear || !b.releaseYear) return true;
  return Math.abs(a.releaseYear - b.releaseYear) <= 1;
}

export default class RatingStore {
  catalog: AggregatedMediaItem[] = [...INITIAL_CUMULATIVE_CATALOG];
  isLoadingCatalog: boolean = false;
  selectedCategory: "All" | MediaCategoryType = "All";
  selectedGenre: string = "All";
  searchQuery: string = "";
  minCumulativeScore: number = 0;
  sortBy:
    | "cumulative_desc"
    | "critic_desc"
    | "audience_desc"
    | "comic_desc"
    | "polarizing_desc"
    | "votes_desc"
    | "year_desc" = "cumulative_desc";

  // UI Theme & Layout state (Defaults to Navy Blue, Black & Grey primary theme)
  activeSkin: AnimeDexSkinId = "navy_blue";
  liteMode: boolean = false;
  explorerViewMode: ExplorerViewMode = "grid";
  shortcutsModalOpen: boolean = false;
  communityDrawerOpen: boolean = false;

  selectedItem: AggregatedMediaItem | null = null;

  // Maximum of 3 compare slots (Slot 1, Slot 2, Slot 3)
  comparisonSlots: (string | null)[] = [
    "comic-watchmen-1986",
    "movie-dark-knight-2008",
    "tv-invincible-2021",
  ];
  compareModalOpen: boolean = false;
  weightsModalOpen: boolean = false;

  customWeights: Record<string, number> = {};
  useCustomWeights: boolean = false;

  reviews: UserReviewItem[] = [...DEFAULT_REVIEWS];
  reportedReviewIds: string[] = [];
  watchlist: WatchlistEntry[] = [...DEFAULT_WATCHLIST];
  customLists: CustomListEntry[] = [...DEFAULT_LISTS];
  encryptionLogs: EncryptionInspectionLog[] = [];
  isSearchingLiveApis: boolean = false;
  isSearchPending: boolean = false;
  liveSearchResultsByQuery: Record<string, AggregatedMediaItem[]> = {};
  liveItemsByExternalId: Record<string, AggregatedMediaItem> = {};
  lastSearchUsedFallback: boolean = false;
  hydratingExternalId: string | null = null;
  private liveHydratedExternalIds = new Set<string>();
  private hydratingInFlight = new Set<string>();

  constructor() {
    makeAutoObservable(this);
    this.initDefaultWeights();
    this.hydrateFromStorage();
    this.applyDomThemeAttributes();
    this.fetchBackendCatalog();
  }

  fetchBackendCatalog = async () => {
    this.isLoadingCatalog = true;
    try {
      const res = await encryptedBackendClient.sendEncryptedGet<AggregatedMediaItem[]>("/media");
      if (res.fromBackend && Array.isArray(res.data) && res.data.length > 0) {
        runInAction(() => {
          const weightsToApply = this.useCustomWeights
            ? this.customWeights
            : undefined;
          const normalizeItem = (item: AggregatedMediaItem): AggregatedMediaItem => ({
            ...item,
            cumulativeRating: calculateCumulativeRating(
              item.cumulativeRating.sources,
              weightsToApply
            ),
          });
          // Merge incoming backend items with client catalog while never clobbering already live-hydrated items
          const backendMap = new Map(res.data!.map((item) => [item.externalId, item]));
          const merged = this.catalog.map((clientItem) => {
            if (this.liveHydratedExternalIds.has(clientItem.externalId)) {
              return clientItem;
            }
            const serverItem = backendMap.get(clientItem.externalId);
            return serverItem
              ? normalizeItem({ ...clientItem, ...serverItem })
              : normalizeItem(clientItem);
          });
          // Also include any items present on the server that weren't in the initial set
          for (const serverItem of res.data!) {
            if (!merged.some((m) => m.externalId === serverItem.externalId)) {
              merged.push(normalizeItem(serverItem));
            }
          }
          this.catalog = merged;
          // Re-apply any already-fetched live items so catalog & search stay identical
          const cachedLive = Object.values(this.liveItemsByExternalId);
          if (cachedLive.length > 0) {
            this.reconcileCatalogWithLiveItems(cachedLive);
          }
          if (this.selectedItem) {
            const refreshed = this.getMediaByExternalId(this.selectedItem.externalId);
            if (refreshed) {
              this.selectedItem = refreshed;
            }
          }
          this.isLoadingCatalog = false;
        });
        return;
      }
      runInAction(() => {
        this.isLoadingCatalog = false;
      });
    } catch {
      runInAction(() => {
        this.isLoadingCatalog = false;
      });
    }
  };

  private applyDomThemeAttributes() {
    if (typeof document !== "undefined") {
      document.body.setAttribute("data-adx-skin", this.activeSkin);
      document.body.setAttribute("data-adx-lite", this.liteMode ? "true" : "false");
    }
  }

  setSkin = (skin: AnimeDexSkinId) => {
    this.activeSkin = skin;
    this.applyDomThemeAttributes();
    try {
      localStorage.setItem("adx_skin", skin);
    } catch {}
  };

  toggleLiteMode = () => {
    this.liteMode = !this.liteMode;
    this.applyDomThemeAttributes();
    try {
      localStorage.setItem("adx_lite", String(this.liteMode));
    } catch {}
  };

  setExplorerViewMode = (mode: ExplorerViewMode) => {
    this.explorerViewMode = mode;
    try {
      localStorage.setItem("adx_view_mode", mode);
    } catch {}
  };

  setShortcutsModalOpen = (open: boolean) => {
    this.shortcutsModalOpen = open;
  };

  setCommunityDrawerOpen = (open: boolean) => {
    this.communityDrawerOpen = open;
  };

  private initDefaultWeights() {
    const defaults: Record<string, number> = {};
    for (const def of RATING_SOURCE_DEFINITIONS) {
      defaults[def.sourceId] = def.defaultWeight;
    }
    this.customWeights = defaults;
  }

  private hydrateFromStorage() {
    try {
      const savedWatchlist = localStorage.getItem("ct_watchlist");
      if (savedWatchlist) {
        this.watchlist = JSON.parse(savedWatchlist);
      }
      const savedReviews = localStorage.getItem("ct_reviews");
      if (savedReviews) {
        this.reviews = JSON.parse(savedReviews);
      }
      const savedLists = localStorage.getItem("ct_lists");
      if (savedLists) {
        this.customLists = JSON.parse(savedLists);
      }
      const savedSkin = localStorage.getItem("adx_skin") as AnimeDexSkinId | null;
      if (savedSkin && ANIMEDEX_SKINS.some((s) => s.id === savedSkin)) {
        this.activeSkin = savedSkin;
      }
      const savedLite = localStorage.getItem("adx_lite");
      if (savedLite === "true" || savedLite === "false") {
        this.liteMode = savedLite === "true";
      }
      const savedView = localStorage.getItem("adx_view_mode") as ExplorerViewMode | null;
      if (savedView && ["grid", "list", "thumbnail"].includes(savedView)) {
        this.explorerViewMode = savedView;
      }
    } catch {
      // Ignore storage errors
    }
  }

  private persistToStorage() {
    try {
      localStorage.setItem("ct_watchlist", JSON.stringify(this.watchlist));
      localStorage.setItem("ct_reviews", JSON.stringify(this.reviews));
      localStorage.setItem("ct_lists", JSON.stringify(this.customLists));
    } catch {
      // Ignore storage errors
    }
  }

  setCategory = (category: "All" | MediaCategoryType) => {
    this.selectedCategory = category;
  };

  setGenre = (genre: string) => {
    this.selectedGenre = genre;
  };

  private searchDebounceTimer: any = null;
  private liveSearchedTerms = new Set<string>();
  private liveSearchSeq = 0;

  setSearchQuery = (q: string) => {
    // Preserve space between words during active typing while stripping dangerous HTML/XSS
    const cleanQuery = sanitizeUserText(q, 160, false);
    const wasEmpty = !this.searchQuery.trim();
    this.searchQuery = cleanQuery;
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    const trimmed = cleanQuery.trim();
    if (trimmed.length > 0 && wasEmpty && this.selectedCategory !== "All") {
      this.selectedCategory = "All";
    }
    if (trimmed.length >= 2) {
      const cacheKey = trimmed.toLowerCase();
      if (!this.liveSearchedTerms.has(cacheKey)) {
        this.isSearchPending = true;
        this.searchDebounceTimer = setTimeout(() => {
          this.searchDebounceTimer = null;
          // Do NOT sync back into searchQuery: the trimmed value would erase a trailing
          // space the user just typed (the cause of the "weird" space-bar behaviour).
          this.executeLiveMultiApiSearch(trimmed, false);
        }, 350);
      } else {
        this.isSearchPending = false;
      }
    } else {
      this.liveSearchSeq++;
      this.isSearchPending = false;
      this.isSearchingLiveApis = false;
    }
  };

  setMinCumulativeScore = (score: number) => {
    this.minCumulativeScore = score;
  };

  setSortBy = (
    sort:
      | "cumulative_desc"
      | "critic_desc"
      | "audience_desc"
      | "comic_desc"
      | "polarizing_desc"
      | "votes_desc"
      | "year_desc"
  ) => {
    this.sortBy = sort;
  };

  get activeSelectedItem(): AggregatedMediaItem | null {
    if (!this.selectedItem) return null;
    return (
      this.getMediaByExternalId(this.selectedItem.externalId) ||
      this.selectedItem
    );
  }

  private mergeLiveSourcesWithCommunity = (
    existingSources: ExternalRatingSource[],
    liveSources: ExternalRatingSource[]
  ): ExternalRatingSource[] => {
    const merged: ExternalRatingSource[] = liveSources.map((s) => ({ ...s }));
    const existingCommunity = existingSources.find(
      (s) => s.sourceId === "comictraffic_community"
    );
    if (
      existingCommunity &&
      !merged.some((s) => s.sourceId === "comictraffic_community")
    ) {
      merged.push({ ...existingCommunity });
    }
    return merged;
  };

  /**
   * Reconciles static/catalog items with freshly fetched live API results by canonical
   * title + mediaType + compatible release year so every section (rows, banner, explorer,
   * details modal, compare arena, and search) displays the exact same Multi-Platform API
   * Rating Breakdown and Final Cumulative Average.
   */
  reconcileCatalogWithLiveItems = (liveItems: AggregatedMediaItem[]) => {
    if (!Array.isArray(liveItems) || liveItems.length === 0) return;
    const weightsToApply = this.useCustomWeights ? this.customWeights : undefined;
    let catalogChanged = false;

    const nextCatalog = this.catalog.map((catItem) => {
      const candidates = liveItems.filter((live) =>
        itemsMatchCanonical(catItem, live)
      );
      if (candidates.length === 0) return catItem;

      // Pick the richest live match (most verified rating sources, then highest vote count)
      candidates.sort((a, b) => {
        const srcDiff =
          b.cumulativeRating.activeSourceCount -
          a.cumulativeRating.activeSourceCount;
        if (srcDiff !== 0) return srcDiff;
        return (
          b.cumulativeRating.totalAggregatedVotes -
          a.cumulativeRating.totalAggregatedVotes
        );
      });
      const bestLive = candidates[0];
      const mergedSources = this.mergeLiveSourcesWithCommunity(
        catItem.cumulativeRating.sources,
        bestLive.cumulativeRating.sources
      );
      const recalculated = calculateCumulativeRating(
        mergedSources,
        weightsToApply
      );
      this.liveHydratedExternalIds.add(catItem.externalId);
      catalogChanged = true;
      return {
        ...catItem,
        cumulativeRating: recalculated,
      };
    });

    if (catalogChanged) {
      this.catalog = nextCatalog;
      const catalogById = new Map(nextCatalog.map((c) => [c.externalId, c]));
      this.watchlist = this.watchlist.map((w) => {
        const synced = catalogById.get(w.externalMediaId);
        return synced
          ? {
              ...w,
              cumulativeAverage: synced.cumulativeRating.finalCumulativeAverage,
            }
          : w;
      });
      if (this.selectedItem) {
        const updatedSelected = this.getMediaByExternalId(
          this.selectedItem.externalId
        );
        if (updatedSelected) {
          this.selectedItem = updatedSelected;
        }
      }
    }
  };

  hydrateItemWithLiveRatings = async (
    item: AggregatedMediaItem | null | undefined
  ) => {
    if (!item || isLiveExternalId(item.externalId)) return;
    if (
      this.liveHydratedExternalIds.has(item.externalId) ||
      this.hydratingInFlight.has(item.externalId)
    ) {
      return;
    }

    // Fast path: reconcile synchronously if a live match is already in memory
    const cachedLive = Object.values(this.liveItemsByExternalId);
    if (cachedLive.some((live) => itemsMatchCanonical(item, live))) {
      runInAction(() => {
        this.reconcileCatalogWithLiveItems(cachedLive);
      });
      return;
    }

    const query = cleanTitleForLiveLookup(item.title);
    if (query.length < 2) return;

    this.hydratingInFlight.add(item.externalId);
    runInAction(() => {
      this.hydratingExternalId = item.externalId;
    });

    try {
      const res = await fetchLiveMediaSnapshot(query);
      runInAction(() => {
        if (!res.failed && !res.fallback && res.items.length > 0) {
          const weightsToApply = this.useCustomWeights
            ? this.customWeights
            : undefined;
          const normalized = res.items.map((live) => ({
            ...live,
            cumulativeRating: calculateCumulativeRating(
              live.cumulativeRating.sources,
              weightsToApply
            ),
          }));
          const nextById = { ...this.liveItemsByExternalId };
          for (const live of normalized) {
            nextById[live.externalId] = live;
          }
          this.liveItemsByExternalId = nextById;
          this.reconcileCatalogWithLiveItems(normalized);
          this.liveHydratedExternalIds.add(item.externalId);
        }
      });
    } finally {
      this.hydratingInFlight.delete(item.externalId);
      runInAction(() => {
        if (this.hydratingExternalId === item.externalId) {
          this.hydratingExternalId = null;
        }
      });
    }
  };

  private triggerAutoHydrate = (item: AggregatedMediaItem | null | undefined) => {
    if (!item || isLiveExternalId(item.externalId)) return;
    // Always perform synchronous reconciliation from in-memory live results first
    const cachedLive = Object.values(this.liveItemsByExternalId);
    if (cachedLive.some((live) => itemsMatchCanonical(item, live))) {
      this.reconcileCatalogWithLiveItems(cachedLive);
      return;
    }
    const isTestEnv =
      typeof import.meta !== "undefined" &&
      (import.meta as any).env?.MODE === "test";
    if (!isTestEnv) {
      void this.hydrateItemWithLiveRatings(item);
    }
  };

  openDetailModal = (item: AggregatedMediaItem) => {
    const resolved = this.getMediaByExternalId(item.externalId) || item;
    this.selectedItem = resolved;
    this.triggerAutoHydrate(resolved);
  };

  closeDetailModal = () => {
    this.selectedItem = null;
  };

  setCompareModalOpen = (open: boolean) => {
    this.compareModalOpen = open;
    if (open) {
      for (const item of this.comparisonItems) {
        this.triggerAutoHydrate(item);
      }
    }
  };

  setWeightsModalOpen = (open: boolean) => {
    this.weightsModalOpen = open;
  };

  setSourceWeight = (sourceId: string, weight: number) => {
    this.customWeights = {
      ...this.customWeights,
      [sourceId]: Math.round(Math.max(0, Math.min(3, weight)) * 100) / 100,
    };
    this.useCustomWeights = true;
    this.recalculateAllCatalogRatings();
  };

  resetSourceWeights = () => {
    this.initDefaultWeights();
    this.useCustomWeights = false;
    this.recalculateAllCatalogRatings();
  };

  recalculateAllCatalogRatings = () => {
    const weightsToApply = this.useCustomWeights ? this.customWeights : undefined;
    const recalc = (item: AggregatedMediaItem): AggregatedMediaItem => ({
      ...item,
      cumulativeRating: calculateCumulativeRating(
        item.cumulativeRating.sources,
        weightsToApply
      ),
    });
    this.catalog = this.catalog.map(recalc);
    const nextLiveById: Record<string, AggregatedMediaItem> = {};
    for (const [id, item] of Object.entries(this.liveItemsByExternalId)) {
      nextLiveById[id] = recalc(item);
    }
    this.liveItemsByExternalId = nextLiveById;
    const nextLiveByQuery: Record<string, AggregatedMediaItem[]> = {};
    for (const [qKey, list] of Object.entries(this.liveSearchResultsByQuery)) {
      nextLiveByQuery[qKey] = list.map(recalc);
    }
    this.liveSearchResultsByQuery = nextLiveByQuery;
    if (this.selectedItem) {
      const updated = this.getMediaByExternalId(this.selectedItem.externalId);
      if (updated) {
        this.selectedItem = updated;
      }
    }
  };

  syncCustomWeightsEncrypted = async () => {
    await encryptedBackendClient.sendEncryptedPost("/media/calculate-custom", {
      externalId: this.selectedItem?.externalId || "comic-watchmen-1986",
      customWeights: this.customWeights,
    });
    runInAction(() => {
      this.encryptionLogs = [...encryptedBackendClient.logs];
    });
  };

  get isSearchInProgress(): boolean {
    return this.isSearchingLiveApis || this.isSearchPending;
  }

  get activeLiveResults(): AggregatedMediaItem[] | null {
    const key = this.searchQuery.trim().toLowerCase();
    if (key.length < 2) return null;
    return Object.prototype.hasOwnProperty.call(this.liveSearchResultsByQuery, key)
      ? this.liveSearchResultsByQuery[key]
      : null;
  }

  get activeSearchMatches(): AggregatedMediaItem[] {
    const activeQuery = this.searchQuery.trim();
    if (!activeQuery) {
      return [...this.catalog];
    }
    const live = this.activeLiveResults;
    if (live !== null) {
      const merged: AggregatedMediaItem[] = [...live];
      const seenIds = new Set(live.map((i) => i.externalId));
      for (const item of this.catalog) {
        if (scoreSearchMatch(item, activeQuery) <= 0) continue;
        if (seenIds.has(item.externalId)) continue;
        if (merged.some((existing) => itemsMatchCanonical(existing, item))) continue;
        seenIds.add(item.externalId);
        merged.push(item);
      }
      return merged;
    }
    return this.catalog.filter((item) => scoreSearchMatch(item, activeQuery) > 0);
  }

  executeLiveMultiApiSearch = async (
    queryText?: string,
    syncToSearchQuery: boolean = true,
    forceRefresh: boolean = false
  ) => {
    const q = (queryText ?? this.searchQuery).trim();
    if (syncToSearchQuery && queryText !== undefined && q !== this.searchQuery) {
      this.searchQuery = q;
    }
    if (q.length < 2) {
      runInAction(() => {
        this.isSearchPending = false;
        this.isSearchingLiveApis = false;
      });
      return;
    }

    const cacheKey = q.toLowerCase();
    if (!forceRefresh && this.liveSearchedTerms.has(cacheKey)) {
      runInAction(() => {
        this.isSearchPending = false;
        this.isSearchingLiveApis = false;
      });
      return;
    }

    const requestSeq = ++this.liveSearchSeq;
    runInAction(() => {
      this.isSearchPending = false;
      this.isSearchingLiveApis = true;
    });
    try {
      const result = await searchLiveMultiApisDetailed(q);
      if (result.aborted) {
        if (requestSeq === this.liveSearchSeq) {
          runInAction(() => {
            this.isSearchingLiveApis = false;
            this.isSearchPending = false;
          });
        }
        return;
      }
      runInAction(() => {
        if (!result.failed) {
          const weightsToApply = this.useCustomWeights
            ? this.customWeights
            : undefined;
          const items = result.items.map((item) => {
            const matchedCatalog = this.catalog.find((c) =>
              itemsMatchCanonical(c, item)
            );
            const sources = matchedCatalog
              ? this.mergeLiveSourcesWithCommunity(
                  matchedCatalog.cumulativeRating.sources,
                  item.cumulativeRating.sources
                )
              : item.cumulativeRating.sources;
            return {
              ...item,
              cumulativeRating: calculateCumulativeRating(
                sources,
                weightsToApply
              ),
            };
          });
          this.liveSearchedTerms.add(cacheKey);
          this.liveSearchResultsByQuery = {
            ...this.liveSearchResultsByQuery,
            [cacheKey]: items,
          };
          const nextById = { ...this.liveItemsByExternalId };
          for (const item of items) {
            nextById[item.externalId] = item;
          }
          this.liveItemsByExternalId = nextById;
          this.lastSearchUsedFallback = result.fallback;
          if (!result.fallback) {
            this.reconcileCatalogWithLiveItems(items);
          }
        }
        if (requestSeq === this.liveSearchSeq) {
          this.isSearchingLiveApis = false;
          this.isSearchPending = false;
        }
      });
    } catch {
      runInAction(() => {
        if (requestSeq === this.liveSearchSeq) {
          this.isSearchingLiveApis = false;
          this.isSearchPending = false;
        }
      });
    }
  };

  searchSuggestions = (
    term: string,
    limit: number = 12,
    categoryFilter: "All" | MediaCategoryType = "All"
  ): AggregatedMediaItem[] => {
    const clean = term.trim();
    const matchesCategory = (item: AggregatedMediaItem) =>
      categoryFilter === "All" || item.mediaType === categoryFilter;

    if (!clean) {
      if (categoryFilter !== "All") {
        return this.catalog.filter(matchesCategory).slice(0, limit);
      }
      // Return a balanced default mix across all 4 categories so Games, Movies, TV, and Comics
      // are all immediately discoverable in Compare Arena before the user even types.
      const categories: MediaCategoryType[] = [
        "Game",
        "Movie",
        "TvSeries",
        "ComicBook",
      ];
      const perCat = Math.max(1, Math.floor(limit / categories.length));
      const balanced: AggregatedMediaItem[] = [];
      const seenDefault = new Set<string>();
      for (const cat of categories) {
        const picked = this.catalog
          .filter((item) => item.mediaType === cat)
          .slice(0, perCat);
        for (const item of picked) {
          if (!seenDefault.has(item.externalId)) {
            seenDefault.add(item.externalId);
            balanced.push(item);
          }
        }
      }
      for (const item of this.catalog) {
        if (balanced.length >= limit) break;
        if (!seenDefault.has(item.externalId)) {
          seenDefault.add(item.externalId);
          balanced.push(item);
        }
      }
      return balanced.slice(0, limit);
    }

    const key = clean.toLowerCase();
    const liveForQuery = Object.prototype.hasOwnProperty.call(
      this.liveSearchResultsByQuery,
      key
    )
      ? this.liveSearchResultsByQuery[key]
      : [];

    const seen = new Set<string>();
    const pool: AggregatedMediaItem[] = [];
    const pushUnique = (item: AggregatedMediaItem) => {
      if (!matchesCategory(item)) return;
      if (seen.has(item.externalId)) return;
      if (pool.some((existing) => itemsMatchCanonical(existing, item))) return;
      seen.add(item.externalId);
      pool.push(item);
    };

    for (const item of liveForQuery) {
      pushUnique(item);
    }
    for (const item of Object.values(this.liveItemsByExternalId)) {
      if (scoreSearchMatch(item, clean) > 0) {
        pushUnique(item);
      }
    }
    for (const item of this.catalog) {
      if (scoreSearchMatch(item, clean) > 0) {
        pushUnique(item);
      }
    }

    if (liveForQuery.length > 0 && categoryFilter === "All") {
      // Preserve live search relevance first, followed by any matching catalog items (e.g., Games)
      // that live providers didn't return in the top slice.
      const liveIds = new Set(liveForQuery.map((i) => i.externalId));
      const liveSlice = pool.filter((i) => liveIds.has(i.externalId));
      const extraCatalog = pool
        .filter((i) => !liveIds.has(i.externalId))
        .sort(
          (a, b) =>
            scoreSearchMatch(b, clean) - scoreSearchMatch(a, clean) ||
            b.cumulativeRating.finalCumulativeAverage -
              a.cumulativeRating.finalCumulativeAverage
        );
      return [...liveSlice, ...extraCatalog].slice(0, limit);
    }

    const scored = pool.map((item) => ({
      item,
      score: scoreSearchMatch(item, clean),
    }));

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        b.item.cumulativeRating.finalCumulativeAverage -
        a.item.cumulativeRating.finalCumulativeAverage
      );
    });
    return scored.slice(0, limit).map((entry) => entry.item);
  };

  get availableGenres(): string[] {
    const set = new Set<string>(["All"]);
    const live = this.activeLiveResults;
    if (live) {
      for (const item of live) {
        for (const g of item.genres) {
          set.add(g);
        }
      }
    }
    for (const item of this.catalog) {
      for (const g of item.genres) {
        set.add(g);
      }
    }
    return Array.from(set);
  }

  get filteredCatalog(): AggregatedMediaItem[] {
    const activeQuery = this.searchQuery.trim();
    const hasLive = activeQuery.length >= 2 && this.activeLiveResults !== null;
    let list =
      activeQuery.length > 0
        ? [...this.activeSearchMatches]
        : [...this.catalog];

    if (this.selectedCategory !== "All") {
      list = list.filter((i) => i.mediaType === this.selectedCategory);
    }

    if (this.selectedGenre !== "All") {
      const g = this.selectedGenre.toLowerCase();
      list = list.filter((i) =>
        i.genres.some((genre) => genre.toLowerCase() === g)
      );
    }

    if (this.minCumulativeScore > 0) {
      list = list.filter(
        (i) =>
          i.cumulativeRating.finalCumulativeAverage >= this.minCumulativeScore
      );
    }

    switch (this.sortBy) {
      case "critic_desc":
        list.sort(
          (a, b) =>
            b.cumulativeRating.criticConsensusScore -
            a.cumulativeRating.criticConsensusScore
        );
        break;
      case "audience_desc":
        list.sort(
          (a, b) =>
            b.cumulativeRating.audienceConsensusScore -
            a.cumulativeRating.audienceConsensusScore
        );
        break;
      case "comic_desc":
        list.sort(
          (a, b) =>
            b.cumulativeRating.comicCommunityScore -
            a.cumulativeRating.comicCommunityScore
        );
        break;
      case "polarizing_desc":
        list.sort(
          (a, b) =>
            b.cumulativeRating.polarizationIndex -
            a.cumulativeRating.polarizationIndex
        );
        break;
      case "votes_desc":
        list.sort(
          (a, b) =>
            b.cumulativeRating.totalAggregatedVotes -
            a.cumulativeRating.totalAggregatedVotes
        );
        break;
      case "year_desc":
        list.sort((a, b) => b.releaseYear - a.releaseYear);
        break;
      case "cumulative_desc":
      default:
        if (activeQuery.length > 0) {
          list.sort((a, b) => {
            const relDiff =
              scoreSearchMatch(b, activeQuery) - scoreSearchMatch(a, activeQuery);
            if (relDiff !== 0) return relDiff;
            if (hasLive) {
              const voteDiff =
                b.cumulativeRating.totalAggregatedVotes -
                a.cumulativeRating.totalAggregatedVotes;
              if (voteDiff !== 0) return voteDiff;
            }
            return (
              b.cumulativeRating.finalCumulativeAverage -
              a.cumulativeRating.finalCumulativeAverage
            );
          });
        } else {
          list.sort(
            (a, b) =>
              b.cumulativeRating.finalCumulativeAverage -
              a.cumulativeRating.finalCumulativeAverage
          );
        }
        break;
    }

    return list;
  }

  getMediaByExternalId = (id: string): AggregatedMediaItem | null => {
    return (
      this.liveItemsByExternalId[id] ||
      this.catalog.find((c) => c.externalId === id) ||
      null
    );
  };

  get comparisonIds(): string[] {
    return this.comparisonSlots.filter((id): id is string => Boolean(id));
  }

  get comparisonItems(): AggregatedMediaItem[] {
    return this.comparisonIds
      .map((id) => this.getMediaByExternalId(id))
      .filter((x): x is AggregatedMediaItem => Boolean(x));
  }

  getComparisonSlotItem = (slotIndex: number): AggregatedMediaItem | null => {
    if (slotIndex < 0 || slotIndex >= 3) return null;
    const id = this.comparisonSlots[slotIndex];
    if (!id) return null;
    return this.getMediaByExternalId(id);
  };

  setComparisonSlot = (slotIndex: number, externalId: string | null) => {
    if (slotIndex < 0 || slotIndex >= 3) return;
    const nextSlots = [...this.comparisonSlots];
    // Prevent duplicate item across slots
    if (externalId) {
      for (let i = 0; i < 3; i++) {
        if (i !== slotIndex && nextSlots[i] === externalId) {
          nextSlots[i] = null;
        }
      }
    }
    nextSlots[slotIndex] = externalId;
    this.comparisonSlots = nextSlots;
    if (externalId) {
      this.triggerAutoHydrate(this.getMediaByExternalId(externalId));
    }
  };

  toggleComparisonItem = (externalId: string) => {
    const existingIdx = this.comparisonSlots.indexOf(externalId);
    if (existingIdx !== -1) {
      const next = [...this.comparisonSlots];
      next[existingIdx] = null;
      this.comparisonSlots = next;
      return;
    }

    const emptyIdx = this.comparisonSlots.findIndex((s) => s === null);
    if (emptyIdx !== -1) {
      const next = [...this.comparisonSlots];
      next[emptyIdx] = externalId;
      this.comparisonSlots = next;
    } else {
      // Shift into the 3rd slot if all 3 slots are full
      this.comparisonSlots = [
        this.comparisonSlots[1],
        this.comparisonSlots[2],
        externalId,
      ];
    }
    this.triggerAutoHydrate(this.getMediaByExternalId(externalId));
  };

  reviewsForMedia = (externalMediaId: string): UserReviewItem[] => {
    return this.reviews.filter((r) => r.externalMediaId === externalMediaId);
  };

  submitReview = async (payload: {
    externalMediaId: string;
    mediaTitle: string;
    mediaType: MediaCategoryType;
    score: number;
    headline: string;
    reviewText: string;
    containsSpoilers: boolean;
    username: string;
  }) => {
    const clampedScore = Math.max(0, Math.min(100, Math.round(payload.score)));
    const newReview: UserReviewItem = {
      id: `rev-${Date.now()}`,
      userId: "11111111-1111-1111-1111-111111111111",
      username: sanitizeUserText(payload.username || "comicwarden", 50),
      externalMediaId: sanitizeUserText(payload.externalMediaId, 120),
      mediaTitle: sanitizeUserText(payload.mediaTitle, 180),
      mediaType: payload.mediaType,
      score: clampedScore,
      headline: sanitizeUserText(payload.headline, 180),
      reviewText: sanitizeUserText(payload.reviewText, 2000),
      containsSpoilers: Boolean(payload.containsSpoilers),
      helpfulVotes: 1,
      createdAt: new Date().toISOString(),
    };

    await encryptedBackendClient.sendEncryptedPost("/reviews", newReview);

    runInAction(() => {
      this.reviews = [newReview, ...this.reviews];
      this.encryptionLogs = [...encryptedBackendClient.logs];

      const target = this.getMediaByExternalId(payload.externalMediaId);
      if (target) {
        const hasCommunitySource = target.cumulativeRating.sources.some(
          (src) => src.sourceId === "comictraffic_community"
        );
        const updatedSources = hasCommunitySource
          ? target.cumulativeRating.sources.map((src) => {
              if (src.sourceId === "comictraffic_community") {
                const prevVotes = Math.max(1, src.voteCount);
                const nextScore =
                  Math.round(
                    ((src.normalizedScore * prevVotes + clampedScore) /
                      (prevVotes + 1)) *
                      10
                  ) / 10;
                return {
                  ...src,
                  normalizedScore: nextScore,
                  voteCount: prevVotes + 1,
                  rawScoreDisplay: `${(nextScore / 10).toFixed(1)} / 10`,
                };
              }
              return src;
            })
          : [
              ...target.cumulativeRating.sources,
              {
                sourceId: "comictraffic_community",
                sourceName: "ComicTraffic Community",
                category: "ComicCommunity" as const,
                rawScoreDisplay: `${(clampedScore / 10).toFixed(1)} / 10`,
                normalizedScore: clampedScore,
                voteCount: 1,
                defaultWeight: 1.15,
                accentColor: "#a855f7",
              },
            ];

        const weightsToApply = this.useCustomWeights
          ? this.customWeights
          : undefined;
        const applyReviewToItem = (
          candidate: AggregatedMediaItem
        ): AggregatedMediaItem => {
          const candidateCommunity = updatedSources.find(
            (s) => s.sourceId === "comictraffic_community"
          );
          const nextSources = candidateCommunity
            ? [
                ...candidate.cumulativeRating.sources.filter(
                  (s) => s.sourceId !== "comictraffic_community"
                ),
                { ...candidateCommunity },
              ]
            : candidate.cumulativeRating.sources;
          return {
            ...candidate,
            cumulativeRating: calculateCumulativeRating(
              nextSources,
              weightsToApply
            ),
          };
        };

        this.catalog = this.catalog.map((c) =>
          c.externalId === target.externalId || itemsMatchCanonical(c, target)
            ? applyReviewToItem(c)
            : c
        );

        const nextLiveById: Record<string, AggregatedMediaItem> = {};
        for (const [id, liveItem] of Object.entries(this.liveItemsByExternalId)) {
          nextLiveById[id] =
            id === target.externalId || itemsMatchCanonical(liveItem, target)
              ? applyReviewToItem(liveItem)
              : liveItem;
        }
        this.liveItemsByExternalId = nextLiveById;

        const nextByQuery: Record<string, AggregatedMediaItem[]> = {};
        for (const [k, list] of Object.entries(this.liveSearchResultsByQuery)) {
          nextByQuery[k] = list.map((it) =>
            it.externalId === target.externalId || itemsMatchCanonical(it, target)
              ? applyReviewToItem(it)
              : it
          );
        }
        this.liveSearchResultsByQuery = nextByQuery;

        if (this.selectedItem) {
          const updatedSel = this.getMediaByExternalId(
            this.selectedItem.externalId
          );
          if (updatedSel) {
            this.selectedItem = updatedSel;
          }
        }
      }

      this.persistToStorage();
    });
  };

  voteReviewHelpful = (reviewId: string) => {
    this.reviews = this.reviews.map((r) =>
      r.id === reviewId ? { ...r, helpfulVotes: r.helpfulVotes + 1 } : r
    );
    this.persistToStorage();
  };

  deleteReview = async (reviewId: string, token?: string | null) => {
    const targetReview = this.reviews.find((r) => r.id === reviewId);
    if (!targetReview) return;

    await encryptedBackendClient.sendEncryptedPost(
      "/reviews/delete",
      { reviewId },
      token
    );

    runInAction(() => {
      this.reviews = this.reviews.filter((r) => r.id !== reviewId);
      const remainingForMedia = this.reviews.filter(
        (r) => r.externalMediaId === targetReview.externalMediaId
      );
      const target = this.getMediaByExternalId(targetReview.externalMediaId);
      if (target) {
        const weightsToApply = this.useCustomWeights
          ? this.customWeights
          : undefined;
        const rebuildWithoutOrWithRemaining = (
          candidate: AggregatedMediaItem
        ): AggregatedMediaItem => {
          const baseSources = candidate.cumulativeRating.sources.filter(
            (s) => s.sourceId !== "comictraffic_community"
          );
          if (remainingForMedia.length > 0) {
            const avg =
              Math.round(
                (remainingForMedia.reduce((acc, r) => acc + r.score, 0) /
                  remainingForMedia.length) *
                  10
              ) / 10;
            baseSources.push({
              sourceId: "comictraffic_community",
              sourceName: "ComicTraffic Community",
              category: "ComicCommunity",
              rawScoreDisplay: `${(avg / 10).toFixed(1)} / 10`,
              normalizedScore: avg,
              voteCount: remainingForMedia.length,
              defaultWeight: 1.15,
              accentColor: "#a855f7",
            });
          }
          return {
            ...candidate,
            cumulativeRating: calculateCumulativeRating(
              baseSources,
              weightsToApply
            ),
          };
        };

        this.catalog = this.catalog.map((c) =>
          c.externalId === target.externalId || itemsMatchCanonical(c, target)
            ? rebuildWithoutOrWithRemaining(c)
            : c
        );

        const nextLiveById: Record<string, AggregatedMediaItem> = {};
        for (const [id, liveItem] of Object.entries(this.liveItemsByExternalId)) {
          nextLiveById[id] =
            id === target.externalId || itemsMatchCanonical(liveItem, target)
              ? rebuildWithoutOrWithRemaining(liveItem)
              : liveItem;
        }
        this.liveItemsByExternalId = nextLiveById;

        if (this.selectedItem) {
          const updatedSel = this.getMediaByExternalId(
            this.selectedItem.externalId
          );
          if (updatedSel) {
            this.selectedItem = updatedSel;
          }
        }
      }

      this.persistToStorage();
    });
  };

  reportReview = async (
    params: {
      reviewId: string;
      externalMediaId: string;
      reason: "Spam" | "Harassment" | "Spoilers" | "CopyrightDMCA" | "Other";
      details?: string;
    },
    token?: string | null
  ) => {
    const cleanDetails = sanitizeUserText(params.details || "", 500);
    await encryptedBackendClient.sendEncryptedPost(
      "/reviews/report",
      {
        reviewId: params.reviewId,
        externalMediaId: params.externalMediaId,
        reason: params.reason,
        details: cleanDetails,
      },
      token
    );

    runInAction(() => {
      if (!this.reportedReviewIds.includes(params.reviewId)) {
        this.reportedReviewIds = [...this.reportedReviewIds, params.reviewId];
      }
      this.encryptionLogs = [...encryptedBackendClient.logs];
    });
  };

  purgeAllPersonalLocalData = (username?: string) => {
    runInAction(() => {
      this.reviews = username
        ? this.reviews.filter(
            (r) => r.username.toLowerCase() !== username.toLowerCase()
          )
        : [];
      this.watchlist = [];
      this.customLists = [];
      this.reportedReviewIds = [];
      this.useCustomWeights = false;
      this.initDefaultWeights();
      try {
        localStorage.removeItem("ct_watchlist");
        localStorage.removeItem("ct_reviews");
        localStorage.removeItem("ct_lists");
      } catch {
        // Ignore storage errors
      }
    });
  };

  upsertWatchlistItem = async (
    item: AggregatedMediaItem,
    status: WatchlistEntry["status"] = "PlanToWatch",
    personalScore?: number | null,
    notes?: string
  ) => {
    const existingIndex = this.watchlist.findIndex(
      (w) => w.externalMediaId === item.externalId
    );

    const entry: WatchlistEntry =
      existingIndex >= 0
        ? {
            ...this.watchlist[existingIndex],
            status,
            userPersonalScore:
              personalScore !== undefined
                ? personalScore
                : this.watchlist[existingIndex].userPersonalScore,
            notes:
              notes !== undefined ? notes : this.watchlist[existingIndex].notes,
            cumulativeAverage: item.cumulativeRating.finalCumulativeAverage,
            updatedAt: new Date().toISOString(),
          }
        : {
            id: `wl-${Date.now()}`,
            userId: "11111111-1111-1111-1111-111111111111",
            externalMediaId: item.externalId,
            title: item.title,
            mediaType: item.mediaType,
            posterUrl: item.posterUrl,
            cumulativeAverage: item.cumulativeRating.finalCumulativeAverage,
            userPersonalScore: personalScore ?? null,
            status,
            notes: notes || "",
            updatedAt: new Date().toISOString(),
          };

    await encryptedBackendClient.sendEncryptedPost(
      "/dashboard/watchlist",
      entry
    );

    runInAction(() => {
      if (existingIndex >= 0) {
        const clone = [...this.watchlist];
        clone[existingIndex] = entry;
        this.watchlist = clone;
      } else {
        this.watchlist = [entry, ...this.watchlist];
      }
      this.encryptionLogs = [...encryptedBackendClient.logs];
      this.persistToStorage();
    });
  };

  removeWatchlistItem = (externalMediaId: string) => {
    this.watchlist = this.watchlist.filter(
      (w) => w.externalMediaId !== externalMediaId
    );
    this.persistToStorage();
  };

  createCustomList = async (
    name: string,
    description: string,
    externalMediaIds: string[],
    ownerUsername: string = "comicwarden"
  ) => {
    const newList: CustomListEntry = {
      id: `list-${Date.now()}`,
      userId: "11111111-1111-1111-1111-111111111111",
      ownerUsername: sanitizeUserText(ownerUsername, 50),
      name: sanitizeUserText(name, 140),
      description: sanitizeUserText(description, 600),
      isPublic: true,
      externalMediaIds: externalMediaIds.slice(0, 50),
      createdAt: new Date().toISOString(),
    };

    await encryptedBackendClient.sendEncryptedPost("/dashboard/lists", newList);

    runInAction(() => {
      this.customLists = [newList, ...this.customLists];
      this.encryptionLogs = [...encryptedBackendClient.logs];
      this.persistToStorage();
    });
  };

  get dashboardMetrics() {
    const totalTracked = this.watchlist.length;
    const moviesCount = this.watchlist.filter(
      (w) => w.mediaType === "Movie"
    ).length;
    const tvCount = this.watchlist.filter(
      (w) => w.mediaType === "TvSeries"
    ).length;
    const comicsCount = this.watchlist.filter(
      (w) => w.mediaType === "ComicBook"
    ).length;
    const gamesCount = this.watchlist.filter(
      (w) => w.mediaType === "Game"
    ).length;

    const scored = this.watchlist.filter(
      (w) =>
        typeof w.userPersonalScore === "number" && w.userPersonalScore !== null
    );
    const avgPersonal =
      scored.length > 0
        ? Math.round(
            (scored.reduce((acc, w) => acc + (w.userPersonalScore || 0), 0) /
              scored.length) *
              10
          ) / 10
        : 94.0;

    const avgGlobal =
      totalTracked > 0
        ? Math.round(
            (this.watchlist.reduce((acc, w) => acc + w.cumulativeAverage, 0) /
              totalTracked) *
              10
          ) / 10
        : 91.5;

    const delta = Math.round((avgPersonal - avgGlobal) * 10) / 10;

    return {
      totalTracked,
      moviesCount,
      tvCount,
      comicsCount,
      gamesCount,
      avgPersonal,
      avgGlobal,
      delta,
      totalReviews: this.reviews.length,
      totalLists: this.customLists.length,
    };
  }
}
