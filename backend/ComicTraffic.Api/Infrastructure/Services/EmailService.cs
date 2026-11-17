using System.Net;
using System.Net.Http.Headers;
using System.Net.Mail;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;

namespace ComicTraffic.Api.Infrastructure.Services;

public class EmailService : IEmailService
{
    private static readonly Uri SendGridEndpoint = new("https://api.sendgrid.com/v3/mail/send", UriKind.Absolute);
    private static readonly HttpClient SharedFallbackHttpClient = new() { Timeout = TimeSpan.FromSeconds(10) };

    private readonly IConfiguration _config;
    private readonly ILogger<EmailService> _logger;
    private readonly HttpClient _httpClient;
    private readonly string _outboxDir;

    public EmailService(IConfiguration config, ILogger<EmailService> logger)
        : this(config, logger, null)
    {
    }

    [ActivatorUtilitiesConstructor]
    public EmailService(HttpClient httpClient, IConfiguration config, ILogger<EmailService> logger)
        : this(config, logger, httpClient)
    {
    }

    private EmailService(IConfiguration config, ILogger<EmailService> logger, HttpClient? httpClient)
    {
        _config = config;
        _logger = logger;
        _httpClient = httpClient ?? SharedFallbackHttpClient;
        _outboxDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "mail-outbox"));
        try
        {
            if (!Directory.Exists(_outboxDir))
            {
                Directory.CreateDirectory(_outboxDir);
            }
        }
        catch
        {
            // Directory creation failure is non-fatal
        }
    }

    private static string SanitizeHeaderValue(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        return input.Replace("\r", string.Empty)
                    .Replace("\n", string.Empty)
                    .Replace("\0", string.Empty)
                    .Trim();
    }

    public async Task<bool> SendPasswordResetEmailAsync(
        string toEmail,
        string username,
        string resetToken,
        string resetUrl,
        CancellationToken ct = default)
    {
        string safeSubject = "[Comic Traffic] Password Reset Verification Code";
        string safeUser = SanitizeHeaderValue(username);
        string safeToken = SanitizeHeaderValue(resetToken);
        string safeUrl = SanitizeHeaderValue(resetUrl);
        string htmlBody = BuildPasswordResetHtml(safeUser, safeToken, safeUrl);
        string plainText = $"Hello {safeUser},\n\n" +
            $"We received a request to reset your Comic Traffic account password.\n\n" +
            $"Your verification code is: {safeToken}\n" +
            $"Direct reset link: {safeUrl}\n\n" +
            $"This code expires in 15 minutes. If you did not make this request, you can safely ignore this email.\n\n" +
            $"Best regards,\nComic Traffic Security Team";

        return await DispatchEmailAsync(toEmail, safeSubject, htmlBody, plainText, ct);
    }

    public async Task<bool> SendPasswordResetConfirmationEmailAsync(
        string toEmail,
        string username,
        CancellationToken ct = default)
    {
        string safeSubject = "[Comic Traffic] Security Alert: Your Password Was Successfully Changed";
        string safeUser = SanitizeHeaderValue(username);
        string htmlBody = BuildPasswordConfirmationHtml(safeUser);
        string plainText = $"Hello {safeUser},\n\n" +
            $"The password for your Comic Traffic account has been successfully updated.\n\n" +
            $"If you performed this change, no further action is required.\n" +
            $"If you did NOT make this change, please contact security@comictraffic.com immediately.\n\n" +
            $"Best regards,\nComic Traffic Security Team";

        return await DispatchEmailAsync(toEmail, safeSubject, htmlBody, plainText, ct);
    }

    private static bool IsValidEmailAddress(string email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        return MailAddress.TryCreate(email, out var parsed) &&
               string.Equals(parsed.Address, email, StringComparison.OrdinalIgnoreCase) &&
               parsed.Host.Contains('.');
    }

    private string ResolveSetting(string envVarName, string configKey, string fallback = "")
    {
        string? envValue = Environment.GetEnvironmentVariable(envVarName);
        if (!string.IsNullOrWhiteSpace(envValue)) return envValue.Trim();

        string? configValue = _config[configKey];
        if (!string.IsNullOrWhiteSpace(configValue)) return configValue.Trim();

        return fallback;
    }

    private async Task<bool> DispatchEmailAsync(
        string toEmail,
        string subject,
        string htmlBody,
        string plainText,
        CancellationToken ct)
    {
        string safeToEmail = SanitizeHeaderValue(toEmail);
        string safeSubject = SanitizeHeaderValue(subject);

        if (!IsValidEmailAddress(safeToEmail))
        {
            _logger.LogWarning("Email dispatch aborted: recipient address is invalid.");
            return false;
        }

        string senderEmail = SanitizeHeaderValue(
            !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SENDGRID_SENDER_EMAIL"))
                ? Environment.GetEnvironmentVariable("SENDGRID_SENDER_EMAIL")!
                : ResolveSetting("SENDER_EMAIL", "EmailSettings:SenderEmail", "security@comictraffic.com"));

        if (!IsValidEmailAddress(senderEmail))
        {
            _logger.LogWarning("Email dispatch aborted: sender email address is invalid.");
            return false;
        }

        string senderName = SanitizeHeaderValue(
            !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SENDGRID_SENDER_NAME"))
                ? Environment.GetEnvironmentVariable("SENDGRID_SENDER_NAME")!
                : ResolveSetting("SENDER_NAME", "EmailSettings:SenderName", "Comic Traffic Security"));

        // Always save to disk outbox for auditing and local inspection
        await SaveToOutboxAsync(safeToEmail, safeSubject, htmlBody);

        // Priority 1: SendGrid v3 Transactional Web API (HTTPS)
        string sendGridApiKey = ResolveSetting("SENDGRID_API_KEY", "EmailSettings:SendGridApiKey");
        if (!string.IsNullOrWhiteSpace(sendGridApiKey))
        {
            bool sentViaSendGrid = await TrySendViaSendGridAsync(
                sendGridApiKey,
                senderEmail,
                senderName,
                safeToEmail,
                safeSubject,
                plainText,
                htmlBody,
                ct);
            if (sentViaSendGrid) return true;
        }

        // Priority 2: Optional SMTP fallback if configured
        string smtpHost = ResolveSetting("SMTP_HOST", "EmailSettings:SmtpHost");
        if (!string.IsNullOrWhiteSpace(smtpHost))
        {
            return await TrySendViaSmtpAsync(
                smtpHost,
                senderEmail,
                senderName,
                safeToEmail,
                safeSubject,
                plainText,
                htmlBody,
                ct);
        }

        if (!string.IsNullOrWhiteSpace(sendGridApiKey))
        {
            return false;
        }

        _logger.LogInformation("Neither SendGrid nor SMTP is configured; email written to local audit outbox.");
        return true;
    }

    private async Task<bool> TrySendViaSendGridAsync(
        string apiKey,
        string senderEmail,
        string senderName,
        string toEmail,
        string subject,
        string plainText,
        string htmlBody,
        CancellationToken ct)
    {
        try
        {
            var payload = new
            {
                personalizations = new[]
                {
                    new
                    {
                        to = new[] { new { email = toEmail } }
                    }
                },
                from = new
                {
                    email = senderEmail,
                    name = senderName
                },
                subject,
                content = new[]
                {
                    new { type = "text/plain", value = plainText },
                    new { type = "text/html", value = htmlBody }
                },
                tracking_settings = new
                {
                    click_tracking = new
                    {
                        enable = false,
                        enable_text = false
                    }
                }
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, SendGridEndpoint);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            using var response = await _httpClient.SendAsync(request, ct);
            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Email dispatched successfully via SendGrid v3 API.");
                return true;
            }

            _logger.LogWarning(
                "SendGrid v3 API delivery failed with HTTP {StatusCode}. Verify SENDGRID_API_KEY and Verified Sender identity.",
                (int)response.StatusCode);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SendGrid v3 API request failed; message preserved in local outbox.");
            return false;
        }
    }

    private async Task<bool> TrySendViaSmtpAsync(
        string smtpHost,
        string senderEmail,
        string senderName,
        string safeToEmail,
        string safeSubject,
        string plainText,
        string htmlBody,
        CancellationToken ct)
    {
        int smtpPort = int.TryParse(
            ResolveSetting("SMTP_PORT", "EmailSettings:SmtpPort", "587"),
            out int port) && port > 0
            ? port
            : 587;

        string smtpUser = ResolveSetting("SMTP_USER", "EmailSettings:SmtpUsername");
        string smtpPass = ResolveSetting("SMTP_PASS", "EmailSettings:SmtpPassword");

        try
        {
            using var mail = new MailMessage
            {
                From = new MailAddress(senderEmail, senderName),
                Subject = safeSubject,
                Body = htmlBody,
                IsBodyHtml = true,
                BodyEncoding = Encoding.UTF8,
                SubjectEncoding = Encoding.UTF8
            };
            mail.To.Add(new MailAddress(safeToEmail));

            mail.AlternateViews.Add(AlternateView.CreateAlternateViewFromString(plainText, Encoding.UTF8, "text/plain"));
            mail.AlternateViews.Add(AlternateView.CreateAlternateViewFromString(htmlBody, Encoding.UTF8, "text/html"));

            using var client = new SmtpClient(smtpHost, smtpPort)
            {
                EnableSsl = true,
                DeliveryMethod = SmtpDeliveryMethod.Network,
                Timeout = 8000
            };

            if (!string.IsNullOrWhiteSpace(smtpUser) && !string.IsNullOrWhiteSpace(smtpPass))
            {
                client.Credentials = new NetworkCredential(smtpUser, smtpPass);
            }

            await client.SendMailAsync(mail, ct);
            _logger.LogInformation("Email dispatched successfully via encrypted SMTP channel.");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SMTP delivery failed on port {SmtpPort}; message preserved in local outbox.", smtpPort);
            return false;
        }
    }

    private async Task SaveToOutboxAsync(string toEmail, string subject, string htmlBody)
    {
        try
        {
            if (!Directory.Exists(_outboxDir))
            {
                Directory.CreateDirectory(_outboxDir);
            }

            string safeTimestamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss_fff");
            string fileToken = Guid.NewGuid().ToString("N")[..12];
            string filename = $"ct_mail_{safeTimestamp}_{fileToken}.html";
            string fullOutboxPrefix = _outboxDir.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            string filepath = Path.GetFullPath(Path.Combine(_outboxDir, filename));

            if (!filepath.StartsWith(fullOutboxPrefix, StringComparison.Ordinal))
            {
                throw new UnauthorizedAccessException("Resolved outbox path escaped target directory.");
            }

            string encodedRecipient = (WebUtility.HtmlEncode(toEmail) ?? string.Empty).Replace("--", "-");
            string encodedSubject = (WebUtility.HtmlEncode(subject) ?? string.Empty).Replace("--", "-");
            string fileContent = $"<!-- TO: {encodedRecipient} -->\n" +
                $"<!-- SUBJECT: {encodedSubject} -->\n" +
                $"<!-- DATE: {DateTime.UtcNow:O} -->\n\n" +
                htmlBody;

            await File.WriteAllTextAsync(filepath, fileContent, Encoding.UTF8);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not write email to disk outbox.");
        }
    }

    private static string BuildPasswordResetHtml(string username, string resetToken, string resetUrl)
    {
        return $@"<!DOCTYPE html>
<html lang=""en"">
<head>
  <meta charset=""UTF-8"" />
  <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"" />
  <title>Reset Your Comic Traffic Password</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #060911;
      color: #e2e8f0;
    }}
    .container {{
      max-width: 600px;
      margin: 32px auto;
      background: #0b1222;
      border: 1px solid rgba(59, 130, 246, 0.35);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
    }}
    .header {{
      background: linear-gradient(135deg, #0f172a, #1e3a8a);
      padding: 32px 24px;
      text-align: center;
      border-bottom: 1px solid rgba(59, 130, 246, 0.4);
    }}
    .brand-title {{
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 2px;
      color: #ffffff;
      margin: 0;
    }}
    .brand-title span {{
      color: #3b82f6;
    }}
    .brand-sub {{
      font-size: 11px;
      letter-spacing: 3px;
      color: #94a3b8;
      margin-top: 4px;
      display: block;
    }}
    .content {{
      padding: 32px 28px;
    }}
    h1 {{
      font-size: 20px;
      font-weight: 800;
      color: #f8fafc;
      margin-top: 0;
    }}
    p {{
      font-size: 14px;
      line-height: 1.6;
      color: #cbd5e1;
      margin: 14px 0;
    }}
    .code-box {{
      margin: 24px 0;
      padding: 18px 24px;
      background: rgba(15, 23, 42, 0.95);
      border: 2px dashed #3b82f6;
      border-radius: 12px;
      text-align: center;
    }}
    .code-label {{
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #94a3b8;
      margin-bottom: 6px;
    }}
    .code-value {{
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 6px;
      color: #60a5fa;
    }}
    .cta-button {{
      display: block;
      margin: 28px 0;
      padding: 14px 28px;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      text-align: center;
      border-radius: 10px;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
    }}
    .notice {{
      padding: 12px 16px;
      background: rgba(245, 158, 11, 0.1);
      border-left: 3px solid #f59e0b;
      border-radius: 6px;
      font-size: 12px;
      color: #fcd34d;
      margin-top: 24px;
    }}
    .footer {{
      padding: 20px 24px;
      background: #070b14;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      text-align: center;
      font-size: 11px;
      color: #64748b;
    }}
  </style>
</head>
<body>
  <div class=""container"">
    <div class=""header"">
      <div class=""brand-title"">COMIC<span>TRAFFIC</span></div>
      <span class=""brand-sub"">CUMULATIVE RATING HUB &bull; ACCOUNT SECURITY</span>
    </div>
    <div class=""content"">
      <h1>Password Recovery Request</h1>
      <p>Hello <strong>{WebUtility.HtmlEncode(username)}</strong>,</p>
      <p>We received a request to reset the password for your Comic Traffic account. Use the verification code below to authorize this change:</p>

      <div class=""code-box"">
        <div class=""code-label"">Your 15-Minute Verification Code</div>
        <div class=""code-value"">{WebUtility.HtmlEncode(resetToken)}</div>
      </div>

      <p style=""text-align: center;"">Or click the button below to open the password recovery page directly:</p>

      <a href=""{WebUtility.HtmlEncode(resetUrl)}"" class=""cta-button"">Reset Password Now</a>

      <div class=""notice"">
        &#9888; <strong>Security Advisory:</strong> This code and link will expire in <strong>15 minutes</strong>. If you did not request a password reset, please disregard this email. Your Comic Traffic account remains fully secure.
      </div>
    </div>
    <div class=""footer"">
      &copy; {DateTime.UtcNow.Year} Comic Traffic Telemetry Consensus Engine. All rights reserved.<br />
      This is an automated security transmission. Please do not reply directly to this address.
    </div>
  </div>
</body>
</html>";
    }

    private static string BuildPasswordConfirmationHtml(string username)
    {
        return $@"<!DOCTYPE html>
<html lang=""en"">
<head>
  <meta charset=""UTF-8"" />
  <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"" />
  <title>Comic Traffic Password Changed</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #060911;
      color: #e2e8f0;
    }}
    .container {{
      max-width: 600px;
      margin: 32px auto;
      background: #0b1222;
      border: 1px solid rgba(16, 185, 129, 0.35);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
    }}
    .header {{
      background: linear-gradient(135deg, #064e3b, #047857);
      padding: 32px 24px;
      text-align: center;
    }}
    .brand-title {{
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 2px;
      color: #ffffff;
      margin: 0;
    }}
    .brand-title span {{
      color: #34d399;
    }}
    .content {{
      padding: 32px 28px;
    }}
    h1 {{
      font-size: 20px;
      font-weight: 800;
      color: #f8fafc;
      margin-top: 0;
    }}
    p {{
      font-size: 14px;
      line-height: 1.6;
      color: #cbd5e1;
      margin: 14px 0;
    }}
    .alert-box {{
      padding: 16px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid #10b981;
      border-radius: 10px;
      color: #a7f3d0;
      font-size: 13px;
      margin: 20px 0;
    }}
    .footer {{
      padding: 20px 24px;
      background: #070b14;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      text-align: center;
      font-size: 11px;
      color: #64748b;
    }}
  </style>
</head>
<body>
  <div class=""container"">
    <div class=""header"">
      <div class=""brand-title"">COMIC<span>TRAFFIC</span></div>
    </div>
    <div class=""content"">
      <h1>&#10003; Password Updated Successfully</h1>
      <p>Hello <strong>{WebUtility.HtmlEncode(username)}</strong>,</p>
      <div class=""alert-box"">
        The password for your Comic Traffic account was updated on <strong>{DateTime.UtcNow:MMMM dd, yyyy 'at' HH:mm 'UTC'}</strong>.
      </div>
      <p>You can now sign in with your new password on any device.</p>
      <p style=""color: #f87171;"">
        &#9888; <strong>Did not perform this action?</strong> If you did not make this change, please contact Comic Traffic Support immediately to lock your account.
      </p>
    </div>
    <div class=""footer"">
      &copy; {DateTime.UtcNow.Year} Comic Traffic Telemetry Consensus Engine. All rights reserved.
    </div>
  </div>
</body>
</html>";
    }
}
