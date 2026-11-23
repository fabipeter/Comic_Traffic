import React from "react";
import axios from "axios";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import {
  AggregatedMediaItem,
  calculateCumulativeRating,
  encryptedBackendClient,
  ExternalRatingSource,
  RATING_SOURCE_DEFINITIONS,
} from "./app/api/ratingApis";
import {
  encryptPayload,
  decryptPayload,
  setRuntimeDerivedKeys,
  clearRuntimeDerivedKeys,
  isWebCryptoAvailable,
} from "./app/security/payloadCrypto";
import {
  sanitizeUserText,
  sanitizeImageUrl,
  sanitizeReturnToPath,
} from "./app/security/inputSanitizer";
import RatingStore, {
  matchesSearchItem,
  normalizeSearchString,
  scoreSearchMatch,
} from "./app/stores/ratingStore";
import { store } from "./app/stores/store";
import LandingPage from "./features/home/LandingPage";
import IndexProfilePage from "./features/dashboard/profile/IndexProfilePage";
import LoginPage from "./features/authentication/login/LoginPage";
import ForgotPasswordPage from "./features/authentication/forgot-password/ForgotPasswordPage";
import RegisterPage from "./features/authentication/register/RegisterPage";
import { CompareModal } from "./features/home/CumulativeModals";
import ScrollToTopButton from "./features/common/ScrollToTopButton";
import {
  PrivacyPolicyPage,
  TermsOfServicePage,
  AttributionsDmcaPage,
} from "./features/legal/LegalPages";

const MOCK_BACKEND_CATALOG: AggregatedMediaItem[] = [
  {
    id: "101",
    externalId: "comic-watchmen-1986",
    title: "Watchmen #1–12 (Absolute Edition)",
    mediaType: "ComicBook",
    releaseYear: 1986,
    publisherOrStudio: "DC Comics",
    creatorOrDirector: "Alan Moore, Dave Gibbons",
    runtimeOrIssueCount: "12 Issues",
    ageRating: "Mature",
    genres: ["Graphic Novel", "Superhero", "Noir"],
    posterUrl: "/comic-traffic-logo.svg",
    backdropUrl: "/comic-traffic-logo.svg",
    overview: "A landmark graphic novel.",
    cumulativeRating: calculateCumulativeRating([
      {
        sourceId: "anilist",
        sourceName: "AniList",
        category: "ComicCommunity",
        rawScoreDisplay: "98 / 100",
        normalizedScore: 98,
        voteCount: 34000,
        defaultWeight: 1.2,
        accentColor: "#02a9ff",
      },
    ]),
  },
  {
    id: "201",
    externalId: "movie-dark-knight-2008",
    title: "The Dark Knight",
    mediaType: "Movie",
    releaseYear: 2008,
    publisherOrStudio: "Warner Bros.",
    creatorOrDirector: "Christopher Nolan",
    runtimeOrIssueCount: "152 min",
    ageRating: "PG-13",
    genres: ["Action", "Superhero"],
    posterUrl: "/comic-traffic-logo.svg",
    backdropUrl: "/comic-traffic-logo.svg",
    overview: "Batman faces the Joker.",
    cumulativeRating: calculateCumulativeRating([
      {
        sourceId: "imdb",
        sourceName: "IMDb",
        category: "Audience",
        rawScoreDisplay: "9.0/10",
        normalizedScore: 90,
        voteCount: 2900000,
        defaultWeight: 1.3,
        accentColor: "#f5c518",
      },
    ]),
  },
];

