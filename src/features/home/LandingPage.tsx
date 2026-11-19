import { observer } from "mobx-react-lite";
import React, { useState, useEffect } from "react";
import { useStore } from "../../app/stores/store";
import Nav from "./Nav";
import Banner from "./Banner";
import Row from "./Row";
import {
  CompareThreeSlotPicker,
  CommunityBottomDrawer,
  getScoreColor,
} from "./CumulativeModals";
import {
  MediaCategoryType,
  RATING_SOURCE_DEFINITIONS,
  formatCumulativeScore,
} from "../../app/api/ratingApis";
import {
  ExplorerViewMode,
} from "../../app/stores/ratingStore";

const LandingPage = () => {
  const { ratingStore } = useStore();
  const filtered = ratingStore.filteredCatalog;
  const [visibleCount, setVisibleCount] = useState(48);

  useEffect(() => {
    setVisibleCount(48);
  }, [
    ratingStore.searchQuery,
    ratingStore.selectedCategory,
    ratingStore.selectedGenre,
  ]);

  const isSearching = ratingStore.searchQuery.trim().length > 0;
  const isSearchLoading =
    isSearching &&
    ratingStore.isSearchInProgress &&
    ratingStore.activeLiveResults === null;
  const allMatchingSearch = isSearching ? ratingStore.activeSearchMatches : [];
  const totalSearchMatches = allMatchingSearch.length;
  const comicMatchesCount = allMatchingSearch.filter(
    (i) => i.mediaType === "ComicBook"
  ).length;
  const movieMatchesCount = allMatchingSearch.filter(
    (i) => i.mediaType === "Movie"
  ).length;
  const tvMatchesCount = allMatchingSearch.filter(
    (i) => i.mediaType === "TvSeries"
  ).length;

  const movieItems = [...ratingStore.catalog]
    .filter((c) => c.mediaType === "Movie")
    .sort(
      (a, b) =>
        b.cumulativeRating.finalCumulativeAverage -
        a.cumulativeRating.finalCumulativeAverage
    );

  const comicItems = [...ratingStore.catalog]
    .filter((c) => c.mediaType === "ComicBook")
    .sort(
      (a, b) =>
        b.cumulativeRating.finalCumulativeAverage -
        a.cumulativeRating.finalCumulativeAverage
    );

  const tvItems = [...ratingStore.catalog]
    .filter((c) => c.mediaType === "TvSeries")
    .sort(
      (a, b) =>
        b.cumulativeRating.finalCumulativeAverage -
        a.cumulativeRating.finalCumulativeAverage
    );

  const hallOfFameItems = [...ratingStore.catalog]
    .filter((c) => c.cumulativeRating.finalCumulativeAverage >= 90)
    .sort(
      (a, b) =>
        b.cumulativeRating.finalCumulativeAverage -
        a.cumulativeRating.finalCumulativeAverage
    );

  const trendingItems = [...ratingStore.catalog].sort(
    (a, b) =>
      b.cumulativeRating.totalAggregatedVotes -
      a.cumulativeRating.totalAggregatedVotes
  );

  const audienceFavorites = [...ratingStore.catalog].sort(
    (a, b) =>
      b.cumulativeRating.audienceConsensusScore -
      a.cumulativeRating.audienceConsensusScore
  );

  const handleExplorerSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ratingStore.searchQuery.trim().length >= 2) {
      await ratingStore.executeLiveMultiApiSearch(
        ratingStore.searchQuery,
        true,
        true
      );
    }
  };

  return (
    <div
      className={`homeScreen ${
        ratingStore.communityDrawerOpen ? "drawer-open" : ""
      }`}
    >
      <Nav />
      <Banner />

      {/* Connected Rating APIs Strip */}
      <section className="ct-api-sources-strip">
        <div className="ct-api-strip-header">
          <span>
            ⚡ COMIC TRAFFIC TELEMETRY • AGGREGATING {RATING_SOURCE_DEFINITIONS.length} RATING APIS &amp; INDICES IN REAL TIME
          </span>
          <span className="ct-security-pill">
            ✓ Real-Time Multi-Source Consensus Verified
          </span>
        </div>
        <div className="ct-api-badges-scroll">
          {RATING_SOURCE_DEFINITIONS.map((def) => (
            <div
              key={def.sourceId}
              className="ct-api-badge-item"
              style={{ borderColor: def.color }}
            >
              <span
                className="ct-api-dot"
                style={{ backgroundColor: def.color }}
              />
              <strong>{def.name}</strong>
              <small>
                {(
                  ratingStore.customWeights[def.sourceId] ?? def.defaultWeight
                ).toFixed(2)}
                x
              </small>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Cumulative Rating Catalog Explorer with General Search */}
      <section id="ct-catalog-explorer" className="ct-explorer-section">
        <div className="ct-explorer-toolbar">
          <div className="ct-explorer-top-row">
            <div className="ct-explorer-title-group">
              <div className="adx-section-eyebrow">
                <span>{isSearching ? "LIVE SEARCH CONSENSUS" : "DESCEND INTO THE ABYSS"}</span>
                <span className="adx-eyebrow-sep">•</span>
                <span>MULTI-SOURCE CONSENSUS ENGINE</span>
              </div>
              <h2>
                {isSearchLoading
                  ? "⏳ Searching Live APIs..."
                  : isSearching
                  ? `🔍 Search Results (${filtered.length})`
                  : "🏆 Cumulative Rating Explorer & General Search"}
              </h2>
              <p>
                {isSearchLoading ? (
                  <>
                    Querying live cinema, TV, comic, manga &amp; literature APIs
                    for &ldquo;<strong>{ratingStore.searchQuery.trim()}</strong>
                    &rdquo;&hellip;
                  </>
                ) : isSearching ? (
                  <>
                    Showing titles matching &ldquo;
                    <strong>{ratingStore.searchQuery}</strong>
                    &rdquo; &bull;{" "}
                    <strong>{totalSearchMatches}</strong>{" "}
                    {totalSearchMatches === 1 ? "match" : "matches"} found across
                    all media categories.
                  </>
                ) : (
                  <>
                    Every Movie, TV Series, Comic Book, Graphic Novel, and Book ranked by its unified{" "}
                    <strong>Final Cumulative Average</strong> (Bayesian +
                    Multi-API Weighted Consensus).
                  </>
                )}
              </p>
            </div>

            <div className="adx-toolbar-right-cluster">
              {/* Category Quick Tabs */}
              <div className="ct-category-pill-bar">
                {(["All", "ComicBook", "Movie", "TvSeries"] as const).map(
                  (cat) => {
                    const countLabel = isSearching
                      ? cat === "All"
                        ? ` (${totalSearchMatches})`
                        : cat === "ComicBook"
                        ? ` (${comicMatchesCount})`
                        : cat === "Movie"
                        ? ` (${movieMatchesCount})`
                        : ` (${tvMatchesCount})`
                      : "";
                    return (
                      <button
                        key={cat}
                        type="button"
                        className={`ct-cat-filter-pill ${
                          ratingStore.selectedCategory === cat ? "active" : ""
                        }`}
                        onClick={() =>
                          ratingStore.setCategory(
                            cat as "All" | MediaCategoryType
                          )
                        }
                      >
                        {cat === "All"
                          ? `All Media${countLabel}`
                          : cat === "ComicBook"
                          ? `📚 Comics & Books${countLabel}`
                          : cat === "Movie"
                          ? `🎬 Movies${countLabel}`
                          : `📺 TV Series${countLabel}`}
                      </button>
                    );
                  }
                )}
              </div>

              {/* AnimeDex Layout View Mode Switcher (Grid / List / Thumbnail) */}
              <div
                className="adx-view-mode-switcher"
                role="group"
                aria-label="Explorer layout view mode"
              >
                {(
                  [
                    { id: "grid", label: "⊞ Grid" },
                    { id: "list", label: "☰ List" },
                    { id: "thumbnail", label: "▣ Rich" },
                  ] as { id: ExplorerViewMode; label: string }[]
                ).map((vm) => (
                  <button
                    key={vm.id}
                    type="button"
                    className={`adx-view-btn ${
                      ratingStore.explorerViewMode === vm.id ? "active" : ""
                    }`}
                    onClick={() => ratingStore.setExplorerViewMode(vm.id)}
                  >
                    {vm.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* General Search Bar inside Explorer */}
          <form
            onSubmit={handleExplorerSearch}
            className="ct-general-search-bar"
          >
            <input
              type="text"
              className="ct-general-search-input"
              placeholder="Search any Movie, Series, Comic Book, Graphic Novel, or Literature (e.g. Watchmen, Dune, Batman, Sandman, Invincible, Lord of the Rings)..."
              aria-label="General catalog search"
              value={ratingStore.searchQuery}
              onChange={(e) => ratingStore.setSearchQuery(e.target.value)}
            />
            {ratingStore.searchQuery && (
              <button
                type="button"
                className="ct-general-search-clear"
                onClick={() => ratingStore.setSearchQuery("")}
              >
                Clear
              </button>
            )}
            <button type="submit" className="ct-primary-cta-btn">
              {ratingStore.isSearchInProgress
                ? "Searching APIs..."
                : "🔍 Search Live APIs"}
            </button>
          </form>

          {/* Active Search Status Banner */}
          {isSearching && (
            <div className="ct-search-active-banner">
              <div className="ct-search-active-info">
                <span className="ct-search-active-pill">
                  {ratingStore.isSearchInProgress
                    ? "⏳ LIVE API SEARCHING..."
                    : "🔍 SEARCH ACTIVE"}
                </span>
                <span>
                  Query: <strong>&ldquo;{ratingStore.searchQuery}&rdquo;</strong> &bull;{" "}
                  {isSearchLoading ? (
                    <span>Fetching live results across connected APIs&hellip;</span>
                  ) : (
                    <>
                      <strong>{filtered.length}</strong> matching {filtered.length === 1 ? "title" : "titles"}
                      {filtered.length > visibleCount && (
                        <> (showing top {visibleCount})</>
                      )}
                      {ratingStore.selectedCategory !== "All" && (
                        <> in {ratingStore.selectedCategory === "ComicBook" ? "Comics" : ratingStore.selectedCategory === "Movie" ? "Movies" : "TV Series"}</>
                      )}
                      {ratingStore.selectedCategory !== "All" && totalSearchMatches > filtered.length && (
                        <span className="ct-search-other-cat-hint">
                          {" "}
                          ({totalSearchMatches - filtered.length} more in other categories)
                        </span>
                      )}
                    </>
                  )}
                </span>
              </div>
              <div className="ct-search-active-btns">
                {ratingStore.selectedCategory !== "All" && (
                  <button
                    type="button"
                    className="ct-search-viewall-pill"
                    onClick={() => ratingStore.setCategory("All")}
                  >
                    View All {totalSearchMatches} Results
                  </button>
                )}
                <button
                  type="button"
                  className="ct-search-clear-pill"
                  onClick={() => {
                    ratingStore.setSearchQuery("");
                    ratingStore.setCategory("All");
                  }}
                >
                  ✕ Clear Search
                </button>
              </div>
            </div>
          )}

          <div className="ct-explorer-controls">
            <div className="ct-control-group">
              <label htmlFor="ct-genre-select">Genre</label>
              <select
                id="ct-genre-select"
                value={ratingStore.selectedGenre}
                onChange={(e) => ratingStore.setGenre(e.target.value)}
              >
                {ratingStore.availableGenres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="ct-control-group">
              <label htmlFor="ct-minscore-select">Min Cumulative Score</label>
              <select
                id="ct-minscore-select"
                value={ratingStore.minCumulativeScore}
                onChange={(e) =>
                  ratingStore.setMinCumulativeScore(Number(e.target.value))
                }
              >
                <option value={0}>All Scores (0%+)</option>
                <option value={75}>75%+ (Favorable)</option>
                <option value={85}>85%+ (Certified Must-Experience)</option>
                <option value={90}>90%+ (Universal Acclaim)</option>
              </select>
            </div>

            <div className="ct-control-group">
              <label htmlFor="ct-sort-select">Sort By</label>
              <select
                id="ct-sort-select"
                value={ratingStore.sortBy}
                onChange={(e) => ratingStore.setSortBy(e.target.value as any)}
              >
                <option value="cumulative_desc">
                  Final Cumulative Average (High → Low)
                </option>
                <option value="critic_desc">
                  Critic Consensus (High → Low)
                </option>
                <option value="audience_desc">
                  Audience Consensus (High → Low)
                </option>
                <option value="comic_desc">
                  Comic Community Score (High → Low)
                </option>
                <option value="polarizing_desc">
                  Most Polarizing (Critic vs Audience Variance)
                </option>
                <option value="votes_desc">Total Aggregated Votes</option>
                <option value="year_desc">Release Year (Newest)</option>
              </select>
            </div>

            <button
              type="button"
              className="ct-small-outline-btn"
              onClick={() => ratingStore.setWeightsModalOpen(true)}
            >
              ⚖️ Tune API Weights
            </button>
          </div>
        </div>

        {/* Explorer Responsive Grid, Loading Stasis, or No Results Message */}
        {isSearchLoading ? (
          <div
            className="ct-search-loading-stasis"
            role="status"
            aria-live="polite"
            aria-label="Searching live APIs"
          >
            <div className="ct-search-loading-header">
              <span className="ct-loading-spinner" aria-hidden="true" />
              <div>
                <h3>
                  Searching live APIs for &ldquo;{ratingStore.searchQuery.trim()}&rdquo;&hellip;
                </h3>
                <p>
                  Aggregating real ratings across TMDB, OMDb, TVMaze, iTunes, AniList,
                  MyAnimeList, ComicVine, Hardcover, Google Books, Apple Books &amp; Open Library.
                </p>
              </div>
            </div>
            <div
              className="ct-explorer-grid adx-view-grid ct-skeleton-grid"
              aria-hidden="true"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="ct-skeleton-card">
                  <div className="ct-skeleton-poster" />
                  <div className="ct-skeleton-body">
                    <div className="ct-skeleton-line ct-skeleton-line-sm" />
                    <div className="ct-skeleton-line ct-skeleton-line-lg" />
                    <div className="ct-skeleton-line ct-skeleton-line-md" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="ct-search-no-results-card">
            <div className="ct-no-results-icon">🔍</div>
            <h3>
              No matching titles found for &ldquo;{ratingStore.searchQuery}&rdquo;
            </h3>
            {ratingStore.selectedCategory !== "All" && totalSearchMatches > 0 ? (
              <div className="ct-no-results-suggestion-box">
                <p>
                  Found <strong>{totalSearchMatches}</strong> matching{" "}
                  {totalSearchMatches === 1 ? "title" : "titles"} in other categories!
                </p>
                <button
                  type="button"
                  className="ct-primary-cta-btn"
                  onClick={() => ratingStore.setCategory("All")}
                >
                  View all {totalSearchMatches} matches in All Media →
                </button>
              </div>
            ) : (
              <div className="ct-no-results-suggestion-box">
                <p>
                  We couldn&rsquo;t find any titles matching that search. Try searching for popular titles like:
                </p>
                <div className="ct-search-chip-group">
                  {[
                    "Watchmen",
                    "Dune",
                    "The Dark Knight",
                    "The Sandman",
                    "Spider-Man",
                    "Invincible",
                    "Lord of the Rings",
                    "Berserk",
                    "Saga",
                    "Alan Moore",
                    "Stephen King",
                  ].map((keyword) => (
                    <button
                      key={keyword}
                      type="button"
                      className="ct-search-sample-chip"
                      onClick={() => {
                        ratingStore.setCategory("All");
                        ratingStore.setSearchQuery(keyword);
                      }}
                    >
                      {keyword}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="ct-primary-cta-btn"
                  style={{ marginTop: "16px" }}
                  onClick={() => {
                    ratingStore.setSearchQuery("");
                    ratingStore.setCategory("All");
                  }}
                >
                  Clear Search & View All Titles (44+)
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div
              className={`ct-explorer-grid adx-view-${ratingStore.explorerViewMode}`}
            >
              {filtered.slice(0, visibleCount).map((item, idx) => {
              const { cumulativeRating } = item;
              const isRated = cumulativeRating.activeSourceCount > 0;
              const inCompare = ratingStore.comparisonIds.includes(
                item.externalId
              );

              return (
                <article key={item.externalId} className="ct-media-card">
                  <div
                    className="ct-media-card-banner"
                    onClick={() => ratingStore.openDetailModal(item)}
                  >
                    <img
                      src={
                        ratingStore.explorerViewMode === "thumbnail"
                          ? item.backdropUrl || item.posterUrl
                          : item.posterUrl
                      }
                      alt={item.title}
                      loading="lazy"
                    />
                    <div className="adx-card-rank-pill">#{idx + 1}</div>
                    <div className="ct-card-type-chip">
                      {item.mediaType === "ComicBook"
                        ? "📚 Comic / Book"
                        : item.mediaType === "TvSeries"
                        ? "📺 TV Series"
                        : "🎬 Movie"}
                    </div>
                    <div className="ct-card-cumulative-Orb">
                      <span className="ct-orb-score">
                        {formatCumulativeScore(cumulativeRating, 1)}
                      </span>
                      <small className="ct-orb-sub">CUMULATIVE</small>
                    </div>
                  </div>

                  <div className="ct-media-card-body">
                    <div className="ct-card-meta-top">
                      <span>
                        {item.releaseYear > 0 ? item.releaseYear : "N/A"} •{" "}
                        {item.publisherOrStudio}
                      </span>
                      <span className="ct-card-tier">
                        {cumulativeRating.consensusTier}
                      </span>
                    </div>

                    <h3
                      className="ct-card-title"
                      onClick={() => ratingStore.openDetailModal(item)}
                    >
                      {item.title}
                    </h3>

                    {ratingStore.explorerViewMode !== "grid" && (
                      <p className="adx-card-synopsis">{item.overview}</p>
                    )}

                    {/* Critic / Audience / Comic Tri-Split */}
                    <div className="ct-card-trisplit">
                      <div>
                        <small>Critics</small>
                        <strong>
                          {isRated
                            ? `${cumulativeRating.criticConsensusScore.toFixed(0)}%`
                            : "—"}
                        </strong>
                      </div>
                      <div>
                        <small>Audience</small>
                        <strong>
                          {isRated
                            ? `${cumulativeRating.audienceConsensusScore.toFixed(0)}%`
                            : "—"}
                        </strong>
                      </div>
                      <div>
                        <small>Comic DB</small>
                        <strong>
                          {isRated
                            ? `${cumulativeRating.comicCommunityScore.toFixed(0)}%`
                            : "—"}
                        </strong>
                      </div>
                      <div>
                        <small>APIs</small>
                        <strong>{cumulativeRating.activeSourceCount}</strong>
                      </div>
                    </div>

                    {/* Individual Rating API Chips */}
                    <div className="ct-card-source-chips">
                      {cumulativeRating.sources.slice(0, 4).map((src) => (
                        <span
                          key={src.sourceId}
                          className="ct-mini-api-pill"
                          style={{ borderLeft: `3px solid ${src.accentColor}` }}
                        >
                          <b>{src.sourceName.split(" ")[0]}:</b>{" "}
                          {src.rawScoreDisplay}
                        </span>
                      ))}
                    </div>

                    <div className="ct-card-actions">
                      <button
                        type="button"
                        className="ct-card-btn-primary"
                        onClick={() => ratingStore.openDetailModal(item)}
                      >
                        All {cumulativeRating.activeSourceCount} APIs & Reviews
                      </button>
                      <button
                        type="button"
                        className={`ct-card-btn-compare ${
                          inCompare ? "selected" : ""
                        }`}
                        onClick={() =>
                          ratingStore.toggleComparisonItem(item.externalId)
                        }
                        title="Add to Head-to-Head Comparison"
                      >
                        {inCompare ? "✓ Comparing" : "⚔️ Compare"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
            </div>
            {filtered.length > visibleCount && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                  marginTop: "24px",
                }}
              >
                <button
                  type="button"
                  className="ct-secondary-cta-btn"
                  onClick={() => setVisibleCount((prev) => prev + 48)}
                >
                  Show More Results (+
                  {Math.min(48, filtered.length - visibleCount)})
                </button>
                <button
                  type="button"
                  className="ct-primary-cta-btn"
                  onClick={() => setVisibleCount(filtered.length)}
                >
                  Show All {filtered.length} Matching Titles
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Dedicated Inline Compare Section with Maximum of 3 Search & Pick Inputs */}
      <section id="ct-compare-section" className="ct-inline-compare-section">
        <div className="ct-inline-compare-card">
          <div className="ct-section-header-flex">
            <div>
              <div className="adx-section-eyebrow">
                <span>HEAD-TO-HEAD VERSUS ARENA</span>
              </div>
              <h2>
                ⚔️ Compare Cumulative Ratings (Search & Pick Up to 3 Titles)
              </h2>
              <p className="ct-muted-text">
                Use the 3 search inputs below to find and pick any Comic Book,
                Movie, or TV Series and compare their Final Cumulative Averages
                side-by-side.
              </p>
            </div>
            <button
              type="button"
              className="ct-primary-cta-btn"
              onClick={() => ratingStore.setCompareModalOpen(true)}
            >
              🔍 Expand Full Compare Arena ({ratingStore.comparisonItems.length}
              /3)
            </button>
          </div>

          {/* The 3 Search & Pick Inputs */}
          <CompareThreeSlotPicker />

          {/* Quick Side-by-Side Summary Cards */}
          {ratingStore.comparisonItems.length > 0 && (
            <div className="ct-compare-grid">
              {ratingStore.comparisonItems.map((item) => (
                <div key={item.externalId} className="ct-compare-column">
                  <div className="ct-compare-col-head">
                    <div>
                      <h4>{item.title}</h4>
                      <span className="ct-meta-pill">
                        {item.mediaType} • {item.releaseYear}
                      </span>
                    </div>
                    <strong
                      className="ct-compare-inline-score"
                      style={{
                        color: getScoreColor(
                          item.cumulativeRating.finalCumulativeAverage
                        ),
                      }}
                    >
                      {formatCumulativeScore(item.cumulativeRating, 1)}
                    </strong>
                  </div>
                  <div className="ct-compare-metrics-list">
                    <div>
                      <span>Critic Consensus:</span>
                      <strong>
                        {item.cumulativeRating.criticConsensusScore.toFixed(1)}%
                      </strong>
                    </div>
                    <div>
                      <span>Audience Consensus:</span>
                      <strong>
                        {item.cumulativeRating.audienceConsensusScore.toFixed(
                          1
                        )}
                        %
                      </strong>
                    </div>
                    <div>
                      <span>Comic Community:</span>
                      <strong>
                        {item.cumulativeRating.comicCommunityScore.toFixed(1)}%
                      </strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Curated Category Rows (Always visible beneath search results & Compare Arena) */}
      <Row
        title="🌟 All-Time Top Rated Cinema & Blockbusters"
        items={movieItems}
        isLargeRow
      />
      <Row
        title="📚 Acclaimed Comic Books & Graphic Novels"
        items={comicItems}
        isLargeRow
      />
      <Row
        title="📺 Highest Rated TV Series & Streaming Originals"
        items={tvItems}
        isLargeRow
      />
      <Row
        title="👑 Masterpiece Hall of Fame (Score 90%+)"
        items={hallOfFameItems}
      />
      <Row
        title="🔥 Trending Across Global APIs (Highest Vote Consensus)"
        items={trendingItems}
      />
      <Row
        title="⚡ Audience Favorites & Cult Acclaim"
        items={audienceFavorites}
      />

      {/* Comic Traffic Footer */}
      <footer className="adx-footer">
        <div className="adx-footer-inner">
          <div className="adx-footer-brand">
            <strong>
              COMIC<span>TRAFFIC</span>
            </strong>
            <p>
              Unified Multi-API Rating Consensus • Powered by 12 Live Rating
              Indices across Comic Books, Movies, and TV Series.
            </p>
          </div>
          <div className="adx-footer-links">
            <button
              type="button"
              onClick={() => ratingStore.setShortcutsModalOpen(true)}
            >
              ⌨️ Shortcuts (?)
            </button>
            <button
              type="button"
              onClick={() => ratingStore.toggleLiteMode()}
            >
              ⚡ {ratingStore.liteMode ? "Disable Lite Mode" : "Enable Lite Mode"}
            </button>
            <button
              type="button"
              onClick={() => ratingStore.setWeightsModalOpen(true)}
            >
              ⚖️ Source Weights
            </button>
            <button
              type="button"
              onClick={() => ratingStore.setCompareModalOpen(true)}
            >
              ⚔️ Compare Arena
            </button>
          </div>
        </div>
      </footer>

      {/* Community Bottom Drawer (Global modals are mounted in App.tsx) */}
      <CommunityBottomDrawer />
    </div>
  );
};

export default observer(LandingPage);
