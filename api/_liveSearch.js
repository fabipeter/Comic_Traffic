"use strict";

/**
 * Universal live search across movies, TV, anime, manga, comics, books and literature.
 *
 * Rules:
 *  - Every rating shown comes from the provider that published it. Nothing is synthesised.
 *  - Items that several providers know about are merged (by IMDb id, MAL id or title+type+year)
 *    so the cumulative score is the combination of every real source.
 *  - Providers needing a key are skipped (and reported as "not configured") when the key is absent.
 *
 * Keys (all optional, see README / docs):
 *   TMDB_API_KEY, OMDB_API_KEY, MDBLIST_API_KEY, COMICVINE_API_KEY, GOOGLE_BOOKS_API_KEY, HARDCOVER_API_TOKEN
 */

const PLACEHOLDER_POSTER =
  "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=900&q=80";
const PLACEHOLDER_BACKDROP =
  "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=1600&q=80";
const USER_AGENT = "ComicTraffic/1.0 (+https://comictraffic.com; contact@comictraffic.com)";
const MAX_RESULTS = 60;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

const TMDB_GENRES = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary",
  18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller",
  10752: "War", 37: "Western", 10759: "Action & Adventure", 10762: "Kids", 10763: "News",
  10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics",
};

const SOURCES = {
  tmdb: { id: "tmdb", name: "TMDB", category: "Audience", weight: 1.0, color: "#01b4e4" },
  imdb: { id: "imdb", name: "IMDb (OMDb)", category: "Audience", weight: 1.25, color: "#f5c518" },
  rt: { id: "rotten_tomatoes_critics", name: "Rotten Tomatoes (Critics)", category: "Critic", weight: 1.2, color: "#fa320a" },
  rtAudience: { id: "rotten_tomatoes_audience", name: "Rotten Tomatoes (Audience)", category: "Audience", weight: 1.1, color: "#ff6b35" },
  metacritic: { id: "metacritic", name: "Metacritic", category: "Critic", weight: 1.2, color: "#ffcc33" },
  trakt: { id: "trakt", name: "Trakt.tv", category: "Audience", weight: 0.95, color: "#ed1c24" },
  letterboxd: { id: "letterboxd", name: "Letterboxd", category: "Audience", weight: 1.1, color: "#00e054" },
  tvmaze: { id: "tvmaze", name: "TVMaze API", category: "Audience", weight: 0.95, color: "#3c948b" },
  anilist: { id: "anilist", name: "AniList", category: "ComicCommunity", weight: 1.2, color: "#02a9ff" },
  mal: { id: "myanimelist", name: "MyAnimeList", category: "ComicCommunity", weight: 1.2, color: "#2e51a2" },
  openlibrary: { id: "openlibrary", name: "Open Library", category: "Audience", weight: 1.0, color: "#059669" },
  googleBooks: { id: "google_books", name: "Google Books", category: "Audience", weight: 1.0, color: "#4285f4" },
  hardcover: { id: "hardcover", name: "Hardcover", category: "Audience", weight: 1.25, color: "#7c3aed" },
  appleBooks: { id: "apple_books", name: "Apple Books", category: "Audience", weight: 1.0, color: "#9ca3af" },
};

function makeSource(key, rawScoreDisplay, normalizedScore, voteCount, sourceUrl = "") {
  const d = SOURCES[key];
  const score = Math.max(0, Math.min(100, Number(normalizedScore)));
  return {
    sourceId: d.id,
    sourceName: d.name,
    category: d.category,
    rawScoreDisplay,
    normalizedScore: Math.round(score * 10) / 10,
    voteCount: Math.max(0, Math.round(Number(voteCount) || 0)),
    defaultWeight: d.weight,
    accentColor: d.color,
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function stripHtml(text) {
  const input = String(text || "");
  let out = "";
  let inTag = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "<") inTag = true;
    else if (ch === ">" && inTag) inTag = false;
    else if (!inTag) out += ch;
  }
  return out
    .split("&amp;").join("&")
    .split("&quot;").join('"')
    .split("&#39;").join("'")
    .split("&#039;").join("'")
    .split("&lt;").join("<")
    .split("&gt;").join(">")
    .split("&nbsp;").join(" ")
    .trim();
}

