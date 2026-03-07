using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

public class BooleanFlagEntry : FlagEntry
{
    [Column("boolean_value")]
    public bool? Value { get; set; }

    [Column("global_tw_boolean_value")]
    public bool? GlobalTimeWindowValue { get; set; }
}
