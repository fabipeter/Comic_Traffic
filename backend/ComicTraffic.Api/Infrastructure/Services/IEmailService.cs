namespace ComicTraffic.Api.Infrastructure.Services;

public interface IEmailService
{
    Task<bool> SendPasswordResetEmailAsync(
        string toEmail,
        string username,
        string resetToken,
        string resetUrl,
        CancellationToken ct = default);

    Task<bool> SendPasswordResetConfirmationEmailAsync(
        string toEmail,
        string username,
        CancellationToken ct = default);
}