function titleKey(title) {
  return String(title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

function toYear(value) {
  const m = /\d{4}/.exec(String(value || ""));
  if (!m) return 0;
  const y = parseInt(m[0], 10);
  return y >= 1000 && y <= 2100 ? y : 0;
}

const ALLOWED_PROVIDER_HOSTS = new Set([
  "api.themoviedb.org",
  "www.omdbapi.com",
  "api.mdblist.com",
  "api.tvmaze.com",
  "itunes.apple.com",
  "graphql.anilist.co",
  "api.jikan.moe",
  "comicvine.gamespot.com",
  "api.hardcover.app",
  "www.googleapis.com",
  "openlibrary.org",
]);

function upgradeToHttps(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    return "";
  }
}

async function getJson(url, { headers = {}, method = "GET", body, timeoutMs = 5500 } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Blocked invalid provider URL");
  }
  if (parsed.protocol !== "https:" || !ALLOWED_PROVIDER_HOSTS.has(parsed.hostname)) {
    throw new Error("Blocked outbound request to unapproved provider host");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(parsed.toString(), {
      method,
      body,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function baseItem(fields) {
  return {
    externalId: "",
    title: "",
    mediaType: "Movie",
    releaseYear: 0,
    overview: "",
    posterUrl: "",
    backdropUrl: "",
    genres: [],
    publisherOrStudio: "",
    creatorOrDirector: "",
    runtimeOrIssueCount: "",
    ageRating: "",
    sources: [],
    ...fields,
  };
}

// ---------------------------------------------------------------------------
// Providers. Each returns raw items (with real `sources` only) or throws.
// ---------------------------------------------------------------------------

function tmdbToItem(raw, forcedCategory) {
  const title = raw.title || raw.name || raw.original_title || raw.original_name;
  if (!title) return null;
  const isTv =
    forcedCategory === "TvSeries" ||
    (forcedCategory !== "Movie" && (raw.media_type === "tv" || Boolean(raw.first_air_date)));
  const mediaType = isTv ? "TvSeries" : "Movie";
  const sources = [];
  const tmdbId = Number(raw.id);
  const tmdbUrl = Number.isInteger(tmdbId) && tmdbId > 0
    ? `https://www.themoviedb.org/${isTv ? "tv" : "movie"}/${tmdbId}`
    : "";
  if (typeof raw.vote_average === "number" && raw.vote_average > 0 && raw.vote_count > 0) {
    sources.push(makeSource("tmdb", `${raw.vote_average.toFixed(1)} / 10`, raw.vote_average * 10, raw.vote_count, tmdbUrl));
  }
  return baseItem({
    externalId: `tmdb-${mediaType.toLowerCase()}-${raw.id}`,
    tmdbId: Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : undefined,
    title,
    mediaType,
    releaseYear: toYear(raw.release_date || raw.first_air_date),
    overview: raw.overview || "",
    posterUrl: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : "",
    backdropUrl: raw.backdrop_path ? `https://image.tmdb.org/t/p/w1280${raw.backdrop_path}` : "",
    genres: (raw.genre_ids || []).map((g) => TMDB_GENRES[g]).filter(Boolean),
    sources,
  });
}

async function searchTmdb(q, env) {
  const key = env.TMDB_API_KEY;
  const pages = await Promise.all(
    [1, 2].map((page) =>
      getJson(
        `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(key)}&language=en-US&query=${encodeURIComponent(q)}&page=${page}&include_adult=false`
      ).catch((e) => (page === 1 ? Promise.reject(e) : { results: [] }))
    )
  );
  const items = [];
  for (const data of pages) {
    for (const raw of data.results || []) {
      if (raw.media_type === "person") continue;
      const item = tmdbToItem(raw);
      if (item) items.push(item);
    }
  }
  return items;
}

async function searchOmdb(q, env) {
  const key = env.OMDB_API_KEY;
  const data = await getJson(
    `https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&s=${encodeURIComponent(q)}&page=1`
  );
  if (data.Response === "False" || !Array.isArray(data.Search)) return [];
  const items = [];
  for (const r of data.Search) {
    if (r.Type !== "movie" && r.Type !== "series") continue;
    items.push(
      baseItem({
        externalId: `omdb-${r.imdbID}`,
        imdbId: r.imdbID,
        title: r.Title,
        mediaType: r.Type === "series" ? "TvSeries" : "Movie",
        releaseYear: toYear(r.Year),
        posterUrl: r.Poster && r.Poster !== "N/A" ? r.Poster : "",
      })
    );
  }
  return items;
}

/** Adds real IMDb / Rotten Tomatoes / Metacritic values (and missing metadata) from OMDb. */
async function enrichWithOmdb(item, env) {
  const key = env.OMDB_API_KEY;
  const lookup = item.imdbId
    ? `i=${encodeURIComponent(item.imdbId)}`
    : `t=${encodeURIComponent(item.title)}${item.releaseYear ? `&y=${item.releaseYear}` : ""}&type=${item.mediaType === "TvSeries" ? "series" : "movie"}`;
  const d = await getJson(`https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&${lookup}&plot=short`, { timeoutMs: 3500 });
  if (d.Response === "False") return;
  // Never attach ratings to a title that merely resembles the requested one.
  if (!item.imdbId && titleKey(d.Title) !== titleKey(item.title)) return;
  if (item.releaseYear && toYear(d.Year) && Math.abs(toYear(d.Year) - item.releaseYear) > 1) return;

  item.imdbId = item.imdbId || d.imdbID;
  const imdb = parseFloat(d.imdbRating);
  const imdbUrl = item.imdbId ? `https://www.imdb.com/title/${encodeURIComponent(item.imdbId)}/` : "";
  if (Number.isFinite(imdb) && imdb > 0) {
    const votes = parseInt(String(d.imdbVotes || "0").replace(/,/g, ""), 10) || 0;
    addSource(item, makeSource("imdb", `${imdb.toFixed(1)} / 10`, imdb * 10, votes, imdbUrl));
  }
  const rt = (d.Ratings || []).find((r) => r.Source === "Rotten Tomatoes");
  if (rt) {
    const pct = parseInt(rt.Value, 10);
    if (Number.isFinite(pct)) addSource(item, makeSource("rt", `${pct}%`, pct, 0));
  }
  const meta = parseInt(d.Metascore, 10);
  if (Number.isFinite(meta)) addSource(item, makeSource("metacritic", `${meta} / 100`, meta, 0));

  if (!item.overview && d.Plot && d.Plot !== "N/A") item.overview = d.Plot;
  if (!item.creatorOrDirector && d.Director && d.Director !== "N/A") item.creatorOrDirector = d.Director;
  if (!item.publisherOrStudio && d.Production && d.Production !== "N/A") item.publisherOrStudio = d.Production;
  if (!item.runtimeOrIssueCount && d.Runtime && d.Runtime !== "N/A") item.runtimeOrIssueCount = d.Runtime;
  if (!item.ageRating && d.Rated && d.Rated !== "N/A") item.ageRating = d.Rated;
  if (!item.posterUrl && d.Poster && d.Poster !== "N/A") item.posterUrl = d.Poster;
  if (d.Genre && d.Genre !== "N/A") {
    for (const g of d.Genre.split(",").map((s) => s.trim())) if (g && !item.genres.includes(g)) item.genres.push(g);
  }
}

function applyMdbListEntry(item, entry) {
  if (!entry || typeof entry !== "object") return false;
  const ids = entry.ids && typeof entry.ids === "object" ? entry.ids : {};
  const imdbId = ids.imdb || entry.imdbid || "";
  if (!item.imdbId && typeof imdbId === "string" && imdbId.startsWith("tt")) {
    item.imdbId = imdbId;
  }

  let addedAny = false;
  const ratings = Array.isArray(entry.ratings) ? entry.ratings : [];
  for (const r of ratings) {
    if (!r || typeof r !== "object") continue;
    const src = String(r.source || "").toLowerCase();
    const rawVal = typeof r.value === "number" ? r.value : parseFloat(r.value);
    const rawScore = typeof r.score === "number" ? r.score : parseFloat(r.score);
    const votes = Math.max(0, parseInt(r.votes, 10) || 0);
    const hasVal = Number.isFinite(rawVal) && rawVal > 0;
    const hasScore = Number.isFinite(rawScore) && rawScore > 0;
    if (!hasVal && !hasScore) continue;

    if (src === "imdb") {
      const outOf10 = hasVal && rawVal <= 10 ? rawVal : (hasScore ? rawScore / 10 : rawVal / 10);
      const norm = hasScore ? rawScore : outOf10 * 10;
      addSource(item, makeSource("imdb", `${outOf10.toFixed(1)} / 10`, norm, votes));
      addedAny = true;
    } else if (src === "tomatoes") {
      const norm = hasScore ? rawScore : rawVal;
      addSource(item, makeSource("rt", `${Math.round(norm)}%`, norm, votes));
      addedAny = true;
    } else if (src === "popcorn" || src === "tomatoesaudience") {
      const norm = hasScore ? rawScore : rawVal;
      addSource(item, makeSource("rtAudience", `${Math.round(norm)}%`, norm, votes));
      addedAny = true;
    } else if (src === "metacritic") {
      const norm = hasScore ? rawScore : rawVal;
      addSource(item, makeSource("metacritic", `${Math.round(norm)} / 100`, norm, votes));
      addedAny = true;
    } else if (src === "trakt") {
      const norm = hasScore ? rawScore : (rawVal <= 10 ? rawVal * 10 : rawVal);
      addSource(item, makeSource("trakt", `${Math.round(norm)}%`, norm, votes));
      addedAny = true;
    } else if (src === "letterboxd") {
      const outOf5 = hasVal && rawVal <= 5 ? rawVal : (hasScore ? rawScore / 20 : rawVal / 20);
      const norm = hasScore ? rawScore : outOf5 * 20;
      addSource(item, makeSource("letterboxd", `${outOf5.toFixed(1)} / 5`, norm, votes));
      addedAny = true;
    } else if (src === "tmdb") {
      const outOf10 = hasVal && rawVal <= 10 ? rawVal : (hasScore ? rawScore / 10 : rawVal / 10);
      const norm = hasScore ? rawScore : outOf10 * 10;
      addSource(item, makeSource("tmdb", `${outOf10.toFixed(1)} / 10`, norm, votes));
      addedAny = true;
    }
  }

  if (!item.overview && typeof entry.description === "string" && entry.description.trim()) {
    item.overview = entry.description.trim();
  }
  if (!item.ageRating && typeof entry.certification === "string" && entry.certification.trim()) {
    item.ageRating = entry.certification.trim();
  }
  if (!item.runtimeOrIssueCount && typeof entry.runtime === "number" && entry.runtime > 0) {
    const mins = Math.round(entry.runtime);
    item.runtimeOrIssueCount =
      item.mediaType === "TvSeries"
        ? `${mins} min / ep`
        : mins >= 60
        ? `${Math.floor(mins / 60)}h ${mins % 60}m`
        : `${mins}m`;
  }
  if (!item.posterUrl && typeof entry.poster === "string" && entry.poster.trim()) {
    item.posterUrl = upgradeToHttps(entry.poster);
  }
  return addedAny;
}

/**
 * Batch-enriches top Movie/TV matches via MDBList (IMDb, RT Critics, RT Audience / Popcornmeter,
 * Metacritic, Trakt, Letterboxd, TMDB) using at most 1 request per (provider, mediaType) bucket.
 */
async function enrichWithMdbList(candidates, env) {
  const apiKey = String(env.MDBLIST_API_KEY || "").trim();
  if (!apiKey || !candidates.length) return { count: 0, error: null };

  const tmdbMovieMap = new Map();
  const tmdbShowMap = new Map();
  const imdbMovieMap = new Map();
  const imdbShowMap = new Map();

  for (const item of candidates) {
    if (item.mediaType !== "Movie" && item.mediaType !== "TvSeries") continue;
    const isShow = item.mediaType === "TvSeries";
    if (item.tmdbId) {
      const targetMap = isShow ? tmdbShowMap : tmdbMovieMap;
      if (!targetMap.has(String(item.tmdbId))) targetMap.set(String(item.tmdbId), item);
    } else if (item.imdbId) {
      const targetMap = isShow ? imdbShowMap : imdbMovieMap;
      if (!targetMap.has(item.imdbId)) targetMap.set(item.imdbId, item);
    }
  }

  const encodedKey = encodeURIComponent(apiKey);
  const postBatch = (url, ids, matchByTmdb, itemMap) => {
    if (!ids.length) return Promise.resolve({ count: 0, error: null });
    return getJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
      timeoutMs: 8500,
    })
      .then((res) => {
        const entries = Array.isArray(res) ? res : res && typeof res === "object" ? [res] : [];
        let enriched = 0;
        for (const entry of entries) {
          if (!entry || typeof entry !== "object") continue;
          const idObj = entry.ids && typeof entry.ids === "object" ? entry.ids : {};
          const lookupKey = matchByTmdb
            ? String(idObj.tmdb ?? entry.tmdbid ?? "")
            : String(idObj.imdb ?? entry.imdbid ?? "");
          const target = lookupKey ? itemMap.get(lookupKey) : null;
          if (target && applyMdbListEntry(target, entry)) {
            enriched++;
          }
        }
        return { count: enriched, error: null };
      })
      .catch((err) => ({
        count: 0,
        error: String((err && err.message) || "provider_error").slice(0, 120),
      }));
  };

  const results = await Promise.all([
    postBatch(
      `https://api.mdblist.com/tmdb/movie/?apikey=${encodedKey}`,
      Array.from(tmdbMovieMap.keys()).map((id) => Number(id)),
      true,
      tmdbMovieMap
    ),
    postBatch(
      `https://api.mdblist.com/tmdb/show/?apikey=${encodedKey}`,
      Array.from(tmdbShowMap.keys()).map((id) => Number(id)),
      true,
      tmdbShowMap
    ),
    postBatch(
      `https://api.mdblist.com/imdb/movie/?apikey=${encodedKey}`,
      Array.from(imdbMovieMap.keys()),
      false,
      imdbMovieMap
    ),
    postBatch(
      `https://api.mdblist.com/imdb/show/?apikey=${encodedKey}`,
      Array.from(imdbShowMap.keys()),
      false,
      imdbShowMap
    ),
  ]);

  const count = results.reduce((sum, r) => sum + r.count, 0);
  const firstError = results.find((r) => r.error)?.error || null;
  return { count, error: count > 0 ? null : firstError };
}

async function searchTvMaze(q) {
  const data = await getJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
  const items = [];
  for (const entry of (Array.isArray(data) ? data : []).slice(0, 15)) {
    const show = entry && entry.show;
    if (!show || !show.name) continue;
    const sources = [];
    const avg = show.rating && show.rating.average;
    if (typeof avg === "number" && avg > 0) sources.push(makeSource("tvmaze", `${avg} / 10`, avg * 10, 0, show.url || "https://www.tvmaze.com"));
    items.push(
      baseItem({
        externalId: `tvmaze-${show.id}`,
        imdbId: show.externals && show.externals.imdb ? show.externals.imdb : undefined,
        title: show.name,
        mediaType: "TvSeries",
        releaseYear: toYear(show.premiered),
        overview: stripHtml(show.summary),
        posterUrl: (show.image && (show.image.original || show.image.medium)) || "",
        genres: Array.isArray(show.genres) ? show.genres : [],
        publisherOrStudio: (show.network && show.network.name) || (show.webChannel && show.webChannel.name) || "",
        runtimeOrIssueCount: show.averageRuntime || show.runtime ? `${show.averageRuntime || show.runtime} min / ep` : "",
        sources,
      })
    );
  }
  return items;
}

async function searchItunesMovies(q) {
  const data = await getJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=movie&entity=movie&limit=25`
  );
  const items = [];
  for (const r of data.results || []) {
    if (!r.trackName) continue;
    let runtime = "";
    if (r.trackTimeMillis > 0) {
      const mins = Math.floor(r.trackTimeMillis / 60000);
      runtime = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
    }
    items.push(
      baseItem({
        externalId: `movie-itunes-${r.trackId}`,
        title: r.trackName,
        mediaType: "Movie",
        releaseYear: toYear(r.releaseDate),
        overview: r.longDescription || r.shortDescription || "",
        posterUrl: r.artworkUrl100 ? upgradeToHttps(String(r.artworkUrl100).replace("/100x100bb", "/600x600bb")) : "",
        genres: r.primaryGenreName ? [r.primaryGenreName] : [],
        publisherOrStudio: r.collectionArtistName || "",
        creatorOrDirector: r.artistName || "",
        runtimeOrIssueCount: runtime,
        ageRating: r.contentAdvisoryRating || "",
      })
    );
  }
  return items;
}

const ANILIST_QUERY = `
query ($search: String) {
  manga: Page(page: 1, perPage: 12) {
    media(search: $search, type: MANGA, sort: SEARCH_MATCH, isAdult: false) {
      id idMal format status chapters volumes genres averageScore popularity
      title { romaji english }
      startDate { year }
      description(asHtml: false)
      coverImage { extraLarge large }
      bannerImage
      staff(perPage: 2, sort: RELEVANCE) { edges { node { name { full } } } }
    }
  }
  anime: Page(page: 1, perPage: 12) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
      id idMal format status episodes duration genres averageScore popularity
      title { romaji english }
      startDate { year }
      description(asHtml: false)
      coverImage { extraLarge large }
      bannerImage
      studios(isMain: true) { nodes { name } }
    }
  }
}`;

async function searchAniList(q) {
  const data = await getJson("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: ANILIST_QUERY, variables: { search: q } }),
  });
  const d = data && data.data;
  if (!d) throw new Error("AniList returned no data");
  const items = [];
  const build = (m, kind) => {
    const title = (m.title && (m.title.english || m.title.romaji)) || "";
    if (!title) return;
    const isManga = kind === "manga";
    const sources = [];
    if (m.averageScore > 0) {
      sources.push(makeSource("anilist", `${m.averageScore} / 100`, m.averageScore, m.popularity || 0, `https://anilist.co/${kind}/${m.id}`));
    }
    const author =
      isManga && m.staff && m.staff.edges && m.staff.edges[0] && m.staff.edges[0].node
        ? m.staff.edges[0].node.name.full
        : "";
    const studio = !isManga && m.studios && m.studios.nodes && m.studios.nodes[0] ? m.studios.nodes[0].name : "";
    items.push(
      baseItem({
        externalId: `anilist-${kind}-${m.id}`,
        malKey: m.idMal ? `${kind}:${m.idMal}` : undefined,
        title,
        mediaType: isManga ? "ComicBook" : m.format === "MOVIE" ? "Movie" : "TvSeries",
        releaseYear: (m.startDate && m.startDate.year) || 0,
        overview: stripHtml(m.description || ""),
        posterUrl: (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || "",
        backdropUrl: m.bannerImage || "",
        genres: [isManga ? "Manga" : "Anime", ...(m.genres || [])],
        publisherOrStudio: studio,
        creatorOrDirector: author,
        runtimeOrIssueCount: isManga
          ? m.chapters
            ? `${m.chapters} Chapters`
            : m.volumes
            ? `${m.volumes} Volumes`
            : ""
          : m.episodes
          ? `${m.episodes} Episodes`
          : "",
        sources,
      })
    );
  };
  for (const m of (d.manga && d.manga.media) || []) build(m, "manga");
  for (const m of (d.anime && d.anime.media) || []) build(m, "anime");
  return items;
}

