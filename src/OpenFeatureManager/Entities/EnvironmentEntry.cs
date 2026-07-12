using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

[Table("environment_entries")]
public class EnvironmentEntry
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("collection_id")]
    public Guid CollectionId { get; set; }

    /// <summary>Human-readable environment name, e.g. "Production", "Staging"</summary>
    [Required]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    public List<EnvironmentAlias> Aliases { get; set; } = [];
}
