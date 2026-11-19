using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using ComicTraffic.Api.Infrastructure.Persistence;
using ComicTraffic.Api.Infrastructure.Security;
using ComicTraffic.Api.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

bool isProduction = builder.Environment.IsProduction();

// Cloud platforms (Railway, Render, Fly, Heroku-style hosts) inject the listening port via PORT.
string? platformPort = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(platformPort) &&
    string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{platformPort}");
}

static string? CleanConfigValue(string? val) =>
    string.IsNullOrWhiteSpace(val) ? null : val.Trim().Trim('"', '\'').Trim();

static string? ResolveConfig(IConfiguration config, params string[] candidateKeys)
{
    foreach (var key in candidateKeys)
    {
        string? val = CleanConfigValue(config[key]);
        if (!string.IsNullOrWhiteSpace(val)) return val;
    }

    var allEnv = Environment.GetEnvironmentVariables();
    foreach (var candidate in candidateKeys)
    {
        foreach (var k in allEnv.Keys.Cast<object>().Select(o => o.ToString()!))
        {
            if (string.Equals(k.Trim(), candidate.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                string? envVal = CleanConfigValue(allEnv[k]?.ToString());
                if (!string.IsNullOrWhiteSpace(envVal)) return envVal;
            }
        }
    }
    return null;
}

Console.WriteLine("=== CONTAINER BOOT DIAGNOSTICS ===");
Console.WriteLine($"Environment: {builder.Environment.EnvironmentName}");
var presentKeys = Environment.GetEnvironmentVariables().Keys.Cast<object>().Select(k => k.ToString()!.Trim()).OrderBy(k => k).ToList();
Console.WriteLine($"Total OS Env Vars: {presentKeys.Count}");
Console.WriteLine($"Detected Env Keys: {string.Join(", ", presentKeys.Where(k => !k.Contains("SECRET", StringComparison.OrdinalIgnoreCase) && !k.Contains("KEY", StringComparison.OrdinalIgnoreCase) && !k.Contains("PASS", StringComparison.OrdinalIgnoreCase)))}");

string? gatewaySharedSecret = ResolveConfig(builder.Configuration, "GATEWAY_SHARED_SECRET", "GATEWAY_SECRET");

string? configuredDbUrl = ResolveConfig(builder.Configuration,
    "DATABASE_URL",
    "POSTGRES_URL",
    "DATABASE_PUBLIC_URL",
    "DATABASE_PRIVATE_URL",
    "ConnectionStrings:DefaultConnection",
    "ConnectionStrings__DefaultConnection");

string? configuredJwtKey = ResolveConfig(builder.Configuration,
    "JWT_SIGNING_KEY",
    "JWT_SECRET",
    "Jwt:Key",
    "Jwt__Key");

Console.WriteLine($"DATABASE_URL resolved: {!string.IsNullOrWhiteSpace(configuredDbUrl)}");
Console.WriteLine($"JWT_SIGNING_KEY resolved: {!string.IsNullOrWhiteSpace(configuredJwtKey)}");
Console.WriteLine($"GATEWAY_SHARED_SECRET resolved: {!string.IsNullOrWhiteSpace(gatewaySharedSecret)}");
Console.WriteLine("==================================");

// Fail fast in production: never boot with ephemeral/default secrets or an open API.
if (isProduction)
{
    var missing = new List<string>();
    if (string.IsNullOrWhiteSpace(configuredDbUrl))
        missing.Add("DATABASE_URL");

    if (string.IsNullOrWhiteSpace(configuredJwtKey) || configuredJwtKey.Length < 32)
        missing.Add($"JWT_SIGNING_KEY (min 32 characters, got {configuredJwtKey?.Length ?? 0})");

    if (string.IsNullOrWhiteSpace(gatewaySharedSecret) || gatewaySharedSecret.Length < 24)
        missing.Add($"GATEWAY_SHARED_SECRET (min 24 characters, got {gatewaySharedSecret?.Length ?? 0})");

    if (missing.Count > 0)
    {
        throw new InvalidOperationException(
            $"Production configuration is incomplete. Set: {string.Join(", ", missing)}. Available keys: [{string.Join(", ", presentKeys)}]");
    }
}

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    // The API is only reachable through the platform proxy + the authenticated gateway
    // (GATEWAY_SHARED_SECRET), so the left-most X-Forwarded-For entry is the real client.
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
    options.ForwardLimit = null;
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
if (!isProduction)
{
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "ComicTraffic Cumulative Rating CQRS API",
            Version = "v1",
            Description = "Cumulative rating API for Comic Books, Movies, and TV Series using CQRS (MediatR) and PostgreSQL."
        });

        c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Description = "JWT Authorization header using the Bearer scheme. Example: 'Bearer {token}'",
            Name = "Authorization",
            In = ParameterLocation.Header,
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT"
        });

        c.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            {
                new OpenApiSecurityScheme
                {
                    Reference = new OpenApiReference
                    {
                        Type = ReferenceType.SecurityScheme,
                        Id = "Bearer"
                    }
                },
                Array.Empty<string>()
            }
        });
    });
}

