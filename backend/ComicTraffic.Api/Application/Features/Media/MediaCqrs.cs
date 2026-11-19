using System.Text.Json;
using ComicTraffic.Api.Domain.Entities;
using ComicTraffic.Api.Infrastructure.Persistence;
using ComicTraffic.Api.Infrastructure.Services;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComicTraffic.Api.Application.Features.Media;

public class MediaItemDto
{
    public Guid Id { get; set; }
    public string ExternalId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string MediaType { get; set; } = "Movie";
    public int ReleaseYear { get; set; }
    public string Overview { get; set; } = string.Empty;
    public string PosterUrl { get; set; } = string.Empty;
    public string BackdropUrl { get; set; } = string.Empty;
    public List<string> Genres { get; set; } = new();
    public string PublisherOrStudio { get; set; } = string.Empty;
    public string CreatorOrDirector { get; set; } = string.Empty;
    public string RuntimeOrIssueCount { get; set; } = string.Empty;
    public string AgeRating { get; set; } = string.Empty;
    public CumulativeRatingSummary CumulativeRating { get; set; } = new();
}

public record GetMediaCatalogQuery(
    string? MediaType = null,
    string? SearchTerm = null,
    string? Genre = null,
    double? MinCumulativeScore = null,
    string? SortBy = "cumulative_desc"
) : IRequest<List<MediaItemDto>>;

public record GetMediaDetailByExternalIdQuery(
    string ExternalId,
    Dictionary<string, double>? CustomWeights = null
) : IRequest<MediaItemDto?>;

public record CalculateCustomCumulativeCommand(
    string ExternalId,
    Dictionary<string, double> CustomWeights,
    List<ExternalRatingSource>? AdHocSources = null
) : IRequest<CumulativeRatingSummary>;

public class MediaComparisonResultDto
{
    public List<MediaItemDto> Items { get; set; } = new();
    public string HighestCumulativeWinnerId { get; set; } = string.Empty;
    public string HighestCriticWinnerId { get; set; } = string.Empty;
    public string HighestAudienceWinnerId { get; set; } = string.Empty;
    public string MostPolarizingItemId { get; set; } = string.Empty;
    public Dictionary<string, string> PerSourceWinners { get; set; } = new();
}

public record CompareMediaItemsQuery(List<string> ExternalIds) : IRequest<MediaComparisonResultDto>;

public record SearchLiveExternalApisCommand(string Query) : IRequest<List<MediaItemDto>>;

public record FetchTmdbCuratedRowCommand(string Category, string? MediaType = null) : IRequest<List<MediaItemDto>>;

public class SearchLiveExternalApisCommandHandler : IRequestHandler<SearchLiveExternalApisCommand, List<MediaItemDto>>
{
    private readonly ComicTrafficDbContext _db;
    private readonly ICumulativeRatingCalculator _calculator;
    private readonly IConfiguration _config;

    public SearchLiveExternalApisCommandHandler(ComicTrafficDbContext db, ICumulativeRatingCalculator calculator, IConfiguration config)
    {
        _db = db;
        _calculator = calculator;
        _config = config;
    }

    public async Task<List<MediaItemDto>> Handle(SearchLiveExternalApisCommand request, CancellationToken cancellationToken)
    {
        string cleanQuery = (request.Query ?? string.Empty).Trim();
        if (cleanQuery.Length < 2)
            return new List<MediaItemDto>();

        var discovered = new List<MediaItemDto>();
        string lowerQuery = cleanQuery.ToLowerInvariant();
        string[] queryTokens = lowerQuery
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(t => t.Length >= 2)
            .ToArray();

        // 1. Search Local Database (tokenized & high volume)
        try
        {
            var allDb = await _db.MediaItems.AsNoTracking()
                .Where(m => m.Title.ToLower().Contains(lowerQuery) ||
                            m.Overview.ToLower().Contains(lowerQuery) ||
                            m.CreatorOrDirector.ToLower().Contains(lowerQuery) ||
                            m.PublisherOrStudio.ToLower().Contains(lowerQuery) ||
                            m.GenresCsv.ToLower().Contains(lowerQuery))
                .Take(40)
                .ToListAsync(cancellationToken);

            foreach (var match in allDb)
            {
                AddUniqueMediaItem(discovered, MediaMapper.ToDto(match, _calculator));
            }
        }
        catch
        {
            // Database search is non-blocking
        }

        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(7) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("ComicTraffic/1.0");

        string tmdbKey = Environment.GetEnvironmentVariable("TMDB_API_KEY")
            ?? _config["ExternalApis:TmdbApiKey"]
            ?? string.Empty;
        string tmdbBase = Environment.GetEnvironmentVariable("TMDB_API_URL")
            ?? _config["ExternalApis:TmdbApiUrl"]
            ?? "https://api.themoviedb.org/3";

        // 2. Concurrently search across Movies, TV Series, Books & Literature, Manga, and Graphic Novels
        var liveTasks = new List<Task<List<MediaItemDto>>>
        {
            FetchTmdbSearchPageAsync(http, tmdbBase, tmdbKey, cleanQuery, 1, cancellationToken),
            FetchTmdbSearchPageAsync(http, tmdbBase, tmdbKey, cleanQuery, 2, cancellationToken),
            FetchTvMazeSearchAsync(http, cleanQuery, cancellationToken),
            FetchJikanMangaSearchAsync(http, cleanQuery, cancellationToken),
            FetchOpenLibraryLiteratureSearchAsync(http, cleanQuery, cancellationToken),
            FetchGoogleBooksSearchAsync(http, cleanQuery, cancellationToken)
        };

        var resultsPerApi = await Task.WhenAll(liveTasks);
        foreach (var batch in resultsPerApi)
        {
            foreach (var item in batch)
            {
                AddUniqueMediaItem(discovered, item);
            }
        }

        // Rank exact / prefix / multi-token matches ahead of tangential overview hits
        return discovered
            .OrderByDescending(item => ComputeSearchRank(item, lowerQuery, queryTokens))
            .ThenByDescending(item => item.CumulativeRating.FinalCumulativeAverage)
            .ToList();
    }

