using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using OpenFeatureManager.Entities;

namespace OpenFeatureManager.Data;

public class FlagdDbContext : DbContext
{
    private readonly string? _connectionString;

    public DbSet<FlagsCollection> FlagsCollections => Set<FlagsCollection>();
    public DbSet<FlagEntry> FlagEntries => Set<FlagEntry>();
    public DbSet<BooleanFlagEntry> BooleanFlagEntries => Set<BooleanFlagEntry>();
    public DbSet<StringFlagEntry> StringFlagEntries => Set<StringFlagEntry>();
    public DbSet<NumberFlagEntry> NumberFlagEntries => Set<NumberFlagEntry>();
    public DbSet<ObjectFlagEntry> ObjectFlagEntries => Set<ObjectFlagEntry>();
    public DbSet<EnvironmentEntry> EnvironmentEntries => Set<EnvironmentEntry>();
    public DbSet<EnvironmentAlias> EnvironmentAliases => Set<EnvironmentAlias>();
    public DbSet<FlagMetadataEntry> FlagMetadataEntries => Set<FlagMetadataEntry>();
    public DbSet<CollectionMetadataEntry> CollectionMetadataEntries => Set<CollectionMetadataEntry>();
    public DbSet<PerEnvironmentDefinition> PerEnvironmentDefinitions => Set<PerEnvironmentDefinition>();
    public DbSet<TimeWindow> TimeWindows => Set<TimeWindow>();

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
        modelBuilder.Entity<FlagsCollection>(entity =>
        {
            entity.ToTable("flags_collections");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).ValueGeneratedOnAdd();
            entity.Property(e => e.Name).IsRequired();
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("datetime('now')");
            entity.HasMany(e => e.Metadata).WithOne().HasForeignKey(e => e.CollectionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.Flags).WithOne().HasForeignKey(e => e.CollectionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.Environments).WithOne().HasForeignKey(e => e.CollectionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.TimeWindows).WithOne().HasForeignKey(e => e.CollectionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<FlagEntry>(entity =>
        {
            entity.ToTable("flag_entries");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).ValueGeneratedOnAdd();
            entity.Property(e => e.FlagKey).IsRequired();
            entity.HasIndex(e => new { e.CollectionId, e.FlagKey }).IsUnique();
            entity.Property(e => e.State).HasConversion(new EnumToStringConverter<FlagState>());
            entity.HasDiscriminator<string>("type")
                .HasValue<BooleanFlagEntry>("boolean")
                .HasValue<StringFlagEntry>("string")
                .HasValue<NumberFlagEntry>("number")
                .HasValue<ObjectFlagEntry>("object");
            entity.HasMany(e => e.Metadata).WithOne().HasForeignKey(e => e.FlagEntryId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.PerEnvironmentDefinitions).WithOne().HasForeignKey(e => e.FlagEntryId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.GlobalTimeWindow).WithMany().HasForeignKey(e => e.GlobalTimeWindowId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<EnvironmentEntry>(entity =>
        {
            entity.ToTable("environment_entries");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).ValueGeneratedOnAdd();
            entity.Property(e => e.Name).IsRequired();
            entity.HasIndex(e => new { e.CollectionId, e.Name }).IsUnique();
            entity.HasMany(e => e.Aliases).WithOne().HasForeignKey(e => e.EnvironmentEntryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EnvironmentAlias>(entity =>
        {
            entity.ToTable("environment_aliases");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).ValueGeneratedOnAdd();
            entity.Property(e => e.Alias).IsRequired();
        });

        modelBuilder.Entity<CollectionMetadataEntry>(entity =>
        {
            entity.ToTable("collection_metadata_entries");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).ValueGeneratedOnAdd();
            entity.Property(e => e.Key).IsRequired();
            entity.HasIndex(e => new { e.CollectionId, e.Key }).IsUnique();
        });

        modelBuilder.Entity<FlagMetadataEntry>(entity =>
        {
            entity.ToTable("flag_metadata_entries");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).ValueGeneratedOnAdd();
            entity.Property(e => e.Key).IsRequired();
            entity.HasIndex(e => new { e.FlagEntryId, e.Key }).IsUnique();
        });

        modelBuilder.Entity<PerEnvironmentDefinition>(entity =>
        {
            entity.ToTable("per_environment_definitions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).ValueGeneratedOnAdd();
            entity.HasIndex(e => new { e.FlagEntryId, e.EnvironmentEntryId }).IsUnique();
            entity.HasOne(e => e.Environment).WithMany().HasForeignKey(e => e.EnvironmentEntryId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.TimeWindow).WithMany().HasForeignKey(e => e.TimeWindowId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<TimeWindow>(entity =>
        {
            entity.ToTable("time_windows");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).ValueGeneratedOnAdd();
            entity.Property(e => e.Name).IsRequired();
            entity.HasIndex(e => new { e.CollectionId, e.Name }).IsUnique();
        });
    }
}