async function searchJikanManga(q) {
  const data = await getJson(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(q)}&limit=15&sfw=true`);
  const items = [];
  for (const m of data.data || []) {
    const title = m.title_english || m.title;
    if (!title) continue;
    const sources = [];
    if (typeof m.score === "number" && m.score > 0) {
      sources.push(makeSource("mal", `${m.score} / 10`, m.score * 10, m.scored_by || 0, m.url || `https://myanimelist.net/manga/${m.mal_id}`));
    }
    const genreNames = [...(m.genres || []), ...(m.themes || [])].map((g) => g.name);
    items.push(
      baseItem({
        externalId: `comic-jikan-${m.mal_id}`,
        malKey: `manga:${m.mal_id}`,
        title,
        mediaType: "ComicBook",
        releaseYear: (m.published && m.published.prop && m.published.prop.from && m.published.prop.from.year) || 0,
        overview: m.synopsis || "",
        posterUrl: (m.images && m.images.jpg && (m.images.jpg.large_image_url || m.images.jpg.image_url)) || "",
        genres: ["Manga", ...genreNames],
        publisherOrStudio: m.serializations && m.serializations[0] ? m.serializations[0].name : "",
        creatorOrDirector: m.authors && m.authors[0] ? m.authors[0].name : "",
        runtimeOrIssueCount: m.chapters ? `${m.chapters} Chapters` : m.volumes ? `${m.volumes} Volumes` : "",
        sources,
      })
    );
  }
  return items;
}

