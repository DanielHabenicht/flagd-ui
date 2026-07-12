using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

[Table("flag_entries")]
public abstract class FlagEntry
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("collection_id")]
    public Guid CollectionId { get; set; }

    [Required]
    [Column("flag_key")]
    public string FlagKey { get; set; } = string.Empty;

    [Column("state")]
    public FlagState State { get; set; } = FlagState.ENABLED;

    [Column("global_time_window_id")]
    public Guid? GlobalTimeWindowId { get; set; }

    public TimeWindow? GlobalTimeWindow { get; set; }

    public List<FlagMetadataEntry> Metadata { get; set; } = [];
    public List<PerEnvironmentDefinition> PerEnvironmentDefinitions { get; set; } = [];
}
