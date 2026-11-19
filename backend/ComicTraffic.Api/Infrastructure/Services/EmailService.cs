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

    public async Task<bool> SendWelcomeEmailAsync(
        string toEmail,
        string displayName,
        string username,
        string appUrl,
        CancellationToken ct = default)
    {
        string safeSubject = "Welcome to Comic Traffic — Your Cumulative Rating Hub Is Ready";
        string safeDisplay = SanitizeHeaderValue(displayName);
        string safeUser = SanitizeHeaderValue(username);
        string safeUrl = SanitizeHeaderValue(appUrl);
        string htmlBody = BuildWelcomeHtml(safeDisplay, safeUser, safeUrl);
        string plainText = $"Welcome to Comic Traffic, {safeDisplay} (@{safeUser})!\n\n" +
            $"Your account is live. Explore Movies, TV Series, and Comic Books ranked by weighted Multi-API consensus:\n" +
            $"- Compare up to 3 titles side-by-side in the Compare Arena\n" +
            $"- Customize critic, audience, and comic community source weights\n" +
            $"- Build trackable watchlists, reading lists, and community reviews\n\n" +
            $"Open Comic Traffic: {safeUrl}\n\n" +
            $"Best regards,\nComic Traffic Team";

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

    private static string WrapBrandedEmailHtml(
        string title,
        string subtitle,
        string headerBg,
        string borderColor,
        string accentColor,
        string bodyHtml,
        bool includeNoReplyFooter = false)
    {
        int year = DateTime.UtcNow.Year;
        string extraFooter = includeNoReplyFooter
            ? "<br />This is an automated security transmission. Please do not reply directly to this address."
            : string.Empty;

        return $@"<!DOCTYPE html>
<html lang=""en"" xmlns:v=""urn:schemas-microsoft-com:vml"" xmlns:o=""urn:schemas-microsoft-com:office:office"">
<head>
  <meta charset=""UTF-8"" />
  <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"" />
  <meta http-equiv=""X-UA-Compatible"" content=""IE=edge"" />
  <meta name=""color-scheme"" content=""light dark"" />
  <meta name=""supported-color-schemes"" content=""light dark"" />
  <title>{WebUtility.HtmlEncode(title)}</title>
  <style>
    :root {{
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }}
    body, table, td, a {{
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }}
    body {{
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background-color: #060911;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
    }}
    .email-body {{ background-color: #060911; }}
    .email-card {{ background-color: #0b1222; }}
    .email-content {{ background-color: #0b1222; color: #cbd5e1; }}
    .code-box {{ background-color: #0f172a; }}
    .code-value {{ color: #60a5fa; }}
    .cta-button {{ background-color: #2563eb; color: #ffffff !important; }}
    .notice {{ background-color: #1e1b18; color: #fde68a; }}
    .alert-box {{ background-color: #062e24; color: #a7f3d0; }}
    .feature-box {{ background-color: #0f172a; color: #e2e8f0; }}

    @media (prefers-color-scheme: dark) {{
      body, .email-body {{ background-color: #050811 !important; color: #e2e8f0 !important; }}
      .email-card {{ background-color: #0b1222 !important; border-color: rgba(59, 130, 246, 0.45) !important; }}
      .email-content {{ background-color: #0b1222 !important; color: #cbd5e1 !important; }}
      .code-box {{ background-color: #0f172a !important; border-color: #3b82f6 !important; }}
      .code-value {{ color: #60a5fa !important; }}
      .feature-box {{ background-color: #0f172a !important; border-color: rgba(59, 130, 246, 0.4) !important; color: #e2e8f0 !important; }}
      .notice {{ background-color: #1e1b18 !important; border-color: #f59e0b !important; color: #fde68a !important; }}
      .alert-box {{ background-color: #062e24 !important; border-color: #10b981 !important; color: #a7f3d0 !important; }}
      h1 {{ color: #f8fafc !important; }}
      p {{ color: #cbd5e1 !important; }}
      .footer {{ background-color: #070b14 !important; color: #64748b !important; }}
    }}

    [data-ogsc] body, [data-ogsc] .email-body {{ background-color: #050811 !important; }}
    [data-ogsc] .email-card {{ background-color: #0b1222 !important; }}
    [data-ogsc] .email-content {{ background-color: #0b1222 !important; }}
    [data-ogsc] .code-box {{ background-color: #0f172a !important; }}
    [data-ogsc] .code-value {{ color: #60a5fa !important; }}
    [data-ogsc] .feature-box {{ background-color: #0f172a !important; }}
    [data-ogsc] .notice {{ background-color: #1e1b18 !important; color: #fde68a !important; }}
    [data-ogsc] .alert-box {{ background-color: #062e24 !important; color: #a7f3d0 !important; }}
    [data-ogsc] h1 {{ color: #f8fafc !important; }}
    [data-ogsc] p {{ color: #cbd5e1 !important; }}
    [data-ogsc] .footer {{ background-color: #070b14 !important; color: #64748b !important; }}
  </style>
</head>
<body bgcolor=""#060911"" class=""email-body"" style=""margin: 0; padding: 0; background-color: #060911; color: #e2e8f0;"">
  <table role=""presentation"" width=""100%"" border=""0"" cellspacing=""0"" cellpadding=""0"" bgcolor=""#060911"" class=""email-body"" style=""background-color: #060911; width: 100%; margin: 0; padding: 36px 12px;"">
    <tr>
      <td align=""center"" style=""padding: 0;"">
        <table role=""presentation"" width=""100%"" border=""0"" cellspacing=""0"" cellpadding=""0"" bgcolor=""#0b1222"" class=""email-card container"" style=""background-color: #0b1222; max-width: 600px; width: 100%; border: 1px solid {borderColor}; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);"">
          <tr>
            <td align=""center"" bgcolor=""#0f172a"" class=""header"" style=""background: {headerBg}; background-color: #0f172a; padding: 32px 24px; text-align: center; border-bottom: 1px solid {borderColor};"">
              <div class=""brand-title"" style=""font-size: 24px; font-weight: 900; letter-spacing: 2px; color: #ffffff; text-transform: uppercase; margin: 0;"">COMIC<span style=""color: {accentColor};"">TRAFFIC</span></div>
              <div class=""brand-sub"" style=""font-size: 11px; letter-spacing: 3px; color: #94a3b8; margin-top: 6px; text-transform: uppercase; font-weight: 600;"">{WebUtility.HtmlEncode(subtitle)}</div>
            </td>
          </tr>
          <tr>
            <td class=""email-content content"" bgcolor=""#0b1222"" style=""background-color: #0b1222; padding: 36px 32px; color: #cbd5e1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.7; text-align: left;"">
              {bodyHtml}
            </td>
          </tr>
          <tr>
            <td align=""center"" bgcolor=""#070b14"" class=""footer"" style=""background-color: #070b14; border-top: 1px solid rgba(255, 255, 255, 0.08); padding: 22px 24px; text-align: center; font-size: 11px; color: #64748b; line-height: 1.7;"">
              &copy; {year} Comic Traffic Telemetry Consensus Engine. All rights reserved.{extraFooter}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>";
    }

    private static string BuildPasswordResetHtml(string username, string resetToken, string resetUrl)
    {
        string body = $@"
      <h1 style=""font-size: 20px; font-weight: 800; color: #f8fafc; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.3px;"">Password Recovery Request</h1>
      <p style=""font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 14px 0;"">Hello <strong style=""color: #f8fafc;"">{WebUtility.HtmlEncode(username)}</strong>,</p>
      <p style=""font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 14px 0;"">We received a request to reset the password for your Comic Traffic account. Use the verification code below to authorize this change:</p>

      <div class=""code-box"" style=""margin: 26px 0; padding: 22px 24px; background-color: #0f172a; border: 2px dashed #3b82f6; border-radius: 12px; text-align: center;"">
        <div class=""code-label"" style=""font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #94a3b8; margin-bottom: 8px;"">Your 15-Minute Verification Code</div>
        <div class=""code-value"" style=""font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #60a5fa; text-shadow: 0 0 12px rgba(96, 165, 250, 0.35);"">{WebUtility.HtmlEncode(resetToken)}</div>
      </div>

      <p style=""text-align: center; font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 16px 0;"">Or click the button below to open the password recovery page directly:</p>

      <table role=""presentation"" border=""0"" cellspacing=""0"" cellpadding=""0"" width=""100%"" style=""margin: 26px 0;"">
        <tr>
          <td align=""center"">
            <a href=""{WebUtility.HtmlEncode(resetUrl)}"" target=""_blank"" rel=""noopener noreferrer"" class=""cta-button"" style=""display: block; width: 100%; box-sizing: border-box; padding: 15px 28px; background: linear-gradient(135deg, #2563eb, #1d4ed8); background-color: #2563eb; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 15px; text-align: center; border-radius: 10px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45); letter-spacing: 0.5px;"">Reset Password Now</a>
          </td>
        </tr>
      </table>

      <div class=""notice"" style=""padding: 14px 18px; background-color: #1e1b18; border-left: 4px solid #f59e0b; border-radius: 6px; font-size: 12px; color: #fde68a; margin-top: 26px; line-height: 1.6;"">
        &#9888; <strong style=""color: #fbbf24;"">Security Advisory:</strong> This code and link will expire in <strong>15 minutes</strong>. If you did not request a password reset, please disregard this email. Your Comic Traffic account remains fully secure.
      </div>";

        return WrapBrandedEmailHtml(
            title: "Reset Your Comic Traffic Password",
            subtitle: "CUMULATIVE RATING HUB \u2022 ACCOUNT SECURITY",
            headerBg: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
            borderColor: "rgba(59, 130, 246, 0.35)",
            accentColor: "#3b82f6",
            bodyHtml: body,
            includeNoReplyFooter: true);
    }

    private static string BuildPasswordConfirmationHtml(string username)
    {
        string timestamp = $"{DateTime.UtcNow:MMMM dd, yyyy 'at' HH:mm 'UTC'}";
        string body = $@"
      <h1 style=""font-size: 20px; font-weight: 800; color: #f8fafc; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.3px;"">&#10003; Password Updated Successfully</h1>
      <p style=""font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 14px 0;"">Hello <strong style=""color: #f8fafc;"">{WebUtility.HtmlEncode(username)}</strong>,</p>
      <div class=""alert-box"" style=""padding: 16px 20px; background-color: #062e24; border: 1px solid #10b981; border-radius: 10px; color: #a7f3d0; font-size: 13px; margin: 20px 0; line-height: 1.6;"">
        The password for your Comic Traffic account was updated on <strong style=""color: #ffffff;"">{WebUtility.HtmlEncode(timestamp)}</strong>.
      </div>
      <p style=""font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 14px 0;"">You can now sign in with your new password on any device.</p>
      <p style=""font-size: 13px; color: #f87171; line-height: 1.6; margin-top: 20px;"">
        &#9888; <strong>Did not perform this action?</strong> If you did not make this change, please contact Comic Traffic Support immediately to lock your account.
      </p>";

        return WrapBrandedEmailHtml(
            title: "Comic Traffic Password Changed",
            subtitle: "CUMULATIVE RATING HUB \u2022 ACCOUNT SECURITY",
            headerBg: "linear-gradient(135deg, #064e3b 0%, #047857 100%)",
            borderColor: "rgba(16, 185, 129, 0.35)",
            accentColor: "#34d399",
            bodyHtml: body,
            includeNoReplyFooter: false);
    }

    private static string BuildWelcomeHtml(string displayName, string username, string appUrl)
    {
        string resolvedUrl = string.IsNullOrWhiteSpace(appUrl) ? "https://comictraffic.com" : appUrl.TrimEnd('/');
        string body = $@"
      <h1 style=""font-size: 20px; font-weight: 800; color: #f8fafc; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.3px;"">Welcome to Comic Traffic!</h1>
      <p style=""font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 14px 0;"">Hello <strong style=""color: #f8fafc;"">{WebUtility.HtmlEncode(displayName)}</strong> (<code style=""background: rgba(59, 130, 246, 0.15); color: #93c5fd; padding: 2px 6px; border-radius: 4px; font-family: monospace;"">@{WebUtility.HtmlEncode(username)}</code>),</p>
      <p style=""font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 14px 0;"">Your Comic Traffic account is active and ready. You now have access to real-time multi-source ratings across Comic Books, Literature, Movies, and TV Series:</p>

      <div class=""feature-box"" style=""margin: 24px 0; padding: 20px 22px; background-color: #0f172a; border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 12px; font-size: 13px; color: #e2e8f0; line-height: 1.8;"">
        &#9889; <strong style=""color: #60a5fa;"">Compare Arena:</strong> Compare up to 3 titles side-by-side<br />
        &#9878; <strong style=""color: #60a5fa;"">Custom Weights:</strong> Tune Critic, Audience, and Comic DB sources<br />
        &#128218; <strong style=""color: #60a5fa;"">Watchlist &amp; Lists:</strong> Track reading and viewing progress anywhere
      </div>

      <table role=""presentation"" border=""0"" cellspacing=""0"" cellpadding=""0"" width=""100%"" style=""margin: 26px 0;"">
        <tr>
          <td align=""center"">
            <a href=""{WebUtility.HtmlEncode(resolvedUrl)}/dashboard"" target=""_blank"" rel=""noopener noreferrer"" class=""cta-button"" style=""display: block; width: 100%; box-sizing: border-box; padding: 15px 28px; background: linear-gradient(135deg, #2563eb, #1d4ed8); background-color: #2563eb; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 15px; text-align: center; border-radius: 10px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45); letter-spacing: 0.5px;"">Open Your Comic Traffic Hub</a>
          </td>
        </tr>
      </table>

      <p style=""font-size: 12px; color: #94a3b8; line-height: 1.6; margin-top: 18px;"">
        Your email address is verified for account recovery and security alerts.
      </p>";

        return WrapBrandedEmailHtml(
            title: "Welcome to Comic Traffic",
            subtitle: "CUMULATIVE RATING HUB \u2022 WELCOME ABOARD",
            headerBg: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
            borderColor: "rgba(59, 130, 246, 0.35)",
            accentColor: "#3b82f6",
            bodyHtml: body,
            includeNoReplyFooter: false);
    }
}
