using System.ComponentModel.DataAnnotations;

namespace ComicTraffic.Api.Domain.Entities;

public enum MediaCategory
{
    Movie = 0,
    TvSeries = 1,
    ComicBook = 2
}

public class AppUser
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    [Required, MaxLength(100)]
    public string Username { get; set; } = string.Empty;
    [Required, MaxLength(150)]
    public string Email { get; set; } = string.Empty;
    [Required]
    public string PasswordHash { get; set; } = string.Empty;
    [MaxLength(120)]
    public string DisplayName { get; set; } = string.Empty;
    [MaxLength(500)]
    public string Bio { get; set; } = "Comic book, cinema & series enthusiast.";
    public string AvatarUrl { get; set; } = "/default-avatar.svg";
    public string Role { get; set; } = "User";
    public string FavoriteGenresCsv { get; set; } = "Action,Sci-Fi,Superhero,Noir";
    public string PreferredWeightsJson { get; set; } = "{}";
    [MaxLength(200)]
    public string? PasswordResetToken { get; set; }
    public DateTime? PasswordResetExpiresAt { get; set; }
    public int PasswordResetFailedAttempts { get; set; } = 0;
    public DateTime? TermsAcceptedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class ExternalRatingSource
{
    public string SourceId { get; set; } = string.Empty;
    public string SourceName { get; set; } = string.Empty;
    public string Category { get; set; } = "Audience"; // Critic | Audience | ComicCommunity
    public string RawScoreDisplay { get; set; } = string.Empty; // e.g., "8.8/10", "94%", "4.6/5"
    public double NormalizedScore { get; set; } // 0 - 100 scale
    public int VoteCount { get; set; }
    public double DefaultWeight { get; set; } = 1.0;
    public string AccentColor { get; set; } = "#f5c518";
    public string SourceUrl { get; set; } = string.Empty;
    public bool IsVerifiedApi { get; set; } = true;
}

public class CumulativeRatingSummary
{
    public double FinalCumulativeAverage { get; set; } // 0 - 100
    public double FinalStarScoreOutOfTen { get; set; } // 0 - 10.0
    public double SimpleArithmeticAverage { get; set; } // 0 - 100
    public double BayesianWeightedScore { get; set; } // 0 - 100
    public double CriticConsensusScore { get; set; } // 0 - 100
    public double AudienceConsensusScore { get; set; } // 0 - 100
    public double ComicCommunityScore { get; set; } // 0 - 100
    public double PolarizationIndex { get; set; } // Standard deviation across platforms
    public string ConsensusTier { get; set; } = "Universal Acclaim";
    public int TotalAggregatedVotes { get; set; }
    public int ActiveSourceCount { get; set; }
    public List<ExternalRatingSource> Sources { get; set; } = new();
}

public class MediaItem
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    [Required, MaxLength(80)]
    public string ExternalId { get; set; } = string.Empty; // e.g. "tmdb-movie-299536" or "comic-watchmen-1986"
    [Required, MaxLength(250)]
    public string Title { get; set; } = string.Empty;
    public MediaCategory MediaType { get; set; } = MediaCategory.Movie;
    public int ReleaseYear { get; set; }
    public string Overview { get; set; } = string.Empty;
    public string PosterUrl { get; set; } = string.Empty;
    public string BackdropUrl { get; set; } = string.Empty;
    public string GenresCsv { get; set; } = string.Empty;
    public string PublisherOrStudio { get; set; } = string.Empty; // Marvel, DC, Image, Warner Bros, HBO, etc.
    public string CreatorOrDirector { get; set; } = string.Empty;
    public string RuntimeOrIssueCount { get; set; } = string.Empty; // e.g., "149 min", "24 Episodes", "12 Issues"
    public string AgeRating { get; set; } = "PG-13";
    public string ExternalRatingsJson { get; set; } = "[]";
    public double FinalCumulativeAverage { get; set; }
    public double BayesianWeightedScore { get; set; }
    public double CriticConsensusScore { get; set; }
    public double AudienceConsensusScore { get; set; }
    public double PolarizationIndex { get; set; }
    public string ConsensusTier { get; set; } = string.Empty;
    public int TotalVoteCount { get; set; }
    public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
}

public class UserReview
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string UserAvatarUrl { get; set; } = string.Empty;
    [Required, MaxLength(80)]
    public string ExternalMediaId { get; set; } = string.Empty;
    public string MediaTitle { get; set; } = string.Empty;
    public MediaCategory MediaType { get; set; }
    public double Score { get; set; } // 0 - 100
    [Required, MaxLength(160)]
    public string Headline { get; set; } = string.Empty;
    [Required, MaxLength(2000)]
    public string ReviewText { get; set; } = string.Empty;
    public bool ContainsSpoilers { get; set; }
    public int HelpfulVotes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class WatchlistItem
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    [Required, MaxLength(80)]
    public string ExternalMediaId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public MediaCategory MediaType { get; set; }
    public string PosterUrl { get; set; } = string.Empty;
    public double CumulativeAverage { get; set; }
    public double? UserPersonalScore { get; set; }
    public string Status { get; set; } = "PlanToWatch"; // PlanToWatch, Watching, Reading, Completed, OnHold, Dropped
    public string Notes { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class CustomMediaList
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string OwnerUsername { get; set; } = string.Empty;
    [Required, MaxLength(140)]
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool IsPublic { get; set; } = true;
    public string ExternalMediaIdsCsv { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class ContentReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? ReviewId { get; set; }
    [MaxLength(128)]
    public string ExternalMediaId { get; set; } = string.Empty;
    public Guid? ReporterUserId { get; set; }
    [Required, MaxLength(80)]
    public string Reason { get; set; } = "Other"; // Spam, Harassment, Spoilers, CopyrightDMCA, Other
    [MaxLength(1000)]
    public string Details { get; set; } = string.Empty;
    [MaxLength(32)]
    public string Status { get; set; } = "Open"; // Open, Reviewed, Dismissed, Actioned
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
