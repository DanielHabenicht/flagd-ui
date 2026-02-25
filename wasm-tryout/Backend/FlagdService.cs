using System.Text;
using System.Text.Json;
using Bootsharp;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Backend;

/// <summary>
/// SQLite-backed flagd schema service exposed to JS via Bootsharp.
///
/// This is a C# port of the TypeScript <c>FlagdSchemaAbstraction</c> class that adds:
/// <list type="bullet">
///   <item>Multi-file support – each flag configuration is stored as a <see cref="FlagFile"/> row.</item>
///   <item>Persistent storage – flags and environments live in an EF-Core / SQLite in-memory DB.</item>
///   <item><c>[JSInvokable]</c> surface – every public method is callable from JavaScript via WASM.</item>
/// </list>
/// </summary>
public static class FlagdService
{
    private const string EnvironmentEvaluatorPrefix = "is";
    private const string EnvironmentVarName = "environment";
    private const string BooleanOnVariant = "on";
    private const string DefaultVariant = "default";

    private static SqliteConnection? _keepAliveConnection;
    private static readonly FlagdJsonContext JsonCtx = FlagdJsonContext.Default;
    private const string ConnectionString = "Data Source=FlagdDb;Mode=Memory;Cache=Shared";

    private static FlagdDbContext CreateContext() => new(ConnectionString);

    // ─── Database lifecycle ────────────────────────────────────────────────

