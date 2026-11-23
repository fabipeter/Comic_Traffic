using ComicTraffic.Api.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ComicTraffic.Api.Infrastructure.Persistence;

public class ComicTrafficDbContext : DbContext
{
    public ComicTrafficDbContext(DbContextOptions<ComicTrafficDbContext> options)
        : base(options)
    {
    }

    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<MediaItem> MediaItems => Set<MediaItem>();
    public DbSet<UserReview> Reviews => Set<UserReview>();
    public DbSet<WatchlistItem> WatchlistItems => Set<WatchlistItem>();
    public DbSet<CustomMediaList> CustomLists => Set<CustomMediaList>();
    public DbSet<ContentReport> ContentReports => Set<ContentReport>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.ToTable("users");
            entity.HasIndex(u => u.Email).IsUnique();
            entity.HasIndex(u => u.Username).IsUnique();
            entity.Property(u => u.PreferredWeightsJson).HasColumnType("jsonb");
        });

        modelBuilder.Entity<MediaItem>(entity =>
        {
            entity.ToTable("media_items");
            entity.HasIndex(m => m.ExternalId).IsUnique();
            entity.HasIndex(m => m.MediaType);
            entity.HasIndex(m => m.FinalCumulativeAverage);
            entity.Property(m => m.ExternalRatingsJson).HasColumnType("jsonb");
        });

        modelBuilder.Entity<UserReview>(entity =>
        {
            entity.ToTable("user_reviews");
            entity.HasIndex(r => r.ExternalMediaId);
            entity.HasIndex(r => r.UserId);
        });

        modelBuilder.Entity<WatchlistItem>(entity =>
        {
            entity.ToTable("watchlist_items");
            entity.HasIndex(w => new { w.UserId, w.ExternalMediaId }).IsUnique();
        });

        modelBuilder.Entity<CustomMediaList>(entity =>
        {
            entity.ToTable("custom_media_lists");
            entity.HasIndex(c => c.UserId);
        });

        modelBuilder.Entity<ContentReport>(entity =>
        {
            entity.ToTable("content_reports");
            entity.HasIndex(r => r.ReviewId);
            entity.HasIndex(r => r.Status);
        });
    }
}
