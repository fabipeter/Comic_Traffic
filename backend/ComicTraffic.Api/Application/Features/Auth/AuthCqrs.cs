using System.Text.Json;
using ComicTraffic.Api.Domain.Entities;
using ComicTraffic.Api.Infrastructure.Persistence;
using ComicTraffic.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

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
    string Username,
    string Email,
    string Password,
    string? DisplayName = null,
    string? FavoriteGenresCsv = null
) : IRequest<AuthUserResponseDto>;

public record LoginUserCommand(
    string EmailOrUsername,
    string Password
) : IRequest<AuthUserResponseDto>;

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

    public RegisterUserCommandHandler(ComicTrafficDbContext db, IJwtTokenService jwtService)
    {
        _db = db;
        _jwtService = jwtService;
    }

    public async Task<AuthUserResponseDto> Handle(RegisterUserCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            throw new InvalidOperationException("Email and password are required.");

        string normalizedEmail = request.Email.Trim().ToLowerInvariant();
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