describe("ComicTraffic Cumulative Rating Platform Unit Tests", () => {
  test("1. calculateCumulativeRating computes Final Cumulative Average, Bayesian score, and Critic/Audience splits", () => {
    const sampleSources: ExternalRatingSource[] = [
      {
        sourceId: "imdb",
        sourceName: "IMDb (OMDb)",
        category: "Audience",
        rawScoreDisplay: "9.0 / 10",
        normalizedScore: 90,
        voteCount: 450000,
        defaultWeight: 1.25,
        accentColor: "#f5c518",
      },
      {
        sourceId: "rotten_tomatoes_critics",
        sourceName: "Rotten Tomatoes (Critics)",
        category: "Critic",
        rawScoreDisplay: "96%",
        normalizedScore: 96,
        voteCount: 320,
        defaultWeight: 1.2,
        accentColor: "#fa320a",
      },
      {
        sourceId: "metacritic",
        sourceName: "Metacritic",
        category: "Critic",
        rawScoreDisplay: "88 / 100",
        normalizedScore: 88,
        voteCount: 55,
        defaultWeight: 1.2,
        accentColor: "#ffcc33",
      },
      {
        sourceId: "anilist",
        sourceName: "AniList",
        category: "ComicCommunity",
        rawScoreDisplay: "96 / 100",
        normalizedScore: 96,
        voteCount: 18000,
        defaultWeight: 1.2,
        accentColor: "#02a9ff",
      },
      // Legacy seeded-only sources must be stripped from cumulative calculation
      {
        sourceId: "comicvine",
        sourceName: "ComicVine",
        category: "ComicCommunity",
        rawScoreDisplay: "1.0 / 5",
        normalizedScore: 20,
        voteCount: 999999,
        defaultWeight: 2.0,
        accentColor: "#e62429",
      },
    ];

    const summary = calculateCumulativeRating(sampleSources);

    expect(summary.activeSourceCount).toBe(4);
    expect(summary.sources.some((s) => s.sourceId === "comicvine")).toBe(false);
    expect(summary.totalAggregatedVotes).toBe(468375);
    expect(summary.criticConsensusScore).toBe(92);
    expect(summary.audienceConsensusScore).toBe(90);
    expect(summary.comicCommunityScore).toBe(96);
    expect(summary.finalCumulativeAverage).toBeGreaterThanOrEqual(89);
    expect(summary.finalCumulativeAverage).toBeLessThanOrEqual(95);
    expect(summary.consensusTier).toBe("Universal Acclaim");

    const weightIds = RATING_SOURCE_DEFINITIONS.map((d) => d.sourceId);
    expect(weightIds).not.toContain("comicvine");
    expect(weightIds).not.toContain("league_of_comic_geeks");
    expect(weightIds).not.toContain("goodreads");
    expect(weightIds).not.toContain("comicbookroundup_critics");
    expect(weightIds).toContain("comictraffic_community");
    expect(weightIds).toContain("rotten_tomatoes_audience");
    expect(weightIds).toContain("metacritic");
  });

  test("2. calculateCumulativeRating responds to custom user source weights", () => {
    const sources: ExternalRatingSource[] = [
      {
        sourceId: "imdb",
        sourceName: "IMDb",
        category: "Audience",
        rawScoreDisplay: "9.5/10",
        normalizedScore: 95,
        voteCount: 10000,
        defaultWeight: 1.0,
        accentColor: "#f5c518",
      },
      {
        sourceId: "metacritic",
        sourceName: "Metacritic",
        category: "Critic",
        rawScoreDisplay: "65/100",
        normalizedScore: 65,
        voteCount: 100,
        defaultWeight: 1.0,
        accentColor: "#ffcc33",
      },
    ];

    const imdbHeavy = calculateCumulativeRating(sources, {
      imdb: 3.0,
      metacritic: 1.0,
    });
    const metacriticHeavy = calculateCumulativeRating(sources, {
      imdb: 1.0,
      metacritic: 3.0,
    });

    expect(imdbHeavy.finalCumulativeAverage).toBe(87.5);
    expect(metacriticHeavy.finalCumulativeAverage).toBe(72.5);
    expect(imdbHeavy.finalCumulativeAverage).toBeGreaterThan(
      metacriticHeavy.finalCumulativeAverage
    );
  });

  test("3. Authenticated payload encryption & decryption round-trip preserves CQRS command data without exposing algorithm hint", async () => {
    const originalCommand = {
      externalMediaId: "comic-watchmen-1986",
      score: 98,
      headline: "Masterpiece of sequential art",
    };

    const envelope = await encryptPayload(originalCommand);
    expect(envelope.encrypted).toBe(true);
    expect((envelope as any).algorithm).toBeUndefined();
    expect(envelope.iv.length).toBeGreaterThan(8);
    expect(envelope.payload.length).toBeGreaterThan(8);

    const decrypted = await decryptPayload<typeof originalCommand>(envelope);
    expect(decrypted).toEqual(originalCommand);
  });

  test("4. RatingStore filters categories, supports General Search, and manages the 3 Compare Slots", () => {
    const testStore = new RatingStore();
    testStore.catalog = [...MOCK_BACKEND_CATALOG];
    expect(testStore.catalog.length).toBe(2);

    testStore.setCategory("ComicBook");
    expect(testStore.filteredCatalog.length).toBe(1);
    expect(
      testStore.filteredCatalog.every((item) => item.mediaType === "ComicBook")
    ).toBe(true);

    // General search suggestions
    const suggestions = testStore.searchSuggestions("Watchmen");
    expect(suggestions.length).toBe(1);

    // 3-Slot Compare management (max 3 slots)
    expect(testStore.comparisonSlots.length).toBe(3);
    testStore.setComparisonSlot(0, "comic-saga-2012");
    testStore.setComparisonSlot(1, "movie-logan-2017");
    testStore.setComparisonSlot(2, "tv-xmen-97-2024");
    expect(testStore.comparisonSlots).toEqual([
      "comic-saga-2012",
      "movie-logan-2017",
      "tv-xmen-97-2024",
    ]);
  });

  test("5. LandingPage renders General Search and the 3 Compare Search & Pick inputs", () => {
    store.ratingStore.catalog = [...MOCK_BACKEND_CATALOG];
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(
      screen.getByText(/Cumulative Rating Explorer & General Search/i)
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/FINAL CUMULATIVE AVERAGE/i).length
    ).toBeGreaterThan(0);

    // Verify the 3 Compare Slot search inputs are rendered
    const slot1Input = screen.getByLabelText(
      /Search and pick item for Compare Slot 1/i
    );
    const slot2Input = screen.getByLabelText(
      /Search and pick item for Compare Slot 2/i
    );
    const slot3Input = screen.getByLabelText(
      /Search and pick item for Compare Slot 3/i
    );
    expect(slot1Input).toBeInTheDocument();
    expect(slot2Input).toBeInTheDocument();
    expect(slot3Input).toBeInTheDocument();
  });

  test("6. User Dashboard requires sign-in and renders KPI Analytics and tabs once signed in", async () => {
    const testUser = {
      id: "test-user",
      username: "testuser",
      email: "test@example.com",
      displayName: "Test User",
      bio: "",
      avatarUrl: "/comic-traffic-logo.svg",
      role: "User",
      favoriteGenres: [],
      accessToken: `token_${Date.now()}`,
    };
    store.userStore.profile = testUser;
    store.commonStore.setLoggedInUser(testUser);
    render(
      <MemoryRouter>
        <IndexProfilePage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Total Tracked Media/i)).toBeInTheDocument();
    expect(screen.getByText(/Your Personal Score Average/i)).toBeInTheDocument();

    const listsTab = screen.getByRole("button", {
      name: /Custom Lists/i,
    });
    fireEvent.click(listsTab);
    expect(
      screen.getByRole("button", {
        name: /Save Custom List/i,
      })
    ).toBeInTheDocument();
  });

  test("Login page does not expose demo login or prefilled demo credentials", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    expect(screen.queryByText(/One-Click Demo Login/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Email or Username/i)).toHaveValue("");
    expect(screen.getByLabelText(/Password/i)).toHaveValue("");
  });

  test("7. Theme & Layout features: Navy Blue, Sky Blue & Daylight skins, Lite Mode toggle, View Mode switcher (Grid/List/Rich)", () => {
    const ratingStore = new RatingStore();
    expect(ratingStore.activeSkin).toBe("navy_blue");
    ratingStore.setSkin("sky_blue");
    expect(ratingStore.activeSkin).toBe("sky_blue");
    expect(document.body.getAttribute("data-adx-skin")).toBe("sky_blue");

    ratingStore.setSkin("daylight");
    expect(ratingStore.activeSkin).toBe("daylight");
    expect(document.body.getAttribute("data-adx-skin")).toBe("daylight");

    expect(ratingStore.liteMode).toBe(false);
    ratingStore.toggleLiteMode();
    expect(ratingStore.liteMode).toBe(true);
    expect(document.body.getAttribute("data-adx-lite")).toBe("true");

    expect(ratingStore.explorerViewMode).toBe("grid");
    ratingStore.setExplorerViewMode("list");
    expect(ratingStore.explorerViewMode).toBe("list");

    // Client-side XSS sanitizer tests
    const malicious = `<script>alert('xss')</script>Hello <iframe src="javascript:alert(1)"></iframe>World`;
    expect(sanitizeUserText(malicious)).toBe("alert('xss')Hello World");
    expect(sanitizeImageUrl("javascript:alert(1)")).toBe("/comic-traffic-logo.svg");
    expect(sanitizeImageUrl("https://image.tmdb.org/t/p/original/test.jpg")).toBe(
      "https://image.tmdb.org/t/p/original/test.jpg"
    );
    expect(sanitizeReturnToPath("javascript:alert(document.cookie)")).toBe("/dashboard");
    expect(sanitizeReturnToPath("//evil.example.com")).toBe("/dashboard");
    expect(sanitizeReturnToPath("/dashboard")).toBe("/dashboard");

    // Verify whitespace between words is preserved during typing for Quick Search
    expect(sanitizeUserText("Spider-Man Across ")).toBe("Spider-Man Across ");
    expect(sanitizeUserText("The Dark Knight ")).toBe("The Dark Knight ");
    expect(sanitizeUserText("   Leading and trailing   ", 100, true)).toBe("Leading and trailing");

    ratingStore.setSearchQuery("Spider-Man ");
    expect(ratingStore.searchQuery).toBe("Spider-Man ");
    ratingStore.setSearchQuery("The Dark Knight");
    expect(ratingStore.searchQuery).toBe("The Dark Knight");
  });

  test("8. Forgot Password Flow: production email recovery without demo hints and direct reset link handling", async () => {
    // 1. UserStore methods test (production flow: no client mock token exposure)
    const requestResult = await store.userStore.requestPasswordReset("comicwarden");
    expect(requestResult.isSuccessful).toBe(true);
    expect(requestResult.message).toMatch(/dispatched|sent/i);

    const generatedCode = ["CT", String(Date.now()).slice(-6)].join("-");
    const generatedPass = ["Updated", Date.now().toString(36), "!"].join("_");
    const shortInput = "123";

    // Short password rejected
    await expect(
      store.userStore.resetPassword({
        emailOrUsername: "comicwarden",
        token: generatedCode,
        newPassword: shortInput,
      })
    ).rejects.toThrow("Password must be at least 6 characters long.");

    // Valid reset succeeds
    const resetResult = await store.userStore.resetPassword({
      emailOrUsername: "comicwarden",
      token: generatedCode,
      newPassword: generatedPass,
    });
    expect(resetResult.isSuccessful).toBe(true);

    // 2. Component Render Test - Step 1
    const { unmount } = render(
      <MemoryRouter initialEntries={["/forgot-password"]}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Reset Your Password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email or Username/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send Verification Code/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back to Sign In/i })).toBeInTheDocument();
    expect(screen.queryByText(/Demo Code/i)).not.toBeInTheDocument();
    unmount();

    // 3. Direct Email Link handling (?token=...&email=...) scrubs URL params via history.replaceState
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    const linkCode = ["CT", String(Date.now() + 1).slice(-6)].join("-");
    render(
      <MemoryRouter initialEntries={[`/reset-password?token=${linkCode}&email=bruce@wayne.com`]}>
        <ForgotPasswordPage />
      </MemoryRouter>
    );
    expect(screen.getByDisplayValue("bruce@wayne.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue(linkCode)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Update Password & Continue/i })).toBeInTheDocument();
    expect(screen.queryByText(/Demo Code/i)).not.toBeInTheDocument();
    expect(replaceStateSpy).toHaveBeenCalled();
    replaceStateSpy.mockRestore();
  });

  test("9. ScrollToTopButton renders when scrolled and triggers smooth scroll on click", () => {
    const scrollToMock = vi.fn();
    window.scrollTo = scrollToMock;

    const { rerender } = render(
      <MemoryRouter>
        <ScrollToTopButton />
      </MemoryRouter>
    );

    // Initially window.scrollY is 0, button is not rendered
    expect(screen.queryByLabelText(/Scroll to top of page/i)).not.toBeInTheDocument();

    // Simulate scroll down past threshold
    window.scrollY = 450;
    fireEvent.scroll(window);

    rerender(
      <MemoryRouter>
        <ScrollToTopButton />
      </MemoryRouter>
    );

    const btn = screen.getByLabelText(/Scroll to top of page/i);
    expect(btn).toBeInTheDocument();

    // Click button -> triggers window.scrollTo({ top: 0, behavior: "smooth" })
    fireEvent.click(btn);
    expect(scrollToMock).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });
  });

  test("10. Search Engine: matches titles, creators, studios, overviews, punctuation-free queries, and renders search results header and empty state", () => {
    const testCatalog = [...MOCK_BACKEND_CATALOG];
    const watchmen = testCatalog[0];
    const darkKnight = testCatalog[1];

    // Punctuation and normalization tests
    expect(normalizeSearchString("Spider-Man: Across the Spider-Verse!")).toBe(
      "spider man across the spider verse"
    );

    // Matches title by tokens
    expect(matchesSearchItem(watchmen, "watchmen")).toBe(true);
    expect(matchesSearchItem(watchmen, "watchmen 1986")).toBe(true);

    // Matches by creator
    expect(matchesSearchItem(watchmen, "alan moore")).toBe(true);
    expect(matchesSearchItem(darkKnight, "nolan")).toBe(true);

    // Matches by studio / publisher
    expect(matchesSearchItem(watchmen, "dc comics")).toBe(true);
    expect(matchesSearchItem(darkKnight, "warner bros")).toBe(true);

    // Matches by overview keyword
    expect(matchesSearchItem(darkKnight, "joker")).toBe(true);

    // Does not match unrelated query
    expect(matchesSearchItem(watchmen, "batman")).toBe(false);

    // RatingStore search integration
    const ratingStore = new RatingStore();
    ratingStore.catalog = testCatalog;

    ratingStore.setSearchQuery("nolan");
    expect(ratingStore.filteredCatalog.length).toBe(1);
    expect(ratingStore.filteredCatalog[0].title).toBe("The Dark Knight");

    ratingStore.setSearchQuery("dc comics");
    expect(ratingStore.filteredCatalog.length).toBe(1);
    expect(ratingStore.filteredCatalog[0].title).toContain("Watchmen");

    // Clear search restores catalog
    ratingStore.setSearchQuery("");
    expect(ratingStore.filteredCatalog.length).toBe(2);

    // Comprehensive Flash Search across Comics, Movies, and TV Series
    const freshRatingStore = new RatingStore();
    freshRatingStore.setSearchQuery("flash");
    const flashResults = freshRatingStore.filteredCatalog;
    expect(flashResults.length).toBeGreaterThanOrEqual(4);
    expect(flashResults.some((i) => i.mediaType === "ComicBook")).toBe(true);
    expect(flashResults.some((i) => i.mediaType === "Movie")).toBe(true);
    expect(flashResults.some((i) => i.mediaType === "TvSeries")).toBe(true);

    freshRatingStore.setSearchQuery("flashpoint");
    expect(freshRatingStore.filteredCatalog.length).toBeGreaterThanOrEqual(2);

    freshRatingStore.setSearchQuery("the flash");
    expect(freshRatingStore.filteredCatalog.length).toBeGreaterThanOrEqual(4);

    const flashSuggestions = freshRatingStore.searchSuggestions("flash", 6);
    expect(flashSuggestions.length).toBeGreaterThanOrEqual(4);
    expect(flashSuggestions[0].title.toLowerCase()).toContain("flash");
  });

  test("11. Registration Flow: email is compulsory and validated in both UI and UserStore", async () => {
    const dynamicPass = ["RegPass", Date.now().toString(36), "!"].join("_");

    // 1. UserStore enforcement (empty, whitespace, missing @, missing domain TLD)
    for (const badEmail of ["", "   ", "invalid-email", "user@localhost"]) {
      await expect(
        store.userStore.registerWithComicTraffic({
          username: "nightwing_reader",
          email: badEmail,
          password: dynamicPass,
          displayName: "Dick Grayson",
        })
      ).rejects.toThrow("A valid email address is required for registration.");
    }

    // 2. RegisterPage form attribute & submit validation enforcement
    const { container } = render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/Email Address/i) as HTMLInputElement;
    expect(emailInput).toBeTruthy();
    expect(emailInput.type).toBe("email");
    expect(emailInput.required).toBe(true);
    expect(emailInput.checkValidity()).toBe(false);

    const usernameInput = screen.getByLabelText(/Username/i) as HTMLInputElement;
    const displayInput = screen.getByLabelText(/Display Name/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/Password/i) as HTMLInputElement;
    const form = container.querySelector("form.ct-auth-form") as HTMLFormElement;
    expect(form).toBeTruthy();

    fireEvent.change(usernameInput, { target: { value: "nightwing_reader" } });
    fireEvent.change(displayInput, { target: { value: "Dick Grayson" } });
    fireEvent.change(passwordInput, { target: { value: dynamicPass } });

    fireEvent.change(emailInput, { target: { value: "   " } });
    fireEvent.submit(form);
    expect(
      screen.getByText(/Please enter a valid email address \(required for account recovery\)\./i)
    ).toBeTruthy();

    fireEvent.change(emailInput, { target: { value: "bad-email" } });
    fireEvent.submit(form);
    expect(
      screen.getByText(/Please enter a valid email address \(required for account recovery\)\./i)
    ).toBeTruthy();
  });

  test("12. Search Efficiency & Volume: relevance sorting prioritizes exact/title matches and expands suggestion limits", () => {
    const bulkStore = new RatingStore();
    const overviewOnlyHigherRated: AggregatedMediaItem = {
      ...MOCK_BACKEND_CATALOG[0],
      externalId: "overview-only-high",
      title: "Gotham Anthology",
      overview: "Includes a brief cameo about batman.",
      cumulativeRating: {
        ...MOCK_BACKEND_CATALOG[0].cumulativeRating,
        finalCumulativeAverage: 99.5,
      },
    };
    const exactTitleLowerRated: AggregatedMediaItem = {
      ...MOCK_BACKEND_CATALOG[1],
      externalId: "exact-batman-title",
      title: "Batman",
      overview: "Classic detective comic.",
      cumulativeRating: {
        ...MOCK_BACKEND_CATALOG[1].cumulativeRating,
        finalCumulativeAverage: 82.0,
      },
    };

    const manyMatches: AggregatedMediaItem[] = Array.from({ length: 14 }, (_, idx) => ({
      ...MOCK_BACKEND_CATALOG[0],
      externalId: `batman-vol-${idx + 1}`,
      title: `Batman Chronicles Vol. ${idx + 1}`,
      overview: "Dark Knight series.",
    }));

    bulkStore.catalog = [overviewOnlyHigherRated, exactTitleLowerRated, ...manyMatches];
    bulkStore.setSearchQuery("batman");

    expect(scoreSearchMatch(exactTitleLowerRated, "batman")).toBeGreaterThan(
      scoreSearchMatch(overviewOnlyHigherRated, "batman")
    );
    expect(bulkStore.filteredCatalog[0].externalId).toBe("exact-batman-title");
    expect(bulkStore.filteredCatalog.length).toBe(16);
    expect(bulkStore.searchSuggestions("batman").length).toBe(12);
  });

  test("13. Compare Arena & Mobile UX: CompareModal renders quick scoreboard, 3 responsive slots, and closes cleanly", () => {
    store.ratingStore.setComparisonSlot(0, store.ratingStore.catalog[0].externalId);
    store.ratingStore.setComparisonSlot(1, store.ratingStore.catalog[1].externalId);
    store.ratingStore.setCompareModalOpen(true);

    render(
      <MemoryRouter>
        <CompareModal />
      </MemoryRouter>
    );

    expect(
      screen.getByLabelText(/Side-by-side quick scoreboard/i)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Search and pick item for Compare Slot 1/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Close compare arena/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Close compare arena/i));
    expect(store.ratingStore.compareModalOpen).toBe(false);
  });

  test("13b. Compare Module: slot inputs search, debounce, trigger on Enter/button, show dropdown suggestions, and pick item", async () => {
    store.ratingStore.catalog = [...MOCK_BACKEND_CATALOG];
    store.ratingStore.setCompareModalOpen(true);
    const origSearch = store.ratingStore.executeLiveMultiApiSearch;
    const searchSpy = vi.fn().mockResolvedValue(undefined as any);
    store.ratingStore.executeLiveMultiApiSearch = searchSpy as any;

    try {
      render(
        <MemoryRouter>
          <CompareModal />
        </MemoryRouter>
      );

      const slot1Input = screen.getByLabelText(
        /Search and pick item for Compare Slot 1/i
      );

      // Focus slot 1: dropdown opens with suggested titles
      act(() => {
        fireEvent.focus(slot1Input);
      });
      expect(screen.getByText(/Suggested Titles to Pick/i)).toBeInTheDocument();

      // Type query: "Dark Knight"
      act(() => {
        fireEvent.change(slot1Input, { target: { value: "Dark Knight" } });
      });
      expect(slot1Input).toHaveValue("Dark Knight");

      // The clear query button (✕) should be visible
      const clearQueryBtn = screen.getByLabelText(/Clear query in Slot 1/i);
      expect(clearQueryBtn).toBeInTheDocument();

      // Press Enter to trigger search immediately
      act(() => {
        fireEvent.keyDown(slot1Input, { key: "Enter" });
      });
      expect(searchSpy).toHaveBeenCalledWith("Dark Knight", false, true);

      // Click 🔍 Search button
      const searchBtn = screen.getByLabelText(/Search live APIs for Slot 1/i);
      act(() => {
        fireEvent.click(searchBtn);
      });
      expect(searchSpy).toHaveBeenCalledTimes(2);

      // Clear query button clears the text
      act(() => {
        fireEvent.click(clearQueryBtn);
      });
      expect(slot1Input).toHaveValue("");
    } finally {
      store.ratingStore.executeLiveMultiApiSearch = origSearch;
    }
  });

  test("14. Session Key Recovery: auto-refreshes handshake and retries once on Payload decryption signature mismatch", async () => {
    const staleAes = Buffer.alloc(32, 1).toString("base64");
    const staleHmac = Buffer.alloc(32, 2).toString("base64");
    const freshAes = Buffer.alloc(32, 7).toString("base64");
    const freshHmac = Buffer.alloc(32, 8).toString("base64");

    setRuntimeDerivedKeys(staleAes, staleHmac);

    const getSpy = vi.spyOn(axios, "get").mockResolvedValueOnce({
      data: {
        isSuccessful: true,
        derivedAesKey: freshAes,
        derivedHmacKey: freshHmac,
      },
    } as any);

    const postSpy = vi
      .spyOn(axios, "post")
      .mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            isSuccessful: false,
            message:
              "Payload decryption error: Encrypted payload signature verification failed (tampered payload).",
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          isSuccessful: true,
          data: {
            username: "comicwarden",
            email: "warden@comictraffic.com",
          },
        },
      } as any);

    try {
      const res = await encryptedBackendClient.sendEncryptedPost<
        { emailOrUsername: string; password: string },
        { username: string; email: string }
      >("/auth/login", {
        emailOrUsername: "warden@comictraffic.com",
        password: ["Test", Date.now().toString(36), "!"].join("_"),
      });

      expect(res.fromBackend).toBe(true);
      expect(res.data?.username).toBe("comicwarden");
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledTimes(2);
    } finally {
      getSpy.mockRestore();
      postSpy.mockRestore();
      clearRuntimeDerivedKeys();
    }
  });

  test("15. Mobile HTTP Fallback: handles missing crypto.subtle cleanly without throwing 'undefined is not an object'", async () => {
    const cryptoDesc = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    const postSpy = vi.spyOn(axios, "post").mockResolvedValueOnce({
      data: {
        isSuccessful: true,
        data: {
          username: "mobile_user",
          email: "mobile@comictraffic.com",
        },
      },
    } as any);

    Object.defineProperty(globalThis, "crypto", {
      value: { getRandomValues: cryptoDesc?.value?.getRandomValues?.bind(cryptoDesc.value) },
      configurable: true,
    });

    try {
      expect(isWebCryptoAvailable()).toBe(false);
      const res = await encryptedBackendClient.sendEncryptedPost<
        { emailOrUsername: string; password: string },
        { username: string; email: string }
      >("/auth/login", {
        emailOrUsername: "mobile@comictraffic.com",
        password: ["Mob", Date.now().toString(36), "!"].join("_"),
      });

      expect(res.fromBackend).toBe(true);
      expect(res.data?.username).toBe("mobile_user");
      expect(postSpy).toHaveBeenCalledTimes(1);
    } finally {
      if (cryptoDesc) {
        Object.defineProperty(globalThis, "crypto", cryptoDesc);
      }
      postSpy.mockRestore();
    }
  });

  test("16. Live Search UX: shows loading stasis while searching, preserves trailing space, and keeps curated rows visible", () => {
    store.ratingStore.catalog = [...MOCK_BACKEND_CATALOG];
    store.ratingStore.setSearchQuery("nonexistent title ");

    // Trailing space is preserved while typing
    expect(store.ratingStore.searchQuery).toBe("nonexistent title ");
    expect(store.ratingStore.isSearchInProgress).toBe(true);

    const { unmount } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    // Loading stasis is displayed instead of "No matching titles found"
    expect(screen.getByRole("status", { name: /Searching live APIs/i })).toBeInTheDocument();
    expect(screen.queryByText(/No matching titles found for/i)).not.toBeInTheDocument();

    // Curated rows beneath search results remain visible
    expect(screen.getByText(/All-Time Top Rated Cinema & Blockbusters/i)).toBeInTheDocument();
    expect(screen.getByText(/Acclaimed Comic Books & Graphic Novels/i)).toBeInTheDocument();

    unmount();
    store.ratingStore.setSearchQuery("");
  });

  test("17. Registration Reliability: surfaces backend validation errors, recovers on undecryptable encrypted error, and handles timeouts clearly", async () => {
    const staleAes = Buffer.alloc(32, 3).toString("base64");
    const staleHmac = Buffer.alloc(32, 4).toString("base64");
    const freshAes = Buffer.alloc(32, 9).toString("base64");
    const freshHmac = Buffer.alloc(32, 10).toString("base64");
    const dynamicTestPass = ["RegTest", Date.now().toString(36), "!"].join("_");
    const dynamicAccessTok = ["tok", Date.now().toString(36)].join("_");

    // 1. ValidationProblemDetails.errors field messages are surfaced directly
    setRuntimeDerivedKeys(freshAes, freshHmac);
    const valPostSpy = vi.spyOn(axios, "post").mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          title: "One or more validation errors occurred.",
          errors: {
            Email: ["The Email field is not a valid e-mail address."],
          },
        },
      },
    });
    try {
      await expect(
        store.userStore.registerWithComicTraffic({
          username: "val_tester",
          email: "valid@comictraffic.io",
          password: dynamicTestPass,
          displayName: "Val Tester",
        })
      ).rejects.toThrow("The Email field is not a valid e-mail address.");
    } finally {
      valPostSpy.mockRestore();
    }

    // 2. Undecryptable encrypted error response refreshes session keys and retries instead of failing silently
    setRuntimeDerivedKeys(staleAes, staleHmac);
    const getSpy = vi.spyOn(axios, "get").mockResolvedValueOnce({
      data: {
        isSuccessful: true,
        derivedAesKey: freshAes,
        derivedHmacKey: freshHmac,
      },
    } as any);
    const retryPostSpy = vi
      .spyOn(axios, "post")
      .mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            encrypted: true,
            iv: Buffer.alloc(12, 1).toString("base64"),
            payload: Buffer.alloc(32, 2).toString("base64"),
            signature: "invalid",
            timestamp: Date.now(),
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          isSuccessful: true,
          data: {
            id: "u-recovered",
            username: "recovered_user",
            email: "recovered@comictraffic.io",
            displayName: "Recovered User",
            bio: "",
            avatarUrl: "/comic-traffic-logo.svg",
            role: "User",
            favoriteGenres: ["Superhero"],
            accessToken: dynamicAccessTok,
          },
        },
      } as any);

    try {
      const profile = await store.userStore.registerWithComicTraffic({
        username: "recovered_user",
        email: "recovered@comictraffic.io",
        password: dynamicTestPass,
        displayName: "Recovered User",
      });
      expect(profile.email).toBe("recovered@comictraffic.io");
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(retryPostSpy).toHaveBeenCalledTimes(2);
    } finally {
      getSpy.mockRestore();
      retryPostSpy.mockRestore();
      store.userStore.logout();
      clearRuntimeDerivedKeys();
    }

    // 3. Timeout reports clear server timeout message
    setRuntimeDerivedKeys(freshAes, freshHmac);
    const timeoutSpy = vi.spyOn(axios, "post").mockRejectedValueOnce({
      code: "ECONNABORTED",
      message: "timeout of 20000ms exceeded",
    });
    try {
      await expect(
        store.userStore.registerWithComicTraffic({
          username: "timeout_user",
          email: "timeout@comictraffic.io",
          password: dynamicTestPass,
          displayName: "Timeout User",
        })
      ).rejects.toThrow(/took too long to respond/i);
    } finally {
      timeoutSpy.mockRestore();
      clearRuntimeDerivedKeys();
    }
  });

  test("18. Login Page Menu Items: modals (Compare, Weights, Shortcuts) and navigation buttons all function on /login", () => {
    store.userStore.logout();
    store.ratingStore.catalog = [...MOCK_BACKEND_CATALOG];
    store.ratingStore.setCompareModalOpen(false);
    store.ratingStore.setWeightsModalOpen(false);
    store.ratingStore.setShortcutsModalOpen(false);

    const { unmount } = render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/" element={<App />}>
            <Route path="" element={<LandingPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    // On /login initially
    expect(screen.getByText(/Sign In to Comic Traffic/i)).toBeInTheDocument();

    // Open Menu and click Compare Arena -> CompareModal opens right on /login
    fireEvent.click(screen.getByLabelText(/Toggle tools, search, and account menu/i));
    fireEvent.click(screen.getByText(/Compare Arena/i));
    expect(
      screen.getByText(/Head-to-Head Cumulative Rating Arena/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Close compare arena/i));

    // Open Menu and click Source Weights -> CustomWeightsModal opens right on /login
    fireEvent.click(screen.getByLabelText(/Toggle tools, search, and account menu/i));
    fireEvent.click(screen.getByRole("button", { name: /Source Weights/i }));
    expect(
      screen.getByText(/Custom Cumulative Rating Source Weights/i)
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(store.ratingStore.weightsModalOpen).toBe(false);

    // Open Menu and click Shortcuts -> KeyboardShortcutsModal opens right on /login
    fireEvent.click(screen.getByLabelText(/Toggle tools, search, and account menu/i));
    fireEvent.click(screen.getByText(/Shortcuts/i));
    expect(
      screen.getByText(/Comic Traffic Keyboard Shortcuts/i)
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(store.ratingStore.shortcutsModalOpen).toBe(false);

    // Open Menu and click Create Account -> navigates to /register
    fireEvent.click(screen.getByLabelText(/Toggle tools, search, and account menu/i));
    fireEvent.click(screen.getByRole("button", { name: /^Create Account$/i }));
    expect(
      screen.getByText(/Create Your Comic Traffic Account/i)
    ).toBeInTheDocument();

    // Click top-bar Comics menu item -> navigates back to "/" with ComicBook selected
    fireEvent.click(screen.getByRole("button", { name: /^Comics$/i }));
    expect(store.ratingStore.selectedCategory).toBe("ComicBook");
    expect(
      screen.getByText(/Cumulative Rating Explorer & General Search/i)
    ).toBeInTheDocument();

    unmount();
    store.ratingStore.setCategory("All");
  });

  test("19. Handshake Concurrency: simultaneous POST requests await single in-flight handshake instead of encrypting with random keys", async () => {
    clearRuntimeDerivedKeys();
    const serverAes = Buffer.alloc(32, 11).toString("base64");
    const serverHmac = Buffer.alloc(32, 12).toString("base64");

    let resolveHandshake!: (val: any) => void;
    const handshakePromise = new Promise((resolve) => {
      resolveHandshake = resolve;
    });

    const getSpy = vi.spyOn(axios, "get").mockImplementation((url) => {
      if (String(url).includes("/security/handshake")) {
        return handshakePromise as any;
      }
      return Promise.resolve({ data: { isSuccessful: true, data: [] } }) as any;
    });

    const sentEnvelopes: any[] = [];
    const postSpy = vi.spyOn(axios, "post").mockImplementation(async (_url, body) => {
      sentEnvelopes.push(body);
      return { data: { isSuccessful: true, data: [] } } as any;
    });

    try {
      // Fire 3 concurrent encrypted requests while handshake is still pending
      const p1 = encryptedBackendClient.sendEncryptedPost("/media/tmdb-row", { category: "trending" });
      const p2 = encryptedBackendClient.sendEncryptedPost("/media/tmdb-row", { category: "top_rated" });
      const p3 = encryptedBackendClient.sendEncryptedPost("/media/search-live", { query: "batman" });

      // Complete the handshake after all 3 callers have entered ensureSessionKeys()
      resolveHandshake({
        data: {
          isSuccessful: true,
          derivedAesKey: serverAes,
          derivedHmacKey: serverHmac,
        },
      });

      await Promise.all([p1, p2, p3]);

      // Only 1 handshake HTTP call should have been made
      const handshakeCalls = getSpy.mock.calls.filter(([u]) =>
        String(u).includes("/security/handshake")
      );
      expect(handshakeCalls.length).toBe(1);
      expect(sentEnvelopes.length).toBe(3);

      // Every envelope must decrypt cleanly with the server's derived AES key
      for (const env of sentEnvelopes) {
        expect(env.encrypted).toBe(true);
        const decrypted = await decryptPayload<any>(env);
        expect(decrypted).toBeTruthy();
      }
    } finally {
      getSpy.mockRestore();
      postSpy.mockRestore();
      clearRuntimeDerivedKeys();
    }
  });

  test("20. Reconciling live search results syncs matching catalog items so details, rows, compare, and search share the exact same rating breakdown", () => {
    const testStore = new RatingStore();
    const catalogAvatar = testStore.catalog.find(
      (c) => c.externalId === "tv-avatar-last-airbender-2005"
    );
    expect(catalogAvatar).toBeDefined();

    const liveSources: ExternalRatingSource[] = [
      { sourceId: "tmdb", sourceName: "TMDB", category: "Audience", rawScoreDisplay: "8.8 / 10", normalizedScore: 88, voteCount: 5238, defaultWeight: 1.0, accentColor: "#01b4e4" },
      { sourceId: "tvmaze", sourceName: "TVMaze API", category: "Audience", rawScoreDisplay: "8.8 / 10", normalizedScore: 88, voteCount: 0, defaultWeight: 0.95, accentColor: "#3c948b" },
      { sourceId: "imdb", sourceName: "IMDb (OMDb)", category: "Audience", rawScoreDisplay: "9.3 / 10", normalizedScore: 93, voteCount: 457457, defaultWeight: 1.25, accentColor: "#f5c518" },
      { sourceId: "trakt", sourceName: "Trakt.tv", category: "Audience", rawScoreDisplay: "91%", normalizedScore: 91, voteCount: 54000, defaultWeight: 0.95, accentColor: "#ed1c24" },
      { sourceId: "rotten_tomatoes_critics", sourceName: "Rotten Tomatoes (Critics)", category: "Critic", rawScoreDisplay: "100%", normalizedScore: 100, voteCount: 68, defaultWeight: 1.2, accentColor: "#fa320a" },
      { sourceId: "rotten_tomatoes_audience", sourceName: "Rotten Tomatoes (Audience)", category: "Audience", rawScoreDisplay: "98%", normalizedScore: 98, voteCount: 42500, defaultWeight: 1.1, accentColor: "#ff6b35" },
    ];
    const liveAvatar: AggregatedMediaItem = {
      ...catalogAvatar!,
      id: "tmdb-tvseries-246",
      externalId: "tmdb-tvseries-246",
      cumulativeRating: calculateCumulativeRating(liveSources),
    };

    testStore.openDetailModal(catalogAvatar!);
    testStore.reconcileCatalogWithLiveItems([liveAvatar]);

    const syncedCatalog = testStore.catalog.find(
      (c) => c.externalId === "tv-avatar-last-airbender-2005"
    )!;
    expect(syncedCatalog.cumulativeRating.finalCumulativeAverage).toBe(
      liveAvatar.cumulativeRating.finalCumulativeAverage
    );
    expect(syncedCatalog.cumulativeRating.sources.map((s) => s.sourceId)).toEqual(
      liveAvatar.cumulativeRating.sources.map((s) => s.sourceId)
    );
    expect(testStore.activeSelectedItem?.cumulativeRating.finalCumulativeAverage).toBe(
      liveAvatar.cumulativeRating.finalCumulativeAverage
    );
  });

  test("21. Non-Commercial Legal Compliance: legal pages, TMDB/TVMaze attributions, Pinterest avatar rewrite, age/terms gate, and review report/delete", async () => {
    // 1. Legacy Pinterest avatar URL is automatically rewritten to self-hosted avatar
    expect(
      sanitizeImageUrl("https://i.pinimg.com/originals/95/8e/e6/958ee665c32ab3bbc9b3365f05c49c85.png")
    ).toBe("/default-avatar.svg");

    // 2. Legal pages render mandatory TMDB notice, TVMaze CC BY-SA 4.0, Privacy & DMCA sections
    const { unmount: unmountLegal } = render(
      <MemoryRouter initialEntries={["/legal/attributions"]}>
        <Routes>
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="/legal/attributions" element={<AttributionsDmcaPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(
      screen.getByText(/This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB\./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/CC BY-SA 4\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/DMCA Takedown Procedure/i)).toBeInTheDocument();
    unmountLegal();

    // 3. Registration enforces age 13+/16+ & Terms/Privacy checkbox
    const { container, unmount: unmountReg } = render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText(/Username/i), { target: { value: "legal_tester" } });
    fireEvent.change(screen.getByLabelText(/Display Name/i), { target: { value: "Legal Tester" } });
    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "legal@comictraffic.io" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "ValidPass123!" } });
    fireEvent.submit(container.querySelector("form.ct-auth-form") as HTMLFormElement);
    expect(
      screen.getByText(/confirm you meet the minimum age requirement/i)
    ).toBeInTheDocument();
    unmountReg();

    // 4. Review report & delete update local store and remove community source when last review is deleted
    const postSpy = vi
      .spyOn(encryptedBackendClient, "sendEncryptedPost")
      .mockResolvedValue({
        fromBackend: true,
        data: { isSuccessful: true },
        envelope: { encrypted: false, iv: "", payload: "", signature: "", timestamp: Date.now() },
      });
    try {
      const modStore = new RatingStore();
      const target = modStore.catalog[0];
      await modStore.submitReview({
        externalMediaId: target.externalId,
        mediaTitle: target.title,
        mediaType: target.mediaType,
        score: 90,
        headline: "Great read",
        reviewText: "Fantastic pacing throughout.",
        containsSpoilers: false,
        username: "legal_tester",
      });
      const addedId = modStore.reviews[0].id;
      await modStore.reportReview({
        reviewId: addedId,
        externalMediaId: target.externalId,
        reason: "Spoilers",
        details: "Unmarked ending spoiler",
      });
      expect(modStore.reportedReviewIds).toContain(addedId);

      await modStore.deleteReview(addedId);
      expect(modStore.reviews.find((r) => r.id === addedId)).toBeUndefined();
    } finally {
      postSpy.mockRestore();
    }
  });
});