// Configure CORS: open for local development, strict allow-list in production
builder.Services.AddCors(options =>
{
    options.AddPolicy("ComicTrafficCors", policy =>
    {
        if (isProduction)
        {
            string[] allowedOrigins = (Environment.GetEnvironmentVariable("CORS_ALLOWED_ORIGINS")
                    ?? "https://comictraffic.com,https://www.comictraffic.com")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            policy.WithOrigins(allowedOrigins)
                  .WithHeaders("Content-Type", "Authorization", "X-Payload-Encrypted", "X-Response-Encrypted", "X-Gateway-Secret")
                  .WithMethods("GET", "POST", "PUT", "DELETE")
                  .WithExposedHeaders("X-Payload-Encrypted");
        }
        else
        {
            policy.AllowAnyOrigin()
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .WithExposedHeaders("X-Payload-Encrypted");
        }
    });
});

// Configure PostgreSQL EF Core with environment variable priority (DATABASE_URL / ConnectionStrings__DefaultConnection)
string configuredConn = !string.IsNullOrWhiteSpace(configuredDbUrl)
    ? configuredDbUrl
    : "Host=localhost;Port=5432;Database=comictraffic_db;Username=postgres;Password=postgres";

if (configuredConn.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
    configuredConn.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
{
    configuredConn = ConvertPostgresUriToNpgsqlConnectionString(configuredConn, requireTls: isProduction);
}

bool useInMemoryFallback = !isProduction &&
    builder.Configuration.GetValue<bool>("Database:UseInMemoryWhenPostgresOffline", true);

// Local development probes common credentials; production uses exactly the configured database.
string? workingPostgresConn = isProduction
    ? configuredConn
    : ResolveWorkingPostgresConnectionString(configuredConn);

builder.Services.AddDbContext<ComicTrafficDbContext>(options =>
{
    if (workingPostgresConn != null)
    {
        options.UseNpgsql(workingPostgresConn, npgsql =>
        {
            npgsql.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(5), errorCodesToAdd: null);
            npgsql.CommandTimeout(15);
        });
    }
    else if (useInMemoryFallback)
    {
        options.UseInMemoryDatabase("ComicTraffic_PostgresDb");
    }
    else
    {
        options.UseNpgsql(configuredConn);
    }
});

// Register CQRS (MediatR), Encryption, JWT, Email, and Cumulative Rating Services
builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(Program).Assembly));
builder.Services.AddSingleton<IPayloadEncryptionService, PayloadEncryptionService>();
builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();
builder.Services.AddSingleton<ICumulativeRatingCalculator, CumulativeRatingCalculator>();
builder.Services.AddHttpClient<IEmailService, EmailService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(10);
});

// Configure JWT Authentication
byte[] keyBytes = SecurityDefaults.GetJwtKey(builder.Configuration);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "ComicTraffic.Api",
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "ComicTraffic.Client",
            IssuerSigningKey = new SymmetricSecurityKey(keyBytes)
        };
    });

builder.Services.AddAuthorization();

// Rate-limit sensitive authentication & recovery endpoints per client IP
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth-sensitive", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 8,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
});

var app = builder.Build();

// Seed Database on startup with resilient fallback
using (var scope = app.Services.CreateScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    var db = scope.ServiceProvider.GetRequiredService<ComicTrafficDbContext>();
    var calculator = scope.ServiceProvider.GetRequiredService<ICumulativeRatingCalculator>();
    var jwtService = scope.ServiceProvider.GetRequiredService<IJwtTokenService>();

    try
    {
        if (workingPostgresConn != null)
        {
            logger.LogInformation("Connected to PostgreSQL database successfully.");
        }
        else
        {
            logger.LogWarning(
                "PostgreSQL credentials in appsettings.json could not authenticate; running with EF Core In-Memory PostgreSQL Mirror. " +
                "Update ConnectionStrings:DefaultConnection in appsettings.json with your local Postgres username/password to persist to PostgreSQL.");
        }

        await db.Database.EnsureCreatedAsync();

        if (workingPostgresConn != null)
        {
            try
            {
                await db.Database.ExecuteSqlAsync($"ALTER TABLE users ADD COLUMN IF NOT EXISTS \"PasswordResetToken\" VARCHAR(200);");
                await db.Database.ExecuteSqlAsync($"ALTER TABLE users ADD COLUMN IF NOT EXISTS \"PasswordResetExpiresAt\" TIMESTAMP WITH TIME ZONE;");
                await db.Database.ExecuteSqlAsync($"ALTER TABLE users ADD COLUMN IF NOT EXISTS \"PasswordResetFailedAttempts\" INTEGER NOT NULL DEFAULT 0;");
                logger.LogInformation("PostgreSQL users table schema synchronized with PasswordReset columns.");
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Could not alter users table for PasswordReset columns.");
            }
        }

        await DatabaseSeeder.SeedAsync(db, calculator, jwtService);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Database initialization encountered an error.");
    }
}

