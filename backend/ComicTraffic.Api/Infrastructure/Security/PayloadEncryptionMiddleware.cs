using System.Text;
using System.Text.Json;

namespace ComicTraffic.Api.Infrastructure.Security;

public class PayloadEncryptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<PayloadEncryptionMiddleware> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public PayloadEncryptionMiddleware(
        RequestDelegate next,
        ILogger<PayloadEncryptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context, IPayloadEncryptionService encryptionService)
    {
        // Bypass Swagger and raw security helper endpoints to allow direct inspection
        var path = context.Request.Path.Value ?? string.Empty;
        if (path.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/api/security", StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        bool requestHasEncryptedHeader =
            context.Request.Headers.TryGetValue("X-Payload-Encrypted", out var reqEncHeader) &&
            string.Equals(reqEncHeader.ToString(), "true", StringComparison.OrdinalIgnoreCase);

        bool responseRequestedEncrypted =
            requestHasEncryptedHeader ||
            (context.Request.Headers.TryGetValue("X-Response-Encrypted", out var respEncHeader) &&
             string.Equals(respEncHeader.ToString(), "true", StringComparison.OrdinalIgnoreCase));

        // 1. Decrypt Incoming Request Payload if encrypted
        if (context.Request.ContentLength > 0 &&
            (requestHasEncryptedHeader ||
             (context.Request.ContentType?.Contains("application/json", StringComparison.OrdinalIgnoreCase) ?? false)))
        {
            context.Request.EnableBuffering();
            using var reader = new StreamReader(context.Request.Body, Encoding.UTF8, leaveOpen: true);
            string rawBody = await reader.ReadToEndAsync();
            context.Request.Body.Position = 0;

            if (!string.IsNullOrWhiteSpace(rawBody) &&
                (requestHasEncryptedHeader || (rawBody.Contains("\"encrypted\"") && rawBody.Contains("\"payload\"") && rawBody.Contains("\"iv\""))))
            {
                try
                {
                    var envelope = JsonSerializer.Deserialize<EncryptedEnvelopeDto>(rawBody, JsonOptions);
                    if (envelope != null && envelope.Encrypted && !string.IsNullOrWhiteSpace(envelope.Payload))
                    {
                        string decryptedJson = encryptionService.DecryptPayload(envelope);
                        byte[] decryptedBytes = Encoding.UTF8.GetBytes(decryptedJson);
                        context.Request.Body = new MemoryStream(decryptedBytes);
                        context.Request.ContentLength = decryptedBytes.Length;
                        context.Request.ContentType = "application/json; charset=utf-8";
                        context.Items["DecryptedRequestPayload"] = true;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to decrypt incoming request payload.");
                    context.Response.StatusCode = StatusCodes.Status400BadRequest;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsync(JsonSerializer.Serialize(new
                    {
                        isSuccessful = false,
                        message = $"Payload decryption error: {ex.Message}"
                    }, JsonOptions));
                    return;
                }
            }
        }

        // 2. Encrypt Outgoing Response if requested
        if (responseRequestedEncrypted)
        {
            var originalBodyStream = context.Response.Body;
            using var memoryStream = new MemoryStream();
            context.Response.Body = memoryStream;

            await _next(context);

            memoryStream.Position = 0;
            string plainResponse = await new StreamReader(memoryStream, Encoding.UTF8).ReadToEndAsync();

            if (!string.IsNullOrWhiteSpace(plainResponse) && context.Response.StatusCode < 500)
            {
                var encryptedEnvelope = encryptionService.EncryptPayload(plainResponse);
                string encryptedJson = JsonSerializer.Serialize(encryptedEnvelope, JsonOptions);
                byte[] encryptedBytes = Encoding.UTF8.GetBytes(encryptedJson);

                context.Response.Headers["X-Payload-Encrypted"] = "true";
                context.Response.Headers["X-Encryption-Algorithm"] = "AES-256-CBC";
                context.Response.ContentType = "application/json; charset=utf-8";
                context.Response.ContentLength = encryptedBytes.Length;

                await originalBodyStream.WriteAsync(encryptedBytes);
            }
            else
            {
                memoryStream.Position = 0;
                await memoryStream.CopyToAsync(originalBodyStream);
            }

            context.Response.Body = originalBodyStream;
        }
        else
        {
            await _next(context);
        }
    }
}
