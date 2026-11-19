using System.Collections.Concurrent;
using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ComicTraffic.Api.Domain.Entities;
using ComicTraffic.Api.Infrastructure.Services;
using Microsoft.AspNetCore.WebUtilities;

namespace ComicTraffic.Api.Application.Features.Media;

/// <summary>
/// Universal live search across movies, TV, anime, manga, comics, books and literature.
///
/// Every rating returned is published by the provider it is attributed to; nothing is synthesised.
/// Items known to several providers are merged (IMDb id, MAL id, or title + type + year) so the
/// cumulative score combines every real source. Providers that need a key are skipped when it is absent.
///
/// Keys (env var or ExternalApis:* config): TMDB_API_KEY, OMDB_API_KEY, COMICVINE_API_KEY,
/// GOOGLE_BOOKS_API_KEY, HARDCOVER_API_TOKEN.
/// </summary>
public sealed class LiveMediaSearchService
{
    private const string PlaceholderPoster = "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=900&q=80";
    private const string PlaceholderBackdrop = "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=1600&q=80";
    private const string UserAgent = "ComicTraffic/1.0 (+https://comictraffic.com)";
    private const int MaxResults = 60;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan ProviderTimeout = TimeSpan.FromSeconds(5.5);

    private static readonly Dictionary<int, string> TmdbGenres = new()
    {
        [28] = "Action", [12] = "Adventure", [16] = "Animation", [35] = "Comedy", [80] = "Crime", [99] = "Documentary",
        [18] = "Drama", [10751] = "Family", [14] = "Fantasy", [36] = "History", [27] = "Horror", [10402] = "Music",
        [9648] = "Mystery", [10749] = "Romance", [878] = "Sci-Fi", [10770] = "TV Movie", [53] = "Thriller",
        [10752] = "War", [37] = "Western", [10759] = "Action & Adventure", [10762] = "Kids", [10763] = "News",
        [10764] = "Reality", [10765] = "Sci-Fi & Fantasy", [10766] = "Soap", [10767] = "Talk", [10768] = "War & Politics"
    };

    private sealed record SourceDef(string Id, string Name, string Category, double Weight, string Color);

    private static readonly Dictionary<string, SourceDef> Defs = new()
    {
        ["tmdb"] = new("tmdb", "TMDB", "Audience", 1.0, "#01b4e4"),
        ["imdb"] = new("imdb", "IMDb (OMDb)", "Audience", 1.25, "#f5c518"),
        ["rt"] = new("rotten_tomatoes_critics", "Rotten Tomatoes (Critics)", "Critic", 1.2, "#fa320a"),
        ["metacritic"] = new("metacritic", "Metacritic", "Critic", 1.2, "#ffcc33"),
        ["tvmaze"] = new("tvmaze", "TVMaze API", "Audience", 0.95, "#3c948b"),
        ["anilist"] = new("anilist", "AniList", "ComicCommunity", 1.2, "#02a9ff"),
        ["mal"] = new("myanimelist", "MyAnimeList", "ComicCommunity", 1.2, "#2e51a2"),
        ["openlibrary"] = new("openlibrary", "Open Library", "Audience", 1.0, "#059669"),
        ["googleBooks"] = new("google_books", "Google Books", "Audience", 1.0, "#4285f4"),
        ["hardcover"] = new("hardcover", "Hardcover", "Audience", 1.25, "#7c3aed"),
        ["appleBooks"] = new("apple_books", "Apple Books", "Audience", 1.0, "#9ca3af")
    };

    public sealed class LiveItem
    {
        public string ExternalId = "";
        public string Title = "";
        public string MediaType = "Movie";
        public int Year;
        public string Overview = "";
        public string PosterUrl = "";
        public string BackdropUrl = "";
        public List<string> Genres = new();
        public string Publisher = "";
        public string Creator = "";
        public string Runtime = "";
        public string AgeRating = "";
        public List<ExternalRatingSource> Sources = new();
        public string? ImdbId;
        public string? MalKey;
        public bool YearLoose;
    }

    public sealed record ProviderDiagnostic(bool Configured, int Count, string? Error);

    public sealed record SearchResult(List<MediaItemDto> Items, Dictionary<string, ProviderDiagnostic> Providers);

    private readonly HttpClient _http;
    private readonly Func<string, string?> _key;
    private readonly ICumulativeRatingCalculator _calculator;
    private readonly ConcurrentDictionary<string, (DateTime At, SearchResult Result)> _cache = new();

    public LiveMediaSearchService(HttpClient http, Func<string, string?> keyResolver, ICumulativeRatingCalculator calculator)
    {
        _http = http;
        _key = keyResolver;
        _calculator = calculator;
    }

    // ------------------------------------------------------------------ helpers

    private static JsonElement? P(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind != JsonValueKind.Null ? v : null;

    private static string S(JsonElement e, string name) => P(e, name) switch
    {
        { ValueKind: JsonValueKind.String } s => s.GetString() ?? "",
        { ValueKind: JsonValueKind.Number } n => n.ToString(),
        _ => ""
    };

    private static double D(JsonElement e, string name) =>
        P(e, name) is { ValueKind: JsonValueKind.Number } n ? n.GetDouble() : 0;

    private static IEnumerable<JsonElement> A(JsonElement e, string name) =>
        P(e, name) is { ValueKind: JsonValueKind.Array } a ? a.EnumerateArray() : Enumerable.Empty<JsonElement>();

    private static JsonElement? O(JsonElement e, string name) =>
        P(e, name) is { ValueKind: JsonValueKind.Object } o ? o : null;

    public static ExternalRatingSource MakeSource(string key, string raw, double normalized, int votes)
    {
        var d = Defs[key];
        return new ExternalRatingSource
        {
            SourceId = d.Id,
            SourceName = d.Name,
            Category = d.Category,
            RawScoreDisplay = raw,
            NormalizedScore = Math.Round(Math.Clamp(normalized, 0, 100), 1),
            VoteCount = Math.Max(0, votes),
            DefaultWeight = d.Weight,
            AccentColor = d.Color
        };
    }

    private static readonly HashSet<string> AllowedProviderHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "api.themoviedb.org",
        "www.omdbapi.com",
        "api.tvmaze.com",
        "itunes.apple.com",
        "graphql.anilist.co",
        "api.jikan.moe",
        "comicvine.gamespot.com",
        "api.hardcover.app",
        "www.googleapis.com",
        "openlibrary.org"
    };

