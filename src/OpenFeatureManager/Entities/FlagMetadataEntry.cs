using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

[Table("flag_metadata_entries")]
public class FlagMetadataEntry
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Column("id")]
    public long Id { get; set; }

    [Column("flag_entry_id")]
    public long FlagEntryId { get; set; }

    [Required]
    [Column("key")]
    public string Key { get; set; } = string.Empty;

    [Column("string_value")]
    public string? StringValue { get; set; }

    [Column("number_value")]
    public double? NumberValue { get; set; }

    [Column("boolean_value")]
    public bool? BooleanValue { get; set; }
}
