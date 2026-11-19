using System.Net;
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
using Microsoft.Extensions.Logging;
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
        Assert.Null(envelope.Algorithm);
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

    private sealed class CapturingEmailService : IEmailService
    {
        private readonly IEmailService _inner;
        public string? LastResetToken { get; private set; }
        public string? LastResetUrl { get; private set; }
        public string? LastWelcomeEmail { get; private set; }
        public string? LastWelcomeUrl { get; private set; }

        public CapturingEmailService(IEmailService inner) => _inner = inner;

        public Task<bool> SendPasswordResetEmailAsync(string toEmail, string username, string resetToken, string resetUrl, CancellationToken ct = default)
        {
            LastResetToken = resetToken;
            LastResetUrl = resetUrl;
            return _inner.SendPasswordResetEmailAsync(toEmail, username, resetToken, resetUrl, ct);
        }

        public Task<bool> SendPasswordResetConfirmationEmailAsync(string toEmail, string username, CancellationToken ct = default) =>
            _inner.SendPasswordResetConfirmationEmailAsync(toEmail, username, ct);

        public Task<bool> SendWelcomeEmailAsync(string toEmail, string displayName, string username, string appUrl, CancellationToken ct = default)
        {
            LastWelcomeEmail = toEmail;
            LastWelcomeUrl = appUrl;
            return _inner.SendWelcomeEmailAsync(toEmail, displayName, username, appUrl, ct);
        }
    }

    [Fact]
    public async Task AuthCqrs_RegisterAndLoginUser_WorksEndToEnd()
    {
        using var db = CreateInMemoryDbContext();
        var jwtService = new JwtTokenService(CreateTestConfiguration());
        var config = CreateTestConfiguration();
        using var loggerFactory = LoggerFactory.Create(b => {});
        var emailLogger = loggerFactory.CreateLogger<EmailService>();
        var emailService = new CapturingEmailService(new EmailService(config, emailLogger));

        string initialPass = string.Concat("Spidey_", Guid.NewGuid().ToString("N")[..10], "!");
        string updatedPass = string.Concat("Updated_", Guid.NewGuid().ToString("N")[..10], "!");
        string invalidCode = string.Concat("CT-", "0", "0", "0", "0", "0", "0");

        var registerHandler = new RegisterUserCommandHandler(db, jwtService, emailService, config);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            registerHandler.Handle(new RegisterUserCommand("no_email_user", "", initialPass), CancellationToken.None));
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            registerHandler.Handle(new RegisterUserCommand("whitespace_email_user", "   ", initialPass), CancellationToken.None));
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            registerHandler.Handle(new RegisterUserCommand("bad_email_user", "not-an-email", initialPass), CancellationToken.None));

        var registered = await registerHandler.Handle(
            new RegisterUserCommand("peter_parker", "peter@dailybugle.com", initialPass, "Peter Parker", null, "http://localhost:3000"),
            CancellationToken.None);

        Assert.Equal("peter_parker", registered.Username);
        Assert.False(string.IsNullOrWhiteSpace(registered.AccessToken));
        Assert.Equal("peter@dailybugle.com", emailService.LastWelcomeEmail);
        Assert.Equal("http://localhost:3000", emailService.LastWelcomeUrl);

        // Verify ASP.NET Core record validation metadata binds to primary constructor parameters (not properties)
        var emailProp = typeof(RegisterUserCommand).GetProperty(nameof(RegisterUserCommand.Email))!;
        Assert.Empty(emailProp.GetCustomAttributes(typeof(System.ComponentModel.DataAnnotations.ValidationAttribute), true));
        var ctorEmailParam = typeof(RegisterUserCommand).GetConstructors()[0].GetParameters().First(p => p.Name == "Email");
        Assert.NotEmpty(ctorEmailParam.GetCustomAttributes(typeof(System.ComponentModel.DataAnnotations.RequiredAttribute), true));

        var loginHandler = new LoginUserCommandHandler(db, jwtService);
        var loggedIn = await loginHandler.Handle(
            new LoginUserCommand("peter@dailybugle.com", initialPass),
            CancellationToken.None);

        Assert.Equal(registered.Id, loggedIn.Id);
        Assert.Equal("Peter Parker", loggedIn.DisplayName);
        Assert.False(string.IsNullOrWhiteSpace(loggedIn.AccessToken));

        // 3. Test Forgot Password and Reset Password Flow with Real DB persistence, Hashed Token & Attempt Lockout
        var forgotLogger = loggerFactory.CreateLogger<ForgotPasswordCommandHandler>();
        var resetLogger = loggerFactory.CreateLogger<ResetPasswordCommandHandler>();

        var forgotHandler = new ForgotPasswordCommandHandler(db, emailService, config, forgotLogger);
        var forgotResult = await forgotHandler.Handle(
            new ForgotPasswordCommand("peter@dailybugle.com", "http://localhost:3000"),
            CancellationToken.None);

        Assert.True(forgotResult.IsSuccessful);
        Assert.NotNull(emailService.LastResetToken);
        Assert.StartsWith("CT-", emailService.LastResetToken);
        Assert.StartsWith("http://localhost:3000/reset-password?token=", emailService.LastResetUrl);
        Assert.DoesNotContain("peter@dailybugle.com", forgotResult.Message);

        // Verify untrusted RequestOrigin cannot poison reset links
        await forgotHandler.Handle(
            new ForgotPasswordCommand("peter@dailybugle.com", "https://evil.attacker.example"),
            CancellationToken.None);
        Assert.NotNull(emailService.LastResetUrl);
        Assert.DoesNotContain("evil.attacker.example", emailService.LastResetUrl);

        // Verify hashed token & expiration were persisted (plaintext token must NOT be in DB)
        var userInDb = await db.Users.FirstAsync(u => u.Email == "peter@dailybugle.com");
        Assert.NotNull(userInDb.PasswordResetToken);
        Assert.Equal(64, userInDb.PasswordResetToken.Length);
        Assert.NotEqual(emailService.LastResetToken, userInDb.PasswordResetToken);
        Assert.NotNull(userInDb.PasswordResetExpiresAt);
        Assert.True(userInDb.PasswordResetExpiresAt > DateTime.UtcNow);

        var resetHandler = new ResetPasswordCommandHandler(db, jwtService, emailService, resetLogger);

        // Passing the raw DB hash directly must fail
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            resetHandler.Handle(
                new ResetPasswordCommand("peter@dailybugle.com", userInDb.PasswordResetToken, updatedPass),
                CancellationToken.None));

        // 4 more invalid attempts should trigger brute-force lockout and wipe the active reset token
        for (int attempt = 0; attempt < 4; attempt++)
        {
            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                resetHandler.Handle(
                    new ResetPasswordCommand("peter@dailybugle.com", invalidCode, updatedPass),
                    CancellationToken.None));
        }

        var lockedOutUser = await db.Users.FirstAsync(u => u.Email == "peter@dailybugle.com");
        Assert.Null(lockedOutUser.PasswordResetToken);

        // Re-issue fresh code and complete valid reset
        await forgotHandler.Handle(new ForgotPasswordCommand("peter@dailybugle.com"), CancellationToken.None);
        string activeToken = emailService.LastResetToken!;

        // Short password (< 6 chars) should fail
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            resetHandler.Handle(
                new ResetPasswordCommand("peter@dailybugle.com", activeToken, "123"),
                CancellationToken.None));

        // Correct token and valid password should succeed
        var resetResult = await resetHandler.Handle(
            new ResetPasswordCommand("peter@dailybugle.com", activeToken, updatedPass),
            CancellationToken.None);

        Assert.True(resetResult.IsSuccessful);

        // Verify token was cleared from Database
        var resetUserInDb = await db.Users.FirstAsync(u => u.Email == "peter@dailybugle.com");
        Assert.Null(resetUserInDb.PasswordResetToken);
        Assert.Null(resetUserInDb.PasswordResetExpiresAt);

        // Old password must fail
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            loginHandler.Handle(
                new LoginUserCommand("peter@dailybugle.com", initialPass),
                CancellationToken.None));

        // New password must succeed
        var newLogin = await loginHandler.Handle(
            new LoginUserCommand("peter@dailybugle.com", updatedPass),
            CancellationToken.None);

        Assert.Equal(registered.Id, newLogin.Id);
        Assert.False(string.IsNullOrWhiteSpace(newLogin.AccessToken));
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

    private sealed class StubSendGridHandler : HttpMessageHandler
    {
        private readonly HttpStatusCode _statusCode;
        public HttpRequestMessage? LastRequest { get; private set; }
        public string? LastBody { get; private set; }

        public StubSendGridHandler(HttpStatusCode statusCode) => _statusCode = statusCode;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            LastBody = request.Content != null
                ? await request.Content.ReadAsStringAsync(cancellationToken)
                : null;
            return new HttpResponseMessage(_statusCode);
        }
    }

    [Fact]
    public async Task EmailService_SendGridV3Api_DispatchesJsonPayloadAndHandlesFailure()
    {
        string ephemeralApiKey = string.Concat("SG.", Guid.NewGuid().ToString("N"), ".", Guid.NewGuid().ToString("N"));
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["EmailSettings:SendGridApiKey"] = ephemeralApiKey,
                ["EmailSettings:SenderEmail"] = "noreply@comictraffic.io",
                ["EmailSettings:SenderName"] = "Comic Traffic Security"
            })
            .Build();

        using var loggerFactory = LoggerFactory.Create(_ => { });
        var logger = loggerFactory.CreateLogger<EmailService>();

        var okHandler = new StubSendGridHandler(HttpStatusCode.Accepted);
        using var okClient = new HttpClient(okHandler);
        var okService = new EmailService(okClient, config, logger);

        bool dispatched = await okService.SendPasswordResetEmailAsync(
            "gwen@dailybugle.com",
            "ghost_spider",
            "CT-654321",
            "https://comictraffic.com/reset-password?token=CT-654321",
            CancellationToken.None);

        Assert.True(dispatched);
        Assert.NotNull(okHandler.LastRequest);
        Assert.Equal(HttpMethod.Post, okHandler.LastRequest!.Method);
        Assert.Equal("https://api.sendgrid.com/v3/mail/send", okHandler.LastRequest.RequestUri?.ToString());
        Assert.Equal("Bearer", okHandler.LastRequest.Headers.Authorization?.Scheme);
        Assert.Equal(ephemeralApiKey, okHandler.LastRequest.Headers.Authorization?.Parameter);
        Assert.Contains("\"gwen@dailybugle.com\"", okHandler.LastBody);
        Assert.Contains("\"noreply@comictraffic.io\"", okHandler.LastBody);
        Assert.Contains("CT-654321", okHandler.LastBody);
        Assert.Contains("\"click_tracking\":{\"enable\":false,\"enable_text\":false}", okHandler.LastBody);

        bool welcomeSent = await okService.SendWelcomeEmailAsync(
            "gwen@dailybugle.com",
            "Gwen Stacy",
            "ghost_spider",
            "https://comictraffic.com",
            CancellationToken.None);
        Assert.True(welcomeSent);
        Assert.Contains("Welcome to Comic Traffic!", okHandler.LastBody);
        Assert.Contains("https://comictraffic.com/dashboard", okHandler.LastBody);

        var forbiddenHandler = new StubSendGridHandler(HttpStatusCode.Forbidden);
        using var forbiddenClient = new HttpClient(forbiddenHandler);
        var failingService = new EmailService(forbiddenClient, config, logger);

        bool failedDispatch = await failingService.SendPasswordResetEmailAsync(
            "gwen@dailybugle.com",
            "ghost_spider",
            "CT-654321",
            "https://comictraffic.com/reset-password?token=CT-654321",
            CancellationToken.None);

        Assert.False(failedDispatch);
    }

    private sealed class RouteStubHttpHandler : HttpMessageHandler
    {
        private readonly List<(string Needle, string Json)> _routes;

        public RouteStubHttpHandler(List<(string Needle, string Json)> routes)
        {
            _routes = routes;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            string url = request.RequestUri?.ToString() ?? string.Empty;
            foreach (var (needle, json) in _routes)
            {
                if (url.Contains(needle, StringComparison.OrdinalIgnoreCase))
                {
                    return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                    {
                        Content = new StringContent(json, Encoding.UTF8, "application/json")
                    });
                }
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent("{}", Encoding.UTF8, "application/json")
            });
        }
    }

    [Fact]
    public async Task LiveMediaSearchService_MergesRealTmdbAndOmdbScoresWithoutSynthesizing()
    {
        var handler = new RouteStubHttpHandler(new List<(string, string)>
        {
            ("themoviedb.org", """{"results":[{"id":155,"media_type":"movie","title":"The Dark Knight","release_date":"2008-07-16","vote_average":8.5,"vote_count":32000,"genre_ids":[18,28],"poster_path":"/p.jpg"}]}"""),
            ("omdbapi.com/?apikey=k&s=", """{"Response":"True","Search":[{"Title":"The Dark Knight","Year":"2008","imdbID":"tt0468569","Type":"movie","Poster":"N/A"}]}"""),
            ("omdbapi.com/?apikey=k&i=tt0468569", """{"Response":"True","Title":"The Dark Knight","Year":"2008","imdbID":"tt0468569","imdbRating":"9.0","imdbVotes":"2,900,000","Metascore":"84","Ratings":[{"Source":"Rotten Tomatoes","Value":"94%"}],"Director":"Christopher Nolan"}""")
        });
        using var http = new HttpClient(handler);
        var keys = new Dictionary<string, string?> { ["TMDB_API_KEY"] = "k", ["OMDB_API_KEY"] = "k" };
        var service = new LiveMediaSearchService(http, k => keys.GetValueOrDefault(k), new CumulativeRatingCalculator());

        var result = await service.SearchAsync("the dark knight", CancellationToken.None);

        var knight = Assert.Single(result.Items, i => i.Title == "The Dark Knight");
        var sourceIds = knight.CumulativeRating.Sources.Select(s => s.SourceId).OrderBy(s => s).ToArray();
        Assert.Equal(new[] { "imdb", "metacritic", "rotten_tomatoes_critics", "tmdb" }, sourceIds);
        Assert.Equal("Christopher Nolan", knight.CreatorOrDirector);
        Assert.Contains("Action", knight.Genres);
        Assert.False(result.Providers["comicvine"].Configured);
    }

    [Fact]
    public async Task LiveMediaSearchService_NeverSynthesizesScoresAndMergesAniListWithJikan()
    {
        var handler = new RouteStubHttpHandler(new List<(string, string)>
        {
            ("itunes.apple.com/search?term=pirates&media=movie", """{"results":[{"trackId":9,"trackName":"Pirates of the Caribbean","releaseDate":"2003-07-09T07:00:00Z","primaryGenreName":"Adventure","artworkUrl100":"http://x/100x100bb.jpg"}]}"""),
            ("graphql.anilist.co", """{"data":{"manga":{"media":[{"id":30002,"idMal":2,"title":{"romaji":"Berserk","english":"Berserk"},"startDate":{"year":1989},"averageScore":94,"popularity":200000,"genres":["Action"],"coverImage":{"large":"https://s4.anilist.co/c.jpg"}}]},"anime":{"media":[]}}}"""),
            ("api.jikan.moe", """{"data":[{"mal_id":2,"title":"Berserk","score":9.47,"scored_by":330000,"published":{"prop":{"from":{"year":1989}}},"genres":[{"name":"Adventure"}],"themes":[],"authors":[{"name":"Miura, Kentarou"}]}]}""")
        });
        using var http = new HttpClient(handler);
        var service = new LiveMediaSearchService(http, _ => null, new CumulativeRatingCalculator());

        var piratesResult = await service.SearchAsync("pirates", CancellationToken.None);
        var pirates = Assert.Single(piratesResult.Items, i => i.Title == "Pirates of the Caribbean");
        Assert.Equal(0, pirates.CumulativeRating.ActiveSourceCount);
        Assert.Equal("Unrated", pirates.CumulativeRating.ConsensusTier);
        Assert.Equal("https://x/600x600bb.jpg", pirates.PosterUrl);

        var berserkResult = await service.SearchAsync("berserk", CancellationToken.None);
        var berserk = Assert.Single(berserkResult.Items, i => i.Title == "Berserk");
        Assert.Equal("ComicBook", berserk.MediaType);
        Assert.Equal(new[] { "anilist", "myanimelist" }, berserk.CumulativeRating.Sources.Select(s => s.SourceId).OrderBy(s => s).ToArray());
    }

    [Fact]
    public async Task SearchLiveExternalApisCommandHandler_UsesSeededDatabaseStrictlyAsFallback()
    {
        await using var db = CreateInMemoryDbContext();
        var calculator = new CumulativeRatingCalculator();
        var jwt = new JwtTokenService(CreateTestConfiguration());
        await DatabaseSeeder.SeedAsync(db, calculator, jwt);

        // 1. When live providers return a hit, DB seeded items are NOT returned
        var liveHitHandler = new RouteStubHttpHandler(new List<(string, string)>
        {
            ("itunes.apple.com/search?term=watchmen&media=movie", """{"results":[{"trackId":42,"trackName":"Watchmen","releaseDate":"2009-03-06T00:00:00Z","primaryGenreName":"Action"}]}""")
        });
        using var liveHttp = new HttpClient(liveHitHandler);
        var liveService = new LiveMediaSearchService(liveHttp, _ => null, calculator);
        var cmdHandler = new SearchLiveExternalApisCommandHandler(db, calculator, liveService);

        var liveRes = await cmdHandler.Handle(new SearchLiveExternalApisCommand("watchmen"), CancellationToken.None);
        Assert.False(liveRes.Fallback);
        Assert.Single(liveRes.Items);
        Assert.Equal("movie-itunes-42", liveRes.Items[0].ExternalId);

        // 2. When every live provider returns nothing, seeded DB acts as fallback
        var emptyHandler = new RouteStubHttpHandler(new List<(string, string)>());
        using var emptyHttp = new HttpClient(emptyHandler);
        var emptyService = new LiveMediaSearchService(emptyHttp, _ => null, calculator);
        var fallbackHandler = new SearchLiveExternalApisCommandHandler(db, calculator, emptyService);

        var fallbackRes = await fallbackHandler.Handle(new SearchLiveExternalApisCommand("watchmen"), CancellationToken.None);
        Assert.True(fallbackRes.Fallback);
        Assert.NotEmpty(fallbackRes.Items);
        Assert.Contains(fallbackRes.Items, i => i.Title.Contains("Watchmen", StringComparison.OrdinalIgnoreCase));
    }
}
