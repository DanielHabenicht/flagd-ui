using System.Text;
using System.Text.Json;
using OpenFeatureManager.Models;

namespace OpenFeatureManager.Services;

/// <summary>
/// Handles import and export of flagd JSON Schema documents.
///
/// Converts between the flagd JSON schema format and the typed DTO model
/// exposed by <see cref="FlagdService"/>. Values are stored with their native
/// types rather than as raw JSON strings.
/// </summary>
public class FlagdSchemaService
{
    private const string EnvironmentEvaluatorPrefix = "is";
    private const string EnvironmentVarName = "environment";
    private const string BooleanOnVariant = "on";
    private const string DefaultVariant = "default";

    private readonly FlagdService _flagdService;
    private readonly SchemaValidator? _validator;

    public FlagdSchemaService(FlagdService flagdService, SchemaValidator? validator = null)
    {
        _flagdService = flagdService;
        _validator = validator;
    }

    /// <summary>
    /// Parse a FlagdSchema JSON string and store it via <see cref="FlagdService"/>.
    /// Validates the JSON against the flagd schema (if a validator is configured),
    /// then parses the JSON document directly.
    /// Existing flags and environments for the file are replaced.
    /// </summary>
    public void ImportSchema(Guid collectionId, string schemaJson)
    {
        _validator?.ValidateOrThrow(schemaJson);

        using var doc = JsonDocument.Parse(schemaJson);
        var root = doc.RootElement;

        // Clear existing data for this collection
        _flagdService.ClearCollectionData(collectionId);

        // Update collection-level metadata if present
        if (root.TryGetProperty("metadata", out var metadataElem)
            && metadataElem.ValueKind == JsonValueKind.Object
            && metadataElem.EnumerateObject().Any())
        {
            var metadata = ParseMetadata(metadataElem);
            _flagdService.UpdateCollectionMetadata(collectionId, metadata);
        }

        // Parse $evaluators → environments  (pattern: "isXxx")
        if (root.TryGetProperty("$evaluators", out var evaluatorsElem)
            && evaluatorsElem.ValueKind == JsonValueKind.Object)
        {
            foreach (var evalProp in evaluatorsElem.EnumerateObject())
            {
                var key = evalProp.Name;
                if (!key.StartsWith(EnvironmentEvaluatorPrefix) || key.Length <= EnvironmentEvaluatorPrefix.Length)
                    continue;

                var evalObj = evalProp.Value;
                if (evalObj.ValueKind != JsonValueKind.Object
                    || !evalObj.TryGetProperty("in", out var inElem)
                    || inElem.ValueKind != JsonValueKind.Array
                    || inElem.GetArrayLength() != 2)
                    continue;

                var varPart = inElem[0];
                var aliasesPart = inElem[1];

                if (!varPart.TryGetProperty("var", out var varValue) ||
                    varValue.GetString() != EnvironmentVarName ||
                    aliasesPart.ValueKind != JsonValueKind.Array)
                    continue;

                var envName = key[EnvironmentEvaluatorPrefix.Length..]; // "Production" from "isProduction"
                var aliases = aliasesPart.EnumerateArray()
                    .Select(a => a.GetString() ?? string.Empty)
                    .Where(a => !string.IsNullOrEmpty(a))
                    .ToArray();

                _flagdService.UpsertEnvironment(collectionId, new EnvironmentEntryDto(envName, aliases));
            }
        }

        // Parse flags
        if (root.TryGetProperty("flags", out var flagsElem)
            && flagsElem.ValueKind == JsonValueKind.Object)
        {
            foreach (var flagProp in flagsElem.EnumerateObject())
            {
                var flagKey = flagProp.Name;
                var flagDef = flagProp.Value;
                if (flagDef.ValueKind != JsonValueKind.Object) continue;

                var state = flagDef.TryGetProperty("state", out var stateElem)
                    ? stateElem.GetString() ?? "ENABLED"
                    : "ENABLED";

                var flagType = "object";
                bool? boolVal = null;
                string? strVal = null;
                double? numVal = null;
                string? objVal = null;

                if (flagDef.TryGetProperty("defaultVariant", out var defaultVariantElem)
                    && flagDef.TryGetProperty("variants", out var variantsElem)
                    && variantsElem.ValueKind == JsonValueKind.Object)
                {
                    var defaultVariantName = defaultVariantElem.GetString();
                    if (!string.IsNullOrEmpty(defaultVariantName)
                        && variantsElem.TryGetProperty(defaultVariantName, out var defaultValue))
                    {
                        switch (defaultValue.ValueKind)
                        {
                            case JsonValueKind.True:
                                flagType = "boolean";
                                boolVal = true;
                                break;
                            case JsonValueKind.False:
                                flagType = "boolean";
                                boolVal = false;
                                break;
                            case JsonValueKind.Number:
                                flagType = "number";
                                numVal = defaultValue.GetDouble();
                                break;
                            case JsonValueKind.String:
                                flagType = "string";
                                strVal = defaultValue.GetString();
                                break;
                            default:
                                flagType = "object";
                                objVal = defaultValue.GetRawText();
                                break;
                        }
                    }
                }

                List<MetadataEntryDto>? flagMetadata = null;
                if (flagDef.TryGetProperty("metadata", out var flagMetaElem)
                    && flagMetaElem.ValueKind == JsonValueKind.Object)
                {
                    flagMetadata = ParseMetadata(flagMetaElem);
                }

                _flagdService.UpsertFlag(collectionId, new FlagEntryDto(
                    flagKey, flagType, state,
                    boolVal, strVal, numVal, objVal,
                    flagMetadata));
            }
        }
    }

