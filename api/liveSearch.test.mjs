import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { executeLiveSearch, _clearCacheForTests } = require("./_liveSearch.js");

// Minimal stand-in for the gateway's calculator: average of normalised scores.
const calc = (sources) => ({
  finalCumulativeAverage: sources.length
    ? sources.reduce((a, s) => a + s.normalizedScore, 0) / sources.length
    : 0,
  activeSourceCount: sources.length,
  sources,
});

const json = (body, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) });

function routeFetch(routes) {
  return vi.fn((url) => {
    const u = String(url);
    for (const [needle, handler] of routes) {
      if (u.includes(needle)) return typeof handler === "function" ? handler(u) : json(handler);
    }
    return json({}, false, 404);
  });
}

describe("executeLiveSearch", () => {
  beforeEach(() => _clearCacheForTests());
  afterEach(() => vi.unstubAllGlobals());

  it("merges TMDB + OMDb data and only exposes real source scores", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch([
        [
          "themoviedb.org",
          {
            results: [
              { id: 155, media_type: "movie", title: "The Dark Knight", release_date: "2008-07-16", vote_average: 8.5, vote_count: 32000, genre_ids: [18, 28], poster_path: "/p.jpg" },
              { id: 1, media_type: "person", name: "Someone" },
            ],
          },
        ],
        ["omdbapi.com/?apikey=k&s=", { Response: "True", Search: [{ Title: "The Dark Knight", Year: "2008", imdbID: "tt0468569", Type: "movie", Poster: "N/A" }] }],
        [
          "omdbapi.com/?apikey=k&i=tt0468569",
          { Response: "True", Title: "The Dark Knight", Year: "2008", imdbID: "tt0468569", imdbRating: "9.0", imdbVotes: "2,900,000", Metascore: "84", Ratings: [{ Source: "Rotten Tomatoes", Value: "94%" }], Director: "Christopher Nolan" },
        ],
      ])
    );
    const { items, providers } = await executeLiveSearch("the dark knight", {
      env: { TMDB_API_KEY: "k", OMDB_API_KEY: "k" },
      calculateCumulativeSummary: calc,
    });

    const knight = items.filter((i) => i.title === "The Dark Knight");
    expect(knight).toHaveLength(1);
    const ids = knight[0].cumulativeRating.sources.map((s) => s.sourceId).sort();
    expect(ids).toEqual(["imdb", "metacritic", "rotten_tomatoes_critics", "tmdb"]);
    expect(knight[0].creatorOrDirector).toBe("Christopher Nolan");
    expect(knight[0].genres).toContain("Action");
    expect(providers.tmdb.count).toBe(2);
    expect(providers.comicvine.configured).toBe(false);
    // internal merge helpers must not leak
    expect(knight[0].imdbId).toBeUndefined();
    expect(knight[0].sources).toBeUndefined();
  });

  it("never synthesises ratings when keys are missing; unrated items stay unrated", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch([
        ["itunes.apple.com/search?term=pirates&media=movie", { results: [{ trackId: 9, trackName: "Pirates of the Caribbean", releaseDate: "2003-07-09T07:00:00Z", primaryGenreName: "Adventure", artworkUrl100: "http://x/100x100bb.jpg" }] }],
      ])
    );
    const { items, providers } = await executeLiveSearch("pirates", {
      env: {},
      calculateCumulativeSummary: calc,
    });
    expect(items).toHaveLength(1);
    expect(items[0].cumulativeRating.activeSourceCount).toBe(0);
    expect(items[0].posterUrl).toBe("https://x/600x600bb.jpg");
    expect(providers.tmdb.configured).toBe(false);
    expect(providers.tvmaze.error).toBeDefined(); // 404 from the stub is reported, not hidden
  });

  it("merges AniList and Jikan manga through the shared MAL id and keeps both real scores", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch([
        [
          "graphql.anilist.co",
          {
            data: {
              manga: { media: [{ id: 30002, idMal: 2, title: { romaji: "Berserk", english: "Berserk" }, startDate: { year: 1989 }, averageScore: 94, popularity: 200000, genres: ["Action"], coverImage: { large: "https://s4.anilist.co/c.jpg" } }] },
              anime: { media: [] },
            },
          },
        ],
        ["api.jikan.moe", { data: [{ mal_id: 2, title: "Berserk", score: 9.47, scored_by: 330000, published: { prop: { from: { year: 1989 } } }, genres: [{ name: "Adventure" }], themes: [], authors: [{ name: "Miura, Kentarou" }] }] }],
      ])
    );
    const { items } = await executeLiveSearch("berserk", { env: {}, calculateCumulativeSummary: calc });
    const berserk = items.filter((i) => i.title === "Berserk");
    expect(berserk).toHaveLength(1);
    expect(berserk[0].mediaType).toBe("ComicBook");
    expect(berserk[0].cumulativeRating.sources.map((s) => s.sourceId).sort()).toEqual(["anilist", "myanimelist"]);
    expect(berserk[0].creatorOrDirector).toContain("Miura");
  });

  it("does not attach OMDb ratings to a different title", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch([
        ["itunes.apple.com/search?term=dune&media=movie", { results: [{ trackId: 1, trackName: "Dune", releaseDate: "2021-10-22T00:00:00Z" }] }],
        ["omdbapi.com/?apikey=k&s=", { Response: "False" }],
        ["omdbapi.com/?apikey=k&t=Dune", { Response: "True", Title: "Dune: Part Two", Year: "2024", imdbID: "tt15239678", imdbRating: "8.5", imdbVotes: "500,000" }],
      ])
    );
    const { items } = await executeLiveSearch("dune", {
      env: { OMDB_API_KEY: "k" },
      calculateCumulativeSummary: calc,
    });
    const dune = items.find((i) => i.title === "Dune");
    expect(dune.cumulativeRating.activeSourceCount).toBe(0);
  });

  it("uses the seeded catalog only when every live provider returns nothing", async () => {
    vi.stubGlobal("fetch", routeFetch([]));
    const seeded = [{ title: "Watchmen", publisherOrStudio: "DC", creatorOrDirector: "Alan Moore", overview: "", genres: [] }];
    const { items, fallback } = await executeLiveSearch("watchmen", {
      env: {},
      calculateCumulativeSummary: calc,
      seededCatalog: seeded,
    });
    expect(fallback).toBe(true);
    expect(items[0].title).toBe("Watchmen");
  });

  it("batch-enriches TV series via MDBList with RT Critics, RT Audience, Metacritic, IMDb, and Trakt", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch([
        [
          "themoviedb.org",
          {
            results: [
              { id: 246, media_type: "tv", name: "Avatar: The Last Airbender", first_air_date: "2005-02-21", vote_average: 8.7, vote_count: 4200, genre_ids: [16, 10759], poster_path: "/atla.jpg" },
            ],
          },
        ],
        [
          "api.tvmaze.com/search/shows",
          [
            { show: { id: 555, name: "Avatar: The Last Airbender", premiered: "2005-02-21", externals: { imdb: "tt0417299" }, rating: { average: 8.9 }, genres: ["Animation"] } },
          ],
        ],
        [
          "api.mdblist.com/tmdb/show/?apikey=mdb",
          [
            {
              title: "Avatar: The Last Airbender",
              year: 2005,
              ids: { tmdb: 246, imdb: "tt0417299" },
              certification: "TV-Y7-FV",
              ratings: [
                { source: "imdb", value: 9.3, score: 93, votes: 390000 },
                { source: "tomatoes", value: 100, score: 100, votes: 68 },
                { source: "popcorn", value: 98, score: 98, votes: 42500 },
                { source: "metacritic", value: 90, score: 90, votes: 28 },
                { source: "trakt", value: 92, score: 92, votes: 54000 },
              ],
            },
          ],
        ],
      ])
    );

    const { items, providers } = await executeLiveSearch("avatar the last airbender", {
      env: { TMDB_API_KEY: "k", MDBLIST_API_KEY: "mdb" },
      calculateCumulativeSummary: calc,
    });

    const avatar = items.find((i) => i.title === "Avatar: The Last Airbender");
    expect(avatar).toBeDefined();
    expect(avatar.tmdbId).toBeUndefined();
    expect(avatar.ageRating).toBe("TV-Y7-FV");
    const ids = avatar.cumulativeRating.sources.map((s) => s.sourceId).sort();
    expect(ids).toEqual([
      "imdb",
      "metacritic",
      "rotten_tomatoes_audience",
      "rotten_tomatoes_critics",
      "tmdb",
      "trakt",
      "tvmaze",
    ]);
    expect(providers.mdblist).toEqual({ configured: true, count: 1 });
  });

  it("merges PC/Steam, RAWG, and Mobile App Store game ratings and parses BoardGameGeek tabletop games", async () => {
    const text = (body, ok = true, status = 200) =>
      Promise.resolve({ ok, status, text: () => Promise.resolve(body) });

    vi.stubGlobal(
      "fetch",
      routeFetch([
        [
          "cheapshark.com/api/1.0/deals",
          [
            {
              title: "Stardew Valley",
              gameID: "147800",
              steamAppID: "413150",
              steamRatingPercent: "98",
              steamRatingCount: "680000",
              metacriticScore: "89",
              metacriticLink: "/game/pc/stardew-valley",
              releaseDate: 1456444800,
              thumb: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/413150/header.jpg",
            },
          ],
        ],
        [
          "api.rawg.io/api/games",
          {
            results: [
              {
                id: 654,
                slug: "stardew-valley",
                name: "Stardew Valley",
                released: "2016-02-26",
                rating: 4.41,
                ratings_count: 3500,
                metacritic: 89,
                background_image: "https://media.rawg.io/media/games/stardew.jpg",
                genres: [{ name: "RPG" }, { name: "Indie" }],
                platforms: [{ platform: { name: "PC" } }, { platform: { name: "iOS" } }],
                esrb_rating: { name: "Everyone 10+" },
              },
            ],
          },
        ],
        [
          "itunes.apple.com/search?term=stardew&media=software",
          {
            results: [
              {
                trackId: 1406710800,
                trackName: "Stardew Valley",
                primaryGenreName: "Games",
                genreIds: ["6014", "7014"],
                genres: ["Games", "Role Playing"],
                averageUserRating: 4.8,
                userRatingCount: 215000,
                releaseDate: "2018-10-24T07:00:00Z",
                artistName: "ConcernedApe",
                artworkUrl512: "https://is1-ssl.mzstatic.com/image/thumb/stardew/512x512bb.jpg",
                trackViewUrl: "https://apps.apple.com/us/app/stardew-valley/id1406710800",
                contentAdvisoryRating: "12+",
              },
              {
                trackId: 99999,
                trackName: "Stardew Guide Utility",
                primaryGenreName: "Utilities",
                genreIds: ["6002"],
                averageUserRating: 4.1,
                userRatingCount: 50,
              },
            ],
          },
        ],
        [
          "boardgamegeek.com/xmlapi2/search",
          () => text(`<items><item type="boardgame" id="332290"><name type="primary" value="Stardew Valley: The Board Game"/></item></items>`),
        ],
        [
          "boardgamegeek.com/xmlapi2/thing",
          () =>
            text(
              `<items><item type="boardgame" id="332290"><name type="primary" value="Stardew Valley: The Board Game"/><yearpublished value="2021"/><minplayers value="1"/><maxplayers value="4"/><image>https://cf.geekdo-images.com/svbg.jpg</image><statistics><ratings><usersrated value="9800"/><average value="7.6"/></ratings></statistics></item></items>`
            ),
        ],
      ])
    );

    const { items, providers } = await executeLiveSearch("stardew", {
      env: { RAWG_API_KEY: "rawg_k", BGG_API_TOKEN: "bgg_tok" },
      calculateCumulativeSummary: calc,
    });

    const stardew = items.find((i) => i.title === "Stardew Valley");
    expect(stardew).toBeDefined();
    expect(stardew.mediaType).toBe("Game");
    expect(stardew.cumulativeRating.sources.map((s) => s.sourceId).sort()).toEqual([
      "apple_app_store",
      "metacritic",
      "rawg",
      "steam",
    ]);
    // Non-game Utilities app must be filtered out
    expect(items.find((i) => i.title === "Stardew Guide Utility")).toBeUndefined();

    // Board game parsed from BGG XML API2
    const boardGame = items.find((i) => i.title === "Stardew Valley: The Board Game");
    expect(boardGame).toBeDefined();
    expect(boardGame.mediaType).toBe("Game");
    expect(boardGame.cumulativeRating.sources.map((s) => s.sourceId)).toEqual(["bgg"]);
    expect(providers.rawg.configured).toBe(true);
    expect(providers.cheapshark_games.count).toBe(1);
    expect(providers.apple_app_store_games.count).toBe(1);
    expect(providers.boardgamegeek.count).toBe(1);
  });
});