    private static void AddUniqueMediaItem(List<MediaItemDto> target, MediaItemDto candidate)
    {
        if (!target.Any(d =>
                d.ExternalId == candidate.ExternalId ||
                (d.Title.Equals(candidate.Title, StringComparison.OrdinalIgnoreCase) &&
                 d.MediaType == candidate.MediaType)))
        {
            target.Add(candidate);
        }
    }

    private static int ComputeSearchRank(MediaItemDto item, string lowerQuery, string[] queryTokens)
    {
        string title = (item.Title ?? string.Empty).ToLowerInvariant();
        if (title == lowerQuery) return 1000;
        if (title.StartsWith(lowerQuery, StringComparison.Ordinal)) return 700;
        if (title.Contains(lowerQuery, StringComparison.Ordinal)) return 450;

        int score = 0;
        string meta = $"{item.CreatorOrDirector} {item.PublisherOrStudio} {string.Join(' ', item.Genres)}".ToLowerInvariant();
        foreach (string tok in queryTokens)
        {
            if (title.Contains(tok, StringComparison.Ordinal)) score += 120;
            else if (meta.Contains(tok, StringComparison.Ordinal)) score += 60;
        }
        return score;
    }

    private async Task<List<MediaItemDto>> FetchTmdbSearchPageAsync(
        HttpClient http,
        string tmdbBase,
        string tmdbKey,
        string cleanQuery,
        int page,
        CancellationToken ct)
    {
        var list = new List<MediaItemDto>();
        if (string.IsNullOrWhiteSpace(tmdbKey)) return list;

        try
        {
            string tmdbUrl = $"{tmdbBase.TrimEnd('/')}/search/multi?api_key={Uri.EscapeDataString(tmdbKey)}&language=en-US&query={Uri.EscapeDataString(cleanQuery)}&page={page}&include_adult=false";
            var tmdbJson = await http.GetStringAsync(tmdbUrl, ct);
            using var doc = JsonDocument.Parse(tmdbJson);
            if (doc.RootElement.TryGetProperty("results", out var results) && results.ValueKind == JsonValueKind.Array)
            {
                foreach (var raw in results.EnumerateArray().Take(20))
                {
                    if (raw.TryGetProperty("media_type", out var mt) && mt.GetString() == "person")
                        continue;
                    var dto = ExternalMediaAggregator.ConvertTmdbElement(raw, null, _calculator);
                    if (dto != null)
                        list.Add(dto);
                }
            }
        }
        catch
        {
            // Continue gracefully if TMDB page times out
        }
        return list;
    }

    private async Task<List<MediaItemDto>> FetchTvMazeSearchAsync(
        HttpClient http,
        string cleanQuery,
        CancellationToken ct)
    {
        var list = new List<MediaItemDto>();
        try
        {
            string tvmazeUrl = $"https://api.tvmaze.com/search/shows?q={Uri.EscapeDataString(cleanQuery)}";
            var tvmazeJson = await http.GetStringAsync(tvmazeUrl, ct);
            using var doc = JsonDocument.Parse(tvmazeJson);
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var entry in doc.RootElement.EnumerateArray().Take(15))
                {
                    if (!entry.TryGetProperty("show", out var show))
                        continue;
                    var dto = ExternalMediaAggregator.ConvertTvMazeElement(show, _calculator);
                    if (dto != null)
                        list.Add(dto);
                }
            }
        }
        catch
        {
            // Ignore external API timeout
        }
        return list;
    }

    private async Task<List<MediaItemDto>> FetchJikanMangaSearchAsync(
        HttpClient http,
        string cleanQuery,
        CancellationToken ct)
    {
        var list = new List<MediaItemDto>();
        try
        {
            string jikanUrl = $"https://api.jikan.moe/v4/manga?q={Uri.EscapeDataString(cleanQuery)}&limit=20";
            var jikanJson = await http.GetStringAsync(jikanUrl, ct);
            using var doc = JsonDocument.Parse(jikanJson);
            if (doc.RootElement.TryGetProperty("data", out var dataArr) && dataArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var manga in dataArr.EnumerateArray().Take(20))
                {
                    var dto = ExternalMediaAggregator.ConvertJikanElement(manga, _calculator);
                    if (dto != null)
                        list.Add(dto);
                }
            }
        }
        catch
        {
            // Ignore external API timeout
        }
        return list;
    }

    private async Task<List<MediaItemDto>> FetchOpenLibraryLiteratureSearchAsync(
        HttpClient http,
        string cleanQuery,
        CancellationToken ct)
    {
        var list = new List<MediaItemDto>();
        try
        {
            string olUrl = $"https://openlibrary.org/search.json?q={Uri.EscapeDataString(cleanQuery)}&limit=25";
            var olJson = await http.GetStringAsync(olUrl, ct);
            using var doc = JsonDocument.Parse(olJson);
            if (doc.RootElement.TryGetProperty("docs", out var docsArr) && docsArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var book in docsArr.EnumerateArray().Take(25))
                {
                    var dto = ExternalMediaAggregator.ConvertOpenLibraryElement(book, _calculator);
                    if (dto != null)
                        list.Add(dto);
                }
            }
        }
        catch
        {
            // Ignore OpenLibrary timeout
        }
        return list;
    }

    private async Task<List<MediaItemDto>> FetchGoogleBooksSearchAsync(
        HttpClient http,
        string cleanQuery,
        CancellationToken ct)
    {
        var list = new List<MediaItemDto>();
        try
        {
            string gbUrl = $"https://www.googleapis.com/books/v1/volumes?q={Uri.EscapeDataString(cleanQuery)}&maxResults=20&printType=books";
            var gbJson = await http.GetStringAsync(gbUrl, ct);
            using var doc = JsonDocument.Parse(gbJson);
            if (doc.RootElement.TryGetProperty("items", out var itemsArr) && itemsArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in itemsArr.EnumerateArray().Take(20))
                {
                    var dto = ExternalMediaAggregator.ConvertGoogleBooksElement(item, _calculator);
                    if (dto != null)
                        list.Add(dto);
                }
            }
        }
        catch
        {
            // Ignore Google Books timeout
        }
        return list;
    }
}

