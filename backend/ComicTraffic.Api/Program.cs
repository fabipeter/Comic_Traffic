using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using ComicTraffic.Api.Infrastructure.Persistence;
using ComicTraffic.Api.Infrastructure.Security;
using ComicTraffic.Api.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "ComicTraffic Cumulative Rating CQRS API",
        Version = "v1",
        Description = "Cumulative rating API for Comic Books, Movies, and TV Series using CQRS (MediatR), AES-256-CBC Payload/Response Encryption, and PostgreSQL."
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

// Configure CORS for React Frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("ComicTrafficCors", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod()
              .WithExposedHeaders("X-Payload-Encrypted");
    });
});

// Configure PostgreSQL EF Core with environment variable priority (DATABASE_URL / ConnectionStrings__DefaultConnection)
string? envDbUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
string? configDbUrl = builder.Configuration.GetConnectionString("DefaultConnection");
string configuredConn = !string.IsNullOrWhiteSpace(envDbUrl)
    ? envDbUrl
    : (!string.IsNullOrWhiteSpace(configDbUrl)
        ? configDbUrl
        : "Host=localhost;Port=5432;Database=comictraffic_db;Username=postgres;Password=postgres");

if (configuredConn.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
    configuredConn.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
{
    configuredConn = ConvertPostgresUriToNpgsqlConnectionString(configuredConn);
}

bool useInMemoryFallback = builder.Configuration.GetValue<bool>("Database:UseInMemoryWhenPostgresOffline", true);

string? workingPostgresConn = ResolveWorkingPostgresConnectionString(configuredConn);

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

// Enable Swagger UI in all environments and redirect root '/' to '/swagger'
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "ComicTraffic CQRS API v1");
    c.RoutePrefix = "swagger";
});

app.MapGet("/", () => Results.Redirect("/swagger")).ExcludeFromDescription();

app.UseCors("ComicTrafficCors");

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

static string ConvertPostgresUriToNpgsqlConnectionString(string uriString)
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
            SslMode = SslMode.Prefer,
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
