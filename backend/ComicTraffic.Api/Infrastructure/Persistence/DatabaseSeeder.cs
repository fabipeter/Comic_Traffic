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

        // 1. Seed Demo Users
        var demoUser = new AppUser
        {
            Id = Guid.Parse("11111111-1111-1111-1111-111111111111"),
            Username = "comicwarden",
            Email = "demo@comictraffic.io",
            DisplayName = "Alex Mercer (ComicWarden)",
            Bio = "Cumulative rating analyst, graphic novel collector, and sci-fi cinema critic.",
            Role = "Admin",
            FavoriteGenresCsv = "Superhero,Sci-Fi,Noir,Graphic Novel,Animation",
            PasswordHash = jwtTokenService.HashPassword("ComicTraffic123!"),
            PreferredWeightsJson = JsonSerializer.Serialize(new Dictionary<string, double>
            {
                ["imdb"] = 1.2,
                ["rotten_tomatoes_critics"] = 1.1,
                ["rotten_tomatoes_audience"] = 1.1,
                ["metacritic"] = 1.15,
                ["tmdb"] = 1.0,
                ["trakt"] = 0.95,
                ["comicvine"] = 1.25,
                ["league_of_comic_geeks"] = 1.2,
                ["anilist"] = 1.0,
                ["comictraffic_community"] = 1.15
            }, JsonOptions)
        };

        var secondUser = new AppUser
        {
            Id = Guid.Parse("22222222-2222-2222-2222-222222222222"),
            Username = "gotham_oracle",
            Email = "barbara@comictraffic.io",
            DisplayName = "Barbara Gordon",
            Bio = "Tracking every issue, crossover event, and live-action adaptation.",
            Role = "User",
            FavoriteGenresCsv = "Detective,Mystery,Comic Book,Thriller",
            PasswordHash = jwtTokenService.HashPassword("Oracle123!")
        };

        db.Users.AddRange(demoUser, secondUser);

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
                    new() { SourceId = "letterboxd", SourceName = "Letterboxd", Category = "Audience", RawScoreDisplay = "4.4 / 5", NormalizedScore = 88.0, VoteCount = 1420000, DefaultWeight = 1.1, AccentColor = "#00e054" },
                    new() { SourceId = "comicvine", SourceName = "ComicVine Adaptation Score", Category = "ComicCommunity", RawScoreDisplay = "4.7 / 5", NormalizedScore = 94.0, VoteCount = 8900, DefaultWeight = 1.15, AccentColor = "#e62429" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "9.2 / 10", NormalizedScore = 92.0, VoteCount = 4250, DefaultWeight = 1.1, AccentColor = "#a855f7" }
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
                    new() { SourceId = "letterboxd", SourceName = "Letterboxd", Category = "Audience", RawScoreDisplay = "4.5 / 5", NormalizedScore = 90.0, VoteCount = 2900000, DefaultWeight = 1.1, AccentColor = "#00e054" },
                    new() { SourceId = "comicvine", SourceName = "ComicVine Adaptation Score", Category = "ComicCommunity", RawScoreDisplay = "4.9 / 5", NormalizedScore = 98.0, VoteCount = 21400, DefaultWeight = 1.15, AccentColor = "#e62429" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "9.5 / 10", NormalizedScore = 95.0, VoteCount = 9180, DefaultWeight = 1.1, AccentColor = "#a855f7" }
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
                    new() { SourceId = "trakt", SourceName = "Trakt.tv", Category = "Audience", RawScoreDisplay = "82%", NormalizedScore = 82.0, VoteCount = 68400, DefaultWeight = 0.95, AccentColor = "#ed1c24" },
                    new() { SourceId = "comicvine", SourceName = "ComicVine Adaptation Score", Category = "ComicCommunity", RawScoreDisplay = "4.6 / 5", NormalizedScore = 92.0, VoteCount = 11200, DefaultWeight = 1.15, AccentColor = "#e62429" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "8.8 / 10", NormalizedScore = 88.0, VoteCount = 3810, DefaultWeight = 1.1, AccentColor = "#a855f7" }
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
                    new() { SourceId = "tmdb", SourceName = "TMDB", Category = "Audience", RawScoreDisplay = "7.8 / 10", NormalizedScore = 78.0, VoteCount = 19100, DefaultWeight = 1.0, AccentColor = "#01b4e4" },
                    new() { SourceId = "comicvine", SourceName = "ComicVine Adaptation Score", Category = "ComicCommunity", RawScoreDisplay = "4.7 / 5", NormalizedScore = 94.0, VoteCount = 9600, DefaultWeight = 1.15, AccentColor = "#e62429" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "9.0 / 10", NormalizedScore = 90.0, VoteCount = 3190, DefaultWeight = 1.1, AccentColor = "#a855f7" }
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
                    new() { SourceId = "trakt", SourceName = "Trakt.tv", Category = "Audience", RawScoreDisplay = "88%", NormalizedScore = 88.0, VoteCount = 39800, DefaultWeight = 0.95, AccentColor = "#ed1c24" },
                    new() { SourceId = "comicvine", SourceName = "ComicVine Adaptation Score", Category = "ComicCommunity", RawScoreDisplay = "4.8 / 5", NormalizedScore = 96.0, VoteCount = 7400, DefaultWeight = 1.15, AccentColor = "#e62429" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "9.3 / 10", NormalizedScore = 93.0, VoteCount = 5120, DefaultWeight = 1.1, AccentColor = "#a855f7" }
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
                    new() { SourceId = "trakt", SourceName = "Trakt.tv", Category = "Audience", RawScoreDisplay = "85%", NormalizedScore = 85.0, VoteCount = 89000, DefaultWeight = 0.95, AccentColor = "#ed1c24" },
                    new() { SourceId = "comicvine", SourceName = "ComicVine Adaptation Score", Category = "ComicCommunity", RawScoreDisplay = "4.6 / 5", NormalizedScore = 92.0, VoteCount = 9100, DefaultWeight = 1.15, AccentColor = "#e62429" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "8.8 / 10", NormalizedScore = 88.0, VoteCount = 6300, DefaultWeight = 1.1, AccentColor = "#a855f7" }
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
                    new() { SourceId = "tvmaze", SourceName = "TVMaze API", Category = "Audience", RawScoreDisplay = "8.7 / 10", NormalizedScore = 87.0, VoteCount = 1900, DefaultWeight = 0.95, AccentColor = "#3c948b" },
                    new() { SourceId = "comicvine", SourceName = "ComicVine Adaptation Score", Category = "ComicCommunity", RawScoreDisplay = "4.9 / 5", NormalizedScore = 98.0, VoteCount = 6700, DefaultWeight = 1.15, AccentColor = "#e62429" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "9.4 / 10", NormalizedScore = 94.0, VoteCount = 3420, DefaultWeight = 1.1, AccentColor = "#a855f7" }
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
                    new() { SourceId = "tvmaze", SourceName = "TVMaze API", Category = "Audience", RawScoreDisplay = "8.1 / 10", NormalizedScore = 81.0, VoteCount = 2400, DefaultWeight = 0.95, AccentColor = "#3c948b" },
                    new() { SourceId = "comicvine", SourceName = "ComicVine Adaptation Score", Category = "ComicCommunity", RawScoreDisplay = "4.2 / 5", NormalizedScore = 84.0, VoteCount = 4900, DefaultWeight = 1.15, AccentColor = "#e62429" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "8.4 / 10", NormalizedScore = 84.0, VoteCount = 2950, DefaultWeight = 1.1, AccentColor = "#a855f7" }
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
                    new() { SourceId = "trakt", SourceName = "Trakt.tv", Category = "Audience", RawScoreDisplay = "92%", NormalizedScore = 92.0, VoteCount = 54000, DefaultWeight = 0.95, AccentColor = "#ed1c24" },
                    new() { SourceId = "comicvine", SourceName = "ComicVine Lore & Tie-In Index", Category = "ComicCommunity", RawScoreDisplay = "4.9 / 5", NormalizedScore = 98.0, VoteCount = 14200, DefaultWeight = 1.2, AccentColor = "#e62429" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "9.7 / 10", NormalizedScore = 97.0, VoteCount = 12900, DefaultWeight = 1.15, AccentColor = "#a855f7" }
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
                    new() { SourceId = "comicvine", SourceName = "ComicVine", Category = "ComicCommunity", RawScoreDisplay = "4.92 / 5", NormalizedScore = 98.4, VoteCount = 34200, DefaultWeight = 1.3, AccentColor = "#e62429" },
                    new() { SourceId = "league_of_comic_geeks", SourceName = "League of Comic Geeks", Category = "ComicCommunity", RawScoreDisplay = "97 / 100", NormalizedScore = 97.0, VoteCount = 28500, DefaultWeight = 1.25, AccentColor = "#00d1b2" },
                    new() { SourceId = "goodreads", SourceName = "Goodreads Graphic Novels", Category = "Audience", RawScoreDisplay = "4.38 / 5", NormalizedScore = 87.6, VoteCount = 598000, DefaultWeight = 1.15, AccentColor = "#8b5e34" },
                    new() { SourceId = "comicbookroundup_critics", SourceName = "ComicBookWire / CBR Critics", Category = "Critic", RawScoreDisplay = "9.8 / 10", NormalizedScore = 98.0, VoteCount = 112, DefaultWeight = 1.25, AccentColor = "#fa320a" },
                    new() { SourceId = "comicbookroundup_users", SourceName = "ComicBookRoundup Users", Category = "Audience", RawScoreDisplay = "9.6 / 10", NormalizedScore = 96.0, VoteCount = 19400, DefaultWeight = 1.15, AccentColor = "#ff6b35" },
                    new() { SourceId = "marvel_dc_index", SourceName = "Grand Comics Database (GCD)", Category = "Critic", RawScoreDisplay = "96 / 100", NormalizedScore = 96.0, VoteCount = 4200, DefaultWeight = 1.1, AccentColor = "#3b82f6" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "9.7 / 10", NormalizedScore = 97.0, VoteCount = 11200, DefaultWeight = 1.15, AccentColor = "#a855f7" }
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
                    new() { SourceId = "comicvine", SourceName = "ComicVine", Category = "ComicCommunity", RawScoreDisplay = "4.88 / 5", NormalizedScore = 97.6, VoteCount = 29100, DefaultWeight = 1.3, AccentColor = "#e62429" },
                    new() { SourceId = "league_of_comic_geeks", SourceName = "League of Comic Geeks", Category = "ComicCommunity", RawScoreDisplay = "96 / 100", NormalizedScore = 96.0, VoteCount = 24600, DefaultWeight = 1.25, AccentColor = "#00d1b2" },
                    new() { SourceId = "goodreads", SourceName = "Goodreads Graphic Novels", Category = "Audience", RawScoreDisplay = "4.55 / 5", NormalizedScore = 91.0, VoteCount = 342000, DefaultWeight = 1.15, AccentColor = "#8b5e34" },
                    new() { SourceId = "comicbookroundup_critics", SourceName = "ComicBookRoundup Critics", Category = "Critic", RawScoreDisplay = "9.5 / 10", NormalizedScore = 95.0, VoteCount = 96, DefaultWeight = 1.25, AccentColor = "#fa320a" },
                    new() { SourceId = "comicbookroundup_users", SourceName = "ComicBookRoundup Users", Category = "Audience", RawScoreDisplay = "9.4 / 10", NormalizedScore = 94.0, VoteCount = 15800, DefaultWeight = 1.15, AccentColor = "#ff6b35" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "9.6 / 10", NormalizedScore = 96.0, VoteCount = 8750, DefaultWeight = 1.15, AccentColor = "#a855f7" }
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
                    new() { SourceId = "comicvine", SourceName = "ComicVine", Category = "ComicCommunity", RawScoreDisplay = "4.82 / 5", NormalizedScore = 96.4, VoteCount = 26400, DefaultWeight = 1.3, AccentColor = "#e62429" },
                    new() { SourceId = "league_of_comic_geeks", SourceName = "League of Comic Geeks", Category = "ComicCommunity", RawScoreDisplay = "95 / 100", NormalizedScore = 95.0, VoteCount = 31900, DefaultWeight = 1.25, AccentColor = "#00d1b2" },
                    new() { SourceId = "goodreads", SourceName = "Goodreads Graphic Novels", Category = "Audience", RawScoreDisplay = "4.46 / 5", NormalizedScore = 89.2, VoteCount = 415000, DefaultWeight = 1.15, AccentColor = "#8b5e34" },
                    new() { SourceId = "comicbookroundup_critics", SourceName = "ComicBookRoundup Critics", Category = "Critic", RawScoreDisplay = "9.2 / 10", NormalizedScore = 92.0, VoteCount = 610, DefaultWeight = 1.25, AccentColor = "#fa320a" },
                    new() { SourceId = "comicbookroundup_users", SourceName = "ComicBookRoundup Users", Category = "Audience", RawScoreDisplay = "9.3 / 10", NormalizedScore = 93.0, VoteCount = 22400, DefaultWeight = 1.15, AccentColor = "#ff6b35" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "9.4 / 10", NormalizedScore = 94.0, VoteCount = 7400, DefaultWeight = 1.15, AccentColor = "#a855f7" }
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
                    new() { SourceId = "comicvine", SourceName = "ComicVine", Category = "ComicCommunity", RawScoreDisplay = "4.89 / 5", NormalizedScore = 97.8, VoteCount = 31000, DefaultWeight = 1.3, AccentColor = "#e62429" },
                    new() { SourceId = "league_of_comic_geeks", SourceName = "League of Comic Geeks", Category = "ComicCommunity", RawScoreDisplay = "96 / 100", NormalizedScore = 96.0, VoteCount = 29400, DefaultWeight = 1.25, AccentColor = "#00d1b2" },
                    new() { SourceId = "goodreads", SourceName = "Goodreads Graphic Novels", Category = "Audience", RawScoreDisplay = "4.27 / 5", NormalizedScore = 85.4, VoteCount = 264000, DefaultWeight = 1.15, AccentColor = "#8b5e34" },
                    new() { SourceId = "comicbookroundup_critics", SourceName = "ComicBookRoundup Critics", Category = "Critic", RawScoreDisplay = "9.6 / 10", NormalizedScore = 96.0, VoteCount = 74, DefaultWeight = 1.25, AccentColor = "#fa320a" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "9.5 / 10", NormalizedScore = 95.0, VoteCount = 9320, DefaultWeight = 1.15, AccentColor = "#a855f7" }
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
                    new() { SourceId = "comicvine", SourceName = "ComicVine", Category = "ComicCommunity", RawScoreDisplay = "4.85 / 5", NormalizedScore = 97.0, VoteCount = 24900, DefaultWeight = 1.3, AccentColor = "#e62429" },
                    new() { SourceId = "league_of_comic_geeks", SourceName = "League of Comic Geeks", Category = "ComicCommunity", RawScoreDisplay = "95 / 100", NormalizedScore = 95.0, VoteCount = 22800, DefaultWeight = 1.25, AccentColor = "#00d1b2" },
                    new() { SourceId = "goodreads", SourceName = "Goodreads Graphic Novels", Category = "Audience", RawScoreDisplay = "4.29 / 5", NormalizedScore = 85.8, VoteCount = 112000, DefaultWeight = 1.15, AccentColor = "#8b5e34" },
                    new() { SourceId = "comicbookroundup_critics", SourceName = "ComicBookRoundup Critics", Category = "Critic", RawScoreDisplay = "9.4 / 10", NormalizedScore = 94.0, VoteCount = 148, DefaultWeight = 1.25, AccentColor = "#fa320a" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "9.5 / 10", NormalizedScore = 95.0, VoteCount = 6840, DefaultWeight = 1.15, AccentColor = "#a855f7" }
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
                    new() { SourceId = "comicvine", SourceName = "ComicVine", Category = "ComicCommunity", RawScoreDisplay = "4.78 / 5", NormalizedScore = 95.6, VoteCount = 18700, DefaultWeight = 1.3, AccentColor = "#e62429" },
                    new() { SourceId = "league_of_comic_geeks", SourceName = "League of Comic Geeks", Category = "ComicCommunity", RawScoreDisplay = "94 / 100", NormalizedScore = 94.0, VoteCount = 26400, DefaultWeight = 1.25, AccentColor = "#00d1b2" },
                    new() { SourceId = "comicbookroundup_critics", SourceName = "ComicBookRoundup Critics", Category = "Critic", RawScoreDisplay = "9.1 / 10", NormalizedScore = 91.0, VoteCount = 580, DefaultWeight = 1.25, AccentColor = "#fa320a" },
                    new() { SourceId = "comicbookroundup_users", SourceName = "ComicBookRoundup Users", Category = "Audience", RawScoreDisplay = "9.2 / 10", NormalizedScore = 92.0, VoteCount = 19100, DefaultWeight = 1.15, AccentColor = "#ff6b35" },
                    new() { SourceId = "marvel_dc_index", SourceName = "Marvel Unlimited Community", Category = "ComicCommunity", RawScoreDisplay = "9.3 / 10", NormalizedScore = 93.0, VoteCount = 14200, DefaultWeight = 1.1, AccentColor = "#3b82f6" },
                    new() { SourceId = "comictraffic_community", SourceName = "ComicTraffic Community", Category = "ComicCommunity", RawScoreDisplay = "9.3 / 10", NormalizedScore = 93.0, VoteCount = 5240, DefaultWeight = 1.15, AccentColor = "#a855f7" }
                })
        };

        db.MediaItems.AddRange(items);

        // 3. Seed Reviews
        db.Reviews.AddRange(
            new UserReview
            {
                UserId = demoUser.Id,
                Username = demoUser.Username,
                UserAvatarUrl = demoUser.AvatarUrl,
                ExternalMediaId = "comic-watchmen-1986",
                MediaTitle = "Watchmen #1–12 (Absolute Edition)",
                MediaType = MediaCategory.ComicBook,
                Score = 98,
                Headline = "The gold standard of sequential art and nine-panel symmetry",
                ReviewText = "Issue #4 (Watchmaker) and Issue #5 (Fearful Symmetry) remain unmatched in how they use the physical medium of comic books. Every rating API agrees: a structural masterpiece.",
                ContainsSpoilers = false,
                HelpfulVotes = 48,
                CreatedAt = DateTime.UtcNow.AddDays(-6)
            },
            new UserReview
            {
                UserId = secondUser.Id,
                Username = secondUser.Username,
                UserAvatarUrl = secondUser.AvatarUrl,
                ExternalMediaId = "movie-spiderverse-2023",
                MediaTitle = "Spider-Man: Across the Spider-Verse",
                MediaType = MediaCategory.Movie,
                Score = 95,
                Headline = "Every frame looks like a hand-inked comic cover come to life",
                ReviewText = "Gwen's watercolor Earth-65 palette reacting to her emotional state and Hobie Brown's collage punk animation push theatrical animation into uncharted territory.",
                ContainsSpoilers = false,
                HelpfulVotes = 34,
                CreatedAt = DateTime.UtcNow.AddDays(-3)
            },
            new UserReview
            {
                UserId = demoUser.Id,
                Username = demoUser.Username,
                UserAvatarUrl = demoUser.AvatarUrl,
                ExternalMediaId = "tv-invincible-2021",
                MediaTitle = "Invincible",
                MediaType = MediaCategory.TvSeries,
                Score = 93,
                Headline = "Faithful to Kirkman's Image Comics run while sharpening the pacing",
                ReviewText = "Seeing Omni-Man and Invincible's arc adapted with full dramatic weight makes this one of the highest-rated comic book television adaptations across IMDb, RT, and TVMaze.",
                ContainsSpoilers = false,
                HelpfulVotes = 29,
                CreatedAt = DateTime.UtcNow.AddDays(-1)
            }
        );

        // 4. Seed Demo User's Watchlist & Reading List
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

        // 5. Seed Custom Curated Lists
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

        await db.SaveChangesAsync();
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