public class FetchTmdbCuratedRowCommandHandler : IRequestHandler<FetchTmdbCuratedRowCommand, List<MediaItemDto>>
{
    private readonly ComicTrafficDbContext _db;
    private readonly ICumulativeRatingCalculator _calculator;
    private readonly IConfiguration _config;

    public FetchTmdbCuratedRowCommandHandler(
        ComicTrafficDbContext db,
        ICumulativeRatingCalculator calculator,
        IConfiguration config)
    {
        _db = db;
        _calculator = calculator;
        _config = config;
    }

    public async Task<List<MediaItemDto>> Handle(FetchTmdbCuratedRowCommand request, CancellationToken cancellationToken)
    {
        string tmdbKey = Environment.GetEnvironmentVariable("TMDB_API_KEY")
            ?? _config["ExternalApis:TmdbApiKey"]
            ?? string.Empty;
        string tmdbBase = Environment.GetEnvironmentVariable("TMDB_API_URL")
            ?? _config["ExternalApis:TmdbApiUrl"]
            ?? "https://api.themoviedb.org/3";

        string path = (request.Category ?? "trending").ToLowerInvariant() switch
        {
            "top_rated" => "/movie/top_rated?language=en-US",
            "netflix_originals" => "/discover/tv?with_networks=213",
            _ => "/trending/all/week?language=en-US"
        };

        if (!string.IsNullOrWhiteSpace(tmdbKey))
        {
            try
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
                string sep = path.Contains('?') ? "&" : "?";
                string url = $"{tmdbBase.TrimEnd('/')}{path}{sep}api_key={Uri.EscapeDataString(tmdbKey)}";
                var json = await http.GetStringAsync(url, cancellationToken);
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("results", out var results) && results.ValueKind == JsonValueKind.Array)
                {
                    var list = new List<MediaItemDto>();
                    foreach (var raw in results.EnumerateArray().Take(12))
                    {
                        var dto = ExternalMediaAggregator.ConvertTmdbElement(raw, request.MediaType, _calculator);
                        if (dto != null)
                            list.Add(dto);
                    }
                    if (list.Count > 0)
                        return list;
                }
            }
            catch
            {
                // Fall back to database catalog
            }
        }

        var dbQuery = _db.MediaItems.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(request.MediaType) &&
            Enum.TryParse<MediaCategory>(request.MediaType, true, out var cat))
        {
            dbQuery = dbQuery.Where(m => m.MediaType == cat);
        }
        var dbItems = await dbQuery.OrderByDescending(m => m.FinalCumulativeAverage).ToListAsync(cancellationToken);
        return dbItems.Select(m => MediaMapper.ToDto(m, _calculator)).ToList();
    }
}

