import React, { useState, useEffect } from "react";
import "./Banner.css";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../app/stores/store";
import { AggregatedMediaItem } from "../../app/api/ratingApis";
import { sanitizeImageUrl } from "../../app/security/inputSanitizer";

const Banner = () => {
  const { ratingStore, userStore } = useStore();
  const navigate = useNavigate();
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [searchInput, setSearchInput] = useState("");

  const featuredItems = ratingStore.catalog.slice(0, 6);
  const featured: AggregatedMediaItem =
    featuredItems[featuredIndex % Math.max(1, featuredItems.length)] ||
    ratingStore.catalog[0];

  useEffect(() => {
    const timer = setInterval(() => {
      setFeaturedIndex(
        (prev) => (prev + 1) % Math.max(1, featuredItems.length)
      );
    }, 8500);
    return () => clearInterval(timer);
  }, [featuredItems.length]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    ratingStore.setCategory("All");
    ratingStore.setSearchQuery(searchInput);
    if (searchInput.trim().length >= 2) {
      await ratingStore.executeLiveMultiApiSearch(searchInput);
    }
    setTimeout(() => {
      const catalogEl = document.getElementById("ct-catalog-explorer");
      if (catalogEl) {
        catalogEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 60);
  };

  if (!featured) return null;

  const { cumulativeRating } = featured;
  const avg = cumulativeRating.finalCumulativeAverage;
  const ringOffset = 283 - (Math.min(100, Math.max(0, avg)) / 100) * 283;

  return (
    <header
      className="banner"
      style={{
        backgroundSize: "cover",
        backgroundImage: `linear-gradient(95deg, rgba(6,9,17,0.97) 0%, rgba(11,17,30,0.82) 52%, rgba(6,9,17,0.55) 100%), url('${sanitizeImageUrl(
          featured.backdropUrl || featured.posterUrl
        )}')`,
        backgroundPosition: "center center",
      }}
    >
      <div className="banner__ambient_glow" />

      <div className="banner__contents">
        <div className="adx-hero-grid">
          {/* Left Spotlight Column */}
          <div className="ct-banner-inner">
            <div className="ct-banner-badges">
              <span className="adx-spotlight-rank">
                🔥 SPOTLIGHT #{featuredIndex + 1}
              </span>
              <span className="ct-banner-tag-featured">
                ⚡ COMIC TRAFFIC CUMULATIVE INDEX
              </span>
              <span className="ct-banner-tag-type">
                {featured.mediaType === "ComicBook"
                  ? "📚 Comic Book / Graphic Novel"
                  : featured.mediaType === "TvSeries"
                  ? "📺 TV Series"
                  : "🎬 Movie"}
              </span>
              <span className="ct-banner-tag-tier">
                ★ {cumulativeRating.consensusTier}
              </span>
            </div>

            <h1
              data-uia="nmhp-card-hero-text-title"
              className="ct-banner-main-title"
            >
              {featured.title}{" "}
              <span className="adx-hero-year">({featured.releaseYear})</span>
            </h1>

            <div className="adx-hero-meta-strip">
              <span className="adx-meta-chip adx-chip-hd">HD • 4K</span>
              <span className="adx-meta-chip">{featured.ageRating}</span>
              <span className="adx-meta-chip">
                {featured.runtimeOrIssueCount}
              </span>
              <span className="adx-meta-chip">{featured.publisherOrStudio}</span>
              {featured.genres.slice(0, 3).map((g) => (
                <span key={g} className="adx-meta-genre">
                  {g}
                </span>
              ))}
            </div>

            <p className="ct-banner-subtitle">{featured.overview}</p>

            {/* Final Cumulative Average & Multi-Source Highlights */}
            <div className="ct-banner-rating-ribbon">
              <div className="ct-banner-final-score-box">
                <div className="ct-banner-final-num">
                  {cumulativeRating.finalCumulativeAverage.toFixed(1)}%
                </div>
                <div className="ct-banner-final-meta">
                  <strong>FINAL CUMULATIVE AVERAGE</strong>
                  <span>
                    {cumulativeRating.finalStarScoreOutOfTen.toFixed(2)}/10 •{" "}
                    {cumulativeRating.activeSourceCount} Rating APIs •{" "}
                    {cumulativeRating.totalAggregatedVotes.toLocaleString()}{" "}
                    Votes
                  </span>
                </div>
              </div>

              <div className="ct-banner-source-pills">
                {cumulativeRating.sources.slice(0, 5).map((src) => (
                  <div
                    key={src.sourceId}
                    className="ct-banner-source-pill"
                    style={{ borderLeft: `3px solid ${src.accentColor}` }}
                  >
                    <small>{src.sourceName}</small>
                    <strong>{src.rawScoreDisplay}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="ct-banner-action-row">
              <button
                type="button"
                className="ct-primary-cta-btn adx-glow-cta"
                onClick={() => ratingStore.openDetailModal(featured)}
              >
                ▶ Explore Multi-API Hub & Reviews
              </button>
              <button
                type="button"
                className="ct-secondary-cta-btn"
                onClick={() => {
                  if (!userStore.isLoggedIn) {
                    navigate("/login");
                    return;
                  }
                  ratingStore.upsertWatchlistItem(featured, "PlanToWatch");
                }}
              >
                + Sync to Watchlist / Reading List
              </button>
              <button
                type="button"
                className="ct-secondary-cta-btn"
                onClick={() => {
                  if (
                    !ratingStore.comparisonIds.includes(featured.externalId)
                  ) {
                    ratingStore.toggleComparisonItem(featured.externalId);
                  }
                  ratingStore.setCompareModalOpen(true);
                }}
              >
                ⚔️ Compare in Arena
              </button>
            </div>

            {/* Search Bar across Movies, TV Series, and Comic Books */}
            <form onSubmit={handleSearch} className="ct-hero-search-form">
              <input
                type="text"
                placeholder="Quick Search: The Flash, Watchmen, Batman, Spider-Verse, Invincible..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  ratingStore.setSearchQuery(e.target.value);
                }}
                className="ct-hero-search-input"
              />
              <button type="submit" className="ct-hero-search-btn">
                {ratingStore.isSearchingLiveApis
                  ? "Aggregating APIs..."
                  : "Search All APIs"}
              </button>
            </form>
          </div>

          {/* Right AnimeDex Spotlight Poster + SVG Cumulative Ring Card */}
          <div className="adx-hero-poster-showcase">
            <div
              className="adx-poster-glass-frame"
              onClick={() => ratingStore.openDetailModal(featured)}
            >
              <img
                src={sanitizeImageUrl(featured.posterUrl)}
                alt={featured.title}
                className="adx-hero-poster-img"
              />
              <div className="adx-poster-ring-badge">
                <svg viewBox="0 0 100 100" className="adx-svg-ring">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    className="adx-svg-ring-bg"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    className="adx-svg-ring-progress"
                    style={{ strokeDashoffset: ringOffset }}
                  />
                </svg>
                <div className="adx-ring-center-text">
                  <strong>{avg.toFixed(1)}%</strong>
                  <small>INDEX</small>
                </div>
              </div>
            </div>

            {/* Spotlight Carousel Indicator Dots */}
            <div className="adx-spotlight-dots">
              {featuredItems.map((it, idx) => (
                <button
                  key={it.externalId}
                  type="button"
                  aria-label={`Spotlight ${idx + 1}: ${it.title}`}
                  className={`adx-spotlight-dot ${
                    idx === featuredIndex % featuredItems.length ? "active" : ""
                  }`}
                  onClick={() => setFeaturedIndex(idx)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="banner--fadeBottom" />
    </header>
  );
};

export default observer(Banner);
