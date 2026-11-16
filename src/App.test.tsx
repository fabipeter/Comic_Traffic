import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  AggregatedMediaItem,
  calculateCumulativeRating,
  ExternalRatingSource,
} from "./app/api/ratingApis";
import { encryptPayload, decryptPayload } from "./app/security/payloadCrypto";
import {
  sanitizeUserText,
  sanitizeImageUrl,
  sanitizeReturnToPath,
} from "./app/security/inputSanitizer";
import RatingStore from "./app/stores/ratingStore";
import { store } from "./app/stores/store";
import LandingPage from "./features/home/LandingPage";
import IndexProfilePage from "./features/dashboard/profile/IndexProfilePage";
import LoginPage from "./features/authentication/login/LoginPage";

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
        sourceId: "comicvine",
        sourceName: "ComicVine",
        category: "ComicCommunity",
        rawScoreDisplay: "4.9/5",
        normalizedScore: 98,
        voteCount: 34000,
        defaultWeight: 1.3,
        accentColor: "#e62429",
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
        sourceId: "comicvine",
        sourceName: "ComicVine",
        category: "ComicCommunity",
        rawScoreDisplay: "4.8 / 5",
        normalizedScore: 96,
        voteCount: 18000,
        defaultWeight: 1.25,
        accentColor: "#e62429",
      },
    ];

    const summary = calculateCumulativeRating(sampleSources);

    expect(summary.activeSourceCount).toBe(4);
    expect(summary.totalAggregatedVotes).toBe(468375);
    expect(summary.criticConsensusScore).toBe(92);
    expect(summary.audienceConsensusScore).toBe(90);
    expect(summary.comicCommunityScore).toBe(96);
    expect(summary.finalCumulativeAverage).toBeGreaterThanOrEqual(89);
    expect(summary.finalCumulativeAverage).toBeLessThanOrEqual(95);
    expect(summary.consensusTier).toBe("Universal Acclaim");
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

  test("3. AES-256-GCM payload encryption & decryption round-trip preserves CQRS command data", async () => {
    const originalCommand = {
      externalMediaId: "comic-watchmen-1986",
      score: 98,
      headline: "Masterpiece of sequential art",
    };

    const envelope = await encryptPayload(originalCommand);
    expect(envelope.encrypted).toBe(true);
    expect(envelope.algorithm).toBe("AES-256-GCM");
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
  });
});
