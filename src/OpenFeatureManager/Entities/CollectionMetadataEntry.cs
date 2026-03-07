using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

[Table("collection_metadata_entries")]
public class CollectionMetadataEntry
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Column("id")]
    public long Id { get; set; }

    [Column("collection_id")]
    public long CollectionId { get; set; }

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
