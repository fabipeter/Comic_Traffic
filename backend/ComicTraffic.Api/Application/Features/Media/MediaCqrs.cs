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