    public static string TitleKey(string? title)
    {
        if (string.IsNullOrWhiteSpace(title)) return "";
        var sb = new StringBuilder(title.Length);
        bool prevSpace = true;
        foreach (char rawChar in title.Normalize(NormalizationForm.FormKD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(rawChar) == UnicodeCategory.NonSpacingMark) continue;
            if (rawChar == '&')
            {
                if (!prevSpace) sb.Append(' ');
                sb.Append("and ");
                prevSpace = true;
                continue;
            }
            char c = char.ToLowerInvariant(rawChar);
            if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'))
            {
                sb.Append(c);
                prevSpace = false;
            }
            else if (!prevSpace)
            {
                sb.Append(' ');
                prevSpace = true;
            }
        }
        string s = sb.ToString().Trim();
        if (s.StartsWith("the ", StringComparison.Ordinal)) return s[4..];
        if (s.StartsWith("an ", StringComparison.Ordinal)) return s[3..];
        if (s.StartsWith("a ", StringComparison.Ordinal)) return s[2..];
        return s;
    }

    private static int ToYear(string? value)
    {
        if (string.IsNullOrEmpty(value)) return 0;
        int run = 0;
        for (int i = 0; i < value.Length; i++)
        {
            if (value[i] >= '0' && value[i] <= '9')
            {
                run++;
                if (run == 4)
                {
                    int y = int.Parse(value.AsSpan(i - 3, 4), CultureInfo.InvariantCulture);
                    if (y is >= 1000 and <= 2100) return y;
                    run = 0;
                }
            }
            else
            {
                run = 0;
            }
        }
        return 0;
    }

    private enum ProviderEndpoint
    {
        TmdbSearchMulti,
        TmdbTopRated,
        TmdbNetflixOriginals,
        TmdbTrending,
        Omdb,
        TvMazeSearch,
        ItunesSearch,
        AniListGraphQl,
        JikanManga,
        ComicVineSearch,
        HardcoverGraphQl,
        GoogleBooksVolumes,
        OpenLibrarySearch
    }

    private static (string BaseUrl, string Host, string Path) ResolveEndpoint(ProviderEndpoint endpoint) => endpoint switch
    {
        ProviderEndpoint.TmdbSearchMulti => ("https://api.themoviedb.org/3/search/multi", "api.themoviedb.org", "/3/search/multi"),
        ProviderEndpoint.TmdbTopRated => ("https://api.themoviedb.org/3/movie/top_rated", "api.themoviedb.org", "/3/movie/top_rated"),
        ProviderEndpoint.TmdbNetflixOriginals => ("https://api.themoviedb.org/3/discover/tv", "api.themoviedb.org", "/3/discover/tv"),
        ProviderEndpoint.TmdbTrending => ("https://api.themoviedb.org/3/trending/all/week", "api.themoviedb.org", "/3/trending/all/week"),
        ProviderEndpoint.Omdb => ("https://www.omdbapi.com/", "www.omdbapi.com", "/"),
        ProviderEndpoint.TvMazeSearch => ("https://api.tvmaze.com/search/shows", "api.tvmaze.com", "/search/shows"),
        ProviderEndpoint.ItunesSearch => ("https://itunes.apple.com/search", "itunes.apple.com", "/search"),
        ProviderEndpoint.AniListGraphQl => ("https://graphql.anilist.co/", "graphql.anilist.co", "/"),
        ProviderEndpoint.JikanManga => ("https://api.jikan.moe/v4/manga", "api.jikan.moe", "/v4/manga"),
        ProviderEndpoint.ComicVineSearch => ("https://comicvine.gamespot.com/api/search/", "comicvine.gamespot.com", "/api/search/"),
        ProviderEndpoint.HardcoverGraphQl => ("https://api.hardcover.app/v1/graphql", "api.hardcover.app", "/v1/graphql"),
        ProviderEndpoint.GoogleBooksVolumes => ("https://www.googleapis.com/books/v1/volumes", "www.googleapis.com", "/books/v1/volumes"),
        ProviderEndpoint.OpenLibrarySearch => ("https://openlibrary.org/search.json", "openlibrary.org", "/search.json"),
        _ => throw new ArgumentOutOfRangeException(nameof(endpoint), "Unsupported external media provider endpoint.")
    };

    private static string SanitizeSearchQuery(string? query)
    {
        if (string.IsNullOrWhiteSpace(query)) return "";
        var sb = new StringBuilder(Math.Min(query.Length, 150));
        foreach (char ch in query.Trim())
        {
            if (char.IsControl(ch)) continue;
            sb.Append(ch);
            if (sb.Length >= 150) break;
        }
        return sb.ToString().Trim();
    }

    private static string StripHtml(string? text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var sb = new StringBuilder();
        bool inTag = false;
        foreach (char ch in text)
        {
            if (ch == '<') inTag = true;
            else if (ch == '>' && inTag) inTag = false;
            else if (!inTag) sb.Append(ch);
        }
        return sb.ToString()
            .Replace("&quot;", "\"")
            .Replace("&#39;", "'")
            .Replace("&#039;", "'")
            .Replace("&lt;", "<")
            .Replace("&gt;", ">")
            .Replace("&nbsp;", " ")
            .Replace("&amp;", "&")
            .Trim();
    }

    private async Task<JsonDocument> GetJsonAsync(
        ProviderEndpoint endpoint,
        CancellationToken ct,
        IEnumerable<KeyValuePair<string, string?>>? queryParams = null,
        HttpMethod? method = null,
        string? jsonBody = null,
        string? bearerToken = null,
        TimeSpan? timeout = null)
    {
        var (baseUrl, expectedHost, expectedPath) = ResolveEndpoint(endpoint);
        string requestUrl = queryParams == null
            ? baseUrl
            : QueryHelpers.AddQueryString(baseUrl, queryParams);

        if (!Uri.TryCreate(requestUrl, UriKind.Absolute, out var safeUri) ||
            !string.Equals(safeUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
            !safeUri.IsDefaultPort ||
            !string.Equals(safeUri.Host, expectedHost, StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(safeUri.AbsolutePath, expectedPath, StringComparison.Ordinal) ||
            !AllowedProviderHosts.Contains(safeUri.Host))
        {
            throw new InvalidOperationException("Blocked outbound request to unapproved provider URL.");
        }

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeout ?? ProviderTimeout);
        using var req = new HttpRequestMessage(method ?? HttpMethod.Get, safeUri);
        req.Headers.UserAgent.ParseAdd(UserAgent);
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (jsonBody != null) req.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
        if (!string.IsNullOrWhiteSpace(bearerToken))
        {
            string cleanToken = new string(bearerToken.Where(ch => !char.IsControl(ch)).ToArray()).Trim();
            if (cleanToken.Length > 0)
            {
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cleanToken);
            }
        }
        using var res = await _http.SendAsync(req, HttpCompletionOption.ResponseContentRead, cts.Token);
        if (!res.IsSuccessStatusCode) throw new HttpRequestException($"HTTP {(int)res.StatusCode}", null, res.StatusCode);
        string body = await res.Content.ReadAsStringAsync(cts.Token);
        return JsonDocument.Parse(body);
    }

