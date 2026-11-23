using System.ComponentModel.DataAnnotations;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ComicTraffic.Api.Domain.Entities;
using ComicTraffic.Api.Infrastructure.Persistence;
using ComicTraffic.Api.Infrastructure.Security;
using ComicTraffic.Api.Infrastructure.Services;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ComicTraffic.Api.Application.Features.Auth;

public class AuthUserResponseDto
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Bio { get; set; } = string.Empty;
    public string AvatarUrl { get; set; } = string.Empty;
    public string Role { get; set; } = "User";
    public List<string> FavoriteGenres { get; set; } = new();
    public Dictionary<string, double> PreferredWeights { get; set; } = new();
    public string AccessToken { get; set; } = string.Empty;
}

public record RegisterUserCommand(
    [Required] string Username,
    [Required, EmailAddress] string Email,
    [Required] string Password,
    string? DisplayName = null,
    string? FavoriteGenresCsv = null,
    string? RequestOrigin = null,
    bool AcceptedTerms = true
) : IRequest<AuthUserResponseDto>;

public record LoginUserCommand(
    string EmailOrUsername,
    string Password
) : IRequest<AuthUserResponseDto>;

public record ForgotPasswordCommand(
    string EmailOrUsername,
    string? RequestOrigin = null
) : IRequest<ForgotPasswordResponseDto>;

public record ForgotPasswordResponseDto(
    bool IsSuccessful,
    string Message
);

public record ResetPasswordCommand(
    string EmailOrUsername,
    string Token,
    string NewPassword
) : IRequest<ResetPasswordResponseDto>;

public record ResetPasswordResponseDto(
    bool IsSuccessful,
    string Message
);

public record GetCurrentUserQuery(Guid UserId) : IRequest<AuthUserResponseDto?>;

public record UpdateUserPreferencesCommand(
    Guid UserId,
    string? DisplayName,
    string? Bio,
    string? FavoriteGenresCsv,
    Dictionary<string, double>? PreferredWeights
) : IRequest<AuthUserResponseDto>;

public class UserDataExportDto
{
    public DateTime ExportedAt { get; set; } = DateTime.UtcNow;
    public object Profile { get; set; } = new { };
    public List<WatchlistItem> Watchlist { get; set; } = new();
    public List<CustomMediaList> CustomLists { get; set; } = new();
    public List<UserReview> Reviews { get; set; } = new();
}

public record ExportUserDataQuery(Guid UserId) : IRequest<UserDataExportDto?>;

public record DeleteUserAccountCommand(
    Guid UserId,
    string? Password = null
) : IRequest<DeleteAccountResultDto>;

public record DeleteAccountResultDto(
    bool IsSuccessful,
    string Message,
    int RemovedReviews,
    int RemovedWatchlistItems,
    int RemovedCustomLists
);

public class RegisterUserCommandHandler : IRequestHandler<RegisterUserCommand, AuthUserResponseDto>
{
    private readonly ComicTrafficDbContext _db;
    private readonly IJwtTokenService _jwtService;
    private readonly IEmailService? _emailService;
    private readonly IConfiguration? _config;
    private readonly ILogger<RegisterUserCommandHandler>? _logger;

    public RegisterUserCommandHandler(
        ComicTrafficDbContext db,
        IJwtTokenService jwtService,
        IEmailService? emailService = null,
        IConfiguration? config = null,
        ILogger<RegisterUserCommandHandler>? logger = null)
    {
        _db = db;
        _jwtService = jwtService;
        _emailService = emailService;
        _config = config;
        _logger = logger;
    }

