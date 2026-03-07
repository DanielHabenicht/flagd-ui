using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

[Table("per_environment_definitions")]
public class PerEnvironmentDefinition
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    [Column("id")]
    public long Id { get; set; }

    [Column("flag_entry_id")]
    public long FlagEntryId { get; set; }

    [Column("environment_entry_id")]
    public long EnvironmentEntryId { get; set; }

    public EnvironmentEntry Environment { get; set; } = null!;

    [Column("boolean_value")]
    public bool? BooleanValue { get; set; }

    [Column("string_value")]
    public string? StringValue { get; set; }

    [Column("number_value")]
    public double? NumberValue { get; set; }

    [Column("object_value")]
    public string? ObjectValue { get; set; }

    [Column("time_window_id")]
    public long? TimeWindowId { get; set; }

    public TimeWindow? TimeWindow { get; set; }
}
