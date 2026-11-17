using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ComicTraffic.Api.Infrastructure.Security;

public class EncryptedEnvelopeDto
{
    public bool Encrypted { get; set; } = true;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Algorithm { get; set; }
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
        _encryptionKey = SecurityDefaults.GetAesKey(configuration);
        _hmacKey = SecurityDefaults.GetHmacKey(configuration);
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

        byte[] plainBytes = Encoding.UTF8.GetBytes(plainTextJson);
        byte[] nonce = RandomNumberGenerator.GetBytes(12);
        byte[] tag = new byte[16];
        byte[] cipherBytes = new byte[plainBytes.Length];

        using (var aesGcm = new AesGcm(_encryptionKey, 16))
        {
            aesGcm.Encrypt(nonce, plainBytes, cipherBytes, tag);
        }

        byte[] combined = new byte[cipherBytes.Length + tag.Length];
        Buffer.BlockCopy(cipherBytes, 0, combined, 0, cipherBytes.Length);
        Buffer.BlockCopy(tag, 0, combined, cipherBytes.Length, tag.Length);

        string ivBase64 = Convert.ToBase64String(nonce);
        string payloadBase64 = Convert.ToBase64String(combined);
        long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        string signature = ComputeHmac(ivBase64, payloadBase64, timestamp);

        return new EncryptedEnvelopeDto
        {
            Encrypted = true,
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

        byte[] nonce = Convert.FromBase64String(envelope.Iv);
        byte[] combined = Convert.FromBase64String(envelope.Payload);

        if (combined.Length < 16)
            throw new CryptographicException("Ciphertext payload too short for authenticated tag.");

        int cipherLen = combined.Length - 16;
        byte[] cipherBytes = new byte[cipherLen];
        byte[] tag = new byte[16];
        Buffer.BlockCopy(combined, 0, cipherBytes, 0, cipherLen);
        Buffer.BlockCopy(combined, cipherLen, tag, 0, 16);

        byte[] plainBytes = new byte[cipherLen];
        using (var aesGcm = new AesGcm(_encryptionKey, 16))
        {
            aesGcm.Decrypt(nonce, cipherBytes, tag, plainBytes);
        }
        return Encoding.UTF8.GetString(plainBytes);
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