    public async Task<AuthUserResponseDto> Handle(RegisterUserCommand request, CancellationToken cancellationToken)
    {
        if (!request.AcceptedTerms)
            throw new InvalidOperationException("You must confirm minimum age eligibility and accept the Terms of Service and Privacy Policy.");
        if (string.IsNullOrWhiteSpace(request.Email))
            throw new InvalidOperationException("A valid email address is required for registration.");
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
            throw new InvalidOperationException("Password must be at least 6 characters long.");

        string normalizedEmail = request.Email.Trim().ToLowerInvariant();
        if (!MailAddress.TryCreate(normalizedEmail, out var parsedMail) ||
            !string.Equals(parsedMail.Address, normalizedEmail, StringComparison.OrdinalIgnoreCase) ||
            !parsedMail.Host.Contains('.'))
        {
            throw new InvalidOperationException("Please provide a valid email address.");
        }
        string normalizedUsername = string.IsNullOrWhiteSpace(request.Username)
            ? normalizedEmail.Split('@')[0]
            : request.Username.Trim();

        if (normalizedUsername.Length > 100)
            throw new InvalidOperationException("Username must be 100 characters or fewer.");
        if (normalizedEmail.Length > 150)
            throw new InvalidOperationException("Email address must be 150 characters or fewer.");

        string resolvedDisplayName = string.IsNullOrWhiteSpace(request.DisplayName)
            ? normalizedUsername
            : request.DisplayName.Trim();
        if (resolvedDisplayName.Length > 120)
            resolvedDisplayName = resolvedDisplayName[..120];

        bool exists = await _db.Users.AnyAsync(
            u => u.Email.ToLower() == normalizedEmail || u.Username.ToLower() == normalizedUsername.ToLower(),
            cancellationToken);

        if (exists)
            throw new InvalidOperationException("A user with that email or username already exists.");

        var newUser = new AppUser
        {
            Username = normalizedUsername,
            Email = normalizedEmail,
            DisplayName = resolvedDisplayName,
            PasswordHash = _jwtService.HashPassword(request.Password),
            FavoriteGenresCsv = string.IsNullOrWhiteSpace(request.FavoriteGenresCsv)
                ? "Action,Superhero,Sci-Fi,Graphic Novel"
                : request.FavoriteGenresCsv,
            TermsAcceptedAt = DateTime.UtcNow
        };

        _db.Users.Add(newUser);
        await _db.SaveChangesAsync(cancellationToken);

        if (_emailService != null)
        {
            string appUrl = AuthUrlSecurityHelper.ResolveSafeAppBaseUrl(request.RequestOrigin, _config);
            var emailTask = DispatchWelcomeEmailSafeAsync(
                _emailService,
                _logger,
                newUser.Id,
                newUser.Email,
                newUser.DisplayName,
                newUser.Username,
                appUrl);

            // Wait briefly so fast local/outbox dispatch completes inline,
            // without letting slow external SMTP/SendGrid APIs time out user registration.
            await Task.WhenAny(emailTask, Task.Delay(TimeSpan.FromMilliseconds(1500), cancellationToken));
        }

        return AuthMapper.ToDto(newUser, _jwtService.GenerateToken(newUser));
    }

    private static async Task DispatchWelcomeEmailSafeAsync(
        IEmailService emailService,
        ILogger<RegisterUserCommandHandler>? logger,
        Guid userId,
        string email,
        string displayName,
        string username,
        string appUrl)
    {
        try
        {
            bool sent = await emailService.SendWelcomeEmailAsync(
                email,
                displayName,
                username,
                appUrl,
                CancellationToken.None);
            if (!sent)
            {
                logger?.LogWarning("Welcome email dispatch returned failure for user ID {UserId}. Check SendGrid configuration.", userId);
            }
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "Failed to dispatch welcome email for user ID {UserId}", userId);
        }
    }
}

public class LoginUserCommandHandler : IRequestHandler<LoginUserCommand, AuthUserResponseDto>
{
    private readonly ComicTrafficDbContext _db;
    private readonly IJwtTokenService _jwtService;

    public LoginUserCommandHandler(ComicTrafficDbContext db, IJwtTokenService jwtService)
    {
        _db = db;
        _jwtService = jwtService;
    }

    public async Task<AuthUserResponseDto> Handle(LoginUserCommand request, CancellationToken cancellationToken)
    {
        string identifier = (request.EmailOrUsername ?? string.Empty).Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(
            u => u.Email.ToLower() == identifier || u.Username.ToLower() == identifier,
            cancellationToken);

        if (user == null || !_jwtService.VerifyPassword(request.Password ?? string.Empty, user.PasswordHash))
            throw new UnauthorizedAccessException("Invalid email/username or password.");

        string token = _jwtService.GenerateToken(user);
        return AuthMapper.ToDto(user, token);
    }
}

