using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend;

[Table("environment_entries")]
public class EnvironmentEntry
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Column("id")]
    public long Id { get; set; }

    [Column("file_id")]
    public long FileId { get; set; }

    /// <summary>Lowercase environment name, e.g. "production"</summary>
    [Required]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    /// <summary>JSON array of alias strings</summary>
    [Column("aliases_json")]
    public string AliasesJson { get; set; } = "[]";
}
