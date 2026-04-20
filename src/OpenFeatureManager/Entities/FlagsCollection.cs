using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

[Table("flags_collections")]
public class FlagsCollection
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<CollectionMetadataEntry> Metadata { get; set; } = [];
    public List<FlagEntry> Flags { get; set; } = [];
    public List<EnvironmentEntry> Environments { get; set; } = [];
    public List<TimeWindow> TimeWindows { get; set; } = [];
}