internal static class AuthUrlSecurityHelper
{
    private static readonly HashSet<string> TrustedOrigins = new(StringComparer.OrdinalIgnoreCase)
    {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "https://comictraffic.com",
        "https://www.comictraffic.com"
    };

    public static string ResolveSafeAppBaseUrl(string? requestOrigin, IConfiguration? config)
    {
        if (!string.IsNullOrWhiteSpace(requestOrigin))
        {
            string trimmedOrigin = requestOrigin.Trim().TrimEnd('/');
            if (TrustedOrigins.Contains(trimmedOrigin))
            {
                return trimmedOrigin;
            }
        }

        string candidate = Environment.GetEnvironmentVariable("APP_BASE_URL")
            ?? config?["EmailSettings:AppBaseUrl"]
            ?? string.Empty;

        if (!string.IsNullOrWhiteSpace(candidate) &&
            Uri.TryCreate(candidate.Trim(), UriKind.Absolute, out var uri) &&
            (uri.Scheme == Uri.UriSchemeHttps || (uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback)))
        {
            return uri.GetLeftPart(UriPartial.Authority);
        }
        return "https://comictraffic.com";
    }
}

internal static class PasswordResetSecurityHelper
{
    private const string TokenAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    public const int MaxFailedAttempts = 5;

    public static string GenerateRecoveryCode() =>
        string.Concat("CT-", RandomNumberGenerator.GetString(TokenAlphabet, 8));

    public static string HashRecoveryCode(string rawCode)
    {
        string normalized = (rawCode ?? string.Empty).Trim().ToUpperInvariant();
        byte[] digest = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexString(digest).ToLowerInvariant();
    }
}

public class ForgotPasswordCommandHandler : IRequestHandler<ForgotPasswordCommand, ForgotPasswordResponseDto>
{
    private const string UniformRecoveryMessage =
        "If an account matches that email or username, recovery instructions and a secure 15-minute verification code have been dispatched.";

    private readonly ComicTrafficDbContext _db;
    private readonly IEmailService _emailService;
    private readonly IConfiguration _config;
    private readonly ILogger<ForgotPasswordCommandHandler> _logger;

    public ForgotPasswordCommandHandler(
        ComicTrafficDbContext db,
        IEmailService emailService,
        IConfiguration config,
        ILogger<ForgotPasswordCommandHandler> logger)
    {
        _db = db;
        _emailService = emailService;
        _config = config;
        _logger = logger;
    }

    public async Task<ForgotPasswordResponseDto> Handle(ForgotPasswordCommand request, CancellationToken cancellationToken)
    {
        string identifier = (request.EmailOrUsername ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(identifier))
            throw new InvalidOperationException("Email or username is required.");

        var user = await _db.Users.FirstOrDefaultAsync(
            u => u.Email.ToLower() == identifier || u.Username.ToLower() == identifier,
            cancellationToken);

        if (user == null)
        {
            _logger.LogInformation("Password recovery requested for unrecognized account.");
            return new ForgotPasswordResponseDto(true, UniformRecoveryMessage);
        }

        // High-entropy 8-char cryptographic recovery code (~1.1 trillion combinations); only SHA-256 hash stored in DB
        string token = PasswordResetSecurityHelper.GenerateRecoveryCode();
        user.PasswordResetToken = PasswordResetSecurityHelper.HashRecoveryCode(token);
        user.PasswordResetExpiresAt = DateTime.UtcNow.AddMinutes(15);
        user.PasswordResetFailedAttempts = 0;
        await _db.SaveChangesAsync(cancellationToken);

        string appBaseUrl = AuthUrlSecurityHelper.ResolveSafeAppBaseUrl(request.RequestOrigin, _config);
        string resetUrl = $"{appBaseUrl.TrimEnd('/')}/reset-password?token={Uri.EscapeDataString(token)}&email={Uri.EscapeDataString(user.Email)}";

        try
        {
            bool dispatched = await _emailService.SendPasswordResetEmailAsync(user.Email, user.Username, token, resetUrl, cancellationToken);
            if (dispatched)
            {
                _logger.LogInformation("Password reset verification email dispatched for user ID {UserId}", user.Id);
            }
            else
            {
                _logger.LogWarning("Password reset email dispatch returned failure for user ID {UserId}. Check SendGrid configuration.", user.Id);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to dispatch password reset email for user ID {UserId}", user.Id);
        }

        return new ForgotPasswordResponseDto(true, UniformRecoveryMessage);
    }
}

public class ResetPasswordCommandHandler : IRequestHandler<ResetPasswordCommand, ResetPasswordResponseDto>
{
    private readonly ComicTrafficDbContext _db;
    private readonly IJwtTokenService _jwtService;
    private readonly IEmailService _emailService;
    private readonly ILogger<ResetPasswordCommandHandler> _logger;

