import React, { useState, useRef, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../app/stores/store";
import {
  AggregatedMediaItem,
  RATING_SOURCE_DEFINITIONS,
  WatchlistEntry,
  formatCumulativeScore,
} from "../../app/api/ratingApis";
import { sanitizeImageUrl, sanitizeUserText } from "../../app/security/inputSanitizer";

export const getScoreColor = (score: number): string => {
  if (score >= 88) return "#10b981";
  if (score >= 75) return "#3b82f6";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
};

/**
 * 3-Input Search & Pick Compare Selector (Maximum of 3 slots: Slot 1, Slot 2, Slot 3)
 */
export const CompareThreeSlotPicker: React.FC = observer(() => {
  const { ratingStore } = useStore();
  const [slotQueries, setSlotQueries] = useState<[string, string, string]>([
    "",
    "",
    "",
  ]);
  const [focusedSlot, setFocusedSlot] = useState<number | null>(null);
  const [slotSearching, setSlotSearching] = useState<[boolean, boolean, boolean]>([
    false,
    false,
    false,
  ]);

  const debounceTimers = useRef<Array<ReturnType<typeof setTimeout> | null>>([
    null,
    null,
    null,
  ]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setFocusedSlot(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      debounceTimers.current.forEach((t) => {
        if (t) clearTimeout(t);
      });
    };
  }, []);

  const handleSlotQueryChange = (slotIdx: number, val: string) => {
    const clean = sanitizeUserText(val, 160, false);
    const next: [string, string, string] = [...slotQueries] as [
      string,
      string,
      string
    ];
    next[slotIdx] = clean;
    setSlotQueries(next);
    setFocusedSlot(slotIdx);

    if (debounceTimers.current[slotIdx]) {
      clearTimeout(debounceTimers.current[slotIdx]!);
      debounceTimers.current[slotIdx] = null;
    }

    const trimmed = clean.trim();
    if (trimmed.length >= 2) {
      setSlotSearching((prev) => {
        const copy = [...prev] as [boolean, boolean, boolean];
        copy[slotIdx] = true;
        return copy;
      });
      debounceTimers.current[slotIdx] = setTimeout(async () => {
        try {
          await ratingStore.executeLiveMultiApiSearch(trimmed, false);
        } finally {
          setSlotSearching((prev) => {
            const copy = [...prev] as [boolean, boolean, boolean];
            copy[slotIdx] = false;
            return copy;
          });
        }
      }, 350);
    } else {
      setSlotSearching((prev) => {
        const copy = [...prev] as [boolean, boolean, boolean];
        copy[slotIdx] = false;
        return copy;
      });
    }
  };

  const handleTriggerSlotSearch = async (slotIdx: number, force: boolean = false) => {
    if (debounceTimers.current[slotIdx]) {
      clearTimeout(debounceTimers.current[slotIdx]!);
      debounceTimers.current[slotIdx] = null;
    }
    const q = slotQueries[slotIdx].trim();
    if (q.length >= 2) {
      setSlotSearching((prev) => {
        const copy = [...prev] as [boolean, boolean, boolean];
        copy[slotIdx] = true;
        return copy;
      });
      try {
        await ratingStore.executeLiveMultiApiSearch(q, false, force);
      } finally {
        setSlotSearching((prev) => {
          const copy = [...prev] as [boolean, boolean, boolean];
          copy[slotIdx] = false;
          return copy;
        });
      }
    }
  };

  const handleClearSlotQuery = (slotIdx: number) => {
    if (debounceTimers.current[slotIdx]) {
      clearTimeout(debounceTimers.current[slotIdx]!);
      debounceTimers.current[slotIdx] = null;
    }
    const next: [string, string, string] = [...slotQueries] as [
      string,
      string,
      string
    ];
    next[slotIdx] = "";
    setSlotQueries(next);
    setSlotSearching((prev) => {
      const copy = [...prev] as [boolean, boolean, boolean];
      copy[slotIdx] = false;
      return copy;
    });
  };

  const handlePickItemForSlot = (
    slotIdx: number,
    item: AggregatedMediaItem
  ) => {
    ratingStore.setComparisonSlot(slotIdx, item.externalId);
    handleClearSlotQuery(slotIdx);
    setFocusedSlot(null);
  };

  return (
    <div className="ct-compare-3slots-wrapper" ref={containerRef}>
      <div className="ct-compare-3slots-grid">
        {[0, 1, 2].map((slotIdx) => {
          const selectedItem = ratingStore.getComparisonSlotItem(slotIdx);
          const query = slotQueries[slotIdx];
          const isSearching =
            slotSearching[slotIdx] ||
            (focusedSlot === slotIdx && ratingStore.isSearchInProgress);

          const suggestions = ratingStore
            .searchSuggestions(query, 12)
            .filter(
              (cand) =>
                !ratingStore.comparisonSlots.includes(cand.externalId) ||
                cand.externalId === selectedItem?.externalId
            );

          return (
            <div
              key={slotIdx}
              className={`ct-compare-slot-box ${
                focusedSlot === slotIdx ? "is-focused" : ""
              }`}
            >
              <div className="ct-compare-slot-header">
                <span className="ct-slot-number-badge">
                  COMPARE SLOT #{slotIdx + 1} (MAX 3)
                </span>
                {selectedItem && (
                  <button
                    type="button"
                    className="ct-slot-clear-btn"
                    onClick={() => ratingStore.setComparisonSlot(slotIdx, null)}
                  >
                    ✕ Clear Slot
                  </button>
                )}
              </div>

              {/* Search Input for this Slot */}
              <div className="ct-slot-search-field">
                <input
                  type="text"
                  aria-label={`Search and pick item for Compare Slot ${slotIdx + 1}`}
                  placeholder={
                    selectedItem
                      ? `Replace "${selectedItem.title}"...`
                      : `Search comic, movie, or series for Slot #${slotIdx + 1}...`
                  }
                  value={query}
                  onFocus={() => setFocusedSlot(slotIdx)}
                  onChange={(e) =>
                    handleSlotQueryChange(slotIdx, e.target.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleTriggerSlotSearch(slotIdx, true);
                    } else if (e.key === "Escape") {
                      setFocusedSlot(null);
                    }
                  }}
                  className="ct-slot-search-input"
                />
                <div className="ct-slot-search-actions">
                  {query.length > 0 && (
                    <button
                      type="button"
                      className="ct-slot-input-clear-btn"
                      onClick={() => handleClearSlotQuery(slotIdx)}
                      aria-label={`Clear query in Slot ${slotIdx + 1}`}
                      title="Clear search text"
                    >
                      ✕
                    </button>
                  )}
                  <button
                    type="button"
                    className="ct-slot-input-search-btn"
                    onClick={() => handleTriggerSlotSearch(slotIdx, true)}
                    aria-label={`Search live APIs for Slot ${slotIdx + 1}`}
                    title="Search live APIs"
                  >
                    🔍
                  </button>
                </div>

                {focusedSlot === slotIdx && (
                  <div className="ct-slot-dropdown">
                    <div className="ct-slot-dropdown-head">
                      <span>
                        {query.trim()
                          ? `Matching Results for "${query}"`
                          : "Suggested Titles to Pick"}
                      </span>
                      <button
                        type="button"
                        className="ct-dropdown-close-btn"
                        onClick={() => setFocusedSlot(null)}
                      >
                        Close
                      </button>
                    </div>

                    {isSearching ? (
                      <div className="ct-slot-dropdown-loading">
                        <span className="ct-loading-spinner" />
                        <span>
                          Searching live APIs for &ldquo;{query.trim()}&rdquo;&hellip;
                        </span>
                      </div>
                    ) : suggestions.length === 0 ? (
                      <div className="ct-slot-dropdown-empty">
                        <p>No matches found for &ldquo;{query}&rdquo;.</p>
                        <button
                          type="button"
                          className="ct-slot-retry-search-btn"
                          onClick={() => handleTriggerSlotSearch(slotIdx, true)}
                        >
                          🔍 Search live providers now
                        </button>
                      </div>
                    ) : (
                      suggestions.map((sug) => (
                        <button
                          key={sug.externalId}
                          type="button"
                          className="ct-slot-dropdown-option"
                          onClick={() => handlePickItemForSlot(slotIdx, sug)}
                        >
                          <img src={sanitizeImageUrl(sug.posterUrl)} alt={sug.title} />
                          <div className="ct-slot-opt-info">
                            <strong>{sug.title}</strong>
                            <small>
                              {sug.mediaType === "ComicBook"
                                ? "📚 Comic"
                                : sug.mediaType === "TvSeries"
                                ? "📺 TV Series"
                                : "🎬 Movie"}{" "}
                              • {sug.releaseYear}
                            </small>
                          </div>
                          <span
                            className="ct-slot-opt-score"
                            style={{
                              color: getScoreColor(
                                sug.cumulativeRating.finalCumulativeAverage
                              ),
                            }}
                          >
                            {formatCumulativeScore(sug.cumulativeRating, 1)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Currently Picked Item Summary */}
              {selectedItem ? (
                <div className="ct-slot-picked-card">
                  <img
                    src={sanitizeImageUrl(selectedItem.posterUrl)}
                    alt={selectedItem.title}
                    className="ct-slot-picked-thumb"
                  />
                  <div className="ct-slot-picked-meta">
                    <strong>{selectedItem.title}</strong>
                    <span>
                      {selectedItem.mediaType} • {selectedItem.releaseYear}
                    </span>
                  </div>
                  <div
                    className="ct-slot-picked-avg"
                    style={{
                      color: getScoreColor(
                        selectedItem.cumulativeRating.finalCumulativeAverage
                      ),
                    }}
                  >
                    {formatCumulativeScore(selectedItem.cumulativeRating, 1)}
                  </div>
                </div>
              ) : (
                <div className="ct-slot-empty-placeholder">
                  Use the search input above to pick a Comic, Movie, or TV Series for Slot #{slotIdx + 1}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export const CumulativeDetailModal: React.FC = observer(() => {
  const { ratingStore, userStore } = useStore();
  const navigate = useNavigate();
  const item = ratingStore.selectedItem;

  const [reviewScore, setReviewScore] = useState<number>(92);
  const [reviewHeadline, setReviewHeadline] = useState<string>("");
  const [reviewText, setReviewText] = useState<string>("");
  const [containsSpoilers, setContainsSpoilers] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [personalScoreInput, setPersonalScoreInput] = useState<string>("");

  if (!item) return null;

  const { cumulativeRating } = item;
  const existingWatchlist = ratingStore.watchlist.find(
    (w) => w.externalMediaId === item.externalId
  );
  const mediaReviews = ratingStore.reviewsForMedia(item.externalId);
  const scoreColor = getScoreColor(cumulativeRating.finalCumulativeAverage);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userStore.isLoggedIn) {
      ratingStore.closeDetailModal();
      navigate("/login");
      return;
    }
    if (!reviewHeadline.trim() || !reviewText.trim()) return;
    setSubmitting(true);
    await ratingStore.submitReview({
      externalMediaId: item.externalId,
      mediaTitle: item.title,
      mediaType: item.mediaType,
      score: reviewScore,
      headline: reviewHeadline,
      reviewText,
      containsSpoilers,
      username: userStore.profile?.username || "comicwarden",
    });
    setReviewHeadline("");
    setReviewText("");
    setContainsSpoilers(false);
    setSubmitting(false);
  };

  const handleWatchlistStatus = async (status: WatchlistEntry["status"]) => {
    if (!userStore.isLoggedIn) {
      ratingStore.closeDetailModal();
      navigate("/login");
      return;
    }
    const parsedScore = personalScoreInput
      ? Math.max(0, Math.min(100, Number(personalScoreInput)))
      : existingWatchlist?.userPersonalScore ?? null;
    await ratingStore.upsertWatchlistItem(item, status, parsedScore);
  };

  return (
    <div
      className="ct-modal-backdrop"
      onClick={() => ratingStore.closeDetailModal()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="ct-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="ct-modal-close"
          onClick={() => ratingStore.closeDetailModal()}
          aria-label="Close detail modal"
        >
          ✕
        </button>

        {/* Hero Header */}
        <div
          className="ct-detail-hero"
          style={{
            backgroundImage: `linear-gradient(to bottom, rgba(10,12,20,0.45), rgba(10,12,20,0.98)), url('${sanitizeImageUrl(
              item.backdropUrl || item.posterUrl
            )}')`,
          }}
        >
          <img
            src={sanitizeImageUrl(item.posterUrl)}
            alt={item.title}
            className="ct-detail-poster"
          />
          <div className="ct-detail-hero-info">
            <div className="ct-badge-row">
              <span
                className={`ct-type-pill ct-type-${item.mediaType.toLowerCase()}`}
              >
                {item.mediaType === "ComicBook"
                  ? "📚 Comic Book / Graphic Novel"
                  : item.mediaType === "TvSeries"
                  ? "📺 TV Series"
                  : "🎬 Feature Movie"}
              </span>
              <span className="ct-meta-pill">{item.releaseYear}</span>
              <span className="ct-meta-pill">{item.ageRating}</span>
              <span className="ct-meta-pill">{item.runtimeOrIssueCount}</span>
              <span
                className="ct-tier-pill"
                style={{ borderColor: scoreColor, color: scoreColor }}
              >
                ★ {cumulativeRating.consensusTier}
              </span>
            </div>

            <h2 className="ct-detail-title">{item.title}</h2>
            <p className="ct-detail-submeta">
              <strong>Publisher / Studio:</strong> {item.publisherOrStudio}{" "}
              &nbsp;•&nbsp; <strong>Creators:</strong> {item.creatorOrDirector}
            </p>
            <p className="ct-detail-overview">{item.overview}</p>

            <div className="ct-genre-tags">
              {item.genres.map((g) => (
                <span key={g} className="ct-genre-chip">
                  {g}
                </span>
              ))}
            </div>
          </div>

          {/* Final Cumulative Average Master Gauge */}
          <div className="ct-cumulative-master-box">
            <div
              className="ct-cumulative-circle"
              style={{
                borderColor: scoreColor,
                boxShadow: `0 0 25px ${scoreColor}44`,
              }}
            >
              <span
                className="ct-cumulative-number"
                style={{ color: scoreColor }}
              >
                {formatCumulativeScore(cumulativeRating, 1)}
              </span>
              <span className="ct-cumulative-sub">
                {cumulativeRating.finalStarScoreOutOfTen.toFixed(2)} / 10
              </span>
            </div>
            <div className="ct-cumulative-label">FINAL CUMULATIVE AVERAGE</div>
            <div className="ct-cumulative-meta">
              {cumulativeRating.activeSourceCount} APIs •{" "}
              {cumulativeRating.totalAggregatedVotes.toLocaleString()} Votes
            </div>
          </div>
        </div>

        {/* Consensus Breakdown Strip */}
        <div className="ct-consensus-strip">
          <div className="ct-consensus-metric">
            <span className="ct-metric-label">Critic Consensus</span>
            <strong className="ct-metric-val">
              {cumulativeRating.criticConsensusScore.toFixed(1)}%
            </strong>
          </div>
          <div className="ct-consensus-metric">
            <span className="ct-metric-label">Audience Consensus</span>
            <strong className="ct-metric-val">
              {cumulativeRating.audienceConsensusScore.toFixed(1)}%
            </strong>
          </div>
          <div className="ct-consensus-metric">
            <span className="ct-metric-label">Comic Community</span>
            <strong className="ct-metric-val">
              {cumulativeRating.comicCommunityScore.toFixed(1)}%
            </strong>
          </div>
          <div className="ct-consensus-metric">
            <span className="ct-metric-label">Bayesian Weighted</span>
            <strong className="ct-metric-val">
              {cumulativeRating.bayesianWeightedScore.toFixed(1)}%
            </strong>
          </div>
          <div className="ct-consensus-metric">
            <span className="ct-metric-label">Arithmetic Mean</span>
            <strong className="ct-metric-val">
              {cumulativeRating.simpleArithmeticAverage.toFixed(1)}%
            </strong>
          </div>
          <div className="ct-consensus-metric">
            <span className="ct-metric-label">Polarization (σ)</span>
            <strong className="ct-metric-val">
              ±{cumulativeRating.polarizationIndex.toFixed(2)}
            </strong>
          </div>
        </div>

        {/* Watchlist & Tracker Controls */}
        <div className="ct-tracker-bar">
          <div className="ct-tracker-left">
            <span className="ct-tracker-title">📌 Track in Your Dashboard:</span>
            {(
              [
                "PlanToWatch",
                item.mediaType === "ComicBook" ? "Reading" : "Watching",
                "Completed",
                "OnHold",
              ] as WatchlistEntry["status"][]
            ).map((st) => (
              <button
                key={st}
                type="button"
                className={`ct-status-btn ${
                  existingWatchlist?.status === st ? "active" : ""
                }`}
                onClick={() => handleWatchlistStatus(st)}
              >
                {existingWatchlist?.status === st ? "✓ " : "+ "}
                {st === "PlanToWatch" ? "Plan to Read/Watch" : st}
              </button>
            ))}
          </div>
          <div className="ct-tracker-right">
            <input
              type="number"
              min={0}
              max={100}
              placeholder={
                existingWatchlist?.userPersonalScore
                  ? `Your Score: ${existingWatchlist.userPersonalScore}%`
                  : "Your Score (0-100)"
              }
              value={personalScoreInput}
              onChange={(e) => setPersonalScoreInput(e.target.value)}
              className="ct-personal-score-input"
            />
            <button
              type="button"
              className="ct-status-btn active"
              onClick={() =>
                handleWatchlistStatus(existingWatchlist?.status || "Completed")
              }
            >
              Save Score
            </button>
          </div>
        </div>

        {/* Multi-API Rating Breakdown Grid */}
        <div className="ct-section-block">
          <div className="ct-section-header-flex">
            <h3>
              🌐 Multi-Platform API Rating Breakdown (
              {cumulativeRating.sources.length} Sources)
            </h3>
            <button
              type="button"
              className="ct-small-outline-btn"
              onClick={() => ratingStore.setWeightsModalOpen(true)}
            >
              ⚙️ Customize Source Weights
            </button>
          </div>

          <div className="ct-sources-grid">
            {cumulativeRating.sources.map((src) => (
              <div key={src.sourceId} className="ct-source-card">
                <div className="ct-source-card-top">
                  <span
                    className="ct-source-dot"
                    style={{ backgroundColor: src.accentColor }}
                  />
                  <div className="ct-source-title-wrap">
                    <strong>{src.sourceName}</strong>
                    <span className="ct-source-cat-tag">{src.category}</span>
                  </div>
                  <div className="ct-source-score-badge">
                    <span className="ct-raw-score">{src.rawScoreDisplay}</span>
                    <span
                      className="ct-norm-score"
                      style={{ color: getScoreColor(src.normalizedScore) }}
                    >
                      ({src.normalizedScore.toFixed(1)}%)
                    </span>
                  </div>
                </div>
                <div className="ct-progress-track">
                  <div
                    className="ct-progress-fill"
                    style={{
                      width: `${Math.min(100, src.normalizedScore)}%`,
                      backgroundColor: src.accentColor,
                    }}
                  />
                </div>
                <div className="ct-source-card-foot">
                  <span>{src.voteCount.toLocaleString()} verified votes</span>
                  <span>
                    Weight:{" "}
                    {(
                      ratingStore.customWeights[src.sourceId] ??
                      src.defaultWeight
                    ).toFixed(2)}
                    x
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Community Reviews & Submit Review Form */}
        <div className="ct-section-block">
          <h3>💬 Community Reviews & Cumulative Score Contribution</h3>
          <form onSubmit={handleReviewSubmit} className="ct-review-form">
            <div className="ct-review-form-row">
              <div className="ct-review-score-field">
                <label htmlFor="ct-rev-score">
                  Your Rating: <strong>{reviewScore}%</strong> (
                  {(reviewScore / 10).toFixed(1)}/10)
                </label>
                <input
                  id="ct-rev-score"
                  type="range"
                  min={10}
                  max={100}
                  value={reviewScore}
                  onChange={(e) => setReviewScore(Number(e.target.value))}
                />
              </div>
              <div className="ct-review-headline-field">
                <input
                  type="text"
                  placeholder="Review headline (e.g., 'A landmark graphic novel adaptation')"
                  value={reviewHeadline}
                  onChange={(e) => setReviewHeadline(e.target.value)}
                  required
                />
              </div>
            </div>
            <textarea
              rows={3}
              placeholder="Share your critique of the story, artwork, cinematography, or adaptation fidelity..."
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              required
            />
            <div className="ct-review-form-actions">
              <label className="ct-spoiler-checkbox">
                <input
                  type="checkbox"
                  checked={containsSpoilers}
                  onChange={(e) => setContainsSpoilers(e.target.checked)}
                />
                Contains Spoilers
              </label>
              <button
                type="submit"
                className="ct-primary-cta-btn"
                disabled={submitting}
              >
                {!userStore.isLoggedIn
                  ? "Sign In to Submit Review"
                  : submitting
                  ? "Updating Cumulative Average..."
                  : "Submit Review & Recalculate Average"}
              </button>
            </div>
          </form>

          <div className="ct-reviews-list">
            {mediaReviews.length === 0 ? (
              <p className="ct-muted-text">
                No community reviews yet for this title. Be the first to
                contribute to its cumulative score!
              </p>
            ) : (
              mediaReviews.map((rev) => (
                <div key={rev.id} className="ct-review-item">
                  <div className="ct-review-item-head">
                    <div>
                      <strong>@{rev.username}</strong>
                      <span className="ct-review-date">
                        {new Date(rev.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="ct-review-score-pill">
                      ★ {rev.score}% ({(rev.score / 10).toFixed(1)}/10)
                    </div>
                  </div>
                  <h4>{rev.headline}</h4>
                  <p>{rev.reviewText}</p>
                  <div className="ct-review-item-foot">
                    <button
                      type="button"
                      className="ct-helpful-btn"
                      onClick={() => ratingStore.voteReviewHelpful(rev.id)}
                    >
                      👍 Helpful ({rev.helpfulVotes})
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export const CompareModal: React.FC = observer(() => {
  const { ratingStore } = useStore();
  if (!ratingStore.compareModalOpen) return null;

  const items = ratingStore.comparisonItems;
  const bestCumulative =
    items.length > 0
      ? [...items].sort(
          (a, b) =>
            b.cumulativeRating.finalCumulativeAverage -
            a.cumulativeRating.finalCumulativeAverage
        )[0]
      : null;

  return (
    <div
      className="ct-modal-backdrop"
      onClick={() => ratingStore.setCompareModalOpen(false)}
    >
      <div
        className="ct-modal-container ct-compare-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="ct-modal-close"
          onClick={() => ratingStore.setCompareModalOpen(false)}
          aria-label="Close compare arena"
        >
          ✕
        </button>

        <div className="ct-section-block">
          <h2>⚔️ Head-to-Head Cumulative Rating Arena (Max 3 Titles)</h2>
          <p className="ct-muted-text">
            Use the 3 search inputs below to search and pick up to 3 Comic Books,
            Movies, or TV Series for side-by-side cumulative comparison.
          </p>

          {/* 3 Search & Pick Inputs */}
          <CompareThreeSlotPicker />

          {bestCumulative && (
            <div className="ct-winner-banner">
              🏆 <strong>Cumulative Average Champion:</strong>{" "}
              {bestCumulative.title} with{" "}
              <strong>
                {formatCumulativeScore(bestCumulative.cumulativeRating, 1)}
              </strong>{" "}
              ({bestCumulative.cumulativeRating.consensusTier})
            </div>
          )}

          {items.length >= 2 && (
            <div className="ct-compare-quick-board" aria-label="Side-by-side quick scoreboard">
              {items.map((item) => (
                <div
                  key={`quick-${item.externalId}`}
                  className={`ct-compare-quick-cell ${
                    bestCumulative?.externalId === item.externalId ? "is-leader" : ""
                  }`}
                >
                  <span className="ct-compare-quick-title">{item.title}</span>
                  <strong
                    className="ct-compare-quick-score"
                    style={{
                      color: getScoreColor(
                        item.cumulativeRating.finalCumulativeAverage
                      ),
                    }}
                  >
                    {formatCumulativeScore(item.cumulativeRating, 1)}
                  </strong>
                  <small>
                    Critics {item.cumulativeRating.criticConsensusScore.toFixed(0)}% • Audience{" "}
                    {item.cumulativeRating.audienceConsensusScore.toFixed(0)}%
                  </small>
                </div>
              ))}
            </div>
          )}

          <div className="ct-compare-grid">
            {items.map((item) => (
              <div key={item.externalId} className="ct-compare-column">
                <div className="ct-compare-card-top">
                  <img
                    src={sanitizeImageUrl(item.posterUrl)}
                    alt={item.title}
                    className="ct-compare-poster"
                  />
                  <div className="ct-compare-card-headmeta">
                    <h3>{item.title}</h3>
                    <span className="ct-meta-pill">
                      {item.mediaType} • {item.releaseYear}
                    </span>
                  </div>
                </div>

                <div className="ct-compare-big-score">
                  <span>Final Cumulative Average</span>
                  <strong
                    style={{
                      color: getScoreColor(
                        item.cumulativeRating.finalCumulativeAverage
                      ),
                    }}
                  >
                    {formatCumulativeScore(item.cumulativeRating, 1)}
                  </strong>
                  <small>{item.cumulativeRating.consensusTier}</small>
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
                      {item.cumulativeRating.audienceConsensusScore.toFixed(1)}%
                    </strong>
                  </div>
                  <div>
                    <span>Comic Community:</span>
                    <strong>
                      {item.cumulativeRating.comicCommunityScore.toFixed(1)}%
                    </strong>
                  </div>
                  <div>
                    <span>Bayesian Weighted:</span>
                    <strong>
                      {item.cumulativeRating.bayesianWeightedScore.toFixed(1)}%
                    </strong>
                  </div>
                  <div>
                    <span>Polarization (σ):</span>
                    <strong>
                      ±{item.cumulativeRating.polarizationIndex.toFixed(2)}
                    </strong>
                  </div>
                </div>

                <div className="ct-compare-sources-sublist">
                  <h4>Individual API Scores</h4>
                  {item.cumulativeRating.sources.map((s) => (
                    <div key={s.sourceId} className="ct-compare-source-row">
                      <span>{s.sourceName}</span>
                      <strong>
                        {s.rawScoreDisplay} ({s.normalizedScore.toFixed(0)}%)
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

export const CustomWeightsModal: React.FC = observer(() => {
  const { ratingStore } = useStore();
  if (!ratingStore.weightsModalOpen) return null;

  return (
    <div
      className="ct-modal-backdrop"
      onClick={() => ratingStore.setWeightsModalOpen(false)}
    >
      <div
        className="ct-modal-container ct-modal-medium"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="ct-modal-close"
          onClick={() => ratingStore.setWeightsModalOpen(false)}
        >
          ✕
        </button>

        <div className="ct-section-block">
          <h2>⚖️ Custom Cumulative Rating Source Weights</h2>
          <p className="ct-muted-text">
            Adjust how much influence each rating API has on the{" "}
            <strong>Final Cumulative Average</strong>. Changes recalculate all
            Movies, TV Series, and Comic Books in real time!
          </p>

          <div className="ct-weights-sliders-list">
            {RATING_SOURCE_DEFINITIONS.map((def) => {
              const currentWeight =
                ratingStore.customWeights[def.sourceId] ?? def.defaultWeight;
              return (
                <div key={def.sourceId} className="ct-weight-slider-row">
                  <div className="ct-weight-slider-label">
                    <span
                      className="ct-source-dot"
                      style={{ backgroundColor: def.color }}
                    />
                    <strong>{def.name}</strong>
                    <span className="ct-source-cat-tag">{def.category}</span>
                  </div>
                  <div className="ct-weight-slider-control">
                    <input
                      type="range"
                      min={0}
                      max={2.5}
                      step={0.05}
                      value={currentWeight}
                      onChange={(e) =>
                        ratingStore.setSourceWeight(
                          def.sourceId,
                          parseFloat(e.target.value)
                        )
                      }
                    />
                    <span className="ct-weight-val">
                      {currentWeight.toFixed(2)}x
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ct-weights-actions">
            <button
              type="button"
              className="ct-small-outline-btn"
              onClick={() => ratingStore.resetSourceWeights()}
            >
              Reset to Default Weights
            </button>
            <button
              type="button"
              className="ct-primary-cta-btn"
              onClick={async () => {
                await ratingStore.syncCustomWeightsEncrypted();
                ratingStore.setWeightsModalOpen(false);
              }}
            >
              ✓ Apply & Sync Weights
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export const KeyboardShortcutsModal: React.FC = observer(() => {
  const { ratingStore } = useStore();
  if (!ratingStore.shortcutsModalOpen) return null;

  return (
    <div
      className="ct-modal-backdrop"
      onClick={() => ratingStore.setShortcutsModalOpen(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="ct-modal-container ct-modal-medium"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="ct-modal-close"
          onClick={() => ratingStore.setShortcutsModalOpen(false)}
        >
          ✕
        </button>

        <div className="ct-section-block">
          <h2>⌨️ Comic Traffic Keyboard Shortcuts & Quick Commands</h2>
          <p className="ct-muted-text">
            Navigate the Cumulative Rating Hub, toggle performance modes, and switch layouts effortlessly.
          </p>

          <div className="adx-shortcuts-grid">
            <div className="adx-shortcut-row">
              <span>Toggle Shortcuts Cheatsheet</span>
              <kbd>?</kbd>
            </div>
            <div className="adx-shortcut-row">
              <span>Toggle Lite Mode (Zero Blur / Low-End Boost)</span>
              <kbd>L</kbd>
            </div>
            <div className="adx-shortcut-row">
              <span>Open Head-to-Head Compare Arena</span>
              <kbd>C</kbd>
            </div>
            <div className="adx-shortcut-row">
              <span>Customize Multi-API Rating Weights</span>
              <kbd>W</kbd>
            </div>
            <div className="adx-shortcut-row">
              <span>Switch Grid / List / Thumbnail View</span>
              <kbd>V</kbd>
            </div>
            <div className="adx-shortcut-row">
              <span>Close Active Modal / Drawer</span>
              <kbd>ESC</kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export const CommunityBottomDrawer: React.FC = observer(() => {
  const { ratingStore, userStore } = useStore();
  const navigate = useNavigate();
  const [quickComment, setQuickComment] = useState("");
  const [selectedMediaId, setSelectedMediaId] = useState(
    ratingStore.catalog[0]?.externalId || "comic-watchmen-1986"
  );

  const handleQuickPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userStore.isLoggedIn) {
      ratingStore.setCommunityDrawerOpen(false);
      navigate("/login");
      return;
    }
    if (!quickComment.trim()) return;
    const target =
      ratingStore.catalog.find((c) => c.externalId === selectedMediaId) ||
      ratingStore.catalog[0];
    if (!target) return;

    await ratingStore.submitReview({
      externalMediaId: target.externalId,
      mediaTitle: target.title,
      mediaType: target.mediaType,
      score: 94,
      headline: "Live Abyss Feed Thought",
      reviewText: quickComment,
      containsSpoilers: false,
      username: userStore.profile?.username || "comicwarden",
    });
    setQuickComment("");
  };

  return (
    <div
      className={`adx-bottom-drawer ${
        ratingStore.communityDrawerOpen ? "open" : ""
      }`}
    >
      <div
        className="adx-drawer-bar"
        onClick={() =>
          ratingStore.setCommunityDrawerOpen(!ratingStore.communityDrawerOpen)
        }
      >
        <div className="adx-drawer-bar-left">
          <span className="adx-live-dot" />
          <strong className="adx-live-bar-title">
            <span className="adx-title-full">
              COMIC TRAFFIC LIVE COMMUNITY PULSE & OST BAR
            </span>
            <span className="adx-title-short">
              COMIC TRAFFIC LIVE
            </span>
          </strong>
          <span className="adx-online-pill">
            🔥 {ratingStore.reviews.length + 124} Analysts Online
          </span>
        </div>

        <div className="adx-drawer-bar-right">
          <span className="adx-ost-mini">
            🎵 Theme: Midnight Synthwave • Multi-API Telemetry Active
          </span>
          <button
            type="button"
            className="adx-drawer-toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              ratingStore.setCommunityDrawerOpen(
                !ratingStore.communityDrawerOpen
              );
            }}
          >
            {ratingStore.communityDrawerOpen ? "▾ Minimize" : "▴ Live Chat & Feed"}
          </button>
        </div>
      </div>

      {ratingStore.communityDrawerOpen && (
        <div className="adx-drawer-body">
          <div className="adx-drawer-messages">
            {ratingStore.reviews.slice(0, 6).map((rev) => (
              <div key={rev.id} className="adx-chat-bubble">
                <div className="adx-chat-meta">
                  <strong className="adx-chat-user">@{rev.username}</strong>
                  <span className="adx-chat-media">{rev.mediaTitle}</span>
                  <span className="adx-chat-score">★ {rev.score}%</span>
                </div>
                <p>{rev.reviewText}</p>
              </div>
            ))}
          </div>

          <form onSubmit={handleQuickPost} className="adx-drawer-input-row">
            <select
              value={selectedMediaId}
              onChange={(e) => setSelectedMediaId(e.target.value)}
              className="adx-drawer-select"
              aria-label="Select title for live comment"
            >
              {ratingStore.catalog.slice(0, 12).map((c) => (
                <option key={c.externalId} value={c.externalId}>
                  {c.title}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Drop a live critique or rating reaction into the Abyss..."
              value={quickComment}
              onChange={(e) => setQuickComment(e.target.value)}
              className="adx-drawer-input"
            />
            <button type="submit" className="ct-primary-cta-btn">
              {userStore.isLoggedIn ? "Post Live" : "Sign In to Post"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
});
