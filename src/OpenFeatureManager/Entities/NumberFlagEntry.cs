using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

public class NumberFlagEntry : FlagEntry
{
    [Column("number_value")]
    public double? Value { get; set; }

    [Column("global_tw_number_value")]
    public double? GlobalTimeWindowValue { get; set; }
}