    [JSInvokable]
    public static string InitDatabase()
    {
        try
        {
            _keepAliveConnection = new SqliteConnection(ConnectionString);
            _keepAliveConnection.Open();
            using var db = CreateContext();
            db.Database.EnsureCreated();
            return "Database initialized successfully.";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    /// <summary>Restore the database from raw SQLite bytes previously exported via <see cref="ExportDatabase"/>.</summary>
    [JSInvokable]
    public static string ImportDatabase(byte[] data)
    {
        try
        {
            _keepAliveConnection = new SqliteConnection(ConnectionString);
            _keepAliveConnection.Open();
            using (var db = CreateContext())
            {
                db.Database.EnsureCreated();
            }

            var tempPath = Path.GetTempFileName();
            File.WriteAllBytes(tempPath, data);
            using var source = new SqliteConnection($"Data Source={tempPath}");
            source.Open();
            source.BackupDatabase(_keepAliveConnection);
            source.Close();
            try { File.Delete(tempPath); } catch { /* best effort */ }

            return "Database imported successfully.";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    /// <summary>Export the in-memory database as raw bytes for IndexedDB persistence.</summary>
    [JSInvokable]
    public static byte[] ExportDatabase()
    {
        if (_keepAliveConnection is null) return [];

        var tempPath = Path.GetTempFileName();
        try
        {
            using var dest = new SqliteConnection($"Data Source={tempPath}");
            dest.Open();
            _keepAliveConnection.BackupDatabase(dest);
            dest.Close();
            return File.ReadAllBytes(tempPath);
        }
        finally
        {
            try { File.Delete(tempPath); } catch { /* best effort */ }
        }
    }

    // ─── File management ──────────────────────────────────────────────────

    [JSInvokable]
    public static string CreateFile(string name)
    {
        try
        {
            using var db = CreateContext();
            var file = new FlagFile { Name = name };
            db.FlagFiles.Add(file);
            db.SaveChanges();
            return JsonSerializer.Serialize(ToDto(file), JsonCtx.FlagFileDto);
        }
        catch (Exception ex) { return $"Error: {ex.Message}"; }
    }

    [JSInvokable]
    public static string GetFiles()
    {
        try
        {
            using var db = CreateContext();
            var dtos = db.FlagFiles.OrderBy(f => f.Id).ToList().Select(ToDto).ToList();
            return JsonSerializer.Serialize(dtos, JsonCtx.ListFlagFileDto);
        }
        catch (Exception ex) { return $"Error: {ex.Message}"; }
    }

    [JSInvokable]
    public static string RenameFile(long id, string name)
    {
        try
        {
            using var db = CreateContext();
            var file = db.FlagFiles.Find(id);
            if (file is null) return $"Error: File {id} not found";
            file.Name = name;
            db.SaveChanges();
            return JsonSerializer.Serialize(ToDto(file), JsonCtx.FlagFileDto);
        }
        catch (Exception ex) { return $"Error: {ex.Message}"; }
    }

    [JSInvokable]
    public static string DeleteFile(long id)
    {
        try
        {
            using var db = CreateContext();
            var file = db.FlagFiles.Find(id);
            if (file is null) return $"Error: File {id} not found";
            db.FlagEntries.RemoveRange(db.FlagEntries.Where(f => f.FileId == id));
            db.EnvironmentEntries.RemoveRange(db.EnvironmentEntries.Where(e => e.FileId == id));
            db.FlagFiles.Remove(file);
            db.SaveChanges();
            return $"Deleted file {id}";
        }
        catch (Exception ex) { return $"Error: {ex.Message}"; }
    }

    // ─── Flag management ──────────────────────────────────────────────────

    [JSInvokable]
    public static string GetFlags(long fileId)
    {
        try
        {
            using var db = CreateContext();
            var dtos = db.FlagEntries
                .Where(f => f.FileId == fileId)
                .OrderBy(f => f.FlagKey)
                .ToList()
                .Select(ToDto)
                .ToList();
            return JsonSerializer.Serialize(dtos, JsonCtx.ListFlagEntryDto);
        }
        catch (Exception ex) { return $"Error: {ex.Message}"; }
    }

    /// <summary>
    /// Create or update a flag. Pass a JSON-serialised <see cref="FlagEntryDto"/>.
    /// Supports renaming via the optional <c>previousKey</c> field inside the DTO.
    /// </summary>
    [JSInvokable]
    public static string UpsertFlag(long fileId, string flagJson)
    {
        try
        {
            var dto = JsonSerializer.Deserialize(flagJson, JsonCtx.FlagEntryDto);
            if (dto is null) return "Error: Invalid flag JSON";

            using var db = CreateContext();

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

            return JsonSerializer.Serialize(ToDto(existing), JsonCtx.FlagEntryDto);
        }
        catch (Exception ex) { return $"Error: {ex.Message}"; }
    }

    [JSInvokable]
    public static string DeleteFlag(long fileId, string flagKey)
    {
        try
        {
            using var db = CreateContext();
            var entry = db.FlagEntries.FirstOrDefault(f => f.FileId == fileId && f.FlagKey == flagKey);
            if (entry is null) return $"Error: Flag '{flagKey}' not found in file {fileId}";
            db.FlagEntries.Remove(entry);
            db.SaveChanges();
            return $"Deleted flag '{flagKey}'";
        }
        catch (Exception ex) { return $"Error: {ex.Message}"; }
    }

    // ─── Environment management ───────────────────────────────────────────

    [JSInvokable]
    public static string GetEnvironments(long fileId)
    {
        try
        {
            using var db = CreateContext();
            var dtos = db.EnvironmentEntries
                .Where(e => e.FileId == fileId)
                .OrderBy(e => e.Name)
                .ToList()
                .Select(ToDto)
                .ToList();
            return JsonSerializer.Serialize(dtos, JsonCtx.ListEnvironmentEntryDto);
        }
        catch (Exception ex) { return $"Error: {ex.Message}"; }
    }

    /// <summary>
    /// Create or update an environment. Pass a JSON-serialised <see cref="EnvironmentEntryDto"/>.
    /// The <c>displayName</c> is title-cased; the key stored in the DB is its lower-case form.
    /// </summary>
    [JSInvokable]
    public static string UpsertEnvironment(long fileId, string envJson)
    {
        try
        {
            var dto = JsonSerializer.Deserialize(envJson, JsonCtx.EnvironmentEntryDto);
            if (dto is null) return "Error: Invalid environment JSON";

            if (string.IsNullOrWhiteSpace(dto.DisplayName))
                return "Error: Environment display name is required";
            var nameLower = dto.DisplayName.ToLowerInvariant();
            using var db = CreateContext();

            var existing = db.EnvironmentEntries.FirstOrDefault(e => e.FileId == fileId && e.Name == nameLower);
            if (existing is null)
            {
                existing = new EnvironmentEntry { FileId = fileId, Name = nameLower };
                db.EnvironmentEntries.Add(existing);
            }

            existing.AliasesJson = JsonSerializer.Serialize(dto.Aliases, JsonCtx.StringArray);
            db.SaveChanges();

            return JsonSerializer.Serialize(ToDto(existing), JsonCtx.EnvironmentEntryDto);
        }
        catch (Exception ex) { return $"Error: {ex.Message}"; }
    }

    [JSInvokable]
    public static string DeleteEnvironment(long fileId, string name)
    {
        try
        {
            var nameLower = name.ToLowerInvariant();
            using var db = CreateContext();
            var entry = db.EnvironmentEntries.FirstOrDefault(e => e.FileId == fileId && e.Name == nameLower);
            if (entry is null) return $"Error: Environment '{name}' not found in file {fileId}";
            db.EnvironmentEntries.Remove(entry);
            db.SaveChanges();
            return $"Deleted environment '{name}'";
        }
        catch (Exception ex) { return $"Error: {ex.Message}"; }
    }

    // ─── Schema import / export ───────────────────────────────────────────

    /// <summary>
    /// Parse a FlagdSchema JSON string into the database for the given file.
    /// Mirrors <c>FlagdSchemaAbstraction.fromSchema()</c> from TypeScript.
    /// Existing flags and environments for the file are replaced.
    /// </summary>
    [JSInvokable]
    public static string ImportSchema(long fileId, string schemaJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(schemaJson);
            var root = doc.RootElement;

            using var db = CreateContext();

            // Verify the target file exists
            if (!db.FlagFiles.Any(f => f.Id == fileId))
                return $"Error: File {fileId} not found";

            // Clear existing data for this file
            db.EnvironmentEntries.RemoveRange(db.EnvironmentEntries.Where(e => e.FileId == fileId));
            db.FlagEntries.RemoveRange(db.FlagEntries.Where(f => f.FileId == fileId));
            db.SaveChanges();

            // Update file-level metadata if present
            if (root.TryGetProperty("metadata", out var schemaMeta))
            {
                var file = db.FlagFiles.Find(fileId);
                if (file is not null)
                {
                    file.MetadataJson = schemaMeta.GetRawText();
                }
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

                    // Infer flag type and default value from variants + defaultVariant
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
            return "Schema imported successfully.";
        }
        catch (Exception ex) { return $"Error: {ex.Message}"; }
    }

    /// <summary>
    /// Reconstruct and return a FlagdSchema JSON string from the database state.
    /// Mirrors <c>FlagdSchemaAbstraction.exportSchema()</c> from TypeScript.
    /// </summary>
    [JSInvokable]
    public static string ExportSchema(long fileId)
    {
        try
        {
            using var db = CreateContext();

            var file = db.FlagFiles.Find(fileId);
            if (file is null) return $"Error: File {fileId} not found";

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
                    // { "var": "environment" }
                    writer.WriteStartObject();
                    writer.WriteString("var", EnvironmentVarName);
                    writer.WriteEndObject();
                    // aliases array
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
        catch (Exception ex) { return $"Error: {ex.Message}"; }
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
