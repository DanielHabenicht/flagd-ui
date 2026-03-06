using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace OpenFeatureManager;

/// <summary>
/// SQLite-backed flagd schema service.
///
/// Provides multi-file flag/environment management and FlagdSchema JSON import/export.
/// Instantiate with a <see cref="Func{FlagdDbContext}"/> factory so that callers
/// (WASM, REST API, tests) can supply their own DB configuration.
/// </summary>
public class FlagdService
{
    private const string EnvironmentEvaluatorPrefix = "is";
    private const string EnvironmentVarName = "environment";
    private const string BooleanOnVariant = "on";
    private const string DefaultVariant = "default";

    private static readonly FlagdJsonContext JsonCtx = FlagdJsonContext.Default;
    private readonly Func<FlagdDbContext> _contextFactory;

    public FlagdService(Func<FlagdDbContext> contextFactory)
    {
        _contextFactory = contextFactory;
    }

    // ─── File management ──────────────────────────────────────────────────

    public FlagFileDto CreateFile(string name)
    {
        using var db = _contextFactory();
        var file = new FlagFile { Name = name };
        db.FlagFiles.Add(file);
        db.SaveChanges();
        return ToDto(file);
    }

    public List<FlagFileDto> GetFiles()
    {
        using var db = _contextFactory();
        return db.FlagFiles.OrderBy(f => f.Id).ToList().Select(ToDto).ToList();
    }

    public FlagFileDto RenameFile(long id, string name)
    {
        using var db = _contextFactory();
        var file = db.FlagFiles.Find(id) ?? throw new KeyNotFoundException($"File {id} not found");
        file.Name = name;
        db.SaveChanges();
        return ToDto(file);
    }

    public void DeleteFile(long id)
    {
        using var db = _contextFactory();
        var file = db.FlagFiles.Find(id) ?? throw new KeyNotFoundException($"File {id} not found");
        db.FlagEntries.RemoveRange(db.FlagEntries.Where(f => f.FileId == id));
        db.EnvironmentEntries.RemoveRange(db.EnvironmentEntries.Where(e => e.FileId == id));
        db.FlagFiles.Remove(file);
        db.SaveChanges();
    }

    // ─── Flag management ──────────────────────────────────────────────────

    public List<FlagEntryDto> GetFlags(long fileId)
    {
        using var db = _contextFactory();
        return db.FlagEntries
            .Where(f => f.FileId == fileId)
            .OrderBy(f => f.FlagKey)
            .ToList()
            .Select(ToDto)
            .ToList();
    }

    /// <summary>
    /// Create or update a flag from a <see cref="FlagEntryDto"/>.
    /// Supports renaming via the optional <c>PreviousKey</c> field.
    /// </summary>
    public FlagEntryDto UpsertFlag(long fileId, FlagEntryDto dto)
    {
        using var db = _contextFactory();

        // Handle rename: remove the old entry when the key changes
        if (!string.IsNullOrEmpty(dto.PreviousKey) && dto.PreviousKey != dto.Key)
        {
            var old = db.FlagEntries.FirstOrDefault(f => f.FileId == fileId && f.FlagKey == dto.PreviousKey);
            if (old is not null) db.FlagEntries.Remove(old);
        }

        var existing = db.FlagEntries.FirstOrDefault(f => f.FileId == fileId && f.FlagKey == dto.Key);
        if (existing is null)
        {
            existing = new FlagEntry { FileId = fileId, FlagKey = dto.Key };
            db.FlagEntries.Add(existing);
        }

        existing.Type = dto.Type;
        existing.State = dto.State;
        existing.ValueJson = dto.ValueJson;
        existing.MetadataJson = dto.MetadataJson;
        existing.TargetingJson = dto.TargetingJson;
        db.SaveChanges();

        return ToDto(existing);
    }

    public void DeleteFlag(long fileId, string flagKey)
    {
        using var db = _contextFactory();
        var entry = db.FlagEntries.FirstOrDefault(f => f.FileId == fileId && f.FlagKey == flagKey)
            ?? throw new KeyNotFoundException($"Flag '{flagKey}' not found in file {fileId}");
        db.FlagEntries.Remove(entry);
        db.SaveChanges();
    }