if (!isProduction)
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "ComicTraffic CQRS API v1");
        c.RoutePrefix = "swagger";
    });
    app.MapGet("/", () => Results.Redirect("/swagger")).ExcludeFromDescription();
}
else
{
    app.MapGet("/", () => Results.Ok(new
    {
        service = "ComicTraffic.Api",
        status = "online",
        timestamp = DateTimeOffset.UtcNow
    })).ExcludeFromDescription();
}

app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    service = "ComicTraffic.Api",
    timestamp = DateTimeOffset.UtcNow
})).ExcludeFromDescription();

app.UseCors("ComicTrafficCors");

// Require valid X-Gateway-Secret in production to block direct unauthenticated access
if (isProduction && !string.IsNullOrWhiteSpace(gatewaySharedSecret))
{
    app.Use(async (context, next) =>
    {
        var path = context.Request.Path.Value ?? string.Empty;
        if (HttpMethods.IsOptions(context.Request.Method) ||
            path == "/" ||
            path.StartsWith("/health", StringComparison.OrdinalIgnoreCase))
        {
            await next();
            return;
        }

        if (context.Request.Headers.TryGetValue("X-Gateway-Secret", out var providedSecret) &&
            CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(providedSecret.ToString()),
                Encoding.UTF8.GetBytes(gatewaySharedSecret)))
        {
            await next();
            return;
        }

        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync("{\"isSuccessful\":false,\"message\":\"Access forbidden: missing or invalid gateway credentials.\"}");
    });
}

// Industry-Standard API Security Headers Middleware
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), unload=*";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'; object-src 'none';";
    context.Response.Headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
    await next();
});

// Register Payload & Response Encryption Middleware
app.UseMiddleware<PayloadEncryptionMiddleware>();

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

static string? ResolveWorkingPostgresConnectionString(string configuredConnectionString)
{
    var candidates = new List<string> { configuredConnectionString };

    string currentOsUser = Environment.UserName;
    if (!string.IsNullOrWhiteSpace(currentOsUser))
    {
        candidates.Add($"Host=localhost;Port=5432;Database=comictraffic_db;Username={currentOsUser}");
    }
    candidates.Add("Host=localhost;Port=5432;Database=comictraffic_db;Username=postgres");
    candidates.Add("Host=localhost;Port=5432;Database=comictraffic_db;Username=postgres;Password=admin");
    candidates.Add("Host=localhost;Port=5432;Database=comictraffic_db;Username=postgres;Password=root");

    foreach (var candidate in candidates.Distinct())
    {
        if (CanAuthenticateWithPostgres(candidate))
        {
            return candidate;
        }
    }

    return null;
}

static string ConvertPostgresUriToNpgsqlConnectionString(string uriString, bool requireTls = false)
{
    try
    {
        var uri = new Uri(uriString);
        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = uri.AbsolutePath.TrimStart('/'),
            Username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : string.Empty,
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty,
            // Managed Postgres (Supabase, Neon, Railway) presents provider-signed certificates:
            // enforce TLS encryption in production without requiring a local CA bundle.
            SslMode = requireTls ? SslMode.Require : SslMode.Prefer,
            Pooling = true,
            MinPoolSize = 1,
            MaxPoolSize = 20
        };
        return builder.ConnectionString;
    }
    catch
    {
        return uriString;
    }
}

static bool CanAuthenticateWithPostgres(string connectionString)
{
    try
    {
        var csb = new NpgsqlConnectionStringBuilder(connectionString)
        {
            Database = "postgres",
            Timeout = 2,
            CommandTimeout = 2
        };

        using var conn = new NpgsqlConnection(csb.ConnectionString);
        conn.Open();
        return true;
    }
    catch
    {
        return false;
    }
}

public partial class Program { }
