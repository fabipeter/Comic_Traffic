import React, { useState, useEffect, useRef } from "react";
import "./Nav.css";
import { useNavigate, useLocation } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "../../app/stores/store";
import { AggregatedMediaItem, MediaCategoryType } from "../../app/api/ratingApis";
import { ANIMEDEX_SKINS, AnimeDexSkinId } from "../../app/stores/ratingStore";
import { sanitizeImageUrl } from "../../app/security/inputSanitizer";
import comicTrafficLogo from "../../assets/comicTrafficLogo.svg";

const Nav = () => {
  const [show, setShow] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [skinMenuOpen, setSkinMenuOpen] = useState(false);
  const [desktopSearchFocused, setDesktopSearchFocused] = useState(false);
  const rightClusterRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { ratingStore, userStore } = useStore();

  const transitionNavBar = () => {
    if (window.scrollY > 20) {
      setShow(true);
    } else {
      setShow(false);
    }
  };

  useEffect(() => {
    window.addEventListener("scroll", transitionNavBar);
    return () => {
      window.removeEventListener("scroll", transitionNavBar);
    };
  }, []);

  // Close popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        rightClusterRef.current &&
        !rightClusterRef.current.contains(e.target as Node)
      ) {
        setDrawerOpen(false);
        setSkinMenuOpen(false);
        setDesktopSearchFocused(false);
      }
    };
    if (drawerOpen || skinMenuOpen || desktopSearchFocused) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [drawerOpen, skinMenuOpen, desktopSearchFocused]);

  // Keyboard shortcut listener for `?` (Shortcuts Overlay) and `L` (Lite Mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "?") {
        e.preventDefault();
        ratingStore.setShortcutsModalOpen(!ratingStore.shortcutsModalOpen);
      } else if (e.key === "l" || e.key === "L") {
        ratingStore.toggleLiteMode();
      } else if (e.key === "Escape") {
        setDrawerOpen(false);
        setSkinMenuOpen(false);
        setDesktopSearchFocused(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ratingStore]);

  const handleCategorySelect = (cat: "All" | MediaCategoryType) => {
    ratingStore.setCategory(cat);
    setDrawerOpen(false);
    if (location.pathname !== "/") {
      navigate("/");
    }
  };

  const handleGlobalSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDrawerOpen(false);
    setDesktopSearchFocused(false);
    if (location.pathname !== "/") {
      navigate("/");
    }
    ratingStore.setCategory("All");
    if (ratingStore.searchQuery.trim().length >= 2) {
      await ratingStore.executeLiveMultiApiSearch(ratingStore.searchQuery);
    }
    setTimeout(() => {
      const el = document.getElementById("ct-catalog-explorer");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 60);
  };

  const handleSelectSuggestion = (item: AggregatedMediaItem) => {
    setDrawerOpen(false);
    setDesktopSearchFocused(false);
    if (location.pathname !== "/") {
      navigate("/");
    }
    ratingStore.setCategory("All");
    ratingStore.openDetailModal(item);
  };

  const quickSuggestions =
    ratingStore.searchQuery.trim().length > 0
      ? ratingStore.searchSuggestions(ratingStore.searchQuery, 10)
      : [];

  const currentSkinObj =
    ANIMEDEX_SKINS.find((s) => s.id === ratingStore.activeSkin) ||
    ANIMEDEX_SKINS[0];

  return (
    <nav className={`nav ${show ? "nav__black" : ""}`}>
      <div className="nav__contents">
        {/* Left: Redesigned Comic Traffic Brand Logo */}
        <div className="nav__left">
          <div
            className="nav__brand"
            onClick={() => handleCategorySelect("All")}
            role="button"
            tabIndex={0}
          >
            <div className="nav__logo_crest">
              <img
                className="nav__logo"
                src={comicTrafficLogo}
                alt="Comic Traffic Logo"
              />
              <span className="nav__crest_pulse" />
            </div>
            <div className="nav__brand_text_wrap">
              <span className="nav__brand__title">
                COMIC<span>TRAFFIC</span>
              </span>
              <small className="nav__brand_sub">CUMULATIVE RATING HUB</small>
            </div>
          </div>
        </div>

        {/* Center: Clean Main Menu Items Centered in the Middle Like AnimeDex */}
        <div className="nav__center_menu">
          <div
            className="nav__links"
            role="menubar"
            aria-label="Main Categories"
          >
            <button
              type="button"
              className={`nav__link__btn ${
                ratingStore.selectedCategory === "All" &&
                location.pathname === "/"
                  ? "active"
                  : ""
              }`}
              onClick={() => handleCategorySelect("All")}
            >
              All Media
            </button>
            <button
              type="button"
              className={`nav__link__btn ${
                ratingStore.selectedCategory === "ComicBook" ? "active" : ""
              }`}
              onClick={() => handleCategorySelect("ComicBook")}
            >
              Comics
            </button>
            <button
              type="button"
              className={`nav__link__btn ${
                ratingStore.selectedCategory === "Movie" ? "active" : ""
              }`}
              onClick={() => handleCategorySelect("Movie")}
            >
              Movies
            </button>
            <button
              type="button"
              className={`nav__link__btn ${
                ratingStore.selectedCategory === "TvSeries" ? "active" : ""
              }`}
              onClick={() => handleCategorySelect("TvSeries")}
            >
              TV Series
            </button>
          </div>
        </div>

        {/* Right: Theme Skins Icon Button (replaces Light/Dark toggle) + Desktop Search + Toggled Menu Button */}
        <div className="nav__right" ref={rightClusterRef}>
          {/* Desktop Search Bar directly on the menu bar */}
          <div className="nav__desktop_search_wrap">
            <form onSubmit={handleGlobalSearchSubmit} className="nav__desktop_search_form">
              <span className="nav__desktop_search_icon">🔍</span>
              <input
                type="text"
                className="nav__desktop_search_input"
                placeholder="Search titles, creators, studios..."
                aria-label="Search titles, creators, studios"
                value={ratingStore.searchQuery}
                onFocus={() => setDesktopSearchFocused(true)}
                onChange={(e) => {
                  ratingStore.setSearchQuery(e.target.value);
                  setDesktopSearchFocused(true);
                }}
              />
              {ratingStore.searchQuery && (
                <button
                  type="button"
                  className="nav__search_clear"
                  onClick={() => ratingStore.setSearchQuery("")}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
              <button type="submit" className="nav__search_submit">
                GO
              </button>
            </form>

            {desktopSearchFocused && ratingStore.searchQuery.trim().length > 0 && (
              <div
                className="nav__desktop_suggestions"
                role="listbox"
                aria-label="Search suggestions"
              >
                <div className="nav__desktop_sugg_head">
                  <span>TITLES MATCHING &ldquo;{ratingStore.searchQuery}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => setDesktopSearchFocused(false)}
                    aria-label="Close suggestions"
                  >
                    ✕
                  </button>
                </div>
                {quickSuggestions.length === 0 ? (
                  <div className="nav__desktop_sugg_empty">
                    <span>Searching catalog & live rating APIs...</span>
                  </div>
                ) : (
                  <>
                    {quickSuggestions.map((item) => (
                      <div
                        key={item.externalId}
                        className="nav__desktop_sugg_item"
                        onClick={() => handleSelectSuggestion(item)}
                        role="option"
                        aria-selected={false}
                        tabIndex={0}
                      >
                        <img
                          src={sanitizeImageUrl(item.posterUrl)}
                          alt={item.title}
                          className="nav__desktop_sugg_poster"
                        />
                        <div className="nav__desktop_sugg_info">
                          <strong className="nav__desktop_sugg_title">{item.title}</strong>
                          <div className="nav__desktop_sugg_meta">
                            <span className="nav__desktop_sugg_cat">
                              {item.mediaType === "ComicBook"
                                ? "📚 Comic"
                                : item.mediaType === "Movie"
                                ? "🎬 Movie"
                                : "📺 TV"}
                            </span>
                            <span className="nav__desktop_sugg_year">
                              {item.releaseYear}
                            </span>
                          </div>
                        </div>
                        <div className="nav__desktop_sugg_score">
                          <strong>
                            {item.cumulativeRating.finalCumulativeAverage.toFixed(1)}%
                          </strong>
                          <small>SCORE</small>
                        </div>
                      </div>
                    ))}
                    <div
                      className="nav__desktop_sugg_foot"
                      onClick={handleGlobalSearchSubmit}
                      role="button"
                      tabIndex={0}
                    >
                      <span>🔍 View all results in Catalog Explorer →</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Theme Skins Icon Trigger */}
          <div className="nav__skin_icon_wrap">
            <button
              type="button"
              className={`nav__skin_icon_btn ${skinMenuOpen ? "active" : ""}`}
              aria-label="Select Theme Skin"
              aria-expanded={skinMenuOpen}
              title={`Theme Skin: ${currentSkinObj.name}`}
              onClick={() => {
                setSkinMenuOpen(!skinMenuOpen);
                setDrawerOpen(false);
              }}
            >
              <span
                className="nav__skin_dot"
                style={{ backgroundColor: currentSkinObj.accent }}
              />
              <span className="nav__skin_icon_glyph">🎨</span>
            </button>

            {skinMenuOpen && (
              <div
                className="nav__skin_dropdown"
                role="dialog"
                aria-label="Theme Skins Selector"
              >
                <div className="nav__skin_dropdown_head">
                  <span>🎨 THEME SKINS</span>
                  <button
                    type="button"
                    onClick={() => setSkinMenuOpen(false)}
                    aria-label="Close skins menu"
                  >
                    ✕
                  </button>
                </div>
                {ANIMEDEX_SKINS.map((sk) => (
                  <button
                    key={sk.id}
                    type="button"
                    className={`nav__skin_option ${
                      ratingStore.activeSkin === sk.id ? "active" : ""
                    }`}
                    onClick={() => {
                      ratingStore.setSkin(sk.id as AnimeDexSkinId);
                      setSkinMenuOpen(false);
                    }}
                  >
                    <span
                      className="nav__skin_dot"
                      style={{ backgroundColor: sk.accent }}
                    />
                    <div className="nav__skin_opt_info">
                      <strong>{sk.name}</strong>
                      <small>{sk.tagline}</small>
                    </div>
                    {ratingStore.activeSkin === sk.id && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className={`nav__hub_toggle_btn ${drawerOpen ? "active" : ""}`}
            aria-label="Toggle tools, search, and account menu"
            aria-expanded={drawerOpen}
            onClick={() => {
              setDrawerOpen(!drawerOpen);
              setSkinMenuOpen(false);
            }}
          >
            <span className="nav__hub_icon">{drawerOpen ? "✕" : "☰"}</span>
            <span className="nav__hub_label">Menu</span>
          </button>

          {/* Toggled Section containing Search, Arena, Weights, Lite Mode, and Auth */}
          {drawerOpen && (
            <div
              className="nav__toggled_panel"
              role="dialog"
              aria-label="Quick Menu & Settings"
            >
              {/* Mobile Main Category Quick Links (visible on compact screens) */}
              <div className="nav__panel_section nav__panel_mobile_cats">
                <span className="nav__panel_heading">BROWSE CATEGORIES</span>
                <div className="nav__panel_cat_grid">
                  {(["All", "ComicBook", "Movie", "TvSeries"] as const).map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={`nav__panel_cat_btn ${
                          ratingStore.selectedCategory === cat ? "active" : ""
                        }`}
                        onClick={() => handleCategorySelect(cat)}
                      >
                        {cat === "All"
                          ? "🔥 All Media"
                          : cat === "ComicBook"
                          ? "📚 Comics"
                          : cat === "Movie"
                          ? "🎬 Movies"
                          : "📺 TV Series"}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Quick Search inside Toggled Panel */}
              <div className="nav__panel_section">
                <span className="nav__panel_heading">QUICK SEARCH</span>
                <form
                  onSubmit={handleGlobalSearchSubmit}
                  className="nav__panel_search_form"
                >
                  <input
                    type="text"
                    className="nav__panel_search_input"
                    placeholder="Search comics, movies, series..."
                    aria-label="General search across comics, movies, and series"
                    value={ratingStore.searchQuery}
                    onChange={(e) => ratingStore.setSearchQuery(e.target.value)}
                  />
                  {ratingStore.searchQuery && (
                    <button
                      type="button"
                      className="nav__search_clear"
                      onClick={() => ratingStore.setSearchQuery("")}
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  )}
                  <button type="submit" className="nav__search_submit">
                    GO
                  </button>
                </form>

                {quickSuggestions.length > 0 && (
                  <div className="nav__panel_suggestions">
                    {quickSuggestions.map((item) => (
                      <button
                        key={item.externalId}
                        type="button"
                        className="nav__search_option"
                        onClick={() => handleSelectSuggestion(item)}
                      >
                        <img src={sanitizeImageUrl(item.posterUrl)} alt={item.title} />
                        <div className="nav__search_opt_meta">
                          <strong>{item.title}</strong>
                          <small>
                            {item.mediaType} • {item.releaseYear}
                          </small>
                        </div>
                        <span className="nav__search_opt_score">
                          ★{" "}
                          {item.cumulativeRating.finalCumulativeAverage.toFixed(
                            1
                          )}
                          %
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Rating Tools & Utilities */}
              <div className="nav__panel_section">
                <span className="nav__panel_heading">RATING TOOLS & HUB</span>
                <div className="nav__panel_tools_grid">
                  <button
                    type="button"
                    className="nav__panel_tool_btn"
                    onClick={() => {
                      setDrawerOpen(false);
                      ratingStore.setCompareModalOpen(true);
                    }}
                  >
                    <span>⚔️ Compare Arena</span>
                    <small>{ratingStore.comparisonIds.length}/3 Selected</small>
                  </button>

                  <button
                    type="button"
                    className="nav__panel_tool_btn"
                    onClick={() => {
                      setDrawerOpen(false);
                      ratingStore.setWeightsModalOpen(true);
                    }}
                  >
                    <span>⚖️ Source Weights</span>
                    <small>
                      {ratingStore.useCustomWeights
                        ? "Custom Active"
                        : "Default"}
                    </small>
                  </button>

                  <button
                    type="button"
                    className={`nav__panel_tool_btn ${
                      ratingStore.liteMode ? "active" : ""
                    }`}
                    onClick={() => ratingStore.toggleLiteMode()}
                  >
                    <span>⚡ Lite Mode</span>
                    <small>{ratingStore.liteMode ? "Enabled" : "Off"}</small>
                  </button>

                  <button
                    type="button"
                    className="nav__panel_tool_btn"
                    onClick={() => {
                      setDrawerOpen(false);
                      ratingStore.setShortcutsModalOpen(true);
                    }}
                  >
                    <span>⌨️ Shortcuts</span>
                    <small>Press ?</small>
                  </button>
                </div>
              </div>

              {/* Account & User Dashboard (Dashboard ONLY visible when signed in) */}
              <div className="nav__panel_section nav__panel_footer_actions">
                {userStore.isLoggedIn ? (
                  <>
                    <button
                      type="button"
                      className="nav__dashboard__button"
                      onClick={() => {
                        setDrawerOpen(false);
                        navigate("/dashboard");
                      }}
                    >
                      📊 User Dashboard
                    </button>
                    <button
                      type="button"
                      className="nav__signin__button nav__logout"
                      onClick={() => {
                        setDrawerOpen(false);
                        userStore.logout();
                        if (location.pathname.startsWith("/dashboard") || location.pathname.startsWith("/user")) {
                          navigate("/");
                        }
                      }}
                    >
                      Sign Out (@{userStore.profile?.username || "comicwarden"})
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="nav__signin__button nav__signin_full"
                    onClick={() => {
                      setDrawerOpen(false);
                      navigate("/login");
                    }}
                  >
                    Sign In / Register to Access Dashboard
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default observer(Nav);
