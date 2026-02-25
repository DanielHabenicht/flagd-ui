using Microsoft.EntityFrameworkCore;

namespace Backend;

public class FlagdDbContext : DbContext
{
    private readonly string _connectionString;

    public DbSet<FlagFile> FlagFiles => Set<FlagFile>();
    public DbSet<FlagEntry> FlagEntries => Set<FlagEntry>();
    public DbSet<EnvironmentEntry> EnvironmentEntries => Set<EnvironmentEntry>();

    public FlagdDbContext(string connectionString)
    {
        _connectionString = connectionString;
    }

    protected override void OnConfiguring(DbContextOptionsBuilder options)
    {
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