async function searchComicVine(q, env) {
  const key = env.COMICVINE_API_KEY;
  const data = await getJson(
    `https://comicvine.gamespot.com/api/search/?api_key=${encodeURIComponent(key)}&format=json&resources=volume&limit=15&query=${encodeURIComponent(q)}&field_list=id,name,start_year,publisher,image,description,deck,count_of_issues`
  );
  if (data.status_code && data.status_code !== 1) throw new Error(`ComicVine: ${data.error || data.status_code}`);
  const items = [];
  for (const v of data.results || []) {
    if (!v.name) continue;
    items.push(
      baseItem({
        externalId: `comicvine-volume-${v.id}`,
        title: v.name,
        mediaType: "ComicBook",
        releaseYear: toYear(v.start_year),
        overview: v.deck || stripHtml(v.description || ""),
        posterUrl: (v.image && (v.image.super_url || v.image.original_url)) || "",
        genres: ["Comic Book"],
        publisherOrStudio: (v.publisher && v.publisher.name) || "",
        runtimeOrIssueCount: v.count_of_issues ? `${v.count_of_issues} Issues` : "",
      })
    );
  }
  return items;
}

async function searchHardcover(q, env) {
  const token = String(env.HARDCOVER_API_TOKEN).replace(/^Bearer\s+/i, "");
  const data = await getJson("https://api.hardcover.app/v1/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: `query Search($q: String!) { search(query: $q, query_type: "Book", per_page: 15, page: 1) { results } }`,
      variables: { q },
    }),
  });
  if (data.errors) throw new Error(`Hardcover: ${data.errors[0] && data.errors[0].message}`);
  let results = data.data && data.data.search && data.data.search.results;
  if (typeof results === "string") results = JSON.parse(results);
  const items = [];
  for (const hit of (results && results.hits) || []) {
    const doc = hit.document || {};
    if (!doc.title) continue;
    const genres = Array.isArray(doc.genres) ? doc.genres : [];
    const sources = [];
    if (typeof doc.rating === "number" && doc.rating > 0 && doc.ratings_count > 0) {
      const hcUrl = doc.slug ? `https://hardcover.app/books/${encodeURIComponent(doc.slug)}` : "https://hardcover.app";
      sources.push(makeSource("hardcover", `${doc.rating.toFixed(2)} / 5`, doc.rating * 20, doc.ratings_count, hcUrl));
    }
    items.push(
      baseItem({
        externalId: `hardcover-${doc.id}`,
        title: doc.title,
        mediaType: "ComicBook",
        yearLoose: true,
        releaseYear: doc.release_year || 0,
        overview: doc.description || "",
        posterUrl: (doc.image && doc.image.url) || "",
        genres: genres.length ? genres : ["Book"],
        creatorOrDirector: Array.isArray(doc.author_names) ? doc.author_names.slice(0, 2).join(", ") : "",
        runtimeOrIssueCount: doc.pages ? `${doc.pages} Pages` : "",
        sources,
      })
    );
  }
  return items;
}