    /// <summary>
    /// Reconstruct and return a FlagdSchema JSON string from the stored data.
    /// Validates the output against the flagd schema (if a validator is configured).
    /// </summary>
    public string ExportSchema(Guid collectionId)
    {
        var collection = _flagdService.GetCollection(collectionId);
        var flags = _flagdService.GetFlags(collectionId);
        var environments = _flagdService.GetEnvironments(collectionId);

        using var stream = new MemoryStream();
        using var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = true });

        writer.WriteStartObject();
        writer.WriteString("$schema", "https://flagd.dev/schema/v0/flags.json");

        // flags
        writer.WritePropertyName("flags");
        writer.WriteStartObject();
        foreach (var flag in flags)
        {
            writer.WritePropertyName(flag.Key);
            writer.WriteStartObject();

            writer.WriteString("state", flag.State);

            var variantKey = flag.Type == "boolean" ? BooleanOnVariant : DefaultVariant;
            writer.WritePropertyName("variants");
            writer.WriteStartObject();
            writer.WritePropertyName(variantKey);
            WriteFlagValue(writer, flag);
            writer.WriteEndObject();

            writer.WriteString("defaultVariant", variantKey);

            if (flag.Metadata is { Count: > 0 })
            {
                writer.WritePropertyName("metadata");
                WriteMetadata(writer, flag.Metadata);
            }

            writer.WriteEndObject();
        }
        writer.WriteEndObject(); // flags

        // $evaluators (from environments)
        if (environments.Count > 0)
        {
            writer.WritePropertyName("$evaluators");
            writer.WriteStartObject();
            foreach (var env in environments)
            {
                if (string.IsNullOrEmpty(env.Name)) continue;
                var refKey = EnvironmentEvaluatorPrefix + env.Name; // "is" + "Production" = "isProduction"

                writer.WritePropertyName(refKey);
                writer.WriteStartObject();
                writer.WritePropertyName("in");
                writer.WriteStartArray();
                writer.WriteStartObject();
                writer.WriteString("var", EnvironmentVarName);
                writer.WriteEndObject();
                writer.WriteStartArray();
                foreach (var alias in env.Aliases) writer.WriteStringValue(alias);
                writer.WriteEndArray();
                writer.WriteEndArray();
                writer.WriteEndObject();
            }
            writer.WriteEndObject(); // $evaluators
        }

        // collection-level metadata
        if (collection.Metadata is { Count: > 0 })
        {
            writer.WritePropertyName("metadata");
            WriteMetadata(writer, collection.Metadata);
        }

        writer.WriteEndObject(); // root
        writer.Flush();

        var json = Encoding.UTF8.GetString(stream.ToArray());

        _validator?.ValidateOrThrow(json);

        return json;
    }

    // ─── Private helpers ──────────────────────────────────────────────────

    private static List<MetadataEntryDto> ParseMetadata(JsonElement metadataObj)
    {
        var result = new List<MetadataEntryDto>();
        foreach (var prop in metadataObj.EnumerateObject())
        {
            var dto = prop.Value.ValueKind switch
            {
                JsonValueKind.String => new MetadataEntryDto(prop.Name, StringValue: prop.Value.GetString()),
                JsonValueKind.Number => new MetadataEntryDto(prop.Name, NumberValue: prop.Value.GetDouble()),
                JsonValueKind.True => new MetadataEntryDto(prop.Name, BooleanValue: true),
                JsonValueKind.False => new MetadataEntryDto(prop.Name, BooleanValue: false),
                _ => null
            };
            if (dto is not null) result.Add(dto);
        }
        return result;
    }

    private static void WriteFlagValue(Utf8JsonWriter writer, FlagEntryDto flag)
    {
        switch (flag.Type)
        {
            case "boolean":
                if (flag.BooleanValue.HasValue)
                    writer.WriteBooleanValue(flag.BooleanValue.Value);
                else
                    writer.WriteNullValue();
                break;
            case "string":
                if (flag.StringValue is not null)
                    writer.WriteStringValue(flag.StringValue);
                else
                    writer.WriteNullValue();
                break;
            case "number":
                if (flag.NumberValue.HasValue)
                    writer.WriteNumberValue(flag.NumberValue.Value);
                else
                    writer.WriteNullValue();
                break;
            case "object":
                if (!string.IsNullOrEmpty(flag.ObjectValue))
                {
                    using var doc = JsonDocument.Parse(flag.ObjectValue);
                    doc.RootElement.WriteTo(writer);
                }
                else
                    writer.WriteNullValue();
                break;
            default:
                writer.WriteNullValue();
                break;
        }
    }

    private static void WriteMetadata(Utf8JsonWriter writer, List<MetadataEntryDto> metadata)
    {
        writer.WriteStartObject();
        foreach (var entry in metadata)
        {
            writer.WritePropertyName(entry.Key);
            if (entry.StringValue is not null)
                writer.WriteStringValue(entry.StringValue);
            else if (entry.NumberValue.HasValue)
                writer.WriteNumberValue(entry.NumberValue.Value);
            else if (entry.BooleanValue.HasValue)
                writer.WriteBooleanValue(entry.BooleanValue.Value);
            else
                writer.WriteNullValue();
        }
        writer.WriteEndObject();
    }
}
