import { makeAutoObservable, runInAction } from "mobx";
import {
  AggregatedMediaItem,
  calculateCumulativeRating,
  CustomListEntry,
  encryptedBackendClient,
  MediaCategoryType,
  RATING_SOURCE_DEFINITIONS,
  searchLiveMultiApis,
  UserReviewItem,
  WatchlistEntry,
} from "../api/ratingApis";
import { EncryptionInspectionLog } from "../security/payloadCrypto";
import { sanitizeUserText } from "../security/inputSanitizer";

const DEFAULT_REVIEWS: UserReviewItem[] = [
  {
    id: "rev-1",
    userId: "11111111-1111-1111-1111-111111111111",
    username: "comicwarden",
    externalMediaId: "comic-watchmen-1986",
    mediaTitle: "Watchmen #1–12 (Absolute Edition)",
    mediaType: "ComicBook",
    score: 98,
    headline: "The gold standard of sequential art and nine-panel symmetry",
    reviewText:
      "Issue #4 (Watchmaker) and Issue #5 (Fearful Symmetry) remain unmatched in how they use the physical medium of comic books. Every rating API agrees: a structural masterpiece.",
    containsSpoilers: false,
    helpfulVotes: 48,
    createdAt: "2026-11-10T14:20:00Z",
  },
  {
    id: "rev-2",
    userId: "22222222-2222-2222-2222-222222222222",
    username: "gotham_oracle",
    externalMediaId: "movie-spiderverse-2023",
    mediaTitle: "Spider-Man: Across the Spider-Verse",
    mediaType: "Movie",
    score: 95,
    headline: "Every frame looks like a hand-inked comic cover come to life",
    reviewText:
      "Gwen's watercolor Earth-65 palette reacting to her emotional state and Hobie Brown's collage punk animation push theatrical animation into uncharted territory.",
    containsSpoilers: false,
    helpfulVotes: 34,
    createdAt: "2026-11-12T18:10:00Z",
  },
  {
    id: "rev-3",
    userId: "11111111-1111-1111-1111-111111111111",
    username: "comicwarden",
    externalMediaId: "tv-invincible-2021",
    mediaTitle: "Invincible",
    mediaType: "TvSeries",
    score: 93,
    headline: "Faithful to Kirkman's Image Comics run while sharpening the pacing",
    reviewText:
      "Seeing Omni-Man and Invincible's arc adapted with full dramatic weight makes this one of the highest-rated comic book television adaptations across IMDb, RT, and TVMaze.",
    containsSpoilers: false,
    helpfulVotes: 29,
    createdAt: "2026-11-14T09:45:00Z",
  },
];

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

export default class RatingStore {
  catalog: AggregatedMediaItem[] = [];
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
  watchlist: WatchlistEntry[] = [...DEFAULT_WATCHLIST];
  customLists: CustomListEntry[] = [...DEFAULT_LISTS];
  encryptionLogs: EncryptionInspectionLog[] = [];
  isSearchingLiveApis: boolean = false;

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
          this.catalog = res.data!;
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