    // ─── Environment management ───────────────────────────────────────────

    public List<EnvironmentEntryDto> GetEnvironments(long fileId)
    {
        using var db = _contextFactory();
        return db.EnvironmentEntries
            .Where(e => e.FileId == fileId)
            .OrderBy(e => e.Name)
            .ToList()
            .Select(ToDto)
            .ToList();
    }

    /// <summary>
    /// Create or update an environment from a <see cref="EnvironmentEntryDto"/>.
    /// The <c>DisplayName</c> is title-cased; the key stored in the DB is its lower-case form.
    /// </summary>
    public EnvironmentEntryDto UpsertEnvironment(long fileId, EnvironmentEntryDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.DisplayName))
            throw new ArgumentException("Environment display name is required");

        var nameLower = dto.DisplayName.ToLowerInvariant();
        using var db = _contextFactory();

        var existing = db.EnvironmentEntries.FirstOrDefault(e => e.FileId == fileId && e.Name == nameLower);
        if (existing is null)
        {
            existing = new EnvironmentEntry { FileId = fileId, Name = nameLower };
            db.EnvironmentEntries.Add(existing);
        }

        existing.AliasesJson = JsonSerializer.Serialize(dto.Aliases, JsonCtx.StringArray);
        db.SaveChanges();

        return ToDto(existing);
    }

    public void DeleteEnvironment(long fileId, string name)
    {
        var nameLower = name.ToLowerInvariant();
        using var db = _contextFactory();
        var entry = db.EnvironmentEntries.FirstOrDefault(e => e.FileId == fileId && e.Name == nameLower)
            ?? throw new KeyNotFoundException($"Environment '{name}' not found in file {fileId}");
        db.EnvironmentEntries.Remove(entry);
        db.SaveChanges();
    }

    // ─── Schema import / export ───────────────────────────────────────────

    /// <summary>
    /// Parse a FlagdSchema JSON string into the database for the given file.
    /// Existing flags and environments for the file are replaced.
    /// </summary>
    public void ImportSchema(long fileId, string schemaJson)
    {
        using var doc = JsonDocument.Parse(schemaJson);
        var root = doc.RootElement;

        using var db = _contextFactory();

        if (!db.FlagFiles.Any(f => f.Id == fileId))
            throw new KeyNotFoundException($"File {fileId} not found");

        // Clear existing data for this file
        db.EnvironmentEntries.RemoveRange(db.EnvironmentEntries.Where(e => e.FileId == fileId));
        db.FlagEntries.RemoveRange(db.FlagEntries.Where(f => f.FileId == fileId));
        db.SaveChanges();

        // Update file-level metadata if present
        if (root.TryGetProperty("metadata", out var schemaMeta))
        {
            var file = db.FlagFiles.Find(fileId);
            if (file is not null)
                file.MetadataJson = schemaMeta.GetRawText();
        }

        // Parse $evaluators → environments  (pattern: "isXxx")
        if (root.TryGetProperty("$evaluators", out var evaluators))
        {
            foreach (var prop in evaluators.EnumerateObject())
            {
                var key = prop.Name;
                if (!key.StartsWith(EnvironmentEvaluatorPrefix) || key.Length <= EnvironmentEvaluatorPrefix.Length)
                    continue;

                if (!prop.Value.TryGetProperty("in", out var inOp) ||
                    inOp.ValueKind != JsonValueKind.Array ||
                    inOp.GetArrayLength() != 2)
                    continue;

                var varPart = inOp[0];
                var aliasesPart = inOp[1];

                if (!varPart.TryGetProperty("var", out var varValue) ||
                    varValue.GetString() != EnvironmentVarName ||
                    aliasesPart.ValueKind != JsonValueKind.Array)
                    continue;

                var envName = key[EnvironmentEvaluatorPrefix.Length..].ToLowerInvariant();
                var aliases = aliasesPart.EnumerateArray()
                    .Select(a => a.GetString() ?? string.Empty)
                    .Where(a => !string.IsNullOrEmpty(a))
                    .ToArray();

                db.EnvironmentEntries.Add(new EnvironmentEntry
                {
                    FileId = fileId,
                    Name = envName,
                    AliasesJson = JsonSerializer.Serialize(aliases, JsonCtx.StringArray),
                });
            }
        }

        // Parse flags
        if (root.TryGetProperty("flags", out var flags))
        {
            foreach (var flagProp in flags.EnumerateObject())
            {
                var flagKey = flagProp.Name;
                var flagDef = flagProp.Value;

                var state = flagDef.TryGetProperty("state", out var stateProp)
                    ? stateProp.GetString() ?? "ENABLED"
                    : "ENABLED";

                var flagType = "object";
                string? valueJson = null;

                if (flagDef.TryGetProperty("variants", out var variants) &&
                    flagDef.TryGetProperty("defaultVariant", out var defaultVariant))
                {
                    var defaultVariantKey = defaultVariant.GetString();
                    if (!string.IsNullOrEmpty(defaultVariantKey) &&
                        variants.TryGetProperty(defaultVariantKey, out var defaultValue))
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

                string? metadataJson = flagDef.TryGetProperty("metadata", out var meta)
                    ? meta.GetRawText() : null;

                string? targetingJson = flagDef.TryGetProperty("targeting", out var targeting)
                    ? targeting.GetRawText() : null;

                db.FlagEntries.Add(new FlagEntry
                {
                    FileId = fileId,
                    FlagKey = flagKey,
                    Type = flagType,
                    State = state,
                    ValueJson = valueJson,
                    MetadataJson = metadataJson,
                    TargetingJson = targetingJson,
                });
            }
        }

        db.SaveChanges();
    }

    /// <summary>
    /// Reconstruct and return a FlagdSchema JSON string from the database state.
    /// </summary>
    public string ExportSchema(long fileId)
    {
        using var db = _contextFactory();

        var file = db.FlagFiles.Find(fileId)
            ?? throw new KeyNotFoundException($"File {fileId} not found");

        var environments = db.EnvironmentEntries
            .Where(e => e.FileId == fileId)
            .OrderBy(e => e.Name)
            .ToList();

        var flagEntries = db.FlagEntries
            .Where(f => f.FileId == fileId)
            .OrderBy(f => f.FlagKey)
            .ToList();

        using var stream = new MemoryStream();
        using var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = true });

        writer.WriteStartObject();
        writer.WriteString("$schema", "https://flagd.dev/schema/v0/flags.json");

        // flags
        writer.WritePropertyName("flags");
        writer.WriteStartObject();
        foreach (var flag in flagEntries)
        {
            writer.WritePropertyName(flag.FlagKey);
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
                var aliases = JsonSerializer.Deserialize(env.AliasesJson, JsonCtx.StringArray) ?? [];

                writer.WritePropertyName(refKey);
                writer.WriteStartObject();
                writer.WritePropertyName("in");
                writer.WriteStartArray();
                writer.WriteStartObject();
                writer.WriteString("var", EnvironmentVarName);
                writer.WriteEndObject();
                writer.WriteStartArray();
                foreach (var alias in aliases) writer.WriteStringValue(alias);
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

        return Encoding.UTF8.GetString(stream.ToArray());
    }

    // ─── Private helpers ──────────────────────────────────────────────────

    private static FlagFileDto ToDto(FlagFile f) =>
        new(f.Id, f.Name, f.CreatedAt, f.MetadataJson);

    private static FlagEntryDto ToDto(FlagEntry e) =>
        new(e.FlagKey, e.Type, e.State, e.ValueJson, e.MetadataJson, e.TargetingJson);

    private static EnvironmentEntryDto ToDto(EnvironmentEntry e)
    {
        var aliases = JsonSerializer.Deserialize(e.AliasesJson, FlagdJsonContext.Default.StringArray) ?? [];
        var displayName = string.IsNullOrEmpty(e.Name)
            ? e.Name
            : char.ToUpperInvariant(e.Name[0]) + e.Name[1..];
        return new EnvironmentEntryDto(e.Name, displayName, aliases);
    }

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