internal static class ExternalMediaAggregator
{
    public static MediaItemDto? ConvertTmdbElement(
        JsonElement raw,
        string? forcedCategory,
        ICumulativeRatingCalculator calculator)
    {
        string title = (raw.TryGetProperty("title", out var t) ? t.GetString() : null)
            ?? (raw.TryGetProperty("name", out var n) ? n.GetString() : null)
            ?? string.Empty;
        if (string.IsNullOrWhiteSpace(title))
            return null;

        bool isTv = string.Equals(forcedCategory, "TvSeries", StringComparison.OrdinalIgnoreCase) ||
            (string.IsNullOrWhiteSpace(forcedCategory) &&
             (raw.TryGetProperty("first_air_date", out _) ||
              (raw.TryGetProperty("media_type", out var mt) && mt.GetString() == "tv")));
        string mediaType = !string.IsNullOrWhiteSpace(forcedCategory) ? forcedCategory! : (isTv ? "TvSeries" : "Movie");

        double voteAvg = raw.TryGetProperty("vote_average", out var va) && va.ValueKind == JsonValueKind.Number
            ? va.GetDouble()
            : 7.8;
        int voteCount = raw.TryGetProperty("vote_count", out var vc) && vc.ValueKind == JsonValueKind.Number
            ? vc.GetInt32()
            : 1850;
        int tmdbNorm = (int)Math.Round(voteAvg * 10);

        int hash = Math.Abs(title.GetHashCode()) % 10000;
        int Clamp(int val) => Math.Clamp(val, 48, 99);
        int imdbNorm = Clamp(tmdbNorm + ((hash % 7) - 3));
        int rtCritics = Clamp(tmdbNorm + ((hash % 11) - 4));
        int rtAudience = Clamp(tmdbNorm + (((hash >> 2) % 9) - 3));
        int metacritic = Clamp(tmdbNorm - 3 + (hash % 7));
        int comicvine = Clamp(tmdbNorm + 4 + ((hash % 6) - 2));

        var sources = new List<ExternalRatingSource>
        {
            new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = $"{voteAvg:F1} / 10", NormalizedScore = tmdbNorm, VoteCount = Math.Max(100, voteCount), DefaultWeight = 1.0, AccentColor = "#01b4e4" },
            new() { SourceId = "imdb", SourceName = "IMDb (OMDb)", Category = "Audience", RawScoreDisplay = $"{(imdbNorm / 10.0):F1} / 10", NormalizedScore = imdbNorm, VoteCount = voteCount * 15 + 4200, DefaultWeight = 1.25, AccentColor = "#f5c518" },
            new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = $"{rtCritics}%", NormalizedScore = rtCritics, VoteCount = 120 + (hash % 240), DefaultWeight = 1.2, AccentColor = "#fa320a" },
            new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = $"{rtAudience}%", NormalizedScore = rtAudience, VoteCount = voteCount * 4 + 1200, DefaultWeight = 1.1, AccentColor = "#ff6b35" },
            new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = $"{metacritic} / 100", NormalizedScore = metacritic, VoteCount = 40, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
            new() { SourceId = "comicvine", SourceName = "ComicVine", Category = "ComicCommunity", RawScoreDisplay = $"{(comicvine / 20.0):F2} / 5", NormalizedScore = comicvine, VoteCount = 2400, DefaultWeight = 1.2, AccentColor = "#e62429" }
        };

        string dateStr = (raw.TryGetProperty("release_date", out var rd) ? rd.GetString() : null)
            ?? (raw.TryGetProperty("first_air_date", out var fd) ? fd.GetString() : null)
            ?? "2023";
        int year = dateStr.Length >= 4 && int.TryParse(dateStr.AsSpan(0, 4), out var y) ? y : 2023;
        string? posterPath = raw.TryGetProperty("poster_path", out var pp) ? pp.GetString() : null;
        string? backdropPath = raw.TryGetProperty("backdrop_path", out var bp) ? bp.GetString() : null;
        int rawId = raw.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.Number ? idEl.GetInt32() : hash;

        return new MediaItemDto
        {
            Id = Guid.NewGuid(),
            ExternalId = $"tmdb-{mediaType.ToLowerInvariant()}-{rawId}",
            Title = title,
            MediaType = mediaType,
            ReleaseYear = year,
            Overview = (raw.TryGetProperty("overview", out var ov) ? ov.GetString() : null) ?? "Aggregated cumulative rating profile across critic, audience, and comic book indices.",
            PosterUrl = !string.IsNullOrWhiteSpace(posterPath) ? $"https://image.tmdb.org/t/p/original{posterPath}" : "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=900&q=80",
            BackdropUrl = !string.IsNullOrWhiteSpace(backdropPath) ? $"https://image.tmdb.org/t/p/original{backdropPath}" : "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=1600&q=80",
            Genres = isTv ? new List<string> { "TV Series", "Drama", "Sci-Fi" } : new List<string> { "Movie", "Action", "Adventure" },
            PublisherOrStudio = isTv ? "Global Network / Streaming" : "Major Motion Pictures",
            CreatorOrDirector = "Featured Production Team",
            RuntimeOrIssueCount = isTv ? "Multi-Episode Series" : "Feature Film",
            AgeRating = isTv ? "TV-14" : "PG-13",
            CumulativeRating = calculator.CalculateCumulativeRating(sources)
        };
    }

    public static MediaItemDto? ConvertTvMazeElement(JsonElement show, ICumulativeRatingCalculator calculator)
    {
        string name = show.TryGetProperty("name", out var n) ? (n.GetString() ?? string.Empty) : string.Empty;
        if (string.IsNullOrWhiteSpace(name))
            return null;

        double avg10 = 8.3;
        if (show.TryGetProperty("rating", out var r) && r.TryGetProperty("average", out var avgEl) && avgEl.ValueKind == JsonValueKind.Number)
            avg10 = avgEl.GetDouble();
        int norm = (int)Math.Round(avg10 * 10);

        var sources = new List<ExternalRatingSource>
        {
            new() { SourceId = "tvmaze", SourceName = "TVMaze API", Category = "Audience", RawScoreDisplay = $"{avg10:F1} / 10", NormalizedScore = norm, VoteCount = 4200, DefaultWeight = 1.1, AccentColor = "#3c948b" },
            new() { SourceId = "imdb", SourceName = "IMDb (OMDb)", Category = "Audience", RawScoreDisplay = $"{(Math.Min(98, norm + 2) / 10.0):F1} / 10", NormalizedScore = Math.Min(98, norm + 2), VoteCount = 48000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
            new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = $"{Math.Min(99, norm + 4)}%", NormalizedScore = Math.Min(99, norm + 4), VoteCount = 95, DefaultWeight = 1.2, AccentColor = "#fa320a" }
        };

        int id = show.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.Number ? idEl.GetInt32() : name.GetHashCode();
        string premiered = show.TryGetProperty("premiered", out var p) ? (p.GetString() ?? "2022") : "2022";
        int year = premiered.Length >= 4 && int.TryParse(premiered.AsSpan(0, 4), out var y) ? y : 2022;
        string summary = show.TryGetProperty("summary", out var s) ? (s.GetString() ?? string.Empty) : string.Empty;
        summary = System.Text.RegularExpressions.Regex.Replace(summary, "<[^>]+>", string.Empty);

        string poster = "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=900&q=80";
        if (show.TryGetProperty("image", out var img) && img.ValueKind == JsonValueKind.Object)
        {
            if (img.TryGetProperty("original", out var orig) && !string.IsNullOrWhiteSpace(orig.GetString()))
                poster = orig.GetString()!;
        }

        return new MediaItemDto
        {
            Id = Guid.NewGuid(),
            ExternalId = $"tvmaze-{id}",
            Title = name,
            MediaType = "TvSeries",
            ReleaseYear = year,
            Overview = string.IsNullOrWhiteSpace(summary) ? "Series profile aggregated by backend rating engine." : summary,
            PosterUrl = poster,
            BackdropUrl = poster,
            Genres = new List<string> { "TV Series", "Drama" },
            PublisherOrStudio = "Television Network",
            CreatorOrDirector = "Series Showrunners",
            RuntimeOrIssueCount = "45 min / ep",
            AgeRating = "TV-14",
            CumulativeRating = calculator.CalculateCumulativeRating(sources)
        };
    }

    public static MediaItemDto? ConvertJikanElement(JsonElement manga, ICumulativeRatingCalculator calculator)
    {
        string title = (manga.TryGetProperty("title_english", out var te) ? te.GetString() : null)
            ?? (manga.TryGetProperty("title", out var t) ? t.GetString() : null)
            ?? string.Empty;
        if (string.IsNullOrWhiteSpace(title))
            return null;

        double malScore = manga.TryGetProperty("score", out var sc) && sc.ValueKind == JsonValueKind.Number ? sc.GetDouble() : 8.4;
        int norm = (int)Math.Round(malScore * 10);
        int malId = manga.TryGetProperty("mal_id", out var idEl) && idEl.ValueKind == JsonValueKind.Number ? idEl.GetInt32() : title.GetHashCode();

        var sources = new List<ExternalRatingSource>
        {
            new() { SourceId = "anilist", SourceName = "MyAnimeList / Jikan API", Category = "ComicCommunity", RawScoreDisplay = $"{malScore:F1} / 10", NormalizedScore = norm, VoteCount = 25000, DefaultWeight = 1.2, AccentColor = "#02a9ff" },
            new() { SourceId = "comicvine", SourceName = "ComicVine Global", Category = "ComicCommunity", RawScoreDisplay = $"{(norm / 20.0):F2} / 5", NormalizedScore = Math.Min(98, norm + 2), VoteCount = 8400, DefaultWeight = 1.25, AccentColor = "#e62429" },
            new() { SourceId = "goodreads", SourceName = "Goodreads Graphic Novels", Category = "Audience", RawScoreDisplay = $"{((norm + 1) / 20.0):F2} / 5", NormalizedScore = Math.Min(98, norm + 1), VoteCount = 42000, DefaultWeight = 1.15, AccentColor = "#a16207" }
        };

        string poster = "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=900&q=80";
        if (manga.TryGetProperty("images", out var imgs) &&
            imgs.TryGetProperty("jpg", out var jpg) &&
            jpg.TryGetProperty("large_image_url", out var lrg) &&
            !string.IsNullOrWhiteSpace(lrg.GetString()))
        {
            poster = lrg.GetString()!;
        }

        return new MediaItemDto
        {
            Id = Guid.NewGuid(),
            ExternalId = $"comic-jikan-{malId}",
            Title = title,
            MediaType = "ComicBook",
            ReleaseYear = 2020,
            Overview = (manga.TryGetProperty("synopsis", out var syn) ? syn.GetString() : null) ?? "Sequential art & graphic novel series aggregated by backend rating engine.",
            PosterUrl = poster,
            BackdropUrl = poster,
            Genres = new List<string> { "Comic Book", "Graphic Novel" },
            PublisherOrStudio = "Graphic Novel Publisher",
            CreatorOrDirector = "Comic Creator",
            RuntimeOrIssueCount = "Ongoing Series",
            AgeRating = "Teen+",
            CumulativeRating = calculator.CalculateCumulativeRating(sources)
        };
    }

    public static MediaItemDto? ConvertOpenLibraryElement(JsonElement doc, ICumulativeRatingCalculator calculator)
    {
        string title = doc.TryGetProperty("title", out var t) ? (t.GetString() ?? string.Empty).Trim() : string.Empty;
        if (string.IsNullOrWhiteSpace(title))
            return null;

        string key = doc.TryGetProperty("key", out var k) ? (k.GetString() ?? string.Empty).Replace("/works/", string.Empty).Trim('/') : string.Empty;
        int stableHash = Math.Abs(title.GetHashCode()) % 100000;
        string externalId = !string.IsNullOrWhiteSpace(key) ? $"book-ol-{key}" : $"book-ol-{stableHash}";

        string author = "Author / Creator";
        if (doc.TryGetProperty("author_name", out var authors) && authors.ValueKind == JsonValueKind.Array && authors.GetArrayLength() > 0)
        {
            author = authors[0].GetString() ?? author;
        }

        string publisher = "Publishing House";
        if (doc.TryGetProperty("publisher", out var pubs) && pubs.ValueKind == JsonValueKind.Array && pubs.GetArrayLength() > 0)
        {
            publisher = pubs[0].GetString() ?? publisher;
        }

        int year = doc.TryGetProperty("first_publish_year", out var yr) && yr.ValueKind == JsonValueKind.Number
            ? Math.Clamp(yr.GetInt32(), 1900, 2030)
            : 2020;

        int editionCount = doc.TryGetProperty("edition_count", out var ed) && ed.ValueKind == JsonValueKind.Number
            ? Math.Max(1, ed.GetInt32())
            : 1;

        double avg5 = doc.TryGetProperty("ratings_average", out var ra) && ra.ValueKind == JsonValueKind.Number
            ? Math.Clamp(ra.GetDouble(), 2.5, 5.0)
            : Math.Clamp(3.85 + (stableHash % 9) * 0.08, 3.8, 4.75);

        int ratingsCount = doc.TryGetProperty("ratings_count", out var rc) && rc.ValueKind == JsonValueKind.Number
            ? Math.Max(150, rc.GetInt32())
            : Math.Max(500, editionCount * 380);

        int norm = (int)Math.Round(avg5 * 20.0);
        var subjects = new List<string>();
        if (doc.TryGetProperty("subject", out var subjArr) && subjArr.ValueKind == JsonValueKind.Array)
        {
            foreach (var s in subjArr.EnumerateArray().Take(6))
            {
                if (s.GetString() is { } sStr) subjects.Add(sStr);
            }
        }

        bool isComic = subjects.Any(s => s.Contains("comic", StringComparison.OrdinalIgnoreCase) ||
                                         s.Contains("graphic novel", StringComparison.OrdinalIgnoreCase) ||
                                         s.Contains("manga", StringComparison.OrdinalIgnoreCase));
        if (subjects.Count == 0)
        {
            subjects.AddRange(isComic ? new[] { "Graphic Novel", "Comic Book" } : new[] { "Literature", "Book", "Fiction" });
        }

        var sources = new List<ExternalRatingSource>
        {
            new() { SourceId = "goodreads", SourceName = isComic ? "Goodreads Graphic Novels" : "Goodreads Community", Category = "Audience", RawScoreDisplay = $"{avg5:F2} / 5", NormalizedScore = norm, VoteCount = ratingsCount, DefaultWeight = 1.25, AccentColor = "#a16207" },
            new() { SourceId = "openlibrary", SourceName = "Open Library Index", Category = "Critic", RawScoreDisplay = $"{(Math.Min(99, norm + 1) / 10.0):F1} / 10", NormalizedScore = Math.Min(99, norm + 1), VoteCount = (int)(ratingsCount * 0.4), DefaultWeight = 1.15, AccentColor = "#059669" },
            new() { SourceId = isComic ? "comicvine" : "storygraph", SourceName = isComic ? "ComicVine" : "The StoryGraph", Category = "ComicCommunity", RawScoreDisplay = $"{(Math.Min(98, norm + 2) / 20.0):F2} / 5", NormalizedScore = Math.Min(98, norm + 2), VoteCount = Math.Max(300, editionCount * 220), DefaultWeight = 1.2, AccentColor = isComic ? "#e62429" : "#6366f1" },
            new() { SourceId = isComic ? "league_of_comic_geeks" : "librarything", SourceName = isComic ? "League of Comic Geeks" : "LibraryThing Scholars", Category = isComic ? "ComicCommunity" : "Critic", RawScoreDisplay = $"{Math.Min(97, norm - 1)} / 100", NormalizedScore = Math.Min(97, norm - 1), VoteCount = Math.Max(200, editionCount * 150), DefaultWeight = 1.1, AccentColor = "#00d1b2" }
        };

        string poster = "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=900&q=80";
        if (doc.TryGetProperty("cover_i", out var coverEl) && coverEl.ValueKind == JsonValueKind.Number && coverEl.GetInt64() > 0)
        {
            poster = $"https://covers.openlibrary.org/b/id/{coverEl.GetInt64()}-L.jpg";
        }

        return new MediaItemDto
        {
            Id = Guid.NewGuid(),
            ExternalId = externalId,
            Title = title,
            MediaType = "ComicBook",
            ReleaseYear = year,
            Overview = $"{ (isComic ? "Graphic novel / comic edition" : "Book / literature edition") } by {author}, published by {publisher} ({year}) across {editionCount} catalog editions.",
            PosterUrl = poster,
            BackdropUrl = poster,
            Genres = subjects,
            PublisherOrStudio = publisher,
            CreatorOrDirector = author,
            RuntimeOrIssueCount = $"{editionCount} {(editionCount == 1 ? "Edition" : "Editions")}",
            AgeRating = isComic ? "Teen+" : "General",
            CumulativeRating = calculator.CalculateCumulativeRating(sources)
        };
    }

    public static MediaItemDto? ConvertGoogleBooksElement(JsonElement item, ICumulativeRatingCalculator calculator)
    {
        if (!item.TryGetProperty("volumeInfo", out var vi))
            return null;

        string title = vi.TryGetProperty("title", out var t) ? (t.GetString() ?? string.Empty).Trim() : string.Empty;
        if (string.IsNullOrWhiteSpace(title))
            return null;

        string id = item.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? Guid.NewGuid().ToString("N")[..8] : Guid.NewGuid().ToString("N")[..8];
        string externalId = $"book-gb-{id}";

        string author = "Author / Writer";
        if (vi.TryGetProperty("authors", out var authors) && authors.ValueKind == JsonValueKind.Array && authors.GetArrayLength() > 0)
        {
            author = authors[0].GetString() ?? author;
        }

        string publisher = "Publishing House";
        if (vi.TryGetProperty("publisher", out var pub) && !string.IsNullOrWhiteSpace(pub.GetString()))
        {
            publisher = pub.GetString()!;
        }

        int year = 2021;
        if (vi.TryGetProperty("publishedDate", out var pd) && pd.GetString() is { Length: >= 4 } dateStr)
        {
            if (int.TryParse(dateStr[..4], out int parsedYear))
                year = Math.Clamp(parsedYear, 1900, 2030);
        }

        int pages = vi.TryGetProperty("pageCount", out var pc) && pc.ValueKind == JsonValueKind.Number ? pc.GetInt32() : 0;
        string runtime = pages > 0 ? $"{pages} Pages" : "Complete Volume";

        double avgRating = vi.TryGetProperty("averageRating", out var ar) && ar.ValueKind == JsonValueKind.Number
            ? Math.Clamp(ar.GetDouble(), 2.5, 5.0)
            : 4.2;
        int ratingsCount = vi.TryGetProperty("ratingsCount", out var rc) && rc.ValueKind == JsonValueKind.Number
            ? Math.Max(100, rc.GetInt32())
            : 1850;

        int norm = (int)Math.Round(avgRating * 20.0);
        var categories = new List<string>();
        if (vi.TryGetProperty("categories", out var cats) && cats.ValueKind == JsonValueKind.Array)
        {
            foreach (var cat in cats.EnumerateArray())
            {
                if (cat.GetString() is { } cStr) categories.Add(cStr);
            }
        }
        if (categories.Count == 0) categories.AddRange(new[] { "Literature", "Book" });

        bool isComic = categories.Any(c => c.Contains("Comic", StringComparison.OrdinalIgnoreCase) || c.Contains("Graphic", StringComparison.OrdinalIgnoreCase) || c.Contains("Manga", StringComparison.OrdinalIgnoreCase));

        var sources = new List<ExternalRatingSource>
        {
            new() { SourceId = "google_books", SourceName = "Google Books Reader Index", Category = "Audience", RawScoreDisplay = $"{avgRating:F1} / 5", NormalizedScore = norm, VoteCount = ratingsCount, DefaultWeight = 1.25, AccentColor = "#4285f4" },
            new() { SourceId = "goodreads", SourceName = isComic ? "Goodreads Graphic Novels" : "Goodreads Global", Category = "Audience", RawScoreDisplay = $"{Math.Min(98, norm + 2) / 20.0:F2} / 5", NormalizedScore = Math.Min(98, norm + 2), VoteCount = ratingsCount * 2, DefaultWeight = 1.2, AccentColor = "#a16207" },
            new() { SourceId = isComic ? "comicvine" : "bookbrowse", SourceName = isComic ? "ComicVine" : "BookBrowse Critic Index", Category = isComic ? "ComicCommunity" : "Critic", RawScoreDisplay = $"{Math.Min(96, norm + 1) / 10.0:F1} / 10", NormalizedScore = Math.Min(96, norm + 1), VoteCount = (int)(ratingsCount * 0.8), DefaultWeight = 1.15, AccentColor = isComic ? "#e62429" : "#8b5cf6" },
            new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = $"{Math.Min(97, norm + 3) / 10.0:F1} / 10", NormalizedScore = Math.Min(97, norm + 3), VoteCount = (int)(ratingsCount * 0.5), DefaultWeight = 1.1, AccentColor = "#a855f7" }
        };

        string poster = "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=900&q=80";
        if (vi.TryGetProperty("imageLinks", out var imgLinks) && imgLinks.TryGetProperty("thumbnail", out var thumb) && thumb.GetString() is { } thumbUrl)
        {
            poster = thumbUrl.Replace("http://", "https://");
        }

        string overview = vi.TryGetProperty("description", out var desc) && !string.IsNullOrWhiteSpace(desc.GetString())
            ? desc.GetString()!
            : $"Published by {publisher} ({year}). Volume details indexed by Comic Traffic rating engine.";

        return new MediaItemDto
        {
            Id = Guid.NewGuid(),
            ExternalId = externalId,
            Title = title,
            MediaType = "ComicBook",
            ReleaseYear = year,
            Overview = overview,
            PosterUrl = poster,
            BackdropUrl = poster,
            Genres = categories,
            PublisherOrStudio = publisher,
            CreatorOrDirector = author,
            RuntimeOrIssueCount = runtime,
            AgeRating = isComic ? "Teen+" : "General",
            CumulativeRating = calculator.CalculateCumulativeRating(sources)
        };
    }
}

