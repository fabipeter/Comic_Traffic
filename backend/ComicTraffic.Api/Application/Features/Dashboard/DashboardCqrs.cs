using ComicTraffic.Api.Domain.Entities;
using ComicTraffic.Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComicTraffic.Api.Application.Features.Dashboard;

public class UserDashboardSummaryDto
{
    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public int TotalTrackedItems { get; set; }
    public int TotalReviewsWritten { get; set; }
    public int MoviesTrackedCount { get; set; }
    public int TvSeriesTrackedCount { get; set; }
    public int ComicBooksTrackedCount { get; set; }
    public int GamesTrackedCount { get; set; }
    public double UserAveragePersonalScore { get; set; }
    public double GlobalAverageOfTrackedItems { get; set; }
    public double UserVsGlobalDelta { get; set; }
    public Dictionary<string, int> StatusBreakdown { get; set; } = new();
    public List<WatchlistItem> Watchlist { get; set; } = new();
    public List<UserReview> RecentReviews { get; set; } = new();
    public List<CustomMediaList> CustomLists { get; set; } = new();
}

public record GetUserDashboardQuery(Guid UserId) : IRequest<UserDashboardSummaryDto>;

public record UpsertWatchlistCommand(
    Guid UserId,
    string ExternalMediaId,
    string Title,
    string MediaType,
    string PosterUrl,
    double CumulativeAverage,
    double? UserPersonalScore,
    string Status,
    string? Notes
) : IRequest<WatchlistItem>;

public record RemoveWatchlistCommand(Guid UserId, string ExternalMediaId) : IRequest<bool>;

public record CreateCustomListCommand(
    Guid UserId,
    string OwnerUsername,
    string Name,
    string Description,
    bool IsPublic,
    List<string> ExternalMediaIds
) : IRequest<CustomMediaList>;

public class GetUserDashboardQueryHandler : IRequestHandler<GetUserDashboardQuery, UserDashboardSummaryDto>
{
    private readonly ComicTrafficDbContext _db;

    public GetUserDashboardQueryHandler(ComicTrafficDbContext db)
    {
        _db = db;
    }

    public async Task<UserDashboardSummaryDto> Handle(GetUserDashboardQuery request, CancellationToken cancellationToken)
    {
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == request.UserId, cancellationToken);
        var watchlist = await _db.WatchlistItems.AsNoTracking()
            .Where(w => w.UserId == request.UserId)
            .OrderByDescending(w => w.UpdatedAt)
            .ToListAsync(cancellationToken);

        var reviews = await _db.Reviews.AsNoTracking()
            .Where(r => r.UserId == request.UserId)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync(cancellationToken);

        var lists = await _db.CustomLists.AsNoTracking()
            .Where(c => c.UserId == request.UserId || c.IsPublic)
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync(cancellationToken);

        var scoredItems = watchlist.Where(w => w.UserPersonalScore.HasValue).ToList();
        double avgPersonal = scoredItems.Count > 0
            ? Math.Round(scoredItems.Average(w => w.UserPersonalScore!.Value), 1)
            : (reviews.Count > 0 ? Math.Round(reviews.Average(r => r.Score), 1) : 0);

        double avgGlobal = watchlist.Count > 0
            ? Math.Round(watchlist.Average(w => w.CumulativeAverage), 1)
            : 0;

        var statusBreakdown = watchlist
            .GroupBy(w => w.Status)
            .ToDictionary(g => g.Key, g => g.Count());

        return new UserDashboardSummaryDto
        {
            UserId = request.UserId,
            Username = user?.Username ?? string.Empty,
            DisplayName = user?.DisplayName ?? "Member",
            TotalTrackedItems = watchlist.Count,
            TotalReviewsWritten = reviews.Count,
            MoviesTrackedCount = watchlist.Count(w => w.MediaType == MediaCategory.Movie),
            TvSeriesTrackedCount = watchlist.Count(w => w.MediaType == MediaCategory.TvSeries),
            ComicBooksTrackedCount = watchlist.Count(w => w.MediaType == MediaCategory.ComicBook),
            GamesTrackedCount = watchlist.Count(w => w.MediaType == MediaCategory.Game),
            UserAveragePersonalScore = avgPersonal,
            GlobalAverageOfTrackedItems = avgGlobal,
            UserVsGlobalDelta = Math.Round(avgPersonal - avgGlobal, 1),
            StatusBreakdown = statusBreakdown,
            Watchlist = watchlist,
            RecentReviews = reviews,
            CustomLists = lists
        };
    }
}

