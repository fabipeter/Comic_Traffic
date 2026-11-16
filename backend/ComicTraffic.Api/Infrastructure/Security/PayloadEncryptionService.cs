using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ComicTraffic.Api.Infrastructure.Security;

public class EncryptedEnvelopeDto
{
    public bool Encrypted { get; set; } = true;
    public string Algorithm { get; set; } = "AES-256-CBC";
    public string Iv { get; set; } = string.Empty;
    public string Payload { get; set; } = string.Empty;
    public string Signature { get; set; } = string.Empty;
    public long Timestamp { get; set; }
}

public interface IPayloadEncryptionService
{
    EncryptedEnvelopeDto EncryptPayload(string plainTextJson);
    EncryptedEnvelopeDto EncryptObject<T>(T data);
    string DecryptPayload(EncryptedEnvelopeDto envelope);
    T? DecryptObject<T>(EncryptedEnvelopeDto envelope);
}

public class PayloadEncryptionService : IPayloadEncryptionService
{
    private readonly byte[] _encryptionKey;
    private readonly byte[] _hmacKey;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public PayloadEncryptionService(IConfiguration configuration)
    {
        string rawSecret = Environment.GetEnvironmentVariable("PAYLOAD_ENCRYPTION_KEY")
            ?? (string.IsNullOrWhiteSpace(configuration["Security:PayloadEncryptionKey"])
                ? "ComicTraffic_AES256_MasterSecretKey_2026!"
                : configuration["Security:PayloadEncryptionKey"]!);
        string rawHmac = Environment.GetEnvironmentVariable("PAYLOAD_HMAC_KEY")
            ?? (string.IsNullOrWhiteSpace(configuration["Security:PayloadHmacKey"])
                ? "ComicTraffic_HMAC256_IntegritySecretKey_2026!"
                : configuration["Security:PayloadHmacKey"]!);

        // Derive deterministic 256-bit (32-byte) keys using SHA-256
        _encryptionKey = SHA256.HashData(Encoding.UTF8.GetBytes(rawSecret));
        _hmacKey = SHA256.HashData(Encoding.UTF8.GetBytes(rawHmac));
    }

    public EncryptedEnvelopeDto EncryptObject<T>(T data)
    {
        string json = JsonSerializer.Serialize(data, JsonOptions);
        return EncryptPayload(json);
    }

    public EncryptedEnvelopeDto EncryptPayload(string plainTextJson)
    {
        if (plainTextJson == null)
            throw new ArgumentNullException(nameof(plainTextJson));

        using var aes = Aes.Create();
        aes.KeySize = 256;
        aes.BlockSize = 128;
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;
        aes.Key = _encryptionKey;
        aes.GenerateIV();

        byte[] plainBytes = Encoding.UTF8.GetBytes(plainTextJson);
        using var encryptor = aes.CreateEncryptor(aes.Key, aes.IV);
        byte[] cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

        string ivBase64 = Convert.ToBase64String(aes.IV);
        string payloadBase64 = Convert.ToBase64String(cipherBytes);
        long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        string signature = ComputeHmac(ivBase64, payloadBase64, timestamp);

        return new EncryptedEnvelopeDto
        {
            Encrypted = true,
            Algorithm = "AES-256-CBC",
            Iv = ivBase64,
            Payload = payloadBase64,
            Signature = signature,
            Timestamp = timestamp
        };
    }

    public string DecryptPayload(EncryptedEnvelopeDto envelope)
    {
        if (envelope == null || string.IsNullOrWhiteSpace(envelope.Payload) || string.IsNullOrWhiteSpace(envelope.Iv))
            throw new CryptographicException("Invalid encrypted envelope: missing Payload or IV.");

        if (!string.IsNullOrWhiteSpace(envelope.Signature))
        {
            string expectedSignature = ComputeHmac(envelope.Iv, envelope.Payload, envelope.Timestamp);
            if (!CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(expectedSignature),
                    Encoding.UTF8.GetBytes(envelope.Signature)))
            {
                throw new CryptographicException("Encrypted payload signature verification failed (tampered payload).");
            }
        }

        byte[] ivBytes = Convert.FromBase64String(envelope.Iv);
        byte[] cipherBytes = Convert.FromBase64String(envelope.Payload);

        using var aes = Aes.Create();
        aes.KeySize = 256;
        aes.BlockSize = 128;
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;
        aes.Key = _encryptionKey;
        aes.IV = ivBytes;

        using var decryptor = aes.CreateDecryptor(aes.Key, aes.IV);
        byte[] decryptedBytes = decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length);
        return Encoding.UTF8.GetString(decryptedBytes);
    }

    public T? DecryptObject<T>(EncryptedEnvelopeDto envelope)
    {
        string json = DecryptPayload(envelope);
        return JsonSerializer.Deserialize<T>(json, JsonOptions);
    }

    private string ComputeHmac(string ivBase64, string payloadBase64, long timestamp)
    {
        string message = $"{ivBase64}:{payloadBase64}:{timestamp}";
        using var hmac = new HMACSHA256(_hmacKey);
        byte[] hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(message));
        return Convert.ToBase64String(hash);
    }
}