async function searchGoogleBooks(q, env) {
  const keyPart = env.GOOGLE_BOOKS_API_KEY ? `&key=${encodeURIComponent(env.GOOGLE_BOOKS_API_KEY)}` : "";
  const data = await getJson(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20&printType=books&orderBy=relevance${keyPart}`
  );
  const items = [];
  for (const it of data.items || []) {
    const vi = it.volumeInfo;
    if (!vi || !vi.title) continue;
    const sources = [];
    if (typeof vi.averageRating === "number" && vi.ratingsCount > 0) {
      sources.push(makeSource("googleBooks", `${vi.averageRating.toFixed(1)} / 5`, vi.averageRating * 20, vi.ratingsCount, vi.infoLink || "https://books.google.com"));
    }
    const poster = vi.imageLinks && (vi.imageLinks.thumbnail || vi.imageLinks.smallThumbnail);
    items.push(
      baseItem({
        externalId: `googlebooks-${it.id}`,
        title: vi.title,
        mediaType: "ComicBook",
        yearLoose: true,
        releaseYear: toYear(vi.publishedDate),
        overview: stripHtml(vi.description || ""),
        posterUrl: poster ? upgradeToHttps(String(poster)).replace("&edge=curl", "") : "",
        genres: Array.isArray(vi.categories) && vi.categories.length ? vi.categories : ["Book"],
        publisherOrStudio: vi.publisher || "",
        creatorOrDirector: Array.isArray(vi.authors) ? vi.authors.slice(0, 2).join(", ") : "",
        runtimeOrIssueCount: vi.pageCount ? `${vi.pageCount} Pages` : "",
        ageRating: vi.maturityRating === "MATURE" ? "Mature" : "",
        sources,
      })
    );
  }
  return items;
}

async function searchAppleBooks(q) {
  const data = await getJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=ebook&entity=ebook&limit=20`
  );
  const items = [];
  for (const r of data.results || []) {
    if (!r.trackName) continue;
    const sources = [];
    if (typeof r.averageUserRating === "number" && r.averageUserRating > 0 && r.userRatingCount > 0) {
      sources.push(makeSource("appleBooks", `${r.averageUserRating.toFixed(1)} / 5`, r.averageUserRating * 20, r.userRatingCount, r.trackViewUrl || "https://books.apple.com"));
    }
    items.push(
      baseItem({
        externalId: `applebooks-${r.trackId}`,
        title: r.trackName,
        mediaType: "ComicBook",
        yearLoose: true,
        releaseYear: toYear(r.releaseDate),
        overview: stripHtml(r.description || ""),
        posterUrl: r.artworkUrl100 ? upgradeToHttps(String(r.artworkUrl100).replace("/100x100bb", "/600x600bb")) : "",
        genres: Array.isArray(r.genres) && r.genres.length ? r.genres : ["Book"],
        creatorOrDirector: r.artistName || "",
        sources,
      })
    );
  }
  return items;
}