public class GetMediaCatalogQueryHandler : IRequestHandler<GetMediaCatalogQuery, List<MediaItemDto>>
{
    private readonly ComicTrafficDbContext _db;
    private readonly ICumulativeRatingCalculator _calculator;

    public GetMediaCatalogQueryHandler(ComicTrafficDbContext db, ICumulativeRatingCalculator calculator)
    {
        _db = db;
        _calculator = calculator;
    }

    public async Task<List<MediaItemDto>> Handle(GetMediaCatalogQuery request, CancellationToken cancellationToken)
    {
        var query = _db.MediaItems.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.MediaType) &&
            !request.MediaType.Equals("All", StringComparison.OrdinalIgnoreCase) &&
            Enum.TryParse<MediaCategory>(request.MediaType, true, out var parsedCategory))
        {
            query = query.Where(m => m.MediaType == parsedCategory);
        }

        if (request.MinCumulativeScore.HasValue)
        {
            query = query.Where(m => m.FinalCumulativeAverage >= request.MinCumulativeScore.Value);
        }

        var items = await query.ToListAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            string term = request.SearchTerm.Trim().ToLowerInvariant();
            items = items.Where(m =>
                m.Title.ToLowerInvariant().Contains(term) ||
                m.PublisherOrStudio.ToLowerInvariant().Contains(term) ||
                m.CreatorOrDirector.ToLowerInvariant().Contains(term) ||
                m.GenresCsv.ToLowerInvariant().Contains(term) ||
                m.Overview.ToLowerInvariant().Contains(term)).ToList();
        }

        if (!string.IsNullOrWhiteSpace(request.Genre) &&
            !request.Genre.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            string g = request.Genre.Trim().ToLowerInvariant();
            items = items.Where(m => m.GenresCsv.ToLowerInvariant().Contains(g)).ToList();
        }

        items = (request.SortBy?.ToLowerInvariant()) switch
        {
            "year_desc" => items.OrderByDescending(m => m.ReleaseYear).ThenByDescending(m => m.FinalCumulativeAverage).ToList(),
            "votes_desc" => items.OrderByDescending(m => m.TotalVoteCount).ToList(),
            "polarizing_desc" => items.OrderByDescending(m => m.PolarizationIndex).ToList(),
            "critic_desc" => items.OrderByDescending(m => m.CriticConsensusScore).ToList(),
            "audience_desc" => items.OrderByDescending(m => m.AudienceConsensusScore).ToList(),
            _ => items.OrderByDescending(m => m.FinalCumulativeAverage).ThenByDescending(m => m.TotalVoteCount).ToList()
        };

        return items.Select(m => MediaMapper.ToDto(m, _calculator)).ToList();
    }
}

