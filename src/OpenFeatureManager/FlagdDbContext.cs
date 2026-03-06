using Microsoft.EntityFrameworkCore;

namespace OpenFeatureManager;

public class FlagdDbContext : DbContext
{
    private readonly string? _connectionString;

    public DbSet<FlagFile> FlagFiles => Set<FlagFile>();
    public DbSet<FlagEntry> FlagEntries => Set<FlagEntry>();
    public DbSet<EnvironmentEntry> EnvironmentEntries => Set<EnvironmentEntry>();

    /// <summary>Constructor for connection-string based configuration (WASM, standalone).</summary>
    public FlagdDbContext(string connectionString)
    {
        _connectionString = connectionString;
    }

    /// <summary>Constructor for DI-based configuration (ASP.NET Core).</summary>
    public FlagdDbContext(DbContextOptions<FlagdDbContext> options) : base(options) { }

    protected override void OnConfiguring(DbContextOptionsBuilder options)
    {
        if (!options.IsConfigured && _connectionString is not null)
            options.UseSqlite(_connectionString);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<FlagFile>(entity =>
        {
            entity.ToTable("flag_files");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).ValueGeneratedOnAdd();
            entity.Property(e => e.Name).IsRequired();
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("datetime('now')");
        });

        modelBuilder.Entity<FlagEntry>(entity =>
        {
            entity.ToTable("flag_entries");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).ValueGeneratedOnAdd();
            entity.Property(e => e.FlagKey).IsRequired();
            entity.HasIndex(e => new { e.FileId, e.FlagKey }).IsUnique();
        });

        modelBuilder.Entity<EnvironmentEntry>(entity =>
        {
            entity.ToTable("environment_entries");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).ValueGeneratedOnAdd();
            entity.Property(e => e.Name).IsRequired();
            entity.HasIndex(e => new { e.FileId, e.Name }).IsUnique();
        });
    }
}