    public async Task<List<MediaItemDto>> FetchTmdbCuratedAsync(string category, string? forcedMediaType, CancellationToken ct)
    {
        string tmdbKey = _key("TMDB_API_KEY") ?? "";
        if (string.IsNullOrWhiteSpace(tmdbKey)) return new List<MediaItemDto>();

        ProviderEndpoint endpoint = (category ?? "trending").ToLowerInvariant() switch
        {
            "top_rated" => ProviderEndpoint.TmdbTopRated,
            "netflix_originals" => ProviderEndpoint.TmdbNetflixOriginals,
            _ => ProviderEndpoint.TmdbTrending
        };
        KeyValuePair<string, string?>[] queryParams = endpoint == ProviderEndpoint.TmdbNetflixOriginals
            ? new KeyValuePair<string, string?>[]
            {
                new("with_networks", "213"),
                new("api_key", tmdbKey)
            }
            : new KeyValuePair<string, string?>[]
            {
                new("language", "en-US"),
                new("api_key", tmdbKey)
            };

        using var doc = await GetJsonAsync(
            endpoint,
            ct,
            queryParams: queryParams,
            timeout: TimeSpan.FromSeconds(4));

        var list = new List<MediaItemDto>();
        foreach (var raw in A(doc.RootElement, "results").Take(12))
        {
            var item = TmdbToItem(raw, forcedMediaType);
            if (item != null) list.Add(ToDto(item));
        }
        return list;
    }

