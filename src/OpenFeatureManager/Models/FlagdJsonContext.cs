using System.Text.Json.Serialization;

namespace OpenFeatureManager.Models;

/// <summary>DTO for a flag file (schema document).</summary>
public record FlagFileDto(long Id, string Name, DateTime CreatedAt, string? MetadataJson = null);

/// <summary>
/// DTO for a single flag entry.
/// <c>ValueJson</c>, <c>MetadataJson</c>, and <c>TargetingJson</c> carry raw JSON text
/// so that arbitrary flag values and targeting rules survive serialisation boundaries without
/// further reflection-based serialisation.
/// </summary>
public record FlagEntryDto(
    string Key,
    string Type,
    string State,
    string? ValueJson = null,
    string? MetadataJson = null,
    string? TargetingJson = null,
    string? PreviousKey = null);

/// <summary>DTO for an environment definition.</summary>
public record EnvironmentEntryDto(string Name, string DisplayName, string[] Aliases);

[JsonSerializable(typeof(string[]))]
[JsonSerializable(typeof(FlagFileDto))]
[JsonSerializable(typeof(List<FlagFileDto>))]
[JsonSerializable(typeof(FlagEntryDto))]
[JsonSerializable(typeof(List<FlagEntryDto>))]
[JsonSerializable(typeof(EnvironmentEntryDto))]
[JsonSerializable(typeof(List<EnvironmentEntryDto>))]
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
public partial class FlagdJsonContext : JsonSerializerContext;
