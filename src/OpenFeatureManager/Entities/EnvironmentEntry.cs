using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

[Table("environment_entries")]
public class EnvironmentEntry
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Column("id")]
    public long Id { get; set; }

    [Column("collection_id")]
    public long CollectionId { get; set; }

    /// <summary>Human-readable environment name, e.g. "Production", "Staging"</summary>
    [Required]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    public List<EnvironmentAlias> Aliases { get; set; } = [];
}
