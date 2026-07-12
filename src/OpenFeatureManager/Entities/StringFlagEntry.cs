using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

public class StringFlagEntry : FlagEntry
{
    [Column("string_value")]
    public string? Value { get; set; }

    [Column("global_tw_string_value")]
    public string? GlobalTimeWindowValue { get; set; }
}