async function searchOpenLibrary(q) {
  const fields = "key,title,author_name,first_publish_year,cover_i,subject,edition_count,publisher,ratings_average,ratings_count";
  const data = await getJson(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=25&fields=${fields}`
  );
  const items = [];
  for (const doc of data.docs || []) {
    if (!doc.title) continue;
    const key = String(doc.key || "").replace("/works/", "");
    const sources = [];
    if (typeof doc.ratings_average === "number" && doc.ratings_average > 0 && doc.ratings_count > 0) {
      const olUrl = doc.key ? `https://openlibrary.org${doc.key}` : "https://openlibrary.org";
      sources.push(makeSource("openlibrary", `${doc.ratings_average.toFixed(2)} / 5`, doc.ratings_average * 20, doc.ratings_count, olUrl));
    }
    const subjects = Array.isArray(doc.subject) ? doc.subject.slice(0, 6) : [];
    items.push(
      baseItem({
        externalId: `book-ol-${key}`,
        title: doc.title,
        mediaType: "ComicBook",
        yearLoose: true,
        releaseYear: doc.first_publish_year || 0,
        posterUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : "",
        genres: subjects.length ? subjects : ["Book"],
        publisherOrStudio: Array.isArray(doc.publisher) ? doc.publisher[0] || "" : "",
        creatorOrDirector: Array.isArray(doc.author_name) ? doc.author_name.slice(0, 2).join(", ") : "",
        runtimeOrIssueCount: doc.edition_count ? `${doc.edition_count} Editions` : "",
        sources,
      })
    );
  }
  return items;
}

// ---------------------------------------------------------------------------
// Merge, rank, finalise
// ---------------------------------------------------------------------------

