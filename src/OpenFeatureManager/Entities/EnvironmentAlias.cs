using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

[Table("environment_aliases")]
public class EnvironmentAlias
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Column("id")]
    public long Id { get; set; }

    [Column("environment_entry_id")]
    public long EnvironmentEntryId { get; set; }

    [Required]
    [Column("alias")]
    public string Alias { get; set; } = string.Empty;
}
