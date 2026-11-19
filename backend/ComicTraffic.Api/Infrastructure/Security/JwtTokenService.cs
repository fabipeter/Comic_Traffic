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
    private readonly byte[] _jwtKeyBytes;
    private readonly string _issuer;
    private readonly string _audience;

    public JwtTokenService(IConfiguration configuration)
    {
        _jwtKeyBytes = SecurityDefaults.GetJwtKey(configuration);
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

        var securityKey = new SymmetricSecurityKey(_jwtKeyBytes);
        var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddDays(7),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private const int CurrentPbkdf2Iterations = 210000;
    private const int LegacyPbkdf2Iterations = 10000;

    public string HashPassword(string password)
    {
        byte[] salt = RandomNumberGenerator.GetBytes(16);
        byte[] hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            iterations: CurrentPbkdf2Iterations,
            hashAlgorithm: HashAlgorithmName.SHA256,
            outputLength: 32);

        return $"v2.{CurrentPbkdf2Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public bool VerifyPassword(string password, string storedHash)
    {
        if (string.IsNullOrWhiteSpace(storedHash))
            return false;

        var parts = storedHash.Split('.');
        int iterations;
        string saltB64;
        string hashB64;

        if (parts.Length == 4 && parts[0] == "v2" && int.TryParse(parts[1], out int parsedIter) && parsedIter >= 10000)
        {
            iterations = parsedIter;
            saltB64 = parts[2];
            hashB64 = parts[3];
        }
        else if (parts.Length == 2)
        {
            iterations = LegacyPbkdf2Iterations;
            saltB64 = parts[0];
            hashB64 = parts[1];
        }
        else
        {
            return false;
        }

        byte[] salt = Convert.FromBase64String(saltB64);
        byte[] expectedHash = Convert.FromBase64String(hashB64);

        byte[] actualHash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            iterations: iterations,
            hashAlgorithm: HashAlgorithmName.SHA256,
            outputLength: expectedHash.Length);

        return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
    }
}
