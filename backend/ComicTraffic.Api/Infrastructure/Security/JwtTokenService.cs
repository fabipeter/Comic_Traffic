using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using ComicTraffic.Api.Domain.Entities;
using Microsoft.IdentityModel.Tokens;

namespace ComicTraffic.Api.Infrastructure.Security;

public interface IJwtTokenService
{
    string GenerateToken(AppUser user);
    string HashPassword(string password);
    bool VerifyPassword(string password, string storedHash);
}

public class JwtTokenService : IJwtTokenService
{
    private readonly string _jwtKey;
    private readonly string _issuer;
    private readonly string _audience;

    public JwtTokenService(IConfiguration configuration)
    {
        _jwtKey = Environment.GetEnvironmentVariable("JWT_SIGNING_KEY")
            ?? (string.IsNullOrWhiteSpace(configuration["Jwt:Key"])
                ? "ComicTraffic_SuperSecret_JwtSigningKey_2026_AtLeast32Chars!"
                : configuration["Jwt:Key"]!);
        _issuer = configuration["Jwt:Issuer"] ?? "ComicTraffic.Api";
        _audience = configuration["Jwt:Audience"] ?? "ComicTraffic.Client";
    }

    public string GenerateToken(AppUser user)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Role, user.Role),
            new("displayName", user.DisplayName)
        };

        var keyBytes = SHA256.HashData(Encoding.UTF8.GetBytes(_jwtKey));
        var securityKey = new SymmetricSecurityKey(keyBytes);
        var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddDays(7),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string HashPassword(string password)
    {
        byte[] salt = RandomNumberGenerator.GetBytes(16);
        byte[] hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            iterations: 10000,
            hashAlgorithm: HashAlgorithmName.SHA256,
            outputLength: 32);

        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public bool VerifyPassword(string password, string storedHash)
    {
        var parts = storedHash.Split('.');
        if (parts.Length != 2)
            return false;

        byte[] salt = Convert.FromBase64String(parts[0]);
        byte[] expectedHash = Convert.FromBase64String(parts[1]);

        byte[] actualHash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            iterations: 10000,
            hashAlgorithm: HashAlgorithmName.SHA256,
            outputLength: 32);

        return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
    }
}