public class UpsertWatchlistCommandHandler : IRequestHandler<UpsertWatchlistCommand, WatchlistItem>
{
    private readonly ComicTrafficDbContext _db;

    public UpsertWatchlistCommandHandler(ComicTrafficDbContext db)
    {
        _db = db;
    }

    public async Task<WatchlistItem> Handle(UpsertWatchlistCommand request, CancellationToken cancellationToken)
    {
        Enum.TryParse<MediaCategory>(request.MediaType, true, out var category);

        var existing = await _db.WatchlistItems.FirstOrDefaultAsync(
            w => w.UserId == request.UserId && w.ExternalMediaId == request.ExternalMediaId,
            cancellationToken);

        if (existing != null)
        {
            existing.Status = string.IsNullOrWhiteSpace(request.Status) ? existing.Status : request.Status;
            existing.UserPersonalScore = request.UserPersonalScore ?? existing.UserPersonalScore;
            existing.CumulativeAverage = request.CumulativeAverage > 0 ? request.CumulativeAverage : existing.CumulativeAverage;
            if (request.Notes != null)
                existing.Notes = request.Notes;
            existing.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
            return existing;
        }

        var item = new WatchlistItem
        {
            UserId = request.UserId,
            ExternalMediaId = request.ExternalMediaId,
            Title = request.Title,
            MediaType = category,
            PosterUrl = request.PosterUrl,
            CumulativeAverage = request.CumulativeAverage,
            UserPersonalScore = request.UserPersonalScore,
            Status = string.IsNullOrWhiteSpace(request.Status) ? "PlanToWatch" : request.Status,
            Notes = request.Notes ?? string.Empty,
            UpdatedAt = DateTime.UtcNow
        };

        _db.WatchlistItems.Add(item);
        await _db.SaveChangesAsync(cancellationToken);
        return item;
    }
}

public class RemoveWatchlistCommandHandler : IRequestHandler<RemoveWatchlistCommand, bool>
{
    private readonly ComicTrafficDbContext _db;

    public RemoveWatchlistCommandHandler(ComicTrafficDbContext db)
    {
        _db = db;
    }

    public async Task<bool> Handle(RemoveWatchlistCommand request, CancellationToken cancellationToken)
    {
        var existing = await _db.WatchlistItems.FirstOrDefaultAsync(
            w => w.UserId == request.UserId && w.ExternalMediaId == request.ExternalMediaId,
            cancellationToken);

        if (existing == null)
            return false;

        _db.WatchlistItems.Remove(existing);
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }
}

public class CreateCustomListCommandHandler : IRequestHandler<CreateCustomListCommand, CustomMediaList>
{
    private readonly ComicTrafficDbContext _db;

    public CreateCustomListCommandHandler(ComicTrafficDbContext db)
    {
        _db = db;
    }

    public async Task<CustomMediaList> Handle(CreateCustomListCommand request, CancellationToken cancellationToken)
    {
        var list = new CustomMediaList
        {
            UserId = request.UserId,
            OwnerUsername = string.IsNullOrWhiteSpace(request.OwnerUsername) ? "comicwarden" : request.OwnerUsername,
            Name = request.Name.Trim(),
            Description = request.Description.Trim(),
            IsPublic = request.IsPublic,
            ExternalMediaIdsCsv = string.Join(",", request.ExternalMediaIds ?? new List<string>()),
            CreatedAt = DateTime.UtcNow
        };

        _db.CustomLists.Add(list);
        await _db.SaveChangesAsync(cancellationToken);
        return list;
    }
}
