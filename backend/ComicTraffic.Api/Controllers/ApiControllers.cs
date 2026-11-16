using System.Security.Claims;
using ComicTraffic.Api.Application.Features.Auth;
using ComicTraffic.Api.Application.Features.Dashboard;
using ComicTraffic.Api.Application.Features.Media;
using ComicTraffic.Api.Application.Features.Reviews;
using ComicTraffic.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ComicTraffic.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IMediator _mediator;

    public AuthController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterUserCommand command, CancellationToken ct)
    {
        try
        {
            var result = await _mediator.Send(command, ct);
            return Ok(new { isSuccessful = true, data = result });
        }
        catch (Exception ex)
        {
            return BadRequest(new { isSuccessful = false, responseMessage = ex.Message });
        }
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginUserCommand command, CancellationToken ct)
    {
        try
        {
            var result = await _mediator.Send(command, ct);
            return Ok(new { isSuccessful = true, data = result });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { isSuccessful = false, responseMessage = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new { isSuccessful = false, responseMessage = ex.Message });
        }
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> GetCurrentUser(CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdClaim, out var userId))
            return Unauthorized();

        var result = await _mediator.Send(new GetCurrentUserQuery(userId), ct);
        return result == null
            ? NotFound(new { isSuccessful = false, responseMessage = "User not found" })
            : Ok(new { isSuccessful = true, data = result });
    }

    [Authorize]
    [HttpPut("preferences")]
    public async Task<IActionResult> UpdatePreferences([FromBody] UpdateUserPreferencesCommand command, CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        Guid userId = Guid.TryParse(userIdClaim, out var parsed) ? parsed : command.UserId;

        var updated = await _mediator.Send(command with { UserId = userId }, ct);
        return Ok(new { isSuccessful = true, data = updated });
    }
}

[ApiController]
[Route("api/media")]
public class MediaController : ControllerBase
{
    private readonly IMediator _mediator;

    public MediaController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpGet]
    public async Task<IActionResult> GetCatalog(
        [FromQuery] string? mediaType,
        [FromQuery] string? searchTerm,
        [FromQuery] string? genre,
        [FromQuery] double? minScore,
        [FromQuery] string? sortBy,
        CancellationToken ct)
    {
        var items = await _mediator.Send(new GetMediaCatalogQuery(mediaType, searchTerm, genre, minScore, sortBy), ct);
        return Ok(new { isSuccessful = true, count = items.Count, data = items });
    }

    [HttpGet("{externalId}")]
    public async Task<IActionResult> GetByExternalId(string externalId, CancellationToken ct)
    {
        var item = await _mediator.Send(new GetMediaDetailByExternalIdQuery(externalId), ct);
        return item == null
            ? NotFound(new { isSuccessful = false, responseMessage = "Media item not found" })
            : Ok(new { isSuccessful = true, data = item });
    }

    [HttpPost("calculate-custom")]
    public async Task<IActionResult> CalculateCustomCumulative(
        [FromBody] CalculateCustomCumulativeCommand command,
        CancellationToken ct)
    {
        var summary = await _mediator.Send(command, ct);
        return Ok(new { isSuccessful = true, data = summary });
    }

    [HttpPost("compare")]
    public async Task<IActionResult> CompareItems(
        [FromBody] CompareMediaItemsQuery query,
        CancellationToken ct)
    {
        var comparison = await _mediator.Send(query, ct);
        return Ok(new { isSuccessful = true, data = comparison });
    }

    [HttpPost("search-live")]
    public async Task<IActionResult> SearchLiveMultiApis(
        [FromBody] LiveSearchRequestDto request,
        CancellationToken ct)
    {
        var items = await _mediator.Send(new SearchLiveExternalApisCommand(request.Query), ct);
        return Ok(new { isSuccessful = true, count = items.Count, data = items });
    }

    [HttpPost("tmdb-row")]
    public async Task<IActionResult> FetchTmdbRow(
        [FromBody] TmdbRowRequestDto request,
        CancellationToken ct)
    {
        var items = await _mediator.Send(new FetchTmdbCuratedRowCommand(request.Category, request.MediaType), ct);
        return Ok(new { isSuccessful = true, count = items.Count, data = items });
    }
}

public record LiveSearchRequestDto(string Query);
public record TmdbRowRequestDto(string Category, string? MediaType = null);

[ApiController]
[Route("api/reviews")]
public class ReviewsController : ControllerBase
{
    private readonly IMediator _mediator;

