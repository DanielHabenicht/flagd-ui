using System.Text;
using System.Text.Json;
using OpenFeatureManager.Models;

namespace OpenFeatureManager.Services;

/// <summary>
/// Handles import and export of flagd JSON Schema documents.
///
/// Converts between the flagd JSON schema format and the normalised DTO model
/// exposed by <see cref="FlagdService"/>, using raw <see cref="JsonDocument"/>
/// parsing so there is no dependency on generated schema types.
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
    public void ImportSchema(long fileId, string schemaJson)
    {
        _validator?.ValidateOrThrow(schemaJson);

        using var doc = JsonDocument.Parse(schemaJson);
        var root = doc.RootElement;

        // Clear existing data for this file
        _flagdService.ClearFileData(fileId);

        // Update file-level metadata if present
        if (root.TryGetProperty("metadata", out var metadataElem)
            && metadataElem.ValueKind == JsonValueKind.Object
            && metadataElem.EnumerateObject().Any())
        {
            _flagdService.UpdateFileMetadata(fileId, metadataElem.GetRawText());
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

                var envName = key[EnvironmentEvaluatorPrefix.Length..].ToLowerInvariant();
                var displayName = char.ToUpperInvariant(envName[0]) + envName[1..];
                var aliases = aliasesPart.EnumerateArray()
                    .Select(a => a.GetString() ?? string.Empty)
                    .Where(a => !string.IsNullOrEmpty(a))
                    .ToArray();

                _flagdService.UpsertEnvironment(fileId, new EnvironmentEntryDto(envName, displayName, aliases));
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
                string? valueJson = null;

                if (flagDef.TryGetProperty("defaultVariant", out var defaultVariantElem)
                    && flagDef.TryGetProperty("variants", out var variantsElem)
                    && variantsElem.ValueKind == JsonValueKind.Object)
                {
                    var defaultVariantName = defaultVariantElem.GetString();
                    if (!string.IsNullOrEmpty(defaultVariantName)
                        && variantsElem.TryGetProperty(defaultVariantName, out var defaultValue))
                    {
                        flagType = defaultValue.ValueKind switch
                        {
                            JsonValueKind.True or JsonValueKind.False => "boolean",
                            JsonValueKind.Number => "number",
                            JsonValueKind.String => "string",
                            _ => "object",
                        };
                        valueJson = defaultValue.GetRawText();
                    }
                }

                string? flagMetadataJson = flagDef.TryGetProperty("metadata", out var flagMetaElem)
                    && flagMetaElem.ValueKind == JsonValueKind.Object
                    ? flagMetaElem.GetRawText() : null;

                string? targetingJson = flagDef.TryGetProperty("targeting", out var targetingElem)
                    && targetingElem.ValueKind == JsonValueKind.Object
                    ? targetingElem.GetRawText() : null;

                _flagdService.UpsertFlag(fileId, new FlagEntryDto(flagKey, flagType, state, valueJson, flagMetadataJson, targetingJson));
            }
        }
    }

    /// <summary>
    /// Reconstruct and return a FlagdSchema JSON string from the stored data.
    /// Validates the output against the flagd schema (if a validator is configured).
    /// </summary>
    public string ExportSchema(long fileId)
    {
        var file = _flagdService.GetFile(fileId);
        var flags = _flagdService.GetFlags(fileId);
        var environments = _flagdService.GetEnvironments(fileId);

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
            WriteRawOrNull(writer, flag.ValueJson);
            writer.WriteEndObject();

            writer.WriteString("defaultVariant", variantKey);

            if (!string.IsNullOrEmpty(flag.TargetingJson))
            {
                writer.WritePropertyName("targeting");
                WriteRaw(writer, flag.TargetingJson);
            }

            if (!string.IsNullOrEmpty(flag.MetadataJson))
            {
                writer.WritePropertyName("metadata");
                WriteRaw(writer, flag.MetadataJson);
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
                var refKey = EnvironmentEvaluatorPrefix +
                             char.ToUpperInvariant(env.Name[0]) +
                             env.Name[1..];

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

        // file-level metadata
        if (!string.IsNullOrEmpty(file.MetadataJson))
        {
            writer.WritePropertyName("metadata");
            WriteRaw(writer, file.MetadataJson);
        }

        writer.WriteEndObject(); // root
        writer.Flush();

        var json = Encoding.UTF8.GetString(stream.ToArray());

        _validator?.ValidateOrThrow(json);

        return json;
    }

    // ─── Private helpers ──────────────────────────────────────────────────

    private static void WriteRaw(Utf8JsonWriter writer, string rawJson)
    {
        using var doc = JsonDocument.Parse(rawJson);
        doc.RootElement.WriteTo(writer);
    }

    private static void WriteRawOrNull(Utf8JsonWriter writer, string? rawJson)
    {
        if (string.IsNullOrEmpty(rawJson))
            writer.WriteNullValue();
        else
            WriteRaw(writer, rawJson);
    }
}
