using System.Text.Json;
using System.Text.Json.Serialization;

namespace OpenFeatureManager.Generated;

/// <summary>
/// Adds typed flag properties to the generated <see cref="FlagDefinition"/> class.
/// The base generated class only has <c>JsonExtensionData</c>; these explicit properties
/// are deserialized by System.Text.Json before unknown keys fall through to AdditionalProperties.
/// </summary>
public partial class FlagDefinition
{
    [JsonPropertyName("state")]
    public string? State { get; set; }

    [JsonPropertyName("variants")]
    public Dictionary<string, JsonElement>? Variants { get; set; }

    [JsonPropertyName("defaultVariant")]
    public string? DefaultVariant { get; set; }

    [JsonPropertyName("targeting")]
    public JsonElement? Targeting { get; set; }

    [JsonPropertyName("metadata")]
    public JsonElement? FlagMetadata { get; set; }
}