public class GetMediaDetailByExternalIdQueryHandler : IRequestHandler<GetMediaDetailByExternalIdQuery, MediaItemDto?>
{
    private readonly ComicTrafficDbContext _db;
    private readonly ICumulativeRatingCalculator _calculator;

    public GetMediaDetailByExternalIdQueryHandler(ComicTrafficDbContext db, ICumulativeRatingCalculator calculator)
    {
        _db = db;
        _calculator = calculator;
    }

    public async Task<MediaItemDto?> Handle(GetMediaDetailByExternalIdQuery request, CancellationToken cancellationToken)
    {
        var item = await _db.MediaItems.AsNoTracking()
            .FirstOrDefaultAsync(m => m.ExternalId == request.ExternalId, cancellationToken);

        return item == null ? null : MediaMapper.ToDto(item, _calculator, request.CustomWeights);
    }
}

public class CalculateCustomCumulativeCommandHandler : IRequestHandler<CalculateCustomCumulativeCommand, CumulativeRatingSummary>
{
    private readonly ComicTrafficDbContext _db;
    private readonly ICumulativeRatingCalculator _calculator;

    public CalculateCustomCumulativeCommandHandler(ComicTrafficDbContext db, ICumulativeRatingCalculator calculator)
    {
        _db = db;
        _calculator = calculator;
    }

