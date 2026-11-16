using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ComicTraffic.Api.Application.Features.Auth;
using ComicTraffic.Api.Application.Features.Dashboard;
using ComicTraffic.Api.Application.Features.Media;
using ComicTraffic.Api.Application.Features.Reviews;
using ComicTraffic.Api.Domain.Entities;
using ComicTraffic.Api.Infrastructure.Persistence;
using ComicTraffic.Api.Infrastructure.Security;
using ComicTraffic.Api.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ComicTraffic.Tests;

public class ComicTrafficBackendTests
{
    private static IConfiguration CreateTestConfiguration()
    {
        string ephemeralAes = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        string ephemeralHmac = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        string ephemeralJwt = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

        string testIssuerKey = string.Concat("Jwt", ":", "Issuer");
        string testAudienceKey = string.Concat("Jwt", ":", "Audience");

        var settings = new Dictionary<string, string?>
        {
            ["Security:PayloadEncryptionKey"] = ephemeralAes,
            ["Security:PayloadHmacKey"] = ephemeralHmac,
            ["Jwt:Key"] = ephemeralJwt,
            [testIssuerKey] = string.Concat("Comic", "Traffic.Tests"),
            [testAudienceKey] = string.Concat("Comic", "Traffic.Tests.Client")
        };
        return new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
    }

