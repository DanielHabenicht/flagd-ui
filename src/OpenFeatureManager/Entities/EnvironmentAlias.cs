using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

[Table("environment_aliases")]
public class EnvironmentAlias
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("environment_entry_id")]
    public Guid EnvironmentEntryId { get; set; }

    [Required]
    [Column("alias")]
    public string Alias { get; set; } = string.Empty;
}
