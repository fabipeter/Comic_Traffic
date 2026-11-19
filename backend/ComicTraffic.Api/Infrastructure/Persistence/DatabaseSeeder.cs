using System.Text.Json;
using ComicTraffic.Api.Domain.Entities;
using ComicTraffic.Api.Infrastructure.Security;
using ComicTraffic.Api.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace ComicTraffic.Api.Infrastructure.Persistence;

public static class DatabaseSeeder
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static async Task SeedAsync(
        ComicTrafficDbContext db,
        ICumulativeRatingCalculator calculator,
        IJwtTokenService jwtTokenService)
    {
        if (await db.MediaItems.AnyAsync())
            return;

        // 1. Seed Demo Users (Save first to satisfy foreign key constraints)
        string demoAdminUsername = Environment.GetEnvironmentVariable("SEED_ADMIN_USER")
            ?? string.Join(string.Empty, new[] { "comic", "warden" });
        string demoAdminPass = Environment.GetEnvironmentVariable("SEED_ADMIN_PASS")
            ?? string.Concat("CT_", Guid.NewGuid().ToString("N")[..8]);

        string secondUsername = Environment.GetEnvironmentVariable("SEED_USER_NAME")
            ?? string.Join(string.Empty, new[] { "gotham_", "oracle" });
        string secondPass = Environment.GetEnvironmentVariable("SEED_USER_PASS")
            ?? string.Concat("GO_", Guid.NewGuid().ToString("N")[..8]);

        var demoUserId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var demoUser = await db.Users.FirstOrDefaultAsync(u => u.Id == demoUserId || u.Email == "demo@comictraffic.io");
        if (demoUser == null)
        {
            demoUser = new AppUser
            {
                Id = demoUserId,
                Username = demoAdminUsername,
                Email = "demo@comictraffic.io",
                DisplayName = "Alex Mercer (ComicWarden)",
                Bio = "Cumulative rating analyst, graphic novel collector, and sci-fi cinema critic.",
                Role = "Admin",
                FavoriteGenresCsv = "Superhero,Sci-Fi,Noir,Graphic Novel,Animation",
                PasswordHash = jwtTokenService.HashPassword(demoAdminPass),
                PreferredWeightsJson = JsonSerializer.Serialize(new Dictionary<string, double>
                {
                    ["imdb"] = 1.25,
                    ["rotten_tomatoes_critics"] = 1.2,
                    ["rotten_tomatoes_audience"] = 1.1,
                    ["metacritic"] = 1.2,
                    ["tmdb"] = 1.0,
                    ["trakt"] = 0.95,
                    ["anilist"] = 1.2,
                    ["comictraffic_community"] = 1.15
                }, JsonOptions)
            };
            db.Users.Add(demoUser);
        }

        var secondUserId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var secondUser = await db.Users.FirstOrDefaultAsync(u => u.Id == secondUserId || u.Email == "barbara@comictraffic.io");
        if (secondUser == null)
        {
            secondUser = new AppUser
            {
                Id = secondUserId,
                Username = secondUsername,
                Email = "barbara@comictraffic.io",
                DisplayName = "Barbara Gordon",
                Bio = "Tracking every issue, crossover event, and live-action adaptation.",
                Role = "User",
                FavoriteGenresCsv = "Detective,Mystery,Comic Book,Thriller",
                PasswordHash = jwtTokenService.HashPassword(secondPass)
            };
            db.Users.Add(secondUser);
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DatabaseSeeder] Users sync warning: {ex.Message}");
        }

        // 2. Seed Movies, TV Series, and Comic Books with Multi-API Rating Breakdown
        var items = new List<MediaItem>
        {
            CreateSeededItem(calculator,
                externalId: "movie-spiderverse-2023",
                title: "Spider-Man: Across the Spider-Verse",
                category: MediaCategory.Movie,
                year: 2023,
                publisher: "Sony Pictures / Marvel Entertainment",
                creator: "Joaquim Dos Santos, Kemp Powers, Justin K. Thompson",
                runtime: "140 min",
                ageRating: "PG",
                genres: "Animation,Action,Adventure,Comic Adaptation,Multiverse",
                posterUrl: "https://image.tmdb.org/t/p/original/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg",
                overview: "After reuniting with Gwen Stacy, Brooklyn's full-time, friendly neighborhood Spider-Man is catapulted across the Multiverse, where he encounters the Spider Society charged with protecting its very existence.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb (OMDb)", Category = "Audience", RawScoreDisplay = "8.6 / 10", NormalizedScore = 86.0, VoteCount = 398000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "95%", NormalizedScore = 95.0, VoteCount = 385, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "94%", NormalizedScore = 94.0, VoteCount = 25000, DefaultWeight = 1.1, AccentColor = "#ff6b35" },
                    new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = "86 / 100", NormalizedScore = 86.0, VoteCount = 60, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "8.4 / 10", NormalizedScore = 84.0, VoteCount = 6720, DefaultWeight = 1.0, AccentColor = "#01b4e4" },
                    new() { SourceId = "trakt", SourceName = "Trakt.tv", Category = "Audience", RawScoreDisplay = "87%", NormalizedScore = 87.0, VoteCount = 41200, DefaultWeight = 0.95, AccentColor = "#ed1c24" },
                    new() { SourceId = "letterboxd", SourceName = "Letterboxd", Category = "Audience", RawScoreDisplay = "4.4 / 5", NormalizedScore = 88.0, VoteCount = 1420000, DefaultWeight = 1.1, AccentColor = "#00e054" }
                }),

            CreateSeededItem(calculator,
                externalId: "movie-dark-knight-2008",
                title: "The Dark Knight",
                category: MediaCategory.Movie,
                year: 2008,
                publisher: "Warner Bros. / DC Films",
                creator: "Christopher Nolan",
                runtime: "152 min",
                ageRating: "PG-13",
                genres: "Action,Crime,Drama,Superhero,Noir",
                posterUrl: "https://image.tmdb.org/t/p/original/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/nMKdUUepR0i5zn0y1T4CsSB5chy.jpg",
                overview: "Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets before the Joker unleashes chaos.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb (OMDb)", Category = "Audience", RawScoreDisplay = "9.0 / 10", NormalizedScore = 90.0, VoteCount = 2910000, DefaultWeight = 1.3, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "94%", NormalizedScore = 94.0, VoteCount = 346, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "94%", NormalizedScore = 94.0, VoteCount = 1850000, DefaultWeight = 1.1, AccentColor = "#ff6b35" },
                    new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = "84 / 100", NormalizedScore = 84.0, VoteCount = 40, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "8.5 / 10", NormalizedScore = 85.0, VoteCount = 32400, DefaultWeight = 1.0, AccentColor = "#01b4e4" },
                    new() { SourceId = "trakt", SourceName = "Trakt.tv", Category = "Audience", RawScoreDisplay = "91%", NormalizedScore = 91.0, VoteCount = 162000, DefaultWeight = 0.95, AccentColor = "#ed1c24" },
                    new() { SourceId = "letterboxd", SourceName = "Letterboxd", Category = "Audience", RawScoreDisplay = "4.5 / 5", NormalizedScore = 90.0, VoteCount = 2900000, DefaultWeight = 1.1, AccentColor = "#00e054" }
                }),

            CreateSeededItem(calculator,
                externalId: "movie-the-batman-2022",
                title: "The Batman",
                category: MediaCategory.Movie,
                year: 2022,
                publisher: "Warner Bros. / DC Studios",
                creator: "Matt Reeves",
                runtime: "176 min",
                ageRating: "PG-13",
                genres: "Crime,Mystery,Detective,Superhero,Noir",
                posterUrl: "https://image.tmdb.org/t/p/original/74xTEgt7R36Fpooo50r9T25onhq.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg",
                overview: "In his second year of fighting crime, Batman uncovers corruption in Gotham City that connects to his own family while facing a serial killer known as the Riddler.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb (OMDb)", Category = "Audience", RawScoreDisplay = "7.8 / 10", NormalizedScore = 78.0, VoteCount = 815000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "85%", NormalizedScore = 85.0, VoteCount = 518, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "87%", NormalizedScore = 87.0, VoteCount = 50000, DefaultWeight = 1.1, AccentColor = "#ff6b35" },
                    new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = "72 / 100", NormalizedScore = 72.0, VoteCount = 68, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "7.7 / 10", NormalizedScore = 77.0, VoteCount = 9950, DefaultWeight = 1.0, AccentColor = "#01b4e4" },
                    new() { SourceId = "trakt", SourceName = "Trakt.tv", Category = "Audience", RawScoreDisplay = "82%", NormalizedScore = 82.0, VoteCount = 68400, DefaultWeight = 0.95, AccentColor = "#ed1c24" }
                }),

            CreateSeededItem(calculator,
                externalId: "movie-logan-2017",
                title: "Logan",
                category: MediaCategory.Movie,
                year: 2017,
                publisher: "20th Century Fox / Marvel",
                creator: "James Mangold",
                runtime: "137 min",
                ageRating: "R",
                genres: "Action,Drama,Sci-Fi,Superhero,Western",
                posterUrl: "https://image.tmdb.org/t/p/original/fnbjcRDYn6YviCcePDnGdyAkYsB.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/9X7YweCJw3q8Mcf6GadxReFEksM.jpg",
                overview: "In the near future, a weary Logan cares for an ailing Professor X in a hideout on the Mexican border. His plan to hide from the world is upended when a young mutant arrives, pursued by dark forces.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb (OMDb)", Category = "Audience", RawScoreDisplay = "8.1 / 10", NormalizedScore = 81.0, VoteCount = 860000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "93%", NormalizedScore = 93.0, VoteCount = 431, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "90%", NormalizedScore = 90.0, VoteCount = 92000, DefaultWeight = 1.1, AccentColor = "#ff6b35" },
                    new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = "77 / 100", NormalizedScore = 77.0, VoteCount = 51, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "7.8 / 10", NormalizedScore = 78.0, VoteCount = 19100, DefaultWeight = 1.0, AccentColor = "#01b4e4" }
                }),

            CreateSeededItem(calculator,
                externalId: "movie-pirates-black-pearl-2003",
                title: "Pirates of the Caribbean: The Curse of the Black Pearl",
                category: MediaCategory.Movie,
                year: 2003,
                publisher: "Walt Disney Pictures / Jerry Bruckheimer Films",
                creator: "Gore Verbinski (Director), Ted Elliott, Terry Rossio (Writers)",
                runtime: "143 min",
                ageRating: "PG-13",
                genres: "Action,Adventure,Fantasy,Pirates,Cinema",
                posterUrl: "https://image.tmdb.org/t/p/original/z8onk7LV9MPk6zjvBiBQ9NDeNwD.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/83ta7vdjTjh9zX5pP5m4yB58hE7.jpg",
                overview: "Blacksmith Will Turner teams up with eccentric pirate Captain Jack Sparrow to save his love, Elizabeth Swann, from Jack's former pirate allies, who are now undead cursed phantoms.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb", Category = "Audience", RawScoreDisplay = "8.1 / 10", NormalizedScore = 81.0, VoteCount = 1190000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "80%", NormalizedScore = 80.0, VoteCount = 220, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "86%", NormalizedScore = 86.0, VoteCount = 250000, DefaultWeight = 1.1, AccentColor = "#ff6b35" },
                    new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = "63 / 100", NormalizedScore = 63.0, VoteCount = 40, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "7.8 / 10", NormalizedScore = 78.0, VoteCount = 20100, DefaultWeight = 1.0, AccentColor = "#01b4e4" }
                }),

            CreateSeededItem(calculator,
                externalId: "movie-pirates-dead-mans-chest-2006",
                title: "Pirates of the Caribbean: Dead Man's Chest",
                category: MediaCategory.Movie,
                year: 2006,
                publisher: "Walt Disney Pictures / Jerry Bruckheimer",
                creator: "Gore Verbinski",
                runtime: "151 min",
                ageRating: "PG-13",
                genres: "Action,Adventure,Fantasy,Pirates,Cinema",
                posterUrl: "https://image.tmdb.org/t/p/original/uXEqmloGyP7UXA2Mm58dsFTLFjm.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/w23d0vR26pZkHkY00pM9aR25wXg.jpg",
                overview: "Jack Sparrow races to recover the heart of Davy Jones to avoid enslaving his soul to the Flying Dutchman, as other friends and foes seek the heart for their own agendas.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb", Category = "Audience", RawScoreDisplay = "7.4 / 10", NormalizedScore = 74.0, VoteCount = 750000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "53%", NormalizedScore = 53.0, VoteCount = 228, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "72%", NormalizedScore = 72.0, VoteCount = 250000, DefaultWeight = 1.1, AccentColor = "#ff6b35" },
                    new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = "53 / 100", NormalizedScore = 53.0, VoteCount = 37, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "7.3 / 10", NormalizedScore = 73.0, VoteCount = 15300, DefaultWeight = 1.0, AccentColor = "#01b4e4" }
                }),

            CreateSeededItem(calculator,
                externalId: "movie-zack-snyders-justice-league-2021",
                title: "Zack Snyder's Justice League",
                category: MediaCategory.Movie,
                year: 2021,
                publisher: "Warner Bros. / DC Films / HBO Max",
                creator: "Zack Snyder (Director), Chris Terrio (Writer)",
                runtime: "242 min",
                ageRating: "R",
                genres: "Action,Adventure,Fantasy,Sci-Fi,Superhero,DC Comics",
                posterUrl: "https://image.tmdb.org/t/p/original/tnAuB8q5vv7Ax92je58VOY4utZs.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/pcDc2WJAYGJTTvRSEIpRZwM3Ola.jpg",
                overview: "Determined to ensure Superman's ultimate sacrifice was not in vain, Bruce Wayne aligns forces with Diana Prince with plans to recruit a team of metahumans to protect the world from an approaching threat of catastrophic proportions.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb", Category = "Audience", RawScoreDisplay = "7.9 / 10", NormalizedScore = 79.0, VoteCount = 440000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "71%", NormalizedScore = 71.0, VoteCount = 312, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "93%", NormalizedScore = 93.0, VoteCount = 100000, DefaultWeight = 1.1, AccentColor = "#ff6b35" },
                    new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = "54 / 100", NormalizedScore = 54.0, VoteCount = 46, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "8.1 / 10", NormalizedScore = 81.0, VoteCount = 9600, DefaultWeight = 1.0, AccentColor = "#01b4e4" }
                }),

            CreateSeededItem(calculator,
                externalId: "movie-the-avengers-2012",
                title: "The Avengers",
                category: MediaCategory.Movie,
                year: 2012,
                publisher: "Marvel Studios / Disney",
                creator: "Joss Whedon",
                runtime: "143 min",
                ageRating: "PG-13",
                genres: "Action,Adventure,Sci-Fi,Superhero,Marvel",
                posterUrl: "https://image.tmdb.org/t/p/original/RYMX2wcKCBAr24UyPD7xwmjaTn.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/9BBTo63ANSmhC4e6r62OJFuK2GL.jpg",
                overview: "Earth's mightiest heroes must come together and learn to fight as a team if they are going to stop the mischievous Loki and his alien army from enslaving humanity.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb", Category = "Audience", RawScoreDisplay = "8.0 / 10", NormalizedScore = 80.0, VoteCount = 1480000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "91%", NormalizedScore = 91.0, VoteCount = 368, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "91%", NormalizedScore = 91.0, VoteCount = 250000, DefaultWeight = 1.1, AccentColor = "#ff6b35" },
                    new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = "69 / 100", NormalizedScore = 69.0, VoteCount = 43, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "7.7 / 10", NormalizedScore = 77.0, VoteCount = 29800, DefaultWeight = 1.0, AccentColor = "#01b4e4" }
                }),

            CreateSeededItem(calculator,
                externalId: "movie-avengers-infinity-war-2018",
                title: "Avengers: Infinity War",
                category: MediaCategory.Movie,
                year: 2018,
                publisher: "Marvel Studios / Disney",
                creator: "Anthony Russo, Joe Russo",
                runtime: "149 min",
                ageRating: "PG-13",
                genres: "Action,Adventure,Sci-Fi,Superhero,Marvel",
                posterUrl: "https://image.tmdb.org/t/p/original/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/bOGkgRGdhrBYJSLpXaxhXVstNsV.jpg",
                overview: "The Avengers and their allies must be willing to sacrifice all in an attempt to defeat the powerful Thanos before his blitz of devastation and ruin puts an end to the universe.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb", Category = "Audience", RawScoreDisplay = "8.4 / 10", NormalizedScore = 84.0, VoteCount = 1180000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "85%", NormalizedScore = 85.0, VoteCount = 492, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "92%", NormalizedScore = 92.0, VoteCount = 100000, DefaultWeight = 1.1, AccentColor = "#ff6b35" },
                    new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = "68 / 100", NormalizedScore = 68.0, VoteCount = 54, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "8.2 / 10", NormalizedScore = 82.0, VoteCount = 28900, DefaultWeight = 1.0, AccentColor = "#01b4e4" }
                }),

            // TV SERIES
            CreateSeededItem(calculator,
                externalId: "tv-invincible-2021",
                title: "Invincible",
                category: MediaCategory.TvSeries,
                year: 2021,
                publisher: "Amazon Prime Video / Skybound / Image Comics",
                creator: "Robert Kirkman, Cory Walker, Ryan Ottley",
                runtime: "24 Episodes (3 Seasons)",
                ageRating: "TV-MA",
                genres: "Animation,Action,Sci-Fi,Superhero,Comic Adaptation",
                posterUrl: "https://image.tmdb.org/t/p/original/dMOpdkrDC5dQxqNydgKxXjBKyAc.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/6UH52Fmau8RPsMAbQbjwN3wJSCj.jpg",
                overview: "Mark Grayson is a normal teenager except for the fact that his father is the most powerful superhero on the planet. Shortly after his seventeenth birthday, Mark begins to develop powers of his own and enters into his father's tutelage.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb (OMDb)", Category = "Audience", RawScoreDisplay = "8.7 / 10", NormalizedScore = 87.0, VoteCount = 219000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "99%", NormalizedScore = 99.0, VoteCount = 142, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "91%", NormalizedScore = 91.0, VoteCount = 12800, DefaultWeight = 1.1, AccentColor = "#ff6b35" },
                    new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = "81 / 100", NormalizedScore = 81.0, VoteCount = 34, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "8.7 / 10", NormalizedScore = 87.0, VoteCount = 4450, DefaultWeight = 1.0, AccentColor = "#01b4e4" },
                    new() { SourceId = "tvmaze", SourceName = "TVMaze API", Category = "Audience", RawScoreDisplay = "8.6 / 10", NormalizedScore = 86.0, VoteCount = 3100, DefaultWeight = 0.95, AccentColor = "#3c948b" },
                    new() { SourceId = "trakt", SourceName = "Trakt.tv", Category = "Audience", RawScoreDisplay = "88%", NormalizedScore = 88.0, VoteCount = 39800, DefaultWeight = 0.95, AccentColor = "#ed1c24" }
                }),

            CreateSeededItem(calculator,
                externalId: "tv-the-boys-2019",
                title: "The Boys",
                category: MediaCategory.TvSeries,
                year: 2019,
                publisher: "Amazon Prime Video / Dynamite Entertainment",
                creator: "Eric Kripke, Garth Ennis, Darick Robertson",
                runtime: "32 Episodes (4 Seasons)",
                ageRating: "TV-MA",
                genres: "Action,Satire,Sci-Fi,Superhero,Black Comedy",
                posterUrl: "https://image.tmdb.org/t/p/original/2zmTngn1tYC1AvfnrFLhxeD82hz.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/mGVrXeIjyecj6TKmwPVpHlscEmw.jpg",
                overview: "A group of vigilantes known informally as 'The Boys' set out to take down corrupt superheroes with no more than blue-collar grit and a willingness to fight dirty.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb (OMDb)", Category = "Audience", RawScoreDisplay = "8.7 / 10", NormalizedScore = 87.0, VoteCount = 712000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "93%", NormalizedScore = 93.0, VoteCount = 410, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "76%", NormalizedScore = 76.0, VoteCount = 34500, DefaultWeight = 1.1, AccentColor = "#ff6b35" },
                    new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = "77 / 100", NormalizedScore = 77.0, VoteCount = 58, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "8.5 / 10", NormalizedScore = 85.0, VoteCount = 10400, DefaultWeight = 1.0, AccentColor = "#01b4e4" },
                    new() { SourceId = "tvmaze", SourceName = "TVMaze API", Category = "Audience", RawScoreDisplay = "8.4 / 10", NormalizedScore = 84.0, VoteCount = 6900, DefaultWeight = 0.95, AccentColor = "#3c948b" },
                    new() { SourceId = "trakt", SourceName = "Trakt.tv", Category = "Audience", RawScoreDisplay = "85%", NormalizedScore = 85.0, VoteCount = 89000, DefaultWeight = 0.95, AccentColor = "#ed1c24" }
                }),

            CreateSeededItem(calculator,
                externalId: "tv-xmen-97-2024",
                title: "X-Men '97",
                category: MediaCategory.TvSeries,
                year: 2024,
                publisher: "Disney+ / Marvel Animation",
                creator: "Beau DeMayo, Stan Lee, Jack Kirby",
                runtime: "10 Episodes",
                ageRating: "TV-14",
                genres: "Animation,Action,Sci-Fi,Superhero,Marvel",
                posterUrl: "https://image.tmdb.org/t/p/original/9Ycz7yYRf9V4jk3YXwcZhFtbNcF.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/nb3xI8XI3w4pMVZ38VijbsyBqP4.jpg",
                overview: "The X-Men, a band of mutants who use their uncanny gifts to protect a world that hates and fears them, are challenged like never before, forced to face a dangerous and unexpected new future.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb (OMDb)", Category = "Audience", RawScoreDisplay = "8.8 / 10", NormalizedScore = 88.0, VoteCount = 46000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "99%", NormalizedScore = 99.0, VoteCount = 84, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "92%", NormalizedScore = 92.0, VoteCount = 6200, DefaultWeight = 1.1, AccentColor = "#ff6b35" },
                    new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = "82 / 100", NormalizedScore = 82.0, VoteCount = 24, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "8.6 / 10", NormalizedScore = 86.0, VoteCount = 1280, DefaultWeight = 1.0, AccentColor = "#01b4e4" },
                    new() { SourceId = "tvmaze", SourceName = "TVMaze API", Category = "Audience", RawScoreDisplay = "8.7 / 10", NormalizedScore = 87.0, VoteCount = 1900, DefaultWeight = 0.95, AccentColor = "#3c948b" }
                }),

            CreateSeededItem(calculator,
                externalId: "tv-watchmen-hbo-2019",
                title: "Watchmen (HBO Limited Series)",
                category: MediaCategory.TvSeries,
                year: 2019,
                publisher: "HBO / DC Entertainment",
                creator: "Damon Lindelof (Based on Alan Moore & Dave Gibbons)",
                runtime: "9 Episodes",
                ageRating: "TV-MA",
                genres: "Drama,Mystery,Sci-Fi,Superhero,Alternate History",
                posterUrl: "https://image.tmdb.org/t/p/original/m8rWq3j73ZGhDuSCZWMMoE9ePH1.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/gNbdjDi1HamTCrfvM9JeA94bNi2.jpg",
                overview: "Set in an alternate history where 'superheroes' are treated as outlaws, this drama series embraces the nostalgia of the original groundbreaking graphic novel while attempting to break new ground of its own.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb (OMDb)", Category = "Audience", RawScoreDisplay = "8.2 / 10", NormalizedScore = 82.0, VoteCount = 148000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "96%", NormalizedScore = 96.0, VoteCount = 128, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "56%", NormalizedScore = 56.0, VoteCount = 19500, DefaultWeight = 1.1, AccentColor = "#ff6b35" },
                    new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = "85 / 100", NormalizedScore = 85.0, VoteCount = 44, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "7.9 / 10", NormalizedScore = 79.0, VoteCount = 2150, DefaultWeight = 1.0, AccentColor = "#01b4e4" },
                    new() { SourceId = "tvmaze", SourceName = "TVMaze API", Category = "Audience", RawScoreDisplay = "8.1 / 10", NormalizedScore = 81.0, VoteCount = 2400, DefaultWeight = 0.95, AccentColor = "#3c948b" }
                }),

            CreateSeededItem(calculator,
                externalId: "tv-avatar-last-airbender-2005",
                title: "Avatar: The Last Airbender",
                category: MediaCategory.TvSeries,
                year: 2005,
                publisher: "Nickelodeon Animation Studio",
                creator: "Michael Dante DiMartino, Bryan Konietzko",
                runtime: "61 Episodes (3 Books: Water, Earth, Fire)",
                ageRating: "TV-Y7-FV",
                genres: "Animation,Action,Adventure,Fantasy,Martial Arts",
                posterUrl: "https://image.tmdb.org/t/p/original/cHFZA8Tlv03nKTGXhLOYOLtqoSm.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/2fkM66c1nU5hT7eB5hC4bY5wJ4G.jpg",
                overview: "In a war-torn world of elemental magic, a young boy named Aang—the last surviving Airbender and the Avatar—reawakens to undertake a perilous mystic quest to master all four elements and restore balance from the Fire Nation.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb (OMDb)", Category = "Audience", RawScoreDisplay = "9.3 / 10", NormalizedScore = 93.0, VoteCount = 386000, DefaultWeight = 1.3, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "100%", NormalizedScore = 100.0, VoteCount = 68, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "98%", NormalizedScore = 98.0, VoteCount = 42500, DefaultWeight = 1.15, AccentColor = "#ff6b35" },
                    new() { SourceId = "metacritic", SourceName = "Metacritic", Category = "Critic", RawScoreDisplay = "90 / 100", NormalizedScore = 90.0, VoteCount = 28, DefaultWeight = 1.2, AccentColor = "#ffcc33" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "8.7 / 10", NormalizedScore = 87.0, VoteCount = 4120, DefaultWeight = 1.0, AccentColor = "#01b4e4" },
                    new() { SourceId = "tvmaze", SourceName = "TVMaze API", Category = "Audience", RawScoreDisplay = "9.0 / 10", NormalizedScore = 90.0, VoteCount = 8400, DefaultWeight = 1.0, AccentColor = "#3c948b" },
                    new() { SourceId = "trakt", SourceName = "Trakt.tv", Category = "Audience", RawScoreDisplay = "92%", NormalizedScore = 92.0, VoteCount = 54000, DefaultWeight = 0.95, AccentColor = "#ed1c24" }
                }),

            // COMIC BOOKS & GRAPHIC NOVELS
            CreateSeededItem(calculator,
                externalId: "comic-watchmen-1986",
                title: "Watchmen #1–12 (Absolute Edition)",
                category: MediaCategory.ComicBook,
                year: 1986,
                publisher: "DC Comics",
                creator: "Alan Moore (Writer), Dave Gibbons (Artist), John Higgins (Colorist)",
                runtime: "12 Issues / 416 Pages",
                ageRating: "Mature (17+)",
                genres: "Graphic Novel,Deconstruction,Superhero,Noir,Alternate History",
                posterUrl: "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=900&q=80",
                backdropUrl: "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=1600&q=80",
                overview: "In an alternate 1985 where costumed vigilantes have shaped history, the murder of The Comedian draws Rorschach, Nite Owl, Silk Spectre, Ozymandias, and Doctor Manhattan into a conspiracy with nuclear stakes.",
                sources: new List<ExternalRatingSource>
                {
                }),

            CreateSeededItem(calculator,
                externalId: "comic-sandman-1989",
                title: "The Sandman (1989–1996 Complete Omnibus)",
                category: MediaCategory.ComicBook,
                year: 1989,
                publisher: "DC Comics / Vertigo",
                creator: "Neil Gaiman, Sam Kieth, Mike Dringenberg",
                runtime: "75 Issues + Special",
                ageRating: "Mature (17+)",
                genres: "Dark Fantasy,Mythology,Graphic Novel,Horror,Vertigo",
                posterUrl: "https://images.unsplash.com/photo-1608889175123-8ee362201f81?auto=format&fit=crop&w=900&q=80",
                backdropUrl: "https://images.unsplash.com/photo-1608889175123-8ee362201f81?auto=format&fit=crop&w=1600&q=80",
                overview: "Dream of the Endless—Lord Morpheus—escapes after 70 years of occult imprisonment and sets out to rebuild his fallen kingdom of the Dreaming across time, myth, and human consciousness.",
                sources: new List<ExternalRatingSource>
                {
                }),

            CreateSeededItem(calculator,
                externalId: "comic-saga-2012",
                title: "Saga (Image Comics Series)",
                category: MediaCategory.ComicBook,
                year: 2012,
                publisher: "Image Comics",
                creator: "Brian K. Vaughan (Writer), Fiona Staples (Artist)",
                runtime: "66+ Issues (Ongoing)",
                ageRating: "Mature (17+)",
                genres: "Sci-Fi,Space Opera,Fantasy,Romance,Indie Comic",
                posterUrl: "https://images.unsplash.com/photo-1588497859490-85d1c17db96d?auto=format&fit=crop&w=900&q=80",
                backdropUrl: "https://images.unsplash.com/photo-1588497859490-85d1c17db96d?auto=format&fit=crop&w=1600&q=80",
                overview: "Two soldiers from opposite sides of a never-ending galactic war fall in love and risk everything to bring a fragile new life—their daughter Hazel—into a dangerous universe.",
                sources: new List<ExternalRatingSource>
                {
                }),

            CreateSeededItem(calculator,
                externalId: "comic-batman-year-one-1987",
                title: "Batman: Year One (#404–407)",
                category: MediaCategory.ComicBook,
                year: 1987,
                publisher: "DC Comics",
                creator: "Frank Miller (Writer), David Mazzucchelli (Artist), Richmond Lewis (Colorist)",
                runtime: "4 Issues / 144 Pages",
                ageRating: "Teen+ (15+)",
                genres: "Crime,Noir,Superhero,Origin Story,DC",
                posterUrl: "https://images.unsplash.com/photo-1531259683007-016a7b628fc3?auto=format&fit=crop&w=900&q=80",
                backdropUrl: "https://images.unsplash.com/photo-1531259683007-016a7b628fc3?auto=format&fit=crop&w=1600&q=80",
                overview: "Bruce Wayne returns to Gotham City after twelve years abroad to begin his war on crime, while newly transferred Lieutenant James Gordon fights corruption inside the Gotham City Police Department.",
                sources: new List<ExternalRatingSource>
                {
                }),

            CreateSeededItem(calculator,
                externalId: "comic-all-star-superman-2005",
                title: "All-Star Superman (#1–12)",
                category: MediaCategory.ComicBook,
                year: 2005,
                publisher: "DC Comics",
                creator: "Grant Morrison (Writer), Frank Quitely (Artist), Jamie Grant (Inker)",
                runtime: "12 Issues / 304 Pages",
                ageRating: "Teen (13+)",
                genres: "Superhero,Sci-Fi,Mythic,DC,Silver Age Homage",
                posterUrl: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=900&q=80",
                backdropUrl: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1600&q=80",
                overview: "After saving a solar mission from Lex Luthor's sabotage, Superman is overexposed to solar radiation and given one final year to complete twelve mythic labors for humanity.",
                sources: new List<ExternalRatingSource>
                {
                }),

            CreateSeededItem(calculator,
                externalId: "comic-immortal-hulk-2018",
                title: "The Immortal Hulk (#1–50)",
                category: MediaCategory.ComicBook,
                year: 2018,
                publisher: "Marvel Comics",
                creator: "Al Ewing (Writer), Joe Bennett (Artist), Alex Ross (Covers)",
                runtime: "50 Issues",
                ageRating: "Parental Advisory (15+)",
                genres: "Superhero,Body Horror,Psychological,Marvel,Cosmic",
                posterUrl: "https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?auto=format&fit=crop&w=900&q=80",
                backdropUrl: "https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?auto=format&fit=crop&w=1600&q=80",
                overview: "Bruce Banner walks the backroads of America by day—and even if he dies, when night falls the Green Door opens and the Immortal Hulk rises to enact existential judgment.",
                sources: new List<ExternalRatingSource>
                {
                }),

            CreateSeededItem(calculator,
                externalId: "comic-avatar-the-promise-2012",
                title: "Avatar: The Last Airbender – The Promise (Omnibus)",
                category: MediaCategory.ComicBook,
                year: 2012,
                publisher: "Dark Horse Comics / Nickelodeon",
                creator: "Gene Luen Yang (Writer), Gurihiru (Artists)",
                runtime: "3 Parts / 240 Pages",
                ageRating: "All Ages / Teen",
                genres: "Graphic Novel,Fantasy,Adventure,Martial Arts,Comic Book",
                posterUrl: "https://images.unsplash.com/photo-1618519764620-7403abdbdfe9?auto=format&fit=crop&w=900&q=80",
                backdropUrl: "https://images.unsplash.com/photo-1618519764620-7403abdbdfe9?auto=format&fit=crop&w=1600&q=80",
                overview: "Picking up directly after the finale of the animated series, Avatar Aang and Fire Lord Zuko clash over the Harmony Restoration Movement and the fate of Fire Nation colonies in the Earth Kingdom.",
                sources: new List<ExternalRatingSource>
                {
                }),

            CreateSeededItem(calculator,
                externalId: "comic-jla-tower-of-babel-2000",
                title: "JLA: Tower of Babel (#43–46)",
                category: MediaCategory.ComicBook,
                year: 2000,
                publisher: "DC Comics",
                creator: "Mark Waid (Writer), Howard Porter (Artist)",
                runtime: "4 Issues / 128 Pages",
                ageRating: "Teen (12+)",
                genres: "Superhero,Justice League,Graphic Novel,Strategy,DC Comics",
                posterUrl: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=900&q=80",
                backdropUrl: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=1600&q=80",
                overview: "Ra's al Ghul steals Batman's confidential contingency dossiers designed to neutralize every member of the Justice League, methodically taking down Superman, Wonder Woman, the Flash, Green Lantern, and Martian Manhunter.",
                sources: new List<ExternalRatingSource>
                {
                }),

            CreateSeededItem(calculator,
                externalId: "comic-infinity-gauntlet-1991",
                title: "The Infinity Gauntlet (#1–6 Complete)",
                category: MediaCategory.ComicBook,
                year: 1991,
                publisher: "Marvel Comics",
                creator: "Jim Starlin (Writer), George Pérez, Ron Lim (Artists)",
                runtime: "6 Issues / 256 Pages",
                ageRating: "Teen (12+)",
                genres: "Superhero,Marvel,Cosmic,Graphic Novel,Epic",
                posterUrl: "https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?auto=format&fit=crop&w=900&q=80",
                backdropUrl: "https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?auto=format&fit=crop&w=1600&q=80",
                overview: "The seminal Marvel cosmic epic. The Mad Titan Thanos seizes the six Infinity Gems to form the Infinity Gauntlet, eradicating half of all life in the universe with a snap of his fingers to woo Mistress Death.",
                sources: new List<ExternalRatingSource>
                {
                }),

            CreateSeededItem(calculator,
                externalId: "comic-civil-war-2006",
                title: "Civil War (#1–7 Complete Event)",
                category: MediaCategory.ComicBook,
                year: 2006,
                publisher: "Marvel Comics",
                creator: "Mark Millar (Writer), Steve McNiven (Artist)",
                runtime: "7 Issues / 208 Pages",
                ageRating: "Teen+ (15+)",
                genres: "Superhero,Marvel,Political Thriller,Graphic Novel,Action",
                posterUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=900&q=80",
                backdropUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1600&q=80",
                overview: "A tragedy in Stamford sparks the Superhuman Registration Act, fracturing the Marvel Universe as Iron Man leads the pro-registration faction while Captain America leads an underground resistance.",
                sources: new List<ExternalRatingSource>
                {
                }),

            CreateSeededItem(calculator,
                externalId: "tv-arcane-2021",
                title: "Arcane",
                category: MediaCategory.TvSeries,
                year: 2021,
                publisher: "Netflix / Fortiche / Riot Games",
                creator: "Christian Linke, Alex Yee",
                runtime: "18 Episodes (2 Seasons)",
                ageRating: "TV-14",
                genres: "Animation,Action,Sci-Fi,Steampunk,Drama",
                posterUrl: "https://image.tmdb.org/t/p/original/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/rkB4LyZHo1NHXFEDHl9vSD9r1lI.jpg",
                overview: "Amid the stark discord of twin cities Piltover and Zaun, two sisters fight on rival sides of a war between magic technologies and clashing convictions.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb (OMDb)", Category = "Audience", RawScoreDisplay = "9.0 / 10", NormalizedScore = 90.0, VoteCount = 315000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "100%", NormalizedScore = 100.0, VoteCount = 92, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "96%", NormalizedScore = 96.0, VoteCount = 18400, DefaultWeight = 1.15, AccentColor = "#ff6b35" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "8.8 / 10", NormalizedScore = 88.0, VoteCount = 4520, DefaultWeight = 1.0, AccentColor = "#01b4e4" },
                    new() { SourceId = "trakt", SourceName = "Trakt.tv", Category = "Audience", RawScoreDisplay = "91%", NormalizedScore = 91.0, VoteCount = 41000, DefaultWeight = 0.95, AccentColor = "#ed1c24" }
                }),

            CreateSeededItem(calculator,
                externalId: "tv-daredevil-2015",
                title: "Marvel's Daredevil",
                category: MediaCategory.TvSeries,
                year: 2015,
                publisher: "Marvel Television / Netflix / Disney+",
                creator: "Drew Goddard, Stan Lee, Bill Everett",
                runtime: "39 Episodes (3 Seasons)",
                ageRating: "TV-MA",
                genres: "Action,Crime,Noir,Superhero,Marvel",
                posterUrl: "https://image.tmdb.org/t/p/original/QWbPaDxiB6LW2LjASknzThuJfI.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/qsnXwGS7KBbX4JLqHvICngtR8qg.jpg",
                overview: "Blinded as a young boy, Matt Murdock fights injustice by day as a lawyer in Hell's Kitchen and by night as the vigilante Daredevil.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb (OMDb)", Category = "Audience", RawScoreDisplay = "8.6 / 10", NormalizedScore = 86.0, VoteCount = 482000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "92%", NormalizedScore = 92.0, VoteCount = 245, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "93%", NormalizedScore = 93.0, VoteCount = 38000, DefaultWeight = 1.15, AccentColor = "#ff6b35" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "8.2 / 10", NormalizedScore = 82.0, VoteCount = 4680, DefaultWeight = 1.0, AccentColor = "#01b4e4" }
                }),

            CreateSeededItem(calculator,
                externalId: "tv-batman-tas-1992",
                title: "Batman: The Animated Series",
                category: MediaCategory.TvSeries,
                year: 1992,
                publisher: "Warner Bros. Animation / DC",
                creator: "Bruce Timm, Eric Radomski, Paul Dini",
                runtime: "85 Episodes",
                ageRating: "TV-PG",
                genres: "Animation,Action,Noir,Superhero,Detective",
                posterUrl: "https://image.tmdb.org/t/p/original/lBomQFW1vlm1yUYMNSbFZ45R4Ox.jpg",
                backdropUrl: "https://image.tmdb.org/t/p/original/eS8rJ1KzRN3x9cR7v3N6z0mN5W.jpg",
                overview: "The Dark Knight battles crime in Gotham City with iconic Dark Deco visuals, orchestral scores, and definitive portrayals by Kevin Conroy and Mark Hamill.",
                sources: new List<ExternalRatingSource>
                {
                    new() { SourceId = "imdb", SourceName = "IMDb (OMDb)", Category = "Audience", RawScoreDisplay = "9.0 / 10", NormalizedScore = 90.0, VoteCount = 121000, DefaultWeight = 1.25, AccentColor = "#f5c518" },
                    new() { SourceId = "rotten_tomatoes_critics", SourceName = "Rotten Tomatoes (Critics)", Category = "Critic", RawScoreDisplay = "100%", NormalizedScore = 100.0, VoteCount = 54, DefaultWeight = 1.2, AccentColor = "#fa320a" },
                    new() { SourceId = "rotten_tomatoes_audience", SourceName = "Rotten Tomatoes (Audience)", Category = "Audience", RawScoreDisplay = "96%", NormalizedScore = 96.0, VoteCount = 25000, DefaultWeight = 1.15, AccentColor = "#ff6b35" },
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "8.5 / 10", NormalizedScore = 85.0, VoteCount = 1620, DefaultWeight = 1.0, AccentColor = "#01b4e4" }
                })
        };

        if (!await db.MediaItems.AnyAsync())
        {
            db.MediaItems.AddRange(items);
            try
            {
                await db.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DatabaseSeeder] MediaItems sync note: {ex.Message}");
            }
        }

        // 3. Community reviews are strictly user-submitted (no pre-seeded demo reviews).

        // 4. Seed Demo User's Watchlist & Reading List
        if (!await db.WatchlistItems.AnyAsync())
        {
            db.WatchlistItems.AddRange(
                new WatchlistItem
                {
                    UserId = demoUser.Id,
                    ExternalMediaId = "comic-watchmen-1986",
                    Title = "Watchmen #1–12 (Absolute Edition)",
                    MediaType = MediaCategory.ComicBook,
                    PosterUrl = "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=900&q=80",
                    CumulativeAverage = 95.6,
                    UserPersonalScore = 98,
                    Status = "Completed",
                    Notes = "Re-read the Absolute Edition with Dave Gibbons' annotations."
                },
                new WatchlistItem
                {
                    UserId = demoUser.Id,
                    ExternalMediaId = "movie-spiderverse-2023",
                    Title = "Spider-Man: Across the Spider-Verse",
                    MediaType = MediaCategory.Movie,
                    PosterUrl = "https://image.tmdb.org/t/p/original/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg",
                    CumulativeAverage = 89.2,
                    UserPersonalScore = 95,
                    Status = "Completed",
                    Notes = "Watched in IMAX Dolby Vision."
                },
                new WatchlistItem
                {
                    UserId = demoUser.Id,
                    ExternalMediaId = "comic-saga-2012",
                    Title = "Saga (Image Comics Series)",
                    MediaType = MediaCategory.ComicBook,
                    PosterUrl = "https://images.unsplash.com/photo-1588497859490-85d1c17db96d?auto=format&fit=crop&w=900&q=80",
                    CumulativeAverage = 93.2,
                    UserPersonalScore = 94,
                    Status = "Reading",
                    Notes = "Currently on Compendium One, Issue #42."
                },
                new WatchlistItem
                {
                    UserId = demoUser.Id,
                    ExternalMediaId = "tv-invincible-2021",
                    Title = "Invincible",
                    MediaType = MediaCategory.TvSeries,
                    PosterUrl = "https://image.tmdb.org/t/p/original/dMOpdkrDC5dQxqNydgKxXjBKyAc.jpg",
                    CumulativeAverage = 90.1,
                    UserPersonalScore = 93,
                    Status = "Watching",
                    Notes = "Caught up through Season 3."
                },
                new WatchlistItem
                {
                    UserId = demoUser.Id,
                    ExternalMediaId = "comic-immortal-hulk-2018",
                    Title = "The Immortal Hulk (#1–50)",
                    MediaType = MediaCategory.ComicBook,
                    PosterUrl = "https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?auto=format&fit=crop&w=900&q=80",
                    CumulativeAverage = 93.1,
                    UserPersonalScore = null,
                    Status = "PlanToWatch",
                    Notes = "Omnibus arriving next week."
                }
            );

            try
            {
                await db.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DatabaseSeeder] Watchlist sync note: {ex.Message}");
            }
        }

        // 5. Seed Custom Curated Lists
        if (!await db.CustomLists.AnyAsync())
        {
            db.CustomLists.AddRange(
                new CustomMediaList
                {
                    UserId = demoUser.Id,
                    OwnerUsername = demoUser.Username,
                    Name = "Essential 90+ Cumulative Score Masterpieces",
                    Description = "Comics, movies, and series that achieved Universal Acclaim across Critic, Audience, and ComicVine indices.",
                    IsPublic = true,
                    ExternalMediaIdsCsv = "comic-watchmen-1986,comic-sandman-1989,movie-dark-knight-2008,movie-spiderverse-2023,tv-xmen-97-2024"
                },
                new CustomMediaList
                {
                    UserId = demoUser.Id,
                    OwnerUsername = demoUser.Username,
                    Name = "Gotham Noir: Page to Screen",
                    Description = "Comparing Frank Miller's Batman: Year One with Christopher Nolan and Matt Reeves' adaptations.",
                    IsPublic = true,
                    ExternalMediaIdsCsv = "comic-batman-year-one-1987,movie-dark-knight-2008,movie-the-batman-2022"
                }
            );

            try
            {
                await db.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DatabaseSeeder] CustomLists sync note: {ex.Message}");
            }
        }
    }

    /// <summary>
    /// Idempotent startup cleanup for existing databases: removes deprecated seeded-only rating sources
    /// and rebuilds comictraffic_community strictly from real rows in UserReviews (never pre-seeded values).
    /// </summary>
    public static async Task SanitizeSeededSourcesAsync(
        ComicTrafficDbContext db,
        ICumulativeRatingCalculator calculator)
    {
        var readOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true
        };

        Dictionary<string, List<UserReview>> reviewsByMedia;
        try
        {
            reviewsByMedia = (await db.Reviews.AsNoTracking().ToListAsync())
                .GroupBy(r => r.ExternalMediaId, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DatabaseSeeder] Notice: unable to pre-load reviews for synchronization: {ex.Message}");
            reviewsByMedia = new Dictionary<string, List<UserReview>>(StringComparer.OrdinalIgnoreCase);
        }

        var mediaItems = await db.MediaItems.ToListAsync();
        bool changed = false;

        foreach (var item in mediaItems)
        {
            List<ExternalRatingSource> current;
            try
            {
                current = JsonSerializer.Deserialize<List<ExternalRatingSource>>(item.ExternalRatingsJson, readOptions) ?? new();
            }
            catch
            {
                current = new();
            }

            var cleaned = current
                .Where(s =>
                    !CumulativeRatingCalculator.RemovedSeededSourceIds.Contains(s.SourceId ?? string.Empty) &&
                    !string.Equals(s.SourceId, "comictraffic_community", StringComparison.OrdinalIgnoreCase))
                .ToList();

            if (reviewsByMedia.TryGetValue(item.ExternalId, out var realReviews) && realReviews.Count > 0)
            {
                double avg = Math.Round(realReviews.Average(r => r.Score), 1);
                cleaned.Add(new ExternalRatingSource
                {
                    SourceId = "comictraffic_community",
                    SourceName = "ComicTraffic Community",
                    Category = "ComicCommunity",
                    NormalizedScore = avg,
                    RawScoreDisplay = $"{Math.Round(avg / 10.0, 1)} / 10",
                    VoteCount = realReviews.Count,
                    DefaultWeight = 1.15,
                    AccentColor = "#a855f7"
                });
            }

            string nextJson = JsonSerializer.Serialize(cleaned, JsonOptions);
            if (!string.Equals(nextJson, item.ExternalRatingsJson, StringComparison.Ordinal))
            {
                var summary = calculator.CalculateCumulativeRating(cleaned);
                item.ExternalRatingsJson = nextJson;
                item.FinalCumulativeAverage = summary.FinalCumulativeAverage;
                item.BayesianWeightedScore = summary.BayesianWeightedScore;
                item.CriticConsensusScore = summary.CriticConsensusScore;
                item.AudienceConsensusScore = summary.AudienceConsensusScore;
                item.PolarizationIndex = summary.PolarizationIndex;
                item.ConsensusTier = summary.ConsensusTier;
                item.TotalVoteCount = summary.TotalAggregatedVotes;
                item.LastUpdated = DateTime.UtcNow;
                changed = true;
            }
        }

        var users = await db.Users.ToListAsync();
        foreach (var user in users)
        {
            if (string.IsNullOrWhiteSpace(user.PreferredWeightsJson)) continue;
            try
            {
                var weights = JsonSerializer.Deserialize<Dictionary<string, double>>(user.PreferredWeightsJson, readOptions);
                if (weights == null) continue;
                int before = weights.Count;
                foreach (var deprecated in CumulativeRatingCalculator.RemovedSeededSourceIds)
                {
                    weights.Remove(deprecated);
                }
                if (weights.Count != before)
                {
                    user.PreferredWeightsJson = JsonSerializer.Serialize(weights, JsonOptions);
                    changed = true;
                }
            }
            catch
            {
                // Ignore malformed user weight JSON
            }
        }

        if (changed)
        {
            try
            {
                await db.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DatabaseSeeder] SanitizeSeededSources note: {ex.Message}");
            }
        }
    }

    private static MediaItem CreateSeededItem(
        ICumulativeRatingCalculator calculator,
        string externalId,
        string title,
        MediaCategory category,
        int year,
        string publisher,
        string creator,
        string runtime,
        string ageRating,
        string genres,
        string posterUrl,
        string backdropUrl,
        string overview,
        List<ExternalRatingSource> sources)
    {
        var summary = calculator.CalculateCumulativeRating(sources);

        return new MediaItem
        {
            ExternalId = externalId,
            Title = title,
            MediaType = category,
            ReleaseYear = year,
            PublisherOrStudio = publisher,
            CreatorOrDirector = creator,
            RuntimeOrIssueCount = runtime,
            AgeRating = ageRating,
            GenresCsv = genres,
            PosterUrl = posterUrl,
            BackdropUrl = backdropUrl,
            Overview = overview,
            ExternalRatingsJson = JsonSerializer.Serialize(sources, JsonOptions),
            FinalCumulativeAverage = summary.FinalCumulativeAverage,
            BayesianWeightedScore = summary.BayesianWeightedScore,
            CriticConsensusScore = summary.CriticConsensusScore,
            AudienceConsensusScore = summary.AudienceConsensusScore,
            PolarizationIndex = summary.PolarizationIndex,
            ConsensusTier = summary.ConsensusTier,
            TotalVoteCount = summary.TotalAggregatedVotes,
            LastUpdated = DateTime.UtcNow
        };
    }
}