    private static ComicTrafficDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<ComicTrafficDbContext>()
            .UseInMemoryDatabase($"ComicTraffic_TestDb_{Guid.NewGuid()}")
            .Options;
        return new ComicTrafficDbContext(options);
    }

    [Fact]
    public void CumulativeRatingCalculator_ComputesFinalCumulativeAverageAndSplitsCorrectly()
    {
        var calculator = new CumulativeRatingCalculator();
        var sources = new List<ExternalRatingSource>
        {
            new() { SourceId = "imdb", SourceName = "IMDb", Category = "Audience", NormalizedScore = 90.0, VoteCount = 500000, DefaultWeight = 1.2 },
            new() { SourceId = "rotten_tomatoes_critics", SourceName = "RT Critics", Category = "Critic", NormalizedScore = 96.0, VoteCount = 350, DefaultWeight = 1.2 },
            new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", NormalizedScore = 88.0, VoteCount = 60, DefaultWeight = 1.15 },
            new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", NormalizedScore = 86.0, VoteCount = 15000, DefaultWeight = 1.0 },
            new() { SourceId = "comicvine", SourceName = "ComicVine", Category = "ComicCommunity", NormalizedScore = 95.0, VoteCount = 12000, DefaultWeight = 1.25 }
        };

        var result = calculator.CalculateCumulativeRating(sources);

        Assert.Equal(5, result.ActiveSourceCount);
        Assert.Equal(527410, result.TotalAggregatedVotes);
        Assert.Equal(92.0, result.CriticConsensusScore);
        Assert.Equal(88.0, result.AudienceConsensusScore);
        Assert.Equal(95.0, result.ComicCommunityScore);
        Assert.InRange(result.FinalCumulativeAverage, 88.0, 94.0);
        Assert.Equal("Universal Acclaim", result.ConsensusTier);
    }

    [Fact]
    public void CumulativeRatingCalculator_AppliesCustomUserWeightsProperly()
    {
        var calculator = new CumulativeRatingCalculator();
        var sources = new List<ExternalRatingSource>
        {
            new() { SourceId = "critic_site", SourceName = "Critic Site", Category = "Critic", NormalizedScore = 95.0, VoteCount = 500, DefaultWeight = 1.0 },
            new() { SourceId = "audience_site", SourceName = "Audience Site", Category = "Audience", NormalizedScore = 65.0, VoteCount = 500, DefaultWeight = 1.0 }
        };

        var criticHeavyWeights = new Dictionary<string, double>
        {
            ["critic_site"] = 3.0,
            ["audience_site"] = 1.0
        };
        var audienceHeavyWeights = new Dictionary<string, double>
        {
            ["critic_site"] = 1.0,
            ["audience_site"] = 3.0
        };

        var criticWeightedResult = calculator.CalculateCumulativeRating(sources, criticHeavyWeights);
        var audienceWeightedResult = calculator.CalculateCumulativeRating(sources, audienceHeavyWeights);

        Assert.Equal(87.5, criticWeightedResult.FinalCumulativeAverage);
        Assert.Equal(72.5, audienceWeightedResult.FinalCumulativeAverage);
        Assert.True(criticWeightedResult.FinalCumulativeAverage > audienceWeightedResult.FinalCumulativeAverage);
    }

    [Fact]
    public void PayloadEncryptionService_EncryptsAndDecryptsObjectRoundTrip()
    {
        var config = CreateTestConfiguration();
        var encryptionService = new PayloadEncryptionService(config);

        var originalCommand = new LoginUserCommand("demo@comictraffic.io", "ComicTraffic123!");
        var envelope = encryptionService.EncryptObject(originalCommand);

        Assert.True(envelope.Encrypted);
        Assert.Equal("AES-256-GCM", envelope.Algorithm);
        Assert.False(string.IsNullOrWhiteSpace(envelope.Payload));
        Assert.False(string.IsNullOrWhiteSpace(envelope.Iv));
        Assert.False(string.IsNullOrWhiteSpace(envelope.Signature));

        var decrypted = encryptionService.DecryptObject<LoginUserCommand>(envelope);

        Assert.NotNull(decrypted);
        Assert.Equal("demo@comictraffic.io", decrypted!.EmailOrUsername);
        Assert.Equal("ComicTraffic123!", decrypted.Password);
    }

    [Fact]
    public void PayloadEncryptionService_DetectsTamperedPayloadSignature()
    {
        var config = CreateTestConfiguration();
        var encryptionService = new PayloadEncryptionService(config);

        var envelope = encryptionService.EncryptPayload("{\"title\":\"Watchmen\",\"score\":98}");
        // Tamper with the signature
        envelope.Signature = Convert.ToBase64String(Encoding.UTF8.GetBytes("tampered_signature_value_0123456"));

        Assert.Throws<CryptographicException>(() => encryptionService.DecryptPayload(envelope));
    }

    [Fact]
    public async Task PayloadEncryptionMiddleware_DecryptsRequestAndEncryptsResponseEndToEnd()
    {
        var config = CreateTestConfiguration();
        var encryptionService = new PayloadEncryptionService(config);

        string capturedDecryptedRequest = string.Empty;
        RequestDelegate next = async ctx =>
        {
            using var reader = new StreamReader(ctx.Request.Body, Encoding.UTF8);
            capturedDecryptedRequest = await reader.ReadToEndAsync();
            ctx.Response.StatusCode = 200;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.WriteAsync("{\"status\":\"ok\",\"cumulativeAverage\":94.5}");
        };

        var middleware = new PayloadEncryptionMiddleware(next, NullLogger<PayloadEncryptionMiddleware>.Instance);
        var context = new DefaultHttpContext();

        var encryptedRequestEnvelope = encryptionService.EncryptPayload("{\"externalId\":\"comic-watchmen-1986\"}");
        string encryptedRequestJson = JsonSerializer.Serialize(encryptedRequestEnvelope, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });

        byte[] requestBytes = Encoding.UTF8.GetBytes(encryptedRequestJson);
        context.Request.Body = new MemoryStream(requestBytes);
        context.Request.ContentLength = requestBytes.Length;
        context.Request.ContentType = "application/json";
        context.Request.Headers["X-Payload-Encrypted"] = "true";

        var responseStream = new MemoryStream();
        context.Response.Body = responseStream;

        await middleware.InvokeAsync(context, encryptionService);

        // Verify the inner controller received the decrypted plaintext JSON
        Assert.Equal("{\"externalId\":\"comic-watchmen-1986\"}", capturedDecryptedRequest);
        Assert.Equal("true", context.Response.Headers["X-Payload-Encrypted"].ToString());

        // Verify the outgoing response was encrypted and can be decrypted back
        responseStream.Position = 0;
        string rawEncryptedResponse = await new StreamReader(responseStream, Encoding.UTF8).ReadToEndAsync();
        var responseEnvelope = JsonSerializer.Deserialize<EncryptedEnvelopeDto>(rawEncryptedResponse, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        Assert.NotNull(responseEnvelope);
        Assert.True(responseEnvelope!.Encrypted);

        string decryptedResponseJson = encryptionService.DecryptPayload(responseEnvelope);
        Assert.Equal("{\"status\":\"ok\",\"cumulativeAverage\":94.5}", decryptedResponseJson);
    }

    [Fact]
    public async Task AuthCqrs_RegisterAndLoginUser_WorksEndToEnd()
    {
        using var db = CreateInMemoryDbContext();
        var jwtService = new JwtTokenService(CreateTestConfiguration());

        var registerHandler = new RegisterUserCommandHandler(db, jwtService);
        var registered = await registerHandler.Handle(
            new RegisterUserCommand("peter_parker", "peter@dailybugle.com", "SpideySense99!", "Peter Parker"),
            CancellationToken.None);

        Assert.Equal("peter_parker", registered.Username);
        Assert.False(string.IsNullOrWhiteSpace(registered.AccessToken));

        var loginHandler = new LoginUserCommandHandler(db, jwtService);
        var loggedIn = await loginHandler.Handle(
            new LoginUserCommand("peter@dailybugle.com", "SpideySense99!"),
            CancellationToken.None);

        Assert.Equal(registered.Id, loggedIn.Id);
        Assert.Equal("Peter Parker", loggedIn.DisplayName);
        Assert.False(string.IsNullOrWhiteSpace(loggedIn.AccessToken));
    }

    [Fact]
    public async Task MediaAndReviewsCqrs_SeedCatalog_CompareItems_AndSubmitReviewRecalculatesAverage()
    {
        using var db = CreateInMemoryDbContext();
        var calculator = new CumulativeRatingCalculator();
        var jwtService = new JwtTokenService(CreateTestConfiguration());

        await DatabaseSeeder.SeedAsync(db, calculator, jwtService);

        // 1. Query Comic Books
        var catalogHandler = new GetMediaCatalogQueryHandler(db, calculator);
        var comics = await catalogHandler.Handle(new GetMediaCatalogQuery(MediaType: "ComicBook"), CancellationToken.None);

        Assert.NotEmpty(comics);
        Assert.All(comics, c => Assert.Equal("ComicBook", c.MediaType));
        Assert.All(comics, c => Assert.True(c.CumulativeRating.FinalCumulativeAverage > 80));

        // 2. Compare Watchmen vs. The Dark Knight
        var compareHandler = new CompareMediaItemsQueryHandler(db, calculator);
        var comparison = await compareHandler.Handle(
            new CompareMediaItemsQuery(new List<string> { "comic-watchmen-1986", "movie-dark-knight-2008" }),
            CancellationToken.None);

        Assert.Equal(2, comparison.Items.Count);
        Assert.False(string.IsNullOrWhiteSpace(comparison.HighestCumulativeWinnerId));

        // 3. Submit Review and verify community score & cumulative average update
        var reviewHandler = new SubmitReviewCommandHandler(db, calculator);
        var reviewResult = await reviewHandler.Handle(
            new SubmitReviewCommand(
                Guid.NewGuid(),
                "alan_fan",
                "comic-watchmen-1986",
                "Watchmen #1–12",
                "ComicBook",
                100.0,
                "Perfection in every panel",
                "Unmatched storytelling across all 12 issues.",
                false),
            CancellationToken.None);

        Assert.Equal(100.0, reviewResult.Review.Score);
        Assert.True(reviewResult.UpdatedCumulativeAverage > 90.0);
    }

    [Fact]
    public async Task DashboardCqrs_UpsertWatchlist_ComputesUserAnalyticsCorrectly()
    {
        using var db = CreateInMemoryDbContext();
        var userId = Guid.NewGuid();

        var upsertHandler = new UpsertWatchlistCommandHandler(db);
        await upsertHandler.Handle(new UpsertWatchlistCommand(
            userId,
            "comic-saga-2012",
            "Saga",
            "ComicBook",
            "https://example.com/saga.jpg",
            93.2,
            96.0,
            "Reading",
            "Issue #45"), CancellationToken.None);

        await upsertHandler.Handle(new UpsertWatchlistCommand(
            userId,
            "movie-spiderverse-2023",
            "Spider-Man: Across the Spider-Verse",
            "Movie",
            "https://example.com/spiderverse.jpg",
            89.2,
            94.0,
            "Completed",
            "Loved it"), CancellationToken.None);

        var dashboardHandler = new GetUserDashboardQueryHandler(db);
        var summary = await dashboardHandler.Handle(new GetUserDashboardQuery(userId), CancellationToken.None);

        Assert.Equal(2, summary.TotalTrackedItems);
        Assert.Equal(1, summary.ComicBooksTrackedCount);
        Assert.Equal(1, summary.MoviesTrackedCount);
        Assert.Equal(95.0, summary.UserAveragePersonalScore);
        Assert.Equal(91.2, summary.GlobalAverageOfTrackedItems);
        Assert.Equal(3.8, summary.UserVsGlobalDelta);
    }
}
