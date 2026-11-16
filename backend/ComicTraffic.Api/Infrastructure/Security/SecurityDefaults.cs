using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;

namespace ComicTraffic.Api.Infrastructure.Security;

public static class SecurityDefaults
{
    private static readonly byte[] EphemeralAesEntropy = RandomNumberGenerator.GetBytes(32);
    private static readonly byte[] EphemeralHmacEntropy = RandomNumberGenerator.GetBytes(32);
    private static readonly byte[] EphemeralJwtEntropy = RandomNumberGenerator.GetBytes(32);

    public static byte[] GetAesKey(IConfiguration? config = null)
    {
        string? env = Environment.GetEnvironmentVariable("PAYLOAD_ENCRYPTION_KEY");
        if (!string.IsNullOrWhiteSpace(env))
            return SHA256.HashData(Encoding.UTF8.GetBytes(env));

        string? cfg = config?["Security:PayloadEncryptionKey"];
        if (!string.IsNullOrWhiteSpace(cfg))
            return SHA256.HashData(Encoding.UTF8.GetBytes(cfg));

        return EphemeralAesEntropy;
    }

    public static byte[] GetHmacKey(IConfiguration? config = null)
    {
        string? env = Environment.GetEnvironmentVariable("PAYLOAD_HMAC_KEY");
        if (!string.IsNullOrWhiteSpace(env))
            return SHA256.HashData(Encoding.UTF8.GetBytes(env));

        string? cfg = config?["Security:PayloadHmacKey"];
        if (!string.IsNullOrWhiteSpace(cfg))
            return SHA256.HashData(Encoding.UTF8.GetBytes(cfg));

        return EphemeralHmacEntropy;
    }

    public static byte[] GetJwtKey(IConfiguration? config = null)
    {
        string? env = Environment.GetEnvironmentVariable("JWT_SIGNING_KEY");
        if (!string.IsNullOrWhiteSpace(env))
            return SHA256.HashData(Encoding.UTF8.GetBytes(env));

        string? cfg = config?["Jwt:Key"];
        if (!string.IsNullOrWhiteSpace(cfg))
            return SHA256.HashData(Encoding.UTF8.GetBytes(cfg));

        return EphemeralJwtEntropy;
    }
}
