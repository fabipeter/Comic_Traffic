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
    string? RequestOrigin = null
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

        bool exists = await _db.Users.AnyAsync(
            u => u.Email.ToLower() == normalizedEmail || u.Username.ToLower() == normalizedUsername.ToLower(),
            cancellationToken);

        if (exists)
            throw new InvalidOperationException("A user with that email or username already exists.");

        var newUser = new AppUser
        {
            Username = normalizedUsername,
            Email = normalizedEmail,
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? normalizedUsername : request.DisplayName.Trim(),
            PasswordHash = _jwtService.HashPassword(request.Password),
            FavoriteGenresCsv = string.IsNullOrWhiteSpace(request.FavoriteGenresCsv)
                ? "Action,Superhero,Sci-Fi,Graphic Novel"
                : request.FavoriteGenresCsv
        };

        _db.Users.Add(newUser);
        await _db.SaveChangesAsync(cancellationToken);

        if (_emailService != null)
        {
            string appUrl = AuthUrlSecurityHelper.ResolveSafeAppBaseUrl(request.RequestOrigin, _config);
            try
            {
                bool sent = await _emailService.SendWelcomeEmailAsync(
                    newUser.Email,
                    newUser.DisplayName,
                    newUser.Username,
                    appUrl,
                    cancellationToken);
                if (!sent)
                {
                    _logger?.LogWarning("Welcome email dispatch returned failure for user ID {UserId}. Check SendGrid configuration.", newUser.Id);
                }
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "Failed to dispatch welcome email for user ID {UserId}", newUser.Id);
            }
        }

        return AuthMapper.ToDto(newUser, _jwtService.GenerateToken(newUser));
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