  setSearchQuery = (q: string) => {
    const cleanQuery = sanitizeUserText(q, 160);
    this.searchQuery = cleanQuery;
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    const trimmed = cleanQuery.trim();
    if (trimmed.length >= 3) {
      this.searchDebounceTimer = setTimeout(() => {
        this.executeLiveMultiApiSearch(trimmed);
      }, 350);
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

  openDetailModal = (item: AggregatedMediaItem) => {
    this.selectedItem = item;
  };

  closeDetailModal = () => {
    this.selectedItem = null;
  };

  setCompareModalOpen = (open: boolean) => {
    this.compareModalOpen = open;
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
    this.catalog = this.catalog.map((item) => ({
      ...item,
      cumulativeRating: calculateCumulativeRating(
        item.cumulativeRating.sources,
        weightsToApply
      ),
    }));
    if (this.selectedItem) {
      const updated = this.catalog.find(
        (c) => c.externalId === this.selectedItem!.externalId
      );
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

  executeLiveMultiApiSearch = async (queryText?: string) => {
    const q = (queryText ?? this.searchQuery).trim();
    if (queryText !== undefined && q !== this.searchQuery) {
      this.searchQuery = q;
    }
    if (q.length < 2) return;

    this.isSearchingLiveApis = true;
    try {
      const discovered = await searchLiveMultiApis(q);
      runInAction(() => {
        const fresh: AggregatedMediaItem[] = [];
        for (const item of discovered) {
          if (
            !this.catalog.some(
              (c) =>
                c.externalId === item.externalId ||
                (c.title.toLowerCase() === item.title.toLowerCase() &&
                  c.mediaType === item.mediaType)
            )
          ) {
            fresh.push(item);
          }
        }
        if (fresh.length > 0) {
          this.catalog = [...fresh, ...this.catalog];
        }
        this.isSearchingLiveApis = false;
      });
    } catch {
      runInAction(() => {
        this.isSearchingLiveApis = false;
      });
    }
  };

  searchSuggestions = (term: string, limit: number = 8): AggregatedMediaItem[] => {
    const clean = term.trim().toLowerCase();
    if (!clean) {
      return this.catalog.slice(0, limit);
    }
    return this.catalog
      .filter(
        (item) =>
          item.title.toLowerCase().includes(clean) ||
          item.publisherOrStudio.toLowerCase().includes(clean) ||
          item.creatorOrDirector.toLowerCase().includes(clean) ||
          item.mediaType.toLowerCase().includes(clean) ||
          item.genres.some((g) => g.toLowerCase().includes(clean))
      )
      .slice(0, limit);
  };

  get availableGenres(): string[] {
    const set = new Set<string>(["All"]);
    for (const item of this.catalog) {
      for (const g of item.genres) {
        set.add(g);
      }
    }
    return Array.from(set);
  }

  get filteredCatalog(): AggregatedMediaItem[] {
    let list = [...this.catalog];

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

    if (this.searchQuery.trim().length > 0) {
      const q = this.searchQuery.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.publisherOrStudio.toLowerCase().includes(q) ||
          i.creatorOrDirector.toLowerCase().includes(q) ||
          i.overview.toLowerCase().includes(q) ||
          i.genres.some((g) => g.toLowerCase().includes(q))
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
        list.sort(
          (a, b) =>
            b.cumulativeRating.finalCumulativeAverage -
            a.cumulativeRating.finalCumulativeAverage
        );
        break;
    }

    return list;
  }

  get comparisonIds(): string[] {
    return this.comparisonSlots.filter((id): id is string => Boolean(id));
  }

  get comparisonItems(): AggregatedMediaItem[] {
    return this.comparisonIds
      .map((id) => this.catalog.find((c) => c.externalId === id))
      .filter((x): x is AggregatedMediaItem => Boolean(x));
  }

  getComparisonSlotItem = (slotIndex: number): AggregatedMediaItem | null => {
    if (slotIndex < 0 || slotIndex >= 3) return null;
    const id = this.comparisonSlots[slotIndex];
    if (!id) return null;
    return this.catalog.find((c) => c.externalId === id) || null;
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

      const targetIndex = this.catalog.findIndex(
        (c) => c.externalId === payload.externalMediaId
      );
      if (targetIndex >= 0) {
        const target = this.catalog[targetIndex];
        const updatedSources = target.cumulativeRating.sources.map((src) => {
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
        });

        const weightsToApply = this.useCustomWeights
          ? this.customWeights
          : undefined;
        const recalculated = calculateCumulativeRating(
          updatedSources,
          weightsToApply
        );
        const updatedItem: AggregatedMediaItem = {
          ...target,
          cumulativeRating: recalculated,
        };
        this.catalog[targetIndex] = updatedItem;
        if (this.selectedItem?.externalId === updatedItem.externalId) {
          this.selectedItem = updatedItem;
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
      avgPersonal,
      avgGlobal,
      delta,
      totalReviews: this.reviews.length,
      totalLists: this.customLists.length,
    };
  }
}
