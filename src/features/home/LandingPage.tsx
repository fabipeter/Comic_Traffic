import { observer } from "mobx-react-lite";
import React from "react";
import { useStore } from "../../app/stores/store";
import Nav from "./Nav";
import Banner from "./Banner";
import Row from "./Row";
import tmdbagent from "../../app/api/tmdbagent";
import {
  CumulativeDetailModal,
  CompareModal,
  CustomWeightsModal,
  CompareThreeSlotPicker,
  KeyboardShortcutsModal,
  CommunityBottomDrawer,
  getScoreColor,
} from "./CumulativeModals";
import {
  MediaCategoryType,
  RATING_SOURCE_DEFINITIONS,
} from "../../app/api/ratingApis";
import { ExplorerViewMode } from "../../app/stores/ratingStore";

const LandingPage = () => {
  const { ratingStore } = useStore();
  const filtered = ratingStore.filteredCatalog;

  const comicItems = ratingStore.catalog.filter(
    (c) => c.mediaType === "ComicBook"
  );
  const movieItems = ratingStore.catalog.filter((c) => c.mediaType === "Movie");
  const tvItems = ratingStore.catalog.filter((c) => c.mediaType === "TvSeries");

  const handleExplorerSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ratingStore.searchQuery.trim().length >= 2) {
      await ratingStore.executeLiveMultiApiSearch(ratingStore.searchQuery);
    }
  };

  return (
    <div className="homeScreen">
      <Nav />
      <Banner />

      {/* Connected Rating APIs Strip */}
      <section className="ct-api-sources-strip">
        <div className="ct-api-strip-header">
          <span>
            ⚡ COMIC TRAFFIC TELEMETRY • AGGREGATING 12 RATING APIS & INDICES IN REAL TIME
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
                <span>DESCEND INTO THE ABYSS</span>
                <span className="adx-eyebrow-sep">•</span>
                <span>MULTI-SOURCE CONSENSUS ENGINE</span>
              </div>
              <h2>🏆 Cumulative Rating Explorer & General Search</h2>
              <p>
                Every Movie, TV Series, and Comic Book ranked by its unified{" "}
                <strong>Final Cumulative Average</strong> (Bayesian + Multi-API
                Weighted Consensus).
              </p>
            </div>

            <div className="adx-toolbar-right-cluster">
              {/* Category Quick Tabs */}
              <div className="ct-category-pill-bar">
                {(["All", "ComicBook", "Movie", "TvSeries"] as const).map(
                  (cat) => (
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
                        ? "All Media"
                        : cat === "ComicBook"
                        ? "📚 Comics"
                        : cat === "Movie"
                        ? "🎬 Movies"
                        : "📺 TV Series"}
                    </button>
                  )
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
              placeholder="General Search: Type any movie, TV series, comic book, creator (e.g., Alan Moore, Watchmen, Spider-Verse, Invincible)..."
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
              {ratingStore.isSearchingLiveApis
                ? "Searching APIs..."
                : "🔍 Search Catalog & Live APIs"}
            </button>
          </form>

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

        {/* Explorer Responsive Grid / List / Rich Thumbnail View */}
        <div
          className={`ct-explorer-grid adx-view-${ratingStore.explorerViewMode}`}
        >
          {filtered.slice(0, 24).map((item, idx) => {
            const { cumulativeRating } = item;
            const avg = cumulativeRating.finalCumulativeAverage;
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
                      ? "📚 Comic Book"
                      : item.mediaType === "TvSeries"
                      ? "📺 TV Series"
                      : "🎬 Movie"}
                  </div>
                  <div className="ct-card-cumulative-Orb">
                    <span className="ct-orb-score">{avg.toFixed(1)}%</span>
                    <small className="ct-orb-sub">CUMULATIVE</small>
                  </div>
                </div>

                <div className="ct-media-card-body">
                  <div className="ct-card-meta-top">
                    <span>
                      {item.releaseYear} • {item.publisherOrStudio}
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
                        {cumulativeRating.criticConsensusScore.toFixed(0)}%
                      </strong>
                    </div>
                    <div>
                      <small>Audience</small>
                      <strong>
                        {cumulativeRating.audienceConsensusScore.toFixed(0)}%
                      </strong>
                    </div>
                    <div>
                      <small>Comic DB</small>
                      <strong>
                        {cumulativeRating.comicCommunityScore.toFixed(0)}%
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
                      {item.cumulativeRating.finalCumulativeAverage.toFixed(1)}%
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

      {/* Curated Category Rows */}
      <Row
        title="📚 Acclaimed Comic Books & Graphic Novels (ComicVine, LOCG, Goodreads, CBR)"
        items={comicItems}
        isLargeRow
      />
      <Row
        title="🎬 Top Cumulative Rated Comic & Sci-Fi Movies"
        items={movieItems}
        isLargeRow
      />
      <Row
        title="📺 Highest Rated Comic & Sci-Fi TV Series (IMDb, RT, TVMaze, Trakt)"
        items={tvItems}
        isLargeRow
      />
      <Row
        title="🔥 Trending Across Global APIs Now"
        fetchUrl={tmdbagent.requests.fetchTrending}
        isLargeRow
      />
      <Row
        title="🌟 All-Time Top Rated Cinema"
        fetchUrl={tmdbagent.requests.fetchTopRated}
        categoryFilter="Movie"
      />
      <Row
        title="📺 Streaming Originals & Series"
        fetchUrl={tmdbagent.requests.fetchNetflixOriginals}
        categoryFilter="TvSeries"
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

      {/* Interactive Modals & Community Bottom Drawer */}
      <CumulativeDetailModal />
      <CompareModal />
      <CustomWeightsModal />
      <KeyboardShortcutsModal />
      <CommunityBottomDrawer />
    </div>
  );
};

export default observer(LandingPage);
