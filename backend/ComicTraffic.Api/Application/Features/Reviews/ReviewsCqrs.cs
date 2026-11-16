using System.Text.Json;
using ComicTraffic.Api.Domain.Entities;
using ComicTraffic.Api.Infrastructure.Persistence;
using ComicTraffic.Api.Infrastructure.Services;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComicTraffic.Api.Application.Features.Reviews;

public class ReviewResultDto
{
    public UserReview Review { get; set; } = new();
    public double UpdatedCumulativeAverage { get; set; }
    public double UpdatedCommunityScore { get; set; }
}

public record GetMediaReviewsQuery(string ExternalMediaId) : IRequest<List<UserReview>>;

public record SubmitReviewCommand(
    Guid UserId,
    string Username,
    string ExternalMediaId,
    string MediaTitle,
    string MediaType,
    double Score,
    string Headline,
    string ReviewText,
    bool ContainsSpoilers = false
) : IRequest<ReviewResultDto>;

public record VoteReviewHelpfulCommand(Guid ReviewId) : IRequest<UserReview?>;

public class GetMediaReviewsQueryHandler : IRequestHandler<GetMediaReviewsQuery, List<UserReview>>
{
    private readonly ComicTrafficDbContext _db;

    public GetMediaReviewsQueryHandler(ComicTrafficDbContext db)
    {
        _db = db;
    }

    public async Task<List<UserReview>> Handle(GetMediaReviewsQuery request, CancellationToken cancellationToken)
    {
        return await _db.Reviews.AsNoTracking()
            .Where(r => r.ExternalMediaId == request.ExternalMediaId)
            .OrderByDescending(r => r.HelpfulVotes)
            .ThenByDescending(r => r.CreatedAt)
            .ToListAsync(cancellationToken);
    }
}

public class SubmitReviewCommandHandler : IRequestHandler<SubmitReviewCommand, ReviewResultDto>
{
    private readonly ComicTrafficDbContext _db;
    private readonly ICumulativeRatingCalculator _calculator;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public SubmitReviewCommandHandler(ComicTrafficDbContext db, ICumulativeRatingCalculator calculator)
    {
        _db = db;
        _calculator = calculator;
    }

    public async Task<ReviewResultDto> Handle(SubmitReviewCommand request, CancellationToken cancellationToken)
    {
        double normalizedScore = Math.Clamp(request.Score, 0, 100);
        Enum.TryParse<MediaCategory>(request.MediaType, true, out var category);

        string authorHandle = !string.IsNullOrWhiteSpace(request.Username)
            ? request.Username.Trim()
            : $"User_{request.UserId.ToString("N")[..6]}";

        var review = new UserReview
        {
            UserId = request.UserId,
            Username = authorHandle,
            ExternalMediaId = request.ExternalMediaId,
            MediaTitle = request.MediaTitle,
            MediaType = category,
            Score = normalizedScore,
            Headline = request.Headline.Trim(),
            ReviewText = request.ReviewText.Trim(),
            ContainsSpoilers = request.ContainsSpoilers,
            HelpfulVotes = 1,
            CreatedAt = DateTime.UtcNow
        };

        _db.Reviews.Add(review);

        double updatedCumulative = normalizedScore;
        double updatedCommunity = normalizedScore;

        var mediaItem = await _db.MediaItems.FirstOrDefaultAsync(
            m => m.ExternalId == request.ExternalMediaId,
            cancellationToken);

        if (mediaItem != null)
        {
            var sources = JsonSerializer.Deserialize<List<ExternalRatingSource>>(mediaItem.ExternalRatingsJson, JsonOptions) ?? new();
            var communitySource = sources.FirstOrDefault(s => s.SourceId == "comictraffic_community");

            if (communitySource != null)
            {
                int prevVotes = Math.Max(1, communitySource.VoteCount);
                double newCommunityScore = ((communitySource.NormalizedScore * prevVotes) + normalizedScore) / (prevVotes + 1);
                communitySource.NormalizedScore = Math.Round(newCommunityScore, 1);
                communitySource.VoteCount = prevVotes + 1;
                communitySource.RawScoreDisplay = $"{Math.Round(communitySource.NormalizedScore / 10.0, 1)} / 10";
                updatedCommunity = communitySource.NormalizedScore;
            }
            else
            {
                sources.Add(new ExternalRatingSource
                {
                    SourceId = "comictraffic_community",
                    SourceName = "ComicTraffic Community",
                    Category = "ComicCommunity",
                    NormalizedScore = normalizedScore,
                    RawScoreDisplay = $"{Math.Round(normalizedScore / 10.0, 1)} / 10",
                    VoteCount = 1,
                    DefaultWeight = 1.15,
                    AccentColor = "#a855f7"
                });
                updatedCommunity = normalizedScore;
            }

            var summary = _calculator.CalculateCumulativeRating(sources);
            mediaItem.ExternalRatingsJson = JsonSerializer.Serialize(sources, JsonOptions);
            mediaItem.FinalCumulativeAverage = summary.FinalCumulativeAverage;
            mediaItem.BayesianWeightedScore = summary.BayesianWeightedScore;
            mediaItem.CriticConsensusScore = summary.CriticConsensusScore;
            mediaItem.AudienceConsensusScore = summary.AudienceConsensusScore;
            mediaItem.PolarizationIndex = summary.PolarizationIndex;
            mediaItem.ConsensusTier = summary.ConsensusTier;
            mediaItem.TotalVoteCount = summary.TotalAggregatedVotes;
            mediaItem.LastUpdated = DateTime.UtcNow;

            updatedCumulative = summary.FinalCumulativeAverage;
        }

        await _db.SaveChangesAsync(cancellationToken);

        return new ReviewResultDto
        {
            Review = review,
            UpdatedCumulativeAverage = updatedCumulative,
            UpdatedCommunityScore = updatedCommunity
        };
    }
}

public class VoteReviewHelpfulCommandHandler : IRequestHandler<VoteReviewHelpfulCommand, UserReview?>
{
    private readonly ComicTrafficDbContext _db;

    public VoteReviewHelpfulCommandHandler(ComicTrafficDbContext db)
    {
        _db = db;
    }

    public async Task<UserReview?> Handle(VoteReviewHelpfulCommand request, CancellationToken cancellationToken)
    {
        var review = await _db.Reviews.FirstOrDefaultAsync(r => r.Id == request.ReviewId, cancellationToken);
        if (review == null)
            return null;

        review.HelpfulVotes += 1;
        await _db.SaveChangesAsync(cancellationToken);
        return review;
    }
}
