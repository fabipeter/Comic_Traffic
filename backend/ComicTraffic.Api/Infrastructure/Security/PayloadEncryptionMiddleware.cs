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

        // 0. Reject HTTP Request Smuggling / Desync & Header Injection vectors
        if (context.Request.Headers.ContainsKey("Transfer-Encoding") &&
            context.Request.Headers.ContainsKey("Content-Length"))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsync("{\"isSuccessful\":false,\"message\":\"Ambiguous Transfer-Encoding and Content-Length headers are not permitted.\"}");
            return;
        }

        if (HttpMethods.IsPost(context.Request.Method) || HttpMethods.IsPut(context.Request.Method))
        {
            var ct = context.Request.ContentType ?? string.Empty;
            if (!ct.Contains("application/json", StringComparison.OrdinalIgnoreCase))
            {
                context.Response.StatusCode = StatusCodes.Status415UnsupportedMediaType;
                await context.Response.WriteAsync("{\"isSuccessful\":false,\"message\":\"Unsupported Media Type. Only application/json is accepted.\"}");
                return;
            }
        }

        bool requestHasEncryptedHeader =
            context.Request.Headers.TryGetValue("X-Payload-Encrypted", out var reqEncHeader) &&
            string.Equals(reqEncHeader.ToString(), "true", StringComparison.OrdinalIgnoreCase);

        bool responseRequestedEncrypted =
            requestHasEncryptedHeader ||
            (context.Request.Headers.TryGetValue("X-Response-Encrypted", out var respEncHeader) &&
             string.Equals(respEncHeader.ToString(), "true", StringComparison.OrdinalIgnoreCase));

        // 1. Decrypt Incoming Request Payload if encrypted (supports both fixed Content-Length and chunked/HTTP2 streams)
        bool hasBodyMethod = HttpMethods.IsPost(context.Request.Method) ||
                             HttpMethods.IsPut(context.Request.Method) ||
                             HttpMethods.IsPatch(context.Request.Method);
        if ((context.Request.ContentLength > 0 || (hasBodyMethod && context.Request.ContentLength is null)) &&
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
                    string safePath = path.Replace("\r", string.Empty).Replace("\n", string.Empty);
                    _logger.LogWarning("Rejected encrypted request payload on {Path}: {Reason}", safePath, ex.Message);
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

            try
            {
                await _next(context);

                memoryStream.Position = 0;
                string plainResponse = await new StreamReader(memoryStream, Encoding.UTF8).ReadToEndAsync();

                if (!string.IsNullOrWhiteSpace(plainResponse) && context.Response.StatusCode < 500)
                {
                    var encryptedEnvelope = encryptionService.EncryptPayload(plainResponse);
                    string encryptedJson = JsonSerializer.Serialize(encryptedEnvelope, JsonOptions);
                    byte[] encryptedBytes = Encoding.UTF8.GetBytes(encryptedJson);

                    context.Response.Headers["X-Payload-Encrypted"] = "true";
                    context.Response.ContentType = "application/json; charset=utf-8";
                    context.Response.ContentLength = encryptedBytes.Length;

                    await originalBodyStream.WriteAsync(encryptedBytes);
                }
                else
                {
                    memoryStream.Position = 0;
                    await memoryStream.CopyToAsync(originalBodyStream);
                }
            }
            finally
            {
                context.Response.Body = originalBodyStream;
            }
        }
        else
        {
            await _next(context);
        }
    }
}