    public ReviewsController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpGet("{externalMediaId}")]
    public async Task<IActionResult> GetReviews(string externalMediaId, CancellationToken ct)
    {
        var reviews = await _mediator.Send(new GetMediaReviewsQuery(externalMediaId), ct);
        return Ok(new { isSuccessful = true, data = reviews });
    }

    [HttpPost]
    public async Task<IActionResult> SubmitReview([FromBody] SubmitReviewCommand command, CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        Guid userId = Guid.TryParse(userIdClaim, out var parsed) && parsed != Guid.Empty
            ? parsed
            : (command.UserId != Guid.Empty ? command.UserId : Guid.Parse("11111111-1111-1111-1111-111111111111"));

        string username = User.FindFirstValue(ClaimTypes.Name) ?? command.Username;
        var result = await _mediator.Send(command with { UserId = userId, Username = username }, ct);
        return Ok(new { isSuccessful = true, data = result });
    }

    [HttpPost("{reviewId:guid}/helpful")]
    public async Task<IActionResult> VoteHelpful(Guid reviewId, CancellationToken ct)
    {
        var updated = await _mediator.Send(new VoteReviewHelpfulCommand(reviewId), ct);
        return updated == null
            ? NotFound(new { isSuccessful = false })
            : Ok(new { isSuccessful = true, data = updated });
    }
}

[ApiController]
[Route("api/dashboard")]
public class DashboardController : ControllerBase
{
    private readonly IMediator _mediator;

    public DashboardController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpGet("{userId:guid?}")]
    public async Task<IActionResult> GetDashboard(Guid? userId, CancellationToken ct)
    {
        var claimId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        Guid effectiveUserId = userId ?? (Guid.TryParse(claimId, out var parsed)
            ? parsed
            : Guid.Parse("11111111-1111-1111-1111-111111111111"));

        var summary = await _mediator.Send(new GetUserDashboardQuery(effectiveUserId), ct);
        return Ok(new { isSuccessful = true, data = summary });
    }

    [HttpPost("watchlist")]
    public async Task<IActionResult> UpsertWatchlist([FromBody] UpsertWatchlistCommand command, CancellationToken ct)
    {
        var claimId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        Guid effectiveUserId = command.UserId != Guid.Empty
            ? command.UserId
            : (Guid.TryParse(claimId, out var parsed) ? parsed : Guid.Parse("11111111-1111-1111-1111-111111111111"));

        var item = await _mediator.Send(command with { UserId = effectiveUserId }, ct);
        return Ok(new { isSuccessful = true, data = item });
    }

    [HttpDelete("watchlist/{externalMediaId}")]
    public async Task<IActionResult> RemoveWatchlist(string externalMediaId, [FromQuery] Guid? userId, CancellationToken ct)
    {
        var claimId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        Guid effectiveUserId = userId ?? (Guid.TryParse(claimId, out var parsed)
            ? parsed
            : Guid.Parse("11111111-1111-1111-1111-111111111111"));

        bool removed = await _mediator.Send(new RemoveWatchlistCommand(effectiveUserId, externalMediaId), ct);
        return Ok(new { isSuccessful = removed });
    }

    [HttpPost("lists")]
    public async Task<IActionResult> CreateCustomList([FromBody] CreateCustomListCommand command, CancellationToken ct)
    {
        var claimId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        Guid effectiveUserId = command.UserId != Guid.Empty
            ? command.UserId
            : (Guid.TryParse(claimId, out var parsed) ? parsed : Guid.Parse("11111111-1111-1111-1111-111111111111"));

        var list = await _mediator.Send(command with { UserId = effectiveUserId }, ct);
        return Ok(new { isSuccessful = true, data = list });
    }
}

[ApiController]
[Route("api/security")]
public class SecurityController : ControllerBase
{
    private readonly IPayloadEncryptionService _encryptionService;

    public SecurityController(IPayloadEncryptionService encryptionService)
    {
        _encryptionService = encryptionService;
    }

    [HttpPost("encrypt")]
    public IActionResult Encrypt([FromBody] object plainObject)
    {
        var envelope = _encryptionService.EncryptObject(plainObject);
        return Ok(envelope);
    }

    [HttpPost("decrypt")]
    public IActionResult Decrypt([FromBody] EncryptedEnvelopeDto envelope)
    {
        string plainJson = _encryptionService.DecryptPayload(envelope);
        using var parsedDoc = System.Text.Json.JsonDocument.Parse(plainJson);
        return new JsonResult(parsedDoc.RootElement.Clone());
    }

    [HttpGet("status")]
    public IActionResult Status()
    {
        return Ok(new
        {
            algorithm = "AES-256-GCM + HMAC-SHA256",
            cqrsPattern = "MediatR 12.2 CQRS Pipeline",
            databaseProvider = "PostgreSQL (Npgsql.EntityFrameworkCore.PostgreSQL)",
            headerTrigger = "X-Payload-Encrypted: true"
        });
    }

    [HttpGet("handshake")]
    public IActionResult Handshake([FromServices] IConfiguration config)
    {
        byte[] aesKeyBytes = SecurityDefaults.GetAesKey(config);
        byte[] hmacKeyBytes = SecurityDefaults.GetHmacKey(config);

        return Ok(new
        {
            isSuccessful = true,
            algorithm = "AES-256-GCM",
            derivedAesKey = Convert.ToBase64String(aesKeyBytes),
            derivedHmacKey = Convert.ToBase64String(hmacKeyBytes),
            issuedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });
    }
}