    public ResetPasswordCommandHandler(
        ComicTrafficDbContext db,
        IJwtTokenService jwtService,
        IEmailService emailService,
        ILogger<ResetPasswordCommandHandler> logger)
    {
        _db = db;
        _jwtService = jwtService;
        _emailService = emailService;
        _logger = logger;
    }

    public async Task<ResetPasswordResponseDto> Handle(ResetPasswordCommand request, CancellationToken cancellationToken)
    {
        string identifier = (request.EmailOrUsername ?? string.Empty).Trim().ToLowerInvariant();
        string token = (request.Token ?? string.Empty).Trim();
        string newPassword = request.NewPassword ?? string.Empty;

        if (string.IsNullOrWhiteSpace(identifier) || string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("Email/username and recovery token are required.");

        if (string.IsNullOrWhiteSpace(newPassword) || newPassword.Length < 6)
            throw new InvalidOperationException("New password must be at least 6 characters long.");

        var user = await _db.Users.FirstOrDefaultAsync(
            u => u.Email.ToLower() == identifier || u.Username.ToLower() == identifier,
            cancellationToken);

        if (user == null || string.IsNullOrWhiteSpace(user.PasswordResetToken))
            throw new InvalidOperationException("Invalid recovery request. Please request a new recovery code.");

        if (user.PasswordResetExpiresAt == null || user.PasswordResetExpiresAt < DateTime.UtcNow)
            throw new InvalidOperationException("The recovery code has expired. Please request a new one.");

        byte[] expectedBytes = Encoding.UTF8.GetBytes(user.PasswordResetToken.Trim().ToLowerInvariant());
        byte[] providedBytes = Encoding.UTF8.GetBytes(PasswordResetSecurityHelper.HashRecoveryCode(token));
        if (expectedBytes.Length != providedBytes.Length ||
            !CryptographicOperations.FixedTimeEquals(expectedBytes, providedBytes))
        {
            user.PasswordResetFailedAttempts++;
            if (user.PasswordResetFailedAttempts >= PasswordResetSecurityHelper.MaxFailedAttempts)
            {
                user.PasswordResetToken = null;
                user.PasswordResetExpiresAt = null;
                user.PasswordResetFailedAttempts = 0;
                await _db.SaveChangesAsync(cancellationToken);
                throw new InvalidOperationException("Too many invalid recovery attempts. For your security, please request a new recovery code.");
            }
            await _db.SaveChangesAsync(cancellationToken);
            throw new InvalidOperationException("Incorrect recovery code. Please check the code and try again.");
        }

        user.PasswordHash = _jwtService.HashPassword(newPassword);
        user.PasswordResetToken = null;
        user.PasswordResetExpiresAt = null;
        user.PasswordResetFailedAttempts = 0;
        await _db.SaveChangesAsync(cancellationToken);

        try
        {
            await _emailService.SendPasswordResetConfirmationEmailAsync(user.Email, user.Username, cancellationToken);
            _logger.LogInformation("Password reset confirmation email sent for user ID {UserId}", user.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send password reset confirmation email for user ID {UserId}", user.Id);
        }

        return new ResetPasswordResponseDto(true, "Your password has been successfully reset. A confirmation email has been sent. You may now sign in.");
    }
}

public class GetCurrentUserQueryHandler : IRequestHandler<GetCurrentUserQuery, AuthUserResponseDto?>
{
    private readonly ComicTrafficDbContext _db;
    private readonly IJwtTokenService _jwtService;

    public GetCurrentUserQueryHandler(ComicTrafficDbContext db, IJwtTokenService jwtService)
    {
        _db = db;
        _jwtService = jwtService;
    }

    public async Task<AuthUserResponseDto?> Handle(GetCurrentUserQuery request, CancellationToken cancellationToken)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == request.UserId, cancellationToken);
        if (user == null)
            return null;

        return AuthMapper.ToDto(user, _jwtService.GenerateToken(user));
    }
}

public class UpdateUserPreferencesCommandHandler : IRequestHandler<UpdateUserPreferencesCommand, AuthUserResponseDto>
{
    private readonly ComicTrafficDbContext _db;
    private readonly IJwtTokenService _jwtService;