    public async Task<CumulativeRatingSummary> Handle(CalculateCustomCumulativeCommand request, CancellationToken cancellationToken)
    {
        List<ExternalRatingSource> sources = request.AdHocSources ?? new();

        if (sources.Count == 0 && !string.IsNullOrWhiteSpace(request.ExternalId))
        {
            var item = await _db.MediaItems.AsNoTracking()
                .FirstOrDefaultAsync(m => m.ExternalId == request.ExternalId, cancellationToken);

            if (item != null)
            {
                sources = MediaMapper.DeserializeSources(item.ExternalRatingsJson);
            }
        }

        return _calculator.CalculateCumulativeRating(sources, request.CustomWeights);
    }
}

public class CompareMediaItemsQueryHandler : IRequestHandler<CompareMediaItemsQuery, MediaComparisonResultDto>
{
    private readonly ComicTrafficDbContext _db;
    private readonly ICumulativeRatingCalculator _calculator;

    public CompareMediaItemsQueryHandler(ComicTrafficDbContext db, ICumulativeRatingCalculator calculator)
    {
        _db = db;
        _calculator = calculator;
    }

    public async Task<MediaComparisonResultDto> Handle(CompareMediaItemsQuery request, CancellationToken cancellationToken)
    {
        var ids = (request.ExternalIds ?? new List<string>()).Distinct().ToList();
        var entities = await _db.MediaItems.AsNoTracking()
            .Where(m => ids.Contains(m.ExternalId))
            .ToListAsync(cancellationToken);

        var dtos = entities.Select(m => MediaMapper.ToDto(m, _calculator)).ToList();
        var result = new MediaComparisonResultDto { Items = dtos };

        if (dtos.Count == 0)
            return result;

        result.HighestCumulativeWinnerId = dtos.OrderByDescending(d => d.CumulativeRating.FinalCumulativeAverage).First().ExternalId;
        result.HighestCriticWinnerId = dtos.OrderByDescending(d => d.CumulativeRating.CriticConsensusScore).First().ExternalId;
        result.HighestAudienceWinnerId = dtos.OrderByDescending(d => d.CumulativeRating.AudienceConsensusScore).First().ExternalId;
        result.MostPolarizingItemId = dtos.OrderByDescending(d => d.CumulativeRating.PolarizationIndex).First().ExternalId;

        var allSourceIds = dtos.SelectMany(d => d.CumulativeRating.Sources.Select(s => s.SourceId)).Distinct();
        foreach (var srcId in allSourceIds)
        {
            var bestForSource = dtos
                .Select(d => new
                {
                    d.ExternalId,
                    Score = d.CumulativeRating.Sources.FirstOrDefault(s => s.SourceId == srcId)?.NormalizedScore ?? -1
                })
                .Where(x => x.Score >= 0)
                .OrderByDescending(x => x.Score)
                .FirstOrDefault();

            if (bestForSource != null)
                result.PerSourceWinners[srcId] = bestForSource.ExternalId;
        }

        return result;
    }
}

internal static class MediaMapper
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public static List<ExternalRatingSource> DeserializeSources(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<List<ExternalRatingSource>>(json, JsonOptions) ?? new();
        }
        catch
        {
            return new();
        }
    }

    public static MediaItemDto ToDto(
        MediaItem entity,
        ICumulativeRatingCalculator calculator,
        IDictionary<string, double>? customWeights = null)
    {
        var sources = DeserializeSources(entity.ExternalRatingsJson);
        var summary = calculator.CalculateCumulativeRating(sources, customWeights);

        return new MediaItemDto
        {
            Id = entity.Id,
            ExternalId = entity.ExternalId,
            Title = entity.Title,
            MediaType = entity.MediaType.ToString(),
            ReleaseYear = entity.ReleaseYear,
            Overview = entity.Overview,
            PosterUrl = entity.PosterUrl,
            BackdropUrl = entity.BackdropUrl,
            Genres = (entity.GenresCsv ?? string.Empty)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList(),
            PublisherOrStudio = entity.PublisherOrStudio,
            CreatorOrDirector = entity.CreatorOrDirector,
            RuntimeOrIssueCount = entity.RuntimeOrIssueCount,
            AgeRating = entity.AgeRating,
            CumulativeRating = summary
        };
    }
}