    private static string UpgradeToHttps(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return "";
        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri)) return "";
        if (!string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase))
            return "";
        var ub = new UriBuilder(uri) { Scheme = Uri.UriSchemeHttps, Port = -1 };
        return ub.Uri.ToString();
    }

    private static string UpgradeArtwork(string? url) =>
        string.IsNullOrEmpty(url) ? "" : UpgradeToHttps(url.Replace("/100x100bb", "/600x600bb"));

    // ------------------------------------------------------------------ providers

    /// <summary>Also used by the curated TMDB rows.</summary>
    public static LiveItem? TmdbToItem(JsonElement raw, string? forcedCategory)
    {
        string title = S(raw, "title");
        if (title == "") title = S(raw, "name");
        if (title == "") title = S(raw, "original_title");
        if (title == "") title = S(raw, "original_name");
        if (title == "") return null;

        bool isTv = string.Equals(forcedCategory, "TvSeries", StringComparison.OrdinalIgnoreCase) ||
                    (!string.Equals(forcedCategory, "Movie", StringComparison.OrdinalIgnoreCase) &&
                     (S(raw, "media_type") == "tv" || P(raw, "first_air_date") != null));
        string mediaType = isTv ? "TvSeries" : "Movie";

        var item = new LiveItem
        {
            ExternalId = $"tmdb-{mediaType.ToLowerInvariant()}-{S(raw, "id")}",
            Title = title,
            MediaType = mediaType,
            Year = ToYear(S(raw, "release_date") != "" ? S(raw, "release_date") : S(raw, "first_air_date")),
            Overview = S(raw, "overview"),
            PosterUrl = S(raw, "poster_path") is { Length: > 0 } pp ? $"https://image.tmdb.org/t/p/w500{pp}" : "",
            BackdropUrl = S(raw, "backdrop_path") is { Length: > 0 } bp ? $"https://image.tmdb.org/t/p/w1280{bp}" : ""
        };
        foreach (var g in A(raw, "genre_ids"))
            if (g.ValueKind == JsonValueKind.Number && TmdbGenres.TryGetValue(g.GetInt32(), out var name)) item.Genres.Add(name);

        double avg = D(raw, "vote_average");
        int votes = (int)D(raw, "vote_count");
        if (avg > 0 && votes > 0)
            item.Sources.Add(MakeSource("tmdb", $"{avg:F1} / 10", avg * 10, votes));
        return item;
    }

    private async Task<List<LiveItem>> SearchTmdbAsync(string q, string key, CancellationToken ct)
    {
        async Task<List<LiveItem>> Page(int page)
        {
            var queryParams = new KeyValuePair<string, string?>[]
            {
                new("api_key", key),
                new("language", "en-US"),
                new("query", q),
                new("page", page.ToString(CultureInfo.InvariantCulture)),
                new("include_adult", "false")
            };
            using var doc = await GetJsonAsync(ProviderEndpoint.TmdbSearchMulti, ct, queryParams: queryParams);
            var list = new List<LiveItem>();
            foreach (var raw in A(doc.RootElement, "results"))
            {
                if (S(raw, "media_type") == "person") continue;
                var it = TmdbToItem(raw, null);
                if (it != null) list.Add(it);
            }
            return list;
        }

        var first = await Page(1);
        try { first.AddRange(await Page(2)); } catch { /* page 2 is best effort */ }
        return first;
    }

    private async Task<List<LiveItem>> SearchOmdbAsync(string q, string key, CancellationToken ct)
    {
        var queryParams = new KeyValuePair<string, string?>[]
        {
            new("apikey", key),
            new("s", q),
            new("page", "1")
        };
        using var doc = await GetJsonAsync(ProviderEndpoint.Omdb, ct, queryParams: queryParams);
        var list = new List<LiveItem>();
        if (S(doc.RootElement, "Response") == "False") return list;
        foreach (var r in A(doc.RootElement, "Search"))
        {
            string type = S(r, "Type");
            if (type != "movie" && type != "series") continue;
            string poster = S(r, "Poster");
            list.Add(new LiveItem
            {
                ExternalId = $"omdb-{S(r, "imdbID")}",
                ImdbId = S(r, "imdbID"),
                Title = S(r, "Title"),
                MediaType = type == "series" ? "TvSeries" : "Movie",
                Year = ToYear(S(r, "Year")),
                PosterUrl = poster == "N/A" ? "" : poster
            });
        }
        return list;
    }

    /// <summary>Adds real IMDb / Rotten Tomatoes / Metacritic values (and missing metadata) from OMDb.</summary>
    private async Task EnrichWithOmdbAsync(LiveItem item, string key, CancellationToken ct)
    {
        var queryParams = new List<KeyValuePair<string, string?>>
        {
            new("apikey", key)
        };
        if (!string.IsNullOrEmpty(item.ImdbId))
        {
            queryParams.Add(new("i", item.ImdbId));
        }
        else
        {
            queryParams.Add(new("t", item.Title));
            if (item.Year > 0)
            {
                queryParams.Add(new("y", item.Year.ToString(CultureInfo.InvariantCulture)));
            }
            queryParams.Add(new("type", item.MediaType == "TvSeries" ? "series" : "movie"));
        }
        queryParams.Add(new("plot", "short"));

        using var doc = await GetJsonAsync(
            ProviderEndpoint.Omdb, ct, queryParams: queryParams, timeout: TimeSpan.FromSeconds(3.5));
        var d = doc.RootElement;
        if (S(d, "Response") == "False") return;
        // Never attach ratings to a title that merely resembles the requested one.
        if (string.IsNullOrEmpty(item.ImdbId) && TitleKey(S(d, "Title")) != TitleKey(item.Title)) return;
        int omdbYear = ToYear(S(d, "Year"));
        if (item.Year > 0 && omdbYear > 0 && Math.Abs(omdbYear - item.Year) > 1) return;

        item.ImdbId ??= S(d, "imdbID");
        if (double.TryParse(S(d, "imdbRating"), NumberStyles.Float, CultureInfo.InvariantCulture, out var imdb) && imdb > 0)
        {
            int.TryParse(S(d, "imdbVotes").Replace(",", ""), out int votes);
            AddSource(item, MakeSource("imdb", $"{imdb:F1} / 10", imdb * 10, votes));
        }
        foreach (var r in A(d, "Ratings"))
        {
            if (S(r, "Source") == "Rotten Tomatoes" &&
                int.TryParse(S(r, "Value").TrimEnd('%'), out int pct))
                AddSource(item, MakeSource("rt", $"{pct}%", pct, 0));
        }
        if (int.TryParse(S(d, "Metascore"), out int meta))
            AddSource(item, MakeSource("metacritic", $"{meta} / 100", meta, 0));

        string Known(string field) { var v = S(d, field); return v == "N/A" ? "" : v; }
        if (item.Overview == "") item.Overview = Known("Plot");
        if (item.Creator == "") item.Creator = Known("Director");
        if (item.Publisher == "") item.Publisher = Known("Production");
        if (item.Runtime == "") item.Runtime = Known("Runtime");
        if (item.AgeRating == "") item.AgeRating = Known("Rated");
        if (item.PosterUrl == "") item.PosterUrl = Known("Poster");
        foreach (var g in Known("Genre").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            if (!item.Genres.Contains(g, StringComparer.OrdinalIgnoreCase)) item.Genres.Add(g);
    }

    private async Task<List<LiveItem>> SearchTvMazeAsync(string q, CancellationToken ct)
    {
        var queryParams = new KeyValuePair<string, string?>[] { new("q", q) };
        using var doc = await GetJsonAsync(ProviderEndpoint.TvMazeSearch, ct, queryParams: queryParams);
        var list = new List<LiveItem>();
        if (doc.RootElement.ValueKind != JsonValueKind.Array) return list;
        foreach (var entry in doc.RootElement.EnumerateArray().Take(15))
        {
            var show = O(entry, "show");
            if (show == null) continue;
            var s = show.Value;
            string name = S(s, "name");
            if (name == "") continue;
            var item = new LiveItem
            {
                ExternalId = $"tvmaze-{S(s, "id")}",
                ImdbId = O(s, "externals") is { } ext && S(ext, "imdb") is { Length: > 0 } imdbId ? imdbId : null,
                Title = name,
                MediaType = "TvSeries",
                Year = ToYear(S(s, "premiered")),
                Overview = StripHtml(S(s, "summary")),
                PosterUrl = O(s, "image") is { } img ? (S(img, "original") != "" ? S(img, "original") : S(img, "medium")) : "",
                Publisher = O(s, "network") is { } net ? S(net, "name") : (O(s, "webChannel") is { } web ? S(web, "name") : "")
            };
            foreach (var g in A(s, "genres")) if (g.GetString() is { } gs) item.Genres.Add(gs);
            double rt = D(s, "averageRuntime") > 0 ? D(s, "averageRuntime") : D(s, "runtime");
            if (rt > 0) item.Runtime = $"{(int)rt} min / ep";
            if (O(s, "rating") is { } rating && D(rating, "average") is var avg && avg > 0)
                item.Sources.Add(MakeSource("tvmaze", $"{avg:0.#} / 10", avg * 10, 0));
            list.Add(item);
        }
        return list;
    }

    private async Task<List<LiveItem>> SearchItunesMoviesAsync(string q, CancellationToken ct)
    {
        var queryParams = new KeyValuePair<string, string?>[]
        {
            new("term", q),
            new("media", "movie"),
            new("entity", "movie"),
            new("limit", "25")
        };
        using var doc = await GetJsonAsync(ProviderEndpoint.ItunesSearch, ct, queryParams: queryParams);
        var list = new List<LiveItem>();
        foreach (var r in A(doc.RootElement, "results"))
        {
            string name = S(r, "trackName");
            if (name == "") continue;
            string runtime = "";
            double ms = D(r, "trackTimeMillis");
            if (ms > 0)
            {
                int mins = (int)(ms / 60000);
                runtime = mins >= 60 ? $"{mins / 60}h {mins % 60}m" : $"{mins}m";
            }
            var item = new LiveItem
            {
                ExternalId = $"movie-itunes-{S(r, "trackId")}",
                Title = name,
                MediaType = "Movie",
                Year = ToYear(S(r, "releaseDate")),
                Overview = S(r, "longDescription") != "" ? S(r, "longDescription") : S(r, "shortDescription"),
                PosterUrl = UpgradeArtwork(S(r, "artworkUrl100")),
                Publisher = S(r, "collectionArtistName"),
                Creator = S(r, "artistName"),
                Runtime = runtime,
                AgeRating = S(r, "contentAdvisoryRating")
            };
            if (S(r, "primaryGenreName") is { Length: > 0 } genre) item.Genres.Add(genre);
            list.Add(item);
        }
        return list;
    }

    private const string AniListQuery = @"
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
}";

    private async Task<List<LiveItem>> SearchAniListAsync(string q, CancellationToken ct)
    {
        string body = JsonSerializer.Serialize(new { query = AniListQuery, variables = new { search = q } });
        using var doc = await GetJsonAsync(ProviderEndpoint.AniListGraphQl, ct, method: HttpMethod.Post, jsonBody: body);
        var data = O(doc.RootElement, "data") ?? throw new InvalidOperationException("AniList returned no data");
        var list = new List<LiveItem>();

        void Build(JsonElement m, string kind)
        {
            bool manga = kind == "manga";
            var titles = O(m, "title");
            string title = titles is { } t ? (S(t, "english") != "" ? S(t, "english") : S(t, "romaji")) : "";
            if (title == "") return;
            var item = new LiveItem
            {
                ExternalId = $"anilist-{kind}-{S(m, "id")}",
                MalKey = S(m, "idMal") is { Length: > 0 } mal ? $"{kind}:{mal}" : null,
                Title = title,
                MediaType = manga ? "ComicBook" : S(m, "format") == "MOVIE" ? "Movie" : "TvSeries",
                Year = O(m, "startDate") is { } sd ? (int)D(sd, "year") : 0,
                Overview = StripHtml(S(m, "description")),
                PosterUrl = O(m, "coverImage") is { } ci ? (S(ci, "extraLarge") != "" ? S(ci, "extraLarge") : S(ci, "large")) : "",
                BackdropUrl = S(m, "bannerImage")
            };
            item.Genres.Add(manga ? "Manga" : "Anime");
            foreach (var g in A(m, "genres")) if (g.GetString() is { } gs) item.Genres.Add(gs);
            if (manga)
            {
                if (O(m, "staff") is { } staff)
                    item.Creator = A(staff, "edges").Select(e => O(e, "node")).Where(n => n != null)
                        .Select(n => O(n!.Value, "name") is { } nm ? S(nm, "full") : "").FirstOrDefault(x => x != "") ?? "";
                item.Runtime = D(m, "chapters") > 0 ? $"{(int)D(m, "chapters")} Chapters" : D(m, "volumes") > 0 ? $"{(int)D(m, "volumes")} Volumes" : "";
            }
            else
            {
                if (O(m, "studios") is { } studios)
                    item.Publisher = A(studios, "nodes").Select(n => S(n, "name")).FirstOrDefault(x => x != "") ?? "";
                item.Runtime = D(m, "episodes") > 0 ? $"{(int)D(m, "episodes")} Episodes" : "";
            }
            double score = D(m, "averageScore");
            if (score > 0)
                item.Sources.Add(MakeSource("anilist", $"{(int)score} / 100", score, (int)D(m, "popularity")));
            list.Add(item);
        }

        if (O(data, "manga") is { } mg) foreach (var m in A(mg, "media")) Build(m, "manga");
        if (O(data, "anime") is { } an) foreach (var m in A(an, "media")) Build(m, "anime");
        return list;
    }

    private async Task<List<LiveItem>> SearchJikanMangaAsync(string q, CancellationToken ct)
    {
        var queryParams = new KeyValuePair<string, string?>[]
        {
            new("q", q),
            new("limit", "15"),
            new("sfw", "true")
        };
        using var doc = await GetJsonAsync(ProviderEndpoint.JikanManga, ct, queryParams: queryParams);
        var list = new List<LiveItem>();
        foreach (var m in A(doc.RootElement, "data"))
        {
            string title = S(m, "title_english") != "" ? S(m, "title_english") : S(m, "title");
            if (title == "") continue;
            var item = new LiveItem
            {
                ExternalId = $"comic-jikan-{S(m, "mal_id")}",
                MalKey = $"manga:{S(m, "mal_id")}",
                Title = title,
                MediaType = "ComicBook",
                Overview = S(m, "synopsis"),
                Year = O(m, "published") is { } pub && O(pub, "prop") is { } prop && O(prop, "from") is { } from ? (int)D(from, "year") : 0
            };
            if (O(m, "images") is { } images && O(images, "jpg") is { } jpg)
                item.PosterUrl = S(jpg, "large_image_url") != "" ? S(jpg, "large_image_url") : S(jpg, "image_url");
            item.Genres.Add("Manga");
            foreach (var g in A(m, "genres").Concat(A(m, "themes"))) if (S(g, "name") is { Length: > 0 } gn) item.Genres.Add(gn);
            item.Publisher = A(m, "serializations").Select(s => S(s, "name")).FirstOrDefault(x => x != "") ?? "";
            item.Creator = A(m, "authors").Select(a => S(a, "name")).FirstOrDefault(x => x != "") ?? "";
            item.Runtime = D(m, "chapters") > 0 ? $"{(int)D(m, "chapters")} Chapters" : D(m, "volumes") > 0 ? $"{(int)D(m, "volumes")} Volumes" : "";
            double score = D(m, "score");
            if (score > 0)
                item.Sources.Add(MakeSource("mal", $"{score:0.##} / 10", score * 10, (int)D(m, "scored_by")));
            list.Add(item);
        }
        return list;
    }

    private async Task<List<LiveItem>> SearchComicVineAsync(string q, string key, CancellationToken ct)
    {
        var queryParams = new KeyValuePair<string, string?>[]
        {
            new("api_key", key),
            new("format", "json"),
            new("resources", "volume"),
            new("limit", "15"),
            new("query", q),
            new("field_list", "id,name,start_year,publisher,image,description,deck,count_of_issues")
        };
        using var doc = await GetJsonAsync(ProviderEndpoint.ComicVineSearch, ct, queryParams: queryParams);
        if (D(doc.RootElement, "status_code") is var sc && sc != 0 && sc != 1)
            throw new InvalidOperationException($"ComicVine: {S(doc.RootElement, "error")}");
        var list = new List<LiveItem>();
        foreach (var v in A(doc.RootElement, "results"))
        {
            string name = S(v, "name");
            if (name == "") continue;
            var item = new LiveItem
            {
                ExternalId = $"comicvine-volume-{S(v, "id")}",
                Title = name,
                MediaType = "ComicBook",
                Year = ToYear(S(v, "start_year")),
                Overview = S(v, "deck") != "" ? S(v, "deck") : StripHtml(S(v, "description")),
                Publisher = O(v, "publisher") is { } pub ? S(pub, "name") : "",
                Runtime = D(v, "count_of_issues") > 0 ? $"{(int)D(v, "count_of_issues")} Issues" : ""
            };
            if (O(v, "image") is { } img) item.PosterUrl = S(img, "super_url") != "" ? S(img, "super_url") : S(img, "original_url");
            item.Genres.Add("Comic Book");
            list.Add(item);
        }
        return list;
    }

    private async Task<List<LiveItem>> SearchHardcoverAsync(string q, string token, CancellationToken ct)
    {
        string trimmedToken = token.Trim();
        string bearer = trimmedToken.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? trimmedToken[7..].TrimStart()
            : trimmedToken;
        string body = JsonSerializer.Serialize(new
        {
            query = "query Search($q: String!) { search(query: $q, query_type: \"Book\", per_page: 15, page: 1) { results } }",
            variables = new { q }
        });
        using var doc = await GetJsonAsync(
            ProviderEndpoint.HardcoverGraphQl,
            ct,
            method: HttpMethod.Post,
            jsonBody: body,
            bearerToken: bearer);
        if (A(doc.RootElement, "errors").FirstOrDefault() is { ValueKind: JsonValueKind.Object } err)
            throw new InvalidOperationException($"Hardcover: {S(err, "message")}");

        JsonElement? results = O(doc.RootElement, "data") is { } data && O(data, "search") is { } search ? P(search, "results") : null;
        JsonDocument? inner = null;
        try
        {
            if (results is { ValueKind: JsonValueKind.String } str) { inner = JsonDocument.Parse(str.GetString() ?? "{}"); results = inner.RootElement; }
            var list = new List<LiveItem>();
            if (results is not { } res) return list;
            foreach (var hit in A(res, "hits"))
            {
                var docEl = O(hit, "document");
                if (docEl == null) continue;
                var d = docEl.Value;
                string title = S(d, "title");
                if (title == "") continue;
                var item = new LiveItem
                {
                    ExternalId = $"hardcover-{S(d, "id")}",
                    Title = title,
                    MediaType = "ComicBook",
                    YearLoose = true,
                    Year = (int)D(d, "release_year"),
                    Overview = S(d, "description"),
                    PosterUrl = O(d, "image") is { } img ? S(img, "url") : "",
                    Creator = string.Join(", ", A(d, "author_names").Take(2).Select(a => a.GetString() ?? "").Where(x => x != "")),
                    Runtime = D(d, "pages") > 0 ? $"{(int)D(d, "pages")} Pages" : ""
                };
                foreach (var g in A(d, "genres")) if (g.GetString() is { } gs) item.Genres.Add(gs);
                double rating = D(d, "rating");
                int count = (int)D(d, "ratings_count");
                if (rating > 0 && count > 0)
                    item.Sources.Add(MakeSource("hardcover", $"{rating:F2} / 5", rating * 20, count));
                list.Add(item);
            }
            return list;
        }
        finally { inner?.Dispose(); }
    }

    private async Task<List<LiveItem>> SearchGoogleBooksAsync(string q, CancellationToken ct)
    {
        string key = _key("GOOGLE_BOOKS_API_KEY") ?? "";
        var queryParams = new List<KeyValuePair<string, string?>>
        {
            new("q", q),
            new("maxResults", "20"),
            new("printType", "books"),
            new("orderBy", "relevance")
        };
        if (key != "")
        {
            queryParams.Add(new("key", key));
        }
        using var doc = await GetJsonAsync(ProviderEndpoint.GoogleBooksVolumes, ct, queryParams: queryParams);
        var list = new List<LiveItem>();
        foreach (var it in A(doc.RootElement, "items"))
        {
            var vi = O(it, "volumeInfo");
            if (vi == null || S(vi.Value, "title") == "") continue;
            var v = vi.Value;
            var item = new LiveItem
            {
                ExternalId = $"googlebooks-{S(it, "id")}",
                Title = S(v, "title"),
                MediaType = "ComicBook",
                YearLoose = true,
                Year = ToYear(S(v, "publishedDate")),
                Overview = StripHtml(S(v, "description")),
                Publisher = S(v, "publisher"),
                Creator = string.Join(", ", A(v, "authors").Take(2).Select(a => a.GetString() ?? "").Where(x => x != "")),
                Runtime = D(v, "pageCount") > 0 ? $"{(int)D(v, "pageCount")} Pages" : "",
                AgeRating = S(v, "maturityRating") == "MATURE" ? "Mature" : ""
            };
            if (O(v, "imageLinks") is { } links)
            {
                string thumb = S(links, "thumbnail") != "" ? S(links, "thumbnail") : S(links, "smallThumbnail");
                item.PosterUrl = UpgradeToHttps(thumb).Replace("&edge=curl", "");
            }
            foreach (var c in A(v, "categories")) if (c.GetString() is { } cs) item.Genres.Add(cs);
            double avg = D(v, "averageRating");
            int count = (int)D(v, "ratingsCount");
            if (avg > 0 && count > 0)
                item.Sources.Add(MakeSource("googleBooks", $"{avg:F1} / 5", avg * 20, count));
            list.Add(item);
        }
        return list;
    }

    private async Task<List<LiveItem>> SearchAppleBooksAsync(string q, CancellationToken ct)
    {
        var queryParams = new KeyValuePair<string, string?>[]
        {
            new("term", q),
            new("media", "ebook"),
            new("entity", "ebook"),
            new("limit", "20")
        };
        using var doc = await GetJsonAsync(ProviderEndpoint.ItunesSearch, ct, queryParams: queryParams);
        var list = new List<LiveItem>();
        foreach (var r in A(doc.RootElement, "results"))
        {
            string name = S(r, "trackName");
            if (name == "") continue;
            var item = new LiveItem
            {
                ExternalId = $"applebooks-{S(r, "trackId")}",
                Title = name,
                MediaType = "ComicBook",
                YearLoose = true,
                Year = ToYear(S(r, "releaseDate")),
                Overview = StripHtml(S(r, "description")),
                PosterUrl = UpgradeArtwork(S(r, "artworkUrl100")),
                Creator = S(r, "artistName")
            };
            foreach (var g in A(r, "genres")) if (g.GetString() is { } gs) item.Genres.Add(gs);
            double avg = D(r, "averageUserRating");
            int count = (int)D(r, "userRatingCount");
            if (avg > 0 && count > 0)
                item.Sources.Add(MakeSource("appleBooks", $"{avg:F1} / 5", avg * 20, count));
            list.Add(item);
        }
        return list;
    }

    private async Task<List<LiveItem>> SearchOpenLibraryAsync(string q, CancellationToken ct)
    {
        const string fields = "key,title,author_name,first_publish_year,cover_i,subject,edition_count,publisher,ratings_average,ratings_count";
        var queryParams = new KeyValuePair<string, string?>[]
        {
            new("q", q),
            new("limit", "25"),
            new("fields", fields)
        };
        using var doc = await GetJsonAsync(ProviderEndpoint.OpenLibrarySearch, ct, queryParams: queryParams);
        var list = new List<LiveItem>();
        foreach (var d in A(doc.RootElement, "docs"))
        {
            string title = S(d, "title");
            if (title == "") continue;
            var item = new LiveItem
            {
                ExternalId = $"book-ol-{S(d, "key").Replace("/works/", "")}",
                Title = title,
                MediaType = "ComicBook",
                YearLoose = true,
                Year = (int)D(d, "first_publish_year"),
                PosterUrl = D(d, "cover_i") > 0 ? $"https://covers.openlibrary.org/b/id/{(long)D(d, "cover_i")}-L.jpg" : "",
                Publisher = A(d, "publisher").Select(p => p.GetString() ?? "").FirstOrDefault(x => x != "") ?? "",
                Creator = string.Join(", ", A(d, "author_name").Take(2).Select(a => a.GetString() ?? "").Where(x => x != "")),
                Runtime = D(d, "edition_count") > 0 ? $"{(int)D(d, "edition_count")} Editions" : ""
            };
            foreach (var s in A(d, "subject").Take(6)) if (s.GetString() is { } ss) item.Genres.Add(ss);
            double avg = D(d, "ratings_average");
            int count = (int)D(d, "ratings_count");
            if (avg > 0 && count > 0)
                item.Sources.Add(MakeSource("openlibrary", $"{avg:F2} / 5", avg * 20, count));
            list.Add(item);
        }
        return list;
    }

    // ------------------------------------------------------------------ merge / rank

    private static void AddSource(LiveItem item, ExternalRatingSource source)
    {
        var existing = item.Sources.FirstOrDefault(s => s.SourceId == source.SourceId);
        if (existing == null) item.Sources.Add(source);
        else if (source.VoteCount > existing.VoteCount) item.Sources[item.Sources.IndexOf(existing)] = source;
    }

    private static bool YearsCompatible(LiveItem a, LiveItem b) =>
        a.Year == 0 || b.Year == 0 || a.YearLoose || b.YearLoose || Math.Abs(a.Year - b.Year) <= 1;

    private static void MergeInto(LiveItem target, LiveItem inc)
    {
        foreach (var s in inc.Sources) AddSource(target, s);
        if (inc.Overview.Length > target.Overview.Length) target.Overview = inc.Overview;
        if (target.PosterUrl == "") target.PosterUrl = inc.PosterUrl;
        if (target.BackdropUrl == "") target.BackdropUrl = inc.BackdropUrl;
        foreach (var g in inc.Genres)
            if (target.Genres.Count < 8 && !target.Genres.Contains(g, StringComparer.OrdinalIgnoreCase)) target.Genres.Add(g);
        if (target.Publisher == "") target.Publisher = inc.Publisher;
        if (target.Creator == "") target.Creator = inc.Creator;
        if (target.Runtime == "") target.Runtime = inc.Runtime;
        if (target.AgeRating == "") target.AgeRating = inc.AgeRating;
        target.ImdbId ??= inc.ImdbId;
        target.MalKey ??= inc.MalKey;
        if (target.Year == 0) target.Year = inc.Year;
        if (target.YearLoose && !inc.YearLoose) target.YearLoose = false;
    }

    public static List<LiveItem> Merge(IEnumerable<IEnumerable<LiveItem>> providerResults)
    {
        var items = new List<LiveItem>();
        var byTitle = new Dictionary<string, List<LiveItem>>();
        var byId = new Dictionary<string, LiveItem>();

        IEnumerable<string> IdKeys(LiveItem i)
        {
            if (!string.IsNullOrEmpty(i.ImdbId)) yield return $"imdb:{i.ImdbId}";
            if (!string.IsNullOrEmpty(i.MalKey)) yield return $"mal:{i.MalKey}";
        }

        foreach (var list in providerResults)
        foreach (var item in list)
        {
            string tk = TitleKey(item.Title);
            if (tk == "") continue;
            LiveItem? target = IdKeys(item).Select(k => byId.GetValueOrDefault(k)).FirstOrDefault(t => t != null);
            string bucket = $"{tk}|{item.MediaType}";
            if (target == null && byTitle.TryGetValue(bucket, out var candidates))
                target = candidates.FirstOrDefault(c => YearsCompatible(c, item));
            if (target != null) MergeInto(target, item);
            else
            {
                target = item;
                items.Add(item);
                if (!byTitle.TryGetValue(bucket, out var l)) byTitle[bucket] = l = new List<LiveItem>();
                l.Add(item);
            }
            foreach (var k in IdKeys(target)) byId[k] = target;
        }
        return items;
    }

    private static int Relevance(LiveItem item, string normalizedQuery, string[] tokens)
    {
        string t = TitleKey(item.Title);
        if (t == normalizedQuery) return 1000;
        if (t.StartsWith(normalizedQuery, StringComparison.Ordinal)) return 700;
        if (t.Contains(normalizedQuery, StringComparison.Ordinal)) return 450;
        string meta = $"{item.Creator} {item.Publisher} {string.Join(' ', item.Genres)}".ToLowerInvariant();
        int score = 0, inTitle = 0;
        foreach (var tok in tokens)
        {
            if (t.Contains(tok, StringComparison.Ordinal)) { score += 120; inTitle++; }
            else if (meta.Contains(tok, StringComparison.Ordinal)) score += 60;
        }
        if (tokens.Length > 1 && inTitle == tokens.Length) score += 200;
        return score;
    }

    private static long TotalVotes(LiveItem i) => i.Sources.Sum(s => (long)s.VoteCount);

    public MediaItemDto ToDto(LiveItem item)
    {
        string poster = item.PosterUrl != "" ? item.PosterUrl : PlaceholderPoster;
        var genres = item.Genres.Take(8).ToList();
        if (genres.Count == 0) genres.Add(item.MediaType == "TvSeries" ? "TV Series" : item.MediaType == "Movie" ? "Movie" : "Book");
        return new MediaItemDto
        {
            Id = new Guid(SHA256.HashData(Encoding.UTF8.GetBytes(item.ExternalId))[..16]),
            ExternalId = item.ExternalId,
            Title = item.Title,
            MediaType = item.MediaType,
            ReleaseYear = item.Year,
            Overview = item.Overview != "" ? item.Overview : "No description is available from the connected sources yet.",
            PosterUrl = poster,
            BackdropUrl = item.BackdropUrl != "" ? item.BackdropUrl : (item.PosterUrl != "" ? poster : PlaceholderBackdrop),
            Genres = genres,
            PublisherOrStudio = item.Publisher != "" ? item.Publisher : "Not listed",
            CreatorOrDirector = item.Creator != "" ? item.Creator : "Not listed",
            RuntimeOrIssueCount = item.Runtime != "" ? item.Runtime : "N/A",
            AgeRating = item.AgeRating != "" ? item.AgeRating : "NR",
            CumulativeRating = _calculator.CalculateCumulativeRating(item.Sources)
        };
    }

    // ------------------------------------------------------------------ orchestration

    public async Task<SearchResult> SearchAsync(string query, CancellationToken ct)
    {
        string clean = SanitizeSearchQuery(query);
        var diagnostics = new Dictionary<string, ProviderDiagnostic>();
        if (clean.Length < 2) return new SearchResult(new List<MediaItemDto>(), diagnostics);

        string cacheKey = clean.ToLowerInvariant();
        if (_cache.TryGetValue(cacheKey, out var hit) && DateTime.UtcNow - hit.At < CacheTtl)
            return hit.Result;

        string normalizedQuery = TitleKey(clean);
        if (normalizedQuery == "") normalizedQuery = cacheKey;
        string[] tokens = normalizedQuery.Split(' ', StringSplitOptions.RemoveEmptyEntries).Where(t => t.Length >= 2).ToArray();

        string tmdb = _key("TMDB_API_KEY") ?? "";
        string omdb = _key("OMDB_API_KEY") ?? "";
        string comicVine = _key("COMICVINE_API_KEY") ?? "";
        string hardcover = _key("HARDCOVER_API_TOKEN") ?? "";

        // Order = merge priority: earlier providers win ids and primary metadata.
        var providers = new List<(string Name, bool Configured, Func<Task<List<LiveItem>>> Run)>
        {
            ("tmdb", tmdb != "", () => SearchTmdbAsync(clean, tmdb, ct)),
            ("omdb", omdb != "", () => SearchOmdbAsync(clean, omdb, ct)),
            ("tvmaze", true, () => SearchTvMazeAsync(clean, ct)),
            ("itunes_movies", true, () => SearchItunesMoviesAsync(clean, ct)),
            ("anilist", true, () => SearchAniListAsync(clean, ct)),
            ("jikan", true, () => SearchJikanMangaAsync(clean, ct)),
            ("comicvine", comicVine != "", () => SearchComicVineAsync(clean, comicVine, ct)),
            ("hardcover", hardcover != "", () => SearchHardcoverAsync(clean, hardcover, ct)),
            ("google_books", true, () => SearchGoogleBooksAsync(clean, ct)),
            ("apple_books", true, () => SearchAppleBooksAsync(clean, ct)),
            ("open_library", true, () => SearchOpenLibraryAsync(clean, ct))
        };

        var tasks = providers.Select(async p =>
        {
            if (!p.Configured) return (p.Name, Items: new List<LiveItem>(), Diag: new ProviderDiagnostic(false, 0, null));
            try
            {
                var items = await p.Run();
                return (p.Name, Items: items, Diag: new ProviderDiagnostic(true, items.Count, null));
            }
            catch (Exception ex)
            {
                string msg = ex switch
                {
                    OperationCanceledException => "timeout",
                    HttpRequestException { StatusCode: { } statusCode } => $"HTTP {(int)statusCode}",
                    _ => "provider_error"
                };
                return (p.Name, Items: new List<LiveItem>(), Diag: new ProviderDiagnostic(true, 0, msg));
            }
        }).ToList();

        var settled = await Task.WhenAll(tasks);
        foreach (var s in settled) diagnostics[s.Name] = s.Diag;

        var merged = Merge(settled.Select(s => (IEnumerable<LiveItem>)s.Items));
        merged = merged.OrderByDescending(i => Relevance(i, normalizedQuery, tokens)).ThenByDescending(TotalVotes).ToList();

        if (omdb != "")
        {
            var candidates = merged
                .Where(i => (i.MediaType == "Movie" || i.MediaType == "TvSeries") && !i.Sources.Any(s => s.SourceId == "imdb"))
                .Take(10).ToList();
            await Task.WhenAll(candidates.Select(async c =>
            {
                try { await EnrichWithOmdbAsync(c, omdb, ct); } catch { /* enrichment is best effort */ }
            }));
            merged = merged.OrderByDescending(i => Relevance(i, normalizedQuery, tokens)).ThenByDescending(TotalVotes).ToList();
        }

        var dtos = merged.Take(MaxResults).Select(ToDto).ToList();
        var result = new SearchResult(dtos, diagnostics);
        if (dtos.Count > 0)
        {
            if (_cache.Count >= 200) _cache.Clear();
            _cache[cacheKey] = (DateTime.UtcNow, result);
        }
        return result;
    }
}

/// <summary>Curated TMDB rows reuse the same real-score conversion as the live search.</summary>
internal static class ExternalMediaAggregator
{
    public static MediaItemDto? ConvertTmdbElement(
        JsonElement raw,
        string? forcedCategory,
        LiveMediaSearchService service)
    {
        var item = LiveMediaSearchService.TmdbToItem(raw, forcedCategory);
        return item == null ? null : service.ToDto(item);
    }
}