    public UpdateUserPreferencesCommandHandler(ComicTrafficDbContext db, IJwtTokenService jwtService)
    {
        _db = db;
        _jwtService = jwtService;
    }

    public async Task<AuthUserResponseDto> Handle(UpdateUserPreferencesCommand request, CancellationToken cancellationToken)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == request.UserId, cancellationToken)
            ?? throw new KeyNotFoundException("User not found.");

        if (!string.IsNullOrWhiteSpace(request.DisplayName))
            user.DisplayName = request.DisplayName.Trim();
        if (request.Bio != null)
            user.Bio = request.Bio.Trim();
        if (!string.IsNullOrWhiteSpace(request.FavoriteGenresCsv))
            user.FavoriteGenresCsv = request.FavoriteGenresCsv.Trim();
        if (request.PreferredWeights != null)
            user.PreferredWeightsJson = JsonSerializer.Serialize(request.PreferredWeights);

        await _db.SaveChangesAsync(cancellationToken);
        return AuthMapper.ToDto(user, _jwtService.GenerateToken(user));
    }
}

public class ExportUserDataQueryHandler : IRequestHandler<ExportUserDataQuery, UserDataExportDto?>
{
    private readonly ComicTrafficDbContext _db;

    public ExportUserDataQueryHandler(ComicTrafficDbContext db)
    {
        _db = db;
    }

    public async Task<UserDataExportDto?> Handle(ExportUserDataQuery request, CancellationToken cancellationToken)
    {
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == request.UserId, cancellationToken);
        if (user == null)
            return null;

        var watchlist = await _db.WatchlistItems.AsNoTracking()
            .Where(w => w.UserId == request.UserId)
            .OrderByDescending(w => w.UpdatedAt)
            .ToListAsync(cancellationToken);

        var customLists = await _db.CustomLists.AsNoTracking()
            .Where(l => l.UserId == request.UserId)
            .OrderByDescending(l => l.CreatedAt)
            .ToListAsync(cancellationToken);

        var reviews = await _db.Reviews.AsNoTracking()
            .Where(r => r.UserId == request.UserId)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync(cancellationToken);

        return new UserDataExportDto
        {
            ExportedAt = DateTime.UtcNow,
            Profile = new
            {
                user.Id,
                user.Username,
                user.Email,
                user.DisplayName,
                user.Bio,
                user.AvatarUrl,
                user.Role,
                user.FavoriteGenresCsv,
                user.PreferredWeightsJson,
                user.TermsAcceptedAt,
                user.CreatedAt
            },
            Watchlist = watchlist,
            CustomLists = customLists,
            Reviews = reviews
        };
    }
}

