using System.Text.Json.Serialization;

namespace OpenFeatureManager.Models;

/// <summary>DTO for a flags collection (schema document).</summary>
public record FlagsCollectionDto(
    Guid Id,
    string Name,
    DateTime CreatedAt,
    List<MetadataEntryDto>? Metadata = null);

/// <summary>DTO for a metadata key-value entry (supports string, number, boolean).</summary>
public record MetadataEntryDto(
    string Key,
    string? StringValue = null,
    double? NumberValue = null,
    bool? BooleanValue = null);

/// <summary>
/// DTO for a single flag entry with typed values.
/// Only the value field matching <c>Type</c> is populated.
/// </summary>
public record FlagEntryDto(
    string Key,
    string Type,
    string State,
    bool? BooleanValue = null,
    string? StringValue = null,
    double? NumberValue = null,
    string? ObjectValue = null,
    List<MetadataEntryDto>? Metadata = null,
    Dictionary<string, PerEnvironmentDefinitionDto>? PerEnvironmentDefinitions = null,
    GlobalTimeWindowDto? GlobalTimeWindow = null,
    string? PreviousKey = null);

/// <summary>DTO for a per-environment value override with optional time window reference.</summary>
public record PerEnvironmentDefinitionDto(
    bool? BooleanValue = null,
    string? StringValue = null,
    double? NumberValue = null,
    string? ObjectValue = null,
    Guid? TimeWindowId = null);

/// <summary>DTO for a global time-windowed value override referencing a TimeWindow entity.</summary>
public record GlobalTimeWindowDto(
    Guid TimeWindowId,
    bool? BooleanValue = null,
    string? StringValue = null,
    double? NumberValue = null,
    string? ObjectValue = null);

/// <summary>DTO for an environment definition.</summary>
public record EnvironmentEntryDto(string Name, string[] Aliases);

/// <summary>DTO for a reusable time window.</summary>
public record TimeWindowDto(Guid Id, string Name, DateTime? StartTime = null, DateTime? EndTime = null);

[JsonSerializable(typeof(string[]))]
[JsonSerializable(typeof(FlagsCollectionDto))]
[JsonSerializable(typeof(List<FlagsCollectionDto>))]
[JsonSerializable(typeof(FlagEntryDto))]
[JsonSerializable(typeof(List<FlagEntryDto>))]
[JsonSerializable(typeof(MetadataEntryDto))]
[JsonSerializable(typeof(List<MetadataEntryDto>))]
[JsonSerializable(typeof(PerEnvironmentDefinitionDto))]
[JsonSerializable(typeof(Dictionary<string, PerEnvironmentDefinitionDto>))]
[JsonSerializable(typeof(GlobalTimeWindowDto))]
[JsonSerializable(typeof(EnvironmentEntryDto))]
[JsonSerializable(typeof(List<EnvironmentEntryDto>))]
[JsonSerializable(typeof(TimeWindowDto))]
[JsonSerializable(typeof(List<TimeWindowDto>))]
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
public partial class FlagdJsonContext : JsonSerializerContext;