function addSource(item, source) {
  const existing = item.sources.find((s) => s.sourceId === source.sourceId);
  if (!existing) {
    item.sources.push(source);
  } else if (source.voteCount > existing.voteCount) {
    existing.sourceId = source.sourceId;
    existing.sourceName = source.sourceName;
    existing.category = source.category;
    existing.rawScoreDisplay = source.rawScoreDisplay;
    existing.normalizedScore = source.normalizedScore;
    existing.voteCount = source.voteCount;
    existing.defaultWeight = source.defaultWeight;
    existing.accentColor = source.accentColor;
    if (source.sourceUrl) existing.sourceUrl = source.sourceUrl;
  } else if (!existing.sourceUrl && source.sourceUrl) {
    existing.sourceUrl = source.sourceUrl;
  }
}

function yearsCompatible(a, b) {
  if (!a.releaseYear || !b.releaseYear) return true;
  if (a.yearLoose || b.yearLoose) return true;
  return Math.abs(a.releaseYear - b.releaseYear) <= 1;
}

function mergeInto(target, inc) {
  for (const s of inc.sources) addSource(target, s);
  if ((inc.overview || "").length > (target.overview || "").length) target.overview = inc.overview;
  if (!target.posterUrl) target.posterUrl = inc.posterUrl;
  if (!target.backdropUrl) target.backdropUrl = inc.backdropUrl;
  for (const g of inc.genres || []) {
    if (target.genres.length < 8 && !target.genres.some((x) => x.toLowerCase() === g.toLowerCase())) target.genres.push(g);
  }
  if (!target.publisherOrStudio && inc.publisherOrStudio) target.publisherOrStudio = inc.publisherOrStudio;
  if (!target.creatorOrDirector && inc.creatorOrDirector) target.creatorOrDirector = inc.creatorOrDirector;
  if (!target.runtimeOrIssueCount && inc.runtimeOrIssueCount) target.runtimeOrIssueCount = inc.runtimeOrIssueCount;
  if (!target.ageRating && inc.ageRating) target.ageRating = inc.ageRating;
  if (!target.imdbId && inc.imdbId) target.imdbId = inc.imdbId;
  if (!target.tmdbId && inc.tmdbId) target.tmdbId = inc.tmdbId;
  if (!target.malKey && inc.malKey) target.malKey = inc.malKey;
  if (!target.releaseYear && inc.releaseYear) target.releaseYear = inc.releaseYear;
  if (target.yearLoose && !inc.yearLoose) target.yearLoose = false;
}

class Merger {
  constructor() {
    this.items = [];
    this.byTitle = new Map();
    this.byId = new Map();
  }

  idKeys(item) {
    const keys = [];
    if (item.imdbId) keys.push(`imdb:${item.imdbId}`);
    if (item.tmdbId) keys.push(`tmdb:${item.mediaType}:${item.tmdbId}`);
    if (item.malKey) keys.push(`mal:${item.malKey}`);
    return keys;
  }

  add(item) {
    if (!item || !item.title) return;
    const tk = titleKey(item.title);
    if (!tk) return;
    let target = null;
    for (const k of this.idKeys(item)) {
      if (this.byId.has(k)) {
        target = this.byId.get(k);
        break;
      }
    }
    const titleBucket = `${tk}|${item.mediaType}`;
    if (!target) {
      target = (this.byTitle.get(titleBucket) || []).find((c) => yearsCompatible(c, item)) || null;
    }
    if (target) {
      mergeInto(target, item);
    } else {
      target = item;
      this.items.push(item);
      if (!this.byTitle.has(titleBucket)) this.byTitle.set(titleBucket, []);
      this.byTitle.get(titleBucket).push(item);
    }
    for (const k of this.idKeys(target)) this.byId.set(k, target);
  }
}

function relevance(item, normalizedQuery, tokens) {
  const t = titleKey(item.title);
  if (t === normalizedQuery) return 1000;
  if (t.startsWith(normalizedQuery)) return 700;
  if (t.includes(normalizedQuery)) return 450;
  const meta = `${item.creatorOrDirector} ${item.publisherOrStudio} ${item.genres.join(" ")}`.toLowerCase();
  let score = 0;
  let inTitle = 0;
  for (const tok of tokens) {
    if (t.includes(tok)) {
      score += 120;
      inTitle++;
    } else if (meta.includes(tok)) score += 60;
  }
  if (tokens.length > 1 && inTitle === tokens.length) score += 200;
  return score;
}

function totalVotes(item) {
  return item.sources.reduce((a, s) => a + (s.voteCount || 0), 0);
}