public class DeleteUserAccountCommandHandler : IRequestHandler<DeleteUserAccountCommand, DeleteAccountResultDto>
{
    private readonly ComicTrafficDbContext _db;
    private readonly IJwtTokenService _jwtService;
    private readonly ICumulativeRatingCalculator _calculator;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public DeleteUserAccountCommandHandler(
        ComicTrafficDbContext db,
        IJwtTokenService jwtService,
        ICumulativeRatingCalculator calculator)
    {
        _db = db;
        _jwtService = jwtService;
        _calculator = calculator;
    }

    public async Task<DeleteAccountResultDto> Handle(DeleteUserAccountCommand request, CancellationToken cancellationToken)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == request.UserId, cancellationToken);
        if (user == null)
            throw new KeyNotFoundException("Account not found.");

        if (!string.IsNullOrWhiteSpace(request.Password) &&
            !_jwtService.VerifyPassword(request.Password, user.PasswordHash))
        {
            throw new UnauthorizedAccessException("Password confirmation failed. Account was not deleted.");
        }

        var userReviews = await _db.Reviews.Where(r => r.UserId == user.Id).ToListAsync(cancellationToken);
        var affectedMediaIds = userReviews
            .Select(r => r.ExternalMediaId)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var watchlist = await _db.WatchlistItems.Where(w => w.UserId == user.Id).ToListAsync(cancellationToken);
        var customLists = await _db.CustomLists.Where(l => l.UserId == user.Id).ToListAsync(cancellationToken);

        _db.Reviews.RemoveRange(userReviews);
        _db.WatchlistItems.RemoveRange(watchlist);
        _db.CustomLists.RemoveRange(customLists);
        _db.Users.Remove(user);
        await _db.SaveChangesAsync(cancellationToken);

        foreach (var mediaId in affectedMediaIds)
        {
            var mediaItem = await _db.MediaItems.FirstOrDefaultAsync(m => m.ExternalId == mediaId, cancellationToken);
            if (mediaItem == null) continue;

            var remainingReviews = await _db.Reviews.AsNoTracking()
                .Where(r => r.ExternalMediaId == mediaId)
                .ToListAsync(cancellationToken);

            var sources = JsonSerializer.Deserialize<List<ExternalRatingSource>>(mediaItem.ExternalRatingsJson, JsonOptions) ?? new();
            sources.RemoveAll(s => string.Equals(s.SourceId, "comictraffic_community", StringComparison.OrdinalIgnoreCase));

            if (remainingReviews.Count > 0)
            {
                double avg = Math.Round(remainingReviews.Average(r => r.Score), 1);
                sources.Add(new ExternalRatingSource
                {
                    SourceId = "comictraffic_community",
                    SourceName = "ComicTraffic Community",
                    Category = "ComicCommunity",
                    NormalizedScore = avg,
                    RawScoreDisplay = $"{Math.Round(avg / 10.0, 1)} / 10",
                    VoteCount = remainingReviews.Count,
                    DefaultWeight = 1.15,
                    AccentColor = "#a855f7"
                });
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
        }

        if (affectedMediaIds.Count > 0)
        {
            await _db.SaveChangesAsync(cancellationToken);
        }

        return new DeleteAccountResultDto(
            true,
            "Your Comic Traffic account and all associated personal data have been permanently deleted.",
            userReviews.Count,
            watchlist.Count,
            customLists.Count);
    }
}

internal static class AuthMapper
{
    public static AuthUserResponseDto ToDto(AppUser user, string token)
    {
        Dictionary<string, double> weights = new();
        try
        {
            if (!string.IsNullOrWhiteSpace(user.PreferredWeightsJson))
            {
                weights = JsonSerializer.Deserialize<Dictionary<string, double>>(user.PreferredWeightsJson) ?? new();
            }
        }
        catch
        {
            weights = new();
        }

        return new AuthUserResponseDto
        {
            Id = user.Id,
            Username = user.Username,
            Email = user.Email,
            DisplayName = user.DisplayName,
            Bio = user.Bio,
            AvatarUrl = user.AvatarUrl,
            Role = user.Role,
            FavoriteGenres = (user.FavoriteGenresCsv ?? string.Empty)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList(),
            PreferredWeights = weights,
            AccessToken = token
        };
    }
}
