using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

[Table("flag_entries")]
public class FlagEntry
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Column("id")]
    public long Id { get; set; }

    [Column("file_id")]
    public long FileId { get; set; }

    [Required]
    [Column("flag_key")]
    public string FlagKey { get; set; } = string.Empty;

    /// <summary>Flag type: boolean | string | number | object</summary>
    [Column("type")]
    public string Type { get; set; } = "boolean";

    /// <summary>Flag state: ENABLED | DISABLED</summary>
    [Column("state")]
    public string State { get; set; } = "ENABLED";

    /// <summary>Raw JSON text of the flag's default value</summary>
    [Column("value_json")]
    public string? ValueJson { get; set; }

    /// <summary>Raw JSON text of the flag's metadata object</summary>
    [Column("metadata_json")]
    public string? MetadataJson { get; set; }

    /// <summary>Raw JSON text of the flag's targeting rule</summary>
    [Column("targeting_json")]
    public string? TargetingJson { get; set; }
}
