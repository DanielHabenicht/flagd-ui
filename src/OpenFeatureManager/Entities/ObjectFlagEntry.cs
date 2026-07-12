using System.ComponentModel.DataAnnotations.Schema;

namespace OpenFeatureManager.Entities;

/// <summary>
/// Flag entry with an object value stored as serialized JSON.
/// The type is explicitly known (object), distinguishing this from untyped JSON storage.
/// </summary>
public class ObjectFlagEntry : FlagEntry
{
    [Column("object_value")]
    public string? ObjectValue { get; set; }

    [Column("global_tw_object_value")]
    public string? GlobalTimeWindowObjectValue { get; set; }
}