function finalizeItem(item, calculateCumulativeSummary) {
  const {
    sources, imdbId, tmdbId, malKey, yearLoose, // internal merge helpers, not part of the public item
    ...rest
  } = item;
  const poster = rest.posterUrl || PLACEHOLDER_POSTER;
  const defaultGenres = rest.mediaType === "TvSeries" ? ["TV Series"] : rest.mediaType === "Movie" ? ["Movie"] : ["Book"];
  return {
    id: rest.externalId,
    ...rest,
    posterUrl: poster,
    backdropUrl: rest.backdropUrl || (rest.posterUrl ? poster : PLACEHOLDER_BACKDROP),
    genres: rest.genres.length ? rest.genres.slice(0, 8) : defaultGenres,
    publisherOrStudio: rest.publisherOrStudio || "Not listed",
    creatorOrDirector: rest.creatorOrDirector || "Not listed",
    runtimeOrIssueCount: rest.runtimeOrIssueCount || "N/A",
    ageRating: rest.ageRating || "NR",
    overview: rest.overview || "No description is available from the connected sources yet.",
    cumulativeRating: calculateCumulativeSummary(sources),
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
}

function seededFallback(seeded, lowerQuery, tokens) {
  return (seeded || []).filter((s) => {
    const hay = `${s.title} ${s.publisherOrStudio} ${s.creatorOrDirector} ${s.overview} ${(s.genres || []).join(" ")}`.toLowerCase();
    return hay.includes(lowerQuery) || (tokens.length > 0 && tokens.every((t) => hay.includes(t)));
  });
}

/**
 * @returns {Promise<{items: object[], providers: Record<string, object>, fallback: boolean}>}
 */
async function executeLiveSearch(query, { env = process.env, calculateCumulativeSummary, seededCatalog = [] } = {}) {
  const cleanQuery = String(query || "").trim();
  if (cleanQuery.length < 2) return { items: [], providers: {}, fallback: false };
  const lowerQuery = cleanQuery.toLowerCase();
  const cached = cacheGet(lowerQuery);
  if (cached) return cached;

  const normalizedQuery = titleKey(cleanQuery) || lowerQuery;
  const tokens = normalizedQuery.split(" ").filter((t) => t.length >= 2);

  // Order = merge priority: earlier providers win ids / primary metadata.
  const providers = [
    { name: "tmdb", needs: "TMDB_API_KEY", run: () => searchTmdb(cleanQuery, env) },
    { name: "omdb", needs: "OMDB_API_KEY", run: () => searchOmdb(cleanQuery, env) },
    { name: "tvmaze", run: () => searchTvMaze(cleanQuery) },
    { name: "itunes_movies", run: () => searchItunesMovies(cleanQuery) },
    { name: "anilist", run: () => searchAniList(cleanQuery) },
    { name: "jikan", run: () => searchJikanManga(cleanQuery) },
    { name: "comicvine", needs: "COMICVINE_API_KEY", run: () => searchComicVine(cleanQuery, env) },
    { name: "hardcover", needs: "HARDCOVER_API_TOKEN", run: () => searchHardcover(cleanQuery, env) },
    { name: "google_books", run: () => searchGoogleBooks(cleanQuery, env) },
    { name: "apple_books", run: () => searchAppleBooks(cleanQuery) },
    { name: "open_library", run: () => searchOpenLibrary(cleanQuery) },
  ];

  const diagnostics = {};
  const settled = await Promise.all(
    providers.map(async (p) => {
      if (p.needs && !env[p.needs]) {
        diagnostics[p.name] = { configured: false, count: 0 };
        return [];
      }
      try {
        const items = await p.run();
        diagnostics[p.name] = { configured: true, count: items.length };
        return items;
      } catch (err) {
        diagnostics[p.name] = { configured: true, count: 0, error: String((err && err.message) || err).slice(0, 120) };
        return [];
      }
    })
  );

  const merger = new Merger();
  for (const list of settled) for (const item of list) merger.add(item);
  let merged = merger.items;

  const rank = (it) => relevance(it, normalizedQuery, tokens);
  const sortItems = (arr) =>
    arr.sort((a, b) => rank(b) - rank(a) || totalVotes(b) - totalVotes(a));
  sortItems(merged);

  // Batch-enrich top screen matches via MDBList (IMDb, RT Critics, RT Audience, Metacritic, Trakt, Letterboxd).
  if (env.MDBLIST_API_KEY) {
    const mdbCandidates = merged
      .filter((i) => (i.mediaType === "Movie" || i.mediaType === "TvSeries") && (i.tmdbId || i.imdbId))
      .slice(0, 10);
    try {
      const mdbRes = await enrichWithMdbList(mdbCandidates, env);
      diagnostics.mdblist = mdbRes.error
        ? { configured: true, count: mdbRes.count, error: mdbRes.error }
        : { configured: true, count: mdbRes.count };
    } catch (err) {
      diagnostics.mdblist = {
        configured: true,
        count: 0,
        error: String((err && err.message) || err).slice(0, 120),
      };
    }
    sortItems(merged);
  } else {
    diagnostics.mdblist = { configured: false, count: 0 };
  }

  // Real IMDb / Rotten Tomatoes / Metacritic for the best screen matches still missing them.
  if (env.OMDB_API_KEY) {
    const candidates = merged
      .filter(
        (i) =>
          (i.mediaType === "Movie" || i.mediaType === "TvSeries") &&
          (!i.sources.some((s) => s.sourceId === "imdb") ||
            !i.sources.some((s) => s.sourceId === "rotten_tomatoes_critics") ||
            !i.sources.some((s) => s.sourceId === "metacritic"))
      )
      .slice(0, 10);
    await Promise.all(
      candidates.map((c) =>
        enrichWithOmdb(c, env).catch(() => {
          /* enrichment is best effort */
        })
      )
    );
    sortItems(merged);
  }

  merged = merged.slice(0, MAX_RESULTS);
  let items = merged.map((i) => finalizeItem(i, calculateCumulativeSummary));
  let fallback = false;
  if (items.length === 0) {
    items = seededFallback(seededCatalog, lowerQuery, tokens);
    fallback = items.length > 0;
  }

  const result = { items, providers: diagnostics, fallback };
  const mdbDegraded = Boolean(diagnostics.mdblist && diagnostics.mdblist.configured && diagnostics.mdblist.error);
  if (items.length > 0 && !fallback && !mdbDegraded) cacheSet(lowerQuery, result);
  return result;
}

function _clearCacheForTests() {
  cache.clear();
}

module.exports = {
  executeLiveSearch,
  tmdbToItem,
  finalizeItem,
  titleKey,
  _clearCacheForTests,
};
