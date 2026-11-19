import React, { useState } from "react";
import { observer } from "mobx-react-lite";
import { Navigate } from "react-router-dom";
import { useStore } from "../../../app/stores/store";
import Nav from "../../home/Nav";
import { CommunityBottomDrawer } from "../../home/CumulativeModals";
import {
  RATING_SOURCE_DEFINITIONS,
  WatchlistEntry,
  formatCumulativeScore,
} from "../../../app/api/ratingApis";
import { sanitizeImageUrl } from "../../../app/security/inputSanitizer";

const IndexProfilePage: React.FC = () => {
  const { ratingStore, userStore } = useStore();
  const [activeTab, setActiveTab] = useState<
    "overview" | "watchlist" | "lists" | "reviews"
  >("overview");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  // New Custom List state
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");
  const [selectedListMediaIds, setSelectedListMediaIds] = useState<string[]>([
    "comic-watchmen-1986",
    "movie-spiderverse-2023",
  ]);

  const metrics = ratingStore.dashboardMetrics;
  const profile = userStore.profile || {
    id: "11111111-1111-1111-1111-111111111111",
    username: "comicwarden",
    displayName: "Alex Mercer (ComicWarden)",
    email: "demo@comictraffic.io",
    bio: "Cumulative rating analyst, graphic novel collector, and sci-fi cinema critic.",
    avatarUrl:
      "https://i.pinimg.com/originals/95/8e/e6/958ee665c32ab3bbc9b3365f05c49c85.png",
    role: "Admin",
    favoriteGenres: ["Superhero", "Sci-Fi", "Noir", "Graphic Novel", "Animation"],
  };

  const filteredWatchlist =
    statusFilter === "All"
      ? ratingStore.watchlist
      : ratingStore.watchlist.filter((w) => w.status === statusFilter);

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    await ratingStore.createCustomList(
      newListName,
      newListDesc,
      selectedListMediaIds,
      profile.username
    );
    setNewListName("");
    setNewListDesc("");
  };

  if (!userStore.isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="ct-dashboard-page">
      <Nav />

      <div className="ct-dashboard-container">
        {/* Profile Header Card */}
        <header className="ct-dash-profile-header">
          <div className="ct-dash-profile-left">
            <img
              src={sanitizeImageUrl(profile.avatarUrl)}
              alt={profile.displayName}
              className="ct-dash-avatar"
            />
            <div>
              <div className="ct-dash-badges">
                <span className="ct-role-badge">⚡ {profile.role} Analyst</span>
                <span className="ct-enc-badge">
                  ✓ Verified Multi-Source Sync Profile
                </span>
              </div>
              <h1>{profile.displayName}</h1>
              <p className="ct-dash-username">
                @{profile.username} • {profile.email}
              </p>
              <p className="ct-dash-bio">{profile.bio}</p>
              <div className="ct-genre-tags">
                {(profile.favoriteGenres || []).map((g) => (
                  <span key={g} className="ct-genre-chip">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="ct-dash-profile-actions">
            <button
              type="button"
              className="ct-primary-cta-btn"
              onClick={() => ratingStore.setWeightsModalOpen(true)}
            >
              ⚖️ Tune API Source Weights
            </button>
            <button
              type="button"
              className="ct-secondary-cta-btn"
              onClick={() => ratingStore.setCompareModalOpen(true)}
            >
              ⚔️ Open Compare Arena
            </button>
          </div>
        </header>

        {/* KPI Analytics Row */}
        <section className="ct-dash-kpi-grid">
          <div className="ct-kpi-card">
            <span className="ct-kpi-label">Total Tracked Media</span>
            <strong className="ct-kpi-value">{metrics.totalTracked}</strong>
            <span className="ct-kpi-sub">
              📚 {metrics.comicsCount} Comics • 🎬 {metrics.moviesCount} Movies • 📺{" "}
              {metrics.tvCount} Series
            </span>
          </div>

          <div className="ct-kpi-card">
            <span className="ct-kpi-label">Your Personal Score Average</span>
            <strong className="ct-kpi-value" style={{ color: "#10b981" }}>
              {metrics.avgPersonal.toFixed(1)}%
            </strong>
            <span className="ct-kpi-sub">
              Global Cumulative Avg: {metrics.avgGlobal.toFixed(1)}% (
              {metrics.delta >= 0 ? `+${metrics.delta}%` : `${metrics.delta}%`} delta)
            </span>
          </div>

          <div className="ct-kpi-card">
            <span className="ct-kpi-label">Reviews & Ratings Submitted</span>
            <strong className="ct-kpi-value" style={{ color: "#a855f7" }}>
              {metrics.totalReviews}
            </strong>
            <span className="ct-kpi-sub">
              Contributing live to Final Cumulative Averages
            </span>
          </div>

          <div className="ct-kpi-card">
            <span className="ct-kpi-label">Curated Collections</span>
            <strong className="ct-kpi-value" style={{ color: "#3b82f6" }}>
              {metrics.totalLists}
            </strong>
            <span className="ct-kpi-sub">
              Cross-media Comic, Movie & Series lists
            </span>
          </div>
        </section>

        {/* Dashboard Navigation Tabs */}
        <div className="ct-dash-tabs" role="tablist">
          <button
            type="button"
            className={`ct-dash-tab ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            📊 Analytics & Distribution
          </button>
          <button
            type="button"
            className={`ct-dash-tab ${activeTab === "watchlist" ? "active" : ""}`}
            onClick={() => setActiveTab("watchlist")}
          >
            📌 Watchlist & Reading List ({ratingStore.watchlist.length})
          </button>
          <button
            type="button"
            className={`ct-dash-tab ${activeTab === "lists" ? "active" : ""}`}
            onClick={() => setActiveTab("lists")}
          >
            🗂️ Custom Lists ({ratingStore.customLists.length})
          </button>
          <button
            type="button"
            className={`ct-dash-tab ${activeTab === "reviews" ? "active" : ""}`}
            onClick={() => setActiveTab("reviews")}
          >
            💬 Community Reviews ({ratingStore.reviews.length})
          </button>
        </div>

        {/* TAB 1: OVERVIEW & ANALYTICS */}
        {activeTab === "overview" && (
          <div className="ct-dash-panel-grid">
            <div className="ct-dash-panel">
              <h3>📈 Cumulative Score Comparison by Media Type</h3>
              <p className="ct-muted-text">
                Aggregated average across all 12 rating APIs for Comic Books, Movies, and TV Series.
              </p>

              {(["ComicBook", "Movie", "TvSeries"] as const).map((type) => {
                const itemsOfType = ratingStore.catalog.filter(
                  (c) => c.mediaType === type
                );
                const avgScore =
                  itemsOfType.length > 0
                    ? itemsOfType.reduce(
                        (s, i) => s + i.cumulativeRating.finalCumulativeAverage,
                        0
                      ) / itemsOfType.length
                    : 0;
                const label =
                  type === "ComicBook"
                    ? "📚 Comic Books & Graphic Novels"
                    : type === "TvSeries"
                    ? "📺 Television Series"
                    : "🎬 Feature Films";

                return (
                  <div key={type} className="ct-analytic-bar-group">
                    <div className="ct-analytic-bar-head">
                      <strong>{label}</strong>
                      <span>
                        {avgScore.toFixed(1)}% Cumulative Avg ({itemsOfType.length} titles)
                      </span>
                    </div>
                    <div className="ct-progress-track">
                      <div
                        className="ct-progress-fill"
                        style={{
                          width: `${avgScore}%`,
                          backgroundColor:
                            type === "ComicBook"
                              ? "#a855f7"
                              : type === "Movie"
                              ? "#ef4444"
                              : "#3b82f6",
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              <h3 style={{ marginTop: "24px" }}>
                ⚖️ Active API Source Weight Profile
              </h3>
              <div className="ct-mini-weights-grid">
                {RATING_SOURCE_DEFINITIONS.map((def) => (
                  <div key={def.sourceId} className="ct-mini-weight-box">
                    <span
                      className="ct-source-dot"
                      style={{ backgroundColor: def.color }}
                    />
                    <span>{def.name}</span>
                    <strong>
                      {(
                        ratingStore.customWeights[def.sourceId] ??
                        def.defaultWeight
                      ).toFixed(2)}
                      x
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="ct-dash-panel">
              <h3>🏆 Top 5 Highest Cumulative Average Titles</h3>
              <div className="ct-top5-list">
                {[...ratingStore.catalog]
                  .sort(
                    (a, b) =>
                      b.cumulativeRating.finalCumulativeAverage -
                      a.cumulativeRating.finalCumulativeAverage
                  )
                  .slice(0, 5)
                  .map((item, idx) => (
                    <div
                      key={item.externalId}
                      className="ct-top5-row"
                      onClick={() => ratingStore.openDetailModal(item)}
                    >
                      <span className="ct-top5-rank">#{idx + 1}</span>
                      <img src={sanitizeImageUrl(item.posterUrl)} alt={item.title} />
                      <div className="ct-top5-info">
                        <strong>{item.title}</strong>
                        <small>
                          {item.mediaType} • {item.releaseYear} •{" "}
                          {item.cumulativeRating.activeSourceCount} APIs
                        </small>
                      </div>
                      <div className="ct-top5-score">
                        {formatCumulativeScore(item.cumulativeRating, 1)}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: WATCHLIST & READING TRACKER */}
        {activeTab === "watchlist" && (
          <div className="ct-dash-panel">
            <div className="ct-section-header-flex">
              <h3>📌 Your Watchlist & Comic Reading Tracker</h3>
              <div className="ct-status-filter-pills">
                {["All", "Reading", "Watching", "PlanToWatch", "Completed", "OnHold"].map(
                  (st) => (
                    <button
                      key={st}
                      type="button"
                      className={`ct-status-btn ${
                        statusFilter === st ? "active" : ""
                      }`}
                      onClick={() => setStatusFilter(st)}
                    >
                      {st}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="ct-watchlist-table">
              {filteredWatchlist.map((entry) => {
                const matchedMedia = ratingStore.catalog.find(
                  (c) => c.externalId === entry.externalMediaId
                );
                return (
                  <div key={entry.id} className="ct-watchlist-row">
                    <img
                      src={sanitizeImageUrl(entry.posterUrl)}
                      alt={entry.title}
                      onClick={() =>
                        matchedMedia && ratingStore.openDetailModal(matchedMedia)
                      }
                    />
                    <div className="ct-watchlist-main">
                      <h4>{entry.title}</h4>
                      <span className="ct-meta-pill">{entry.mediaType}</span>
                      {entry.notes && (
                        <p className="ct-watchlist-notes">{entry.notes}</p>
                      )}
                    </div>

                    <div className="ct-watchlist-scores">
                      <div>
                        <small>Cumulative Avg</small>
                        <strong>{entry.cumulativeAverage.toFixed(1)}%</strong>
                      </div>
                      <div>
                        <small>Your Score</small>
                        <strong style={{ color: "#10b981" }}>
                          {entry.userPersonalScore
                            ? `${entry.userPersonalScore}%`
                            : "—"}
                        </strong>
                      </div>
                    </div>

                    <div className="ct-watchlist-controls">
                      <select
                        value={entry.status}
                        onChange={(e) => {
                          if (matchedMedia) {
                            ratingStore.upsertWatchlistItem(
                              matchedMedia,
                              e.target.value as WatchlistEntry["status"]
                            );
                          }
                        }}
                      >
                        <option value="PlanToWatch">Plan to Watch/Read</option>
                        <option value="Reading">Reading</option>
                        <option value="Watching">Watching</option>
                        <option value="Completed">Completed</option>
                        <option value="OnHold">On Hold</option>
                        <option value="Dropped">Dropped</option>
                      </select>
                      <button
                        type="button"
                        className="ct-remove-btn"
                        onClick={() =>
                          ratingStore.removeWatchlistItem(entry.externalMediaId)
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: CUSTOM LISTS */}
        {activeTab === "lists" && (
          <div className="ct-dash-panel-grid">
            <div className="ct-dash-panel">
              <h3>🗂️ Create a Cross-Media Cumulative List</h3>
              <form onSubmit={handleCreateList} className="ct-auth-form">
                <div className="ct-form-field">
                  <label htmlFor="ct-list-name">List Name</label>
                  <input
                    id="ct-list-name"
                    type="text"
                    placeholder="e.g. Essential Cosmic Marvel & Sci-Fi"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    required
                  />
                </div>
                <div className="ct-form-field">
                  <label htmlFor="ct-list-desc">Description</label>
                  <input
                    id="ct-list-desc"
                    type="text"
                    placeholder="Why these comics, movies, and series belong together..."
                    value={newListDesc}
                    onChange={(e) => setNewListDesc(e.target.value)}
                  />
                </div>
                <div className="ct-form-field">
                  <label>Include Titles</label>
                  <div className="ct-compare-selector-bar">
                    {ratingStore.catalog.slice(0, 10).map((item) => {
                      const picked = selectedListMediaIds.includes(
                        item.externalId
                      );
                      return (
                        <button
                          key={item.externalId}
                          type="button"
                          className={`ct-compare-chip ${picked ? "selected" : ""}`}
                          onClick={() =>
                            setSelectedListMediaIds((prev) =>
                              picked
                                ? prev.filter((id) => id !== item.externalId)
                                : [...prev, item.externalId]
                            )
                          }
                        >
                          {picked ? "✓ " : "+ "}
                          {item.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button type="submit" className="ct-primary-cta-btn">
                  ✓ Save Custom List
                </button>
              </form>
            </div>

            <div className="ct-dash-panel">
              <h3>📚 Curated Lists & Average Cumulative Score</h3>
              {ratingStore.customLists.map((list) => {
                const resolvedItems = list.externalMediaIds
                  .map((id) =>
                    ratingStore.catalog.find((c) => c.externalId === id)
                  )
                  .filter(Boolean);
                const listAvg =
                  resolvedItems.length > 0
                    ? resolvedItems.reduce(
                        (s, i) =>
                          s + (i?.cumulativeRating.finalCumulativeAverage || 0),
                        0
                      ) / resolvedItems.length
                    : 92.4;

                return (
                  <div key={list.id} className="ct-custom-list-card">
                    <div className="ct-custom-list-head">
                      <div>
                        <h4>{list.name}</h4>
                        <p>{list.description}</p>
                      </div>
                      <div className="ct-list-avg-pill">
                        List Avg: <strong>{listAvg.toFixed(1)}%</strong>
                      </div>
                    </div>
                    <div className="ct-list-items-strip">
                      {resolvedItems.map((item) =>
                        item ? (
                          <span
                            key={item.externalId}
                            className="ct-genre-chip"
                            onClick={() => ratingStore.openDetailModal(item)}
                            style={{ cursor: "pointer" }}
                          >
                            {item.title} (
                            {formatCumulativeScore(item.cumulativeRating, 1)})
                          </span>
                        ) : null
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: REVIEWS */}
        {activeTab === "reviews" && (
          <div className="ct-dash-panel">
            <h3>💬 Community & Analyst Reviews</h3>
            <div className="ct-reviews-list">
              {ratingStore.reviews.map((rev) => (
                <div key={rev.id} className="ct-review-item">
                  <div className="ct-review-item-head">
                    <div>
                      <strong>{rev.mediaTitle}</strong>{" "}
                      <span className="ct-meta-pill">{rev.mediaType}</span>{" "}
                      <span className="ct-review-date">
                        by @{rev.username} •{" "}
                        {new Date(rev.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="ct-review-score-pill">
                      ★ {rev.score}% ({(rev.score / 10).toFixed(1)}/10)
                    </div>
                  </div>
                  <h4>{rev.headline}</h4>
                  <p>{rev.reviewText}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <CommunityBottomDrawer />
    </div>
  );
};

export default observer(IndexProfilePage);
