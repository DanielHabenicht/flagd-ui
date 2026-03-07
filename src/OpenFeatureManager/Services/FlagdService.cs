using Microsoft.EntityFrameworkCore;
using OpenFeatureManager.Data;
using OpenFeatureManager.Entities;
using OpenFeatureManager.Models;

namespace OpenFeatureManager.Services;

/// <summary>
/// SQLite-backed flagd CRUD service with typed flag entities.
///
/// Provides multi-file flag/environment management using TPH inheritance
/// for type-safe flag value storage.
/// </summary>
public class FlagdService
{
    private readonly Func<FlagdDbContext> _contextFactory;

    public FlagdService(Func<FlagdDbContext> contextFactory)
    {
        _contextFactory = contextFactory;
    }

    // ─── File management ──────────────────────────────────────────────────

    public FlagFileDto GetFile(long id)
    {
        using var db = _contextFactory();
        var file = db.FlagFiles.Include(f => f.Metadata).FirstOrDefault(f => f.Id == id)
            ?? throw new KeyNotFoundException($"File {id} not found");
        return ToDto(file);
    }

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
        return db.FlagFiles.Include(f => f.Metadata).OrderBy(f => f.Id).ToList().Select(ToDto).ToList();
    }

    public FlagFileDto RenameFile(long id, string name)
    {
        using var db = _contextFactory();
        var file = db.FlagFiles.Include(f => f.Metadata).FirstOrDefault(f => f.Id == id)
            ?? throw new KeyNotFoundException($"File {id} not found");
        file.Name = name;
        db.SaveChanges();
        return ToDto(file);
    }

    public void DeleteFile(long id)
    {
        using var db = _contextFactory();
        var file = db.FlagFiles.Find(id) ?? throw new KeyNotFoundException($"File {id} not found");
        db.FileMetadataEntries.RemoveRange(db.FileMetadataEntries.Where(m => m.FileId == id));
        db.FlagEntries.RemoveRange(db.FlagEntries.Where(f => f.FileId == id));
        db.EnvironmentEntries.RemoveRange(db.EnvironmentEntries.Where(e => e.FileId == id));
        db.TimeWindows.RemoveRange(db.TimeWindows.Where(t => t.FileId == id));
        db.FlagFiles.Remove(file);
        db.SaveChanges();
    }

    public void ClearFileData(long fileId)
    {
        using var db = _contextFactory();
        if (!db.FlagFiles.Any(f => f.Id == fileId))
            throw new KeyNotFoundException($"File {fileId} not found");
        db.FileMetadataEntries.RemoveRange(db.FileMetadataEntries.Where(m => m.FileId == fileId));
        db.EnvironmentEntries.RemoveRange(db.EnvironmentEntries.Where(e => e.FileId == fileId));
        db.FlagEntries.RemoveRange(db.FlagEntries.Where(f => f.FileId == fileId));
        db.TimeWindows.RemoveRange(db.TimeWindows.Where(t => t.FileId == fileId));
        db.SaveChanges();
    }

    public void UpdateFileMetadata(long fileId, List<MetadataEntryDto> metadata)
    {
        using var db = _contextFactory();
        var file = db.FlagFiles.Find(fileId) ?? throw new KeyNotFoundException($"File {fileId} not found");

        db.FileMetadataEntries.RemoveRange(db.FileMetadataEntries.Where(m => m.FileId == fileId));
        foreach (var entry in metadata)
        {
            db.FileMetadataEntries.Add(new FileMetadataEntry
            {
                FileId = fileId,
                Key = entry.Key,
                StringValue = entry.StringValue,
                NumberValue = entry.NumberValue,
                BooleanValue = entry.BooleanValue
            });
        }
        db.SaveChanges();
    }

    // ─── Flag management ──────────────────────────────────────────────────

    public List<FlagEntryDto> GetFlags(long fileId)
    {
        using var db = _contextFactory();
        var envLookup = db.EnvironmentEntries
            .Where(e => e.FileId == fileId)
            .ToDictionary(e => e.Id, e => e.Name);

        return db.FlagEntries
            .Where(f => f.FileId == fileId)
            .Include(f => f.Metadata)
            .Include(f => f.PerEnvironmentDefinitions)
            .OrderBy(f => f.FlagKey)
            .ToList()
            .Select(f => ToDto(f, envLookup))
            .ToList();
    }

    /// <summary>
    /// Create or update a flag from a <see cref="FlagEntryDto"/>.
    /// Supports renaming via the optional <c>PreviousKey</c> field.
    /// If the flag type changes, the existing entity is replaced.
    /// Per-environment definitions are keyed by environment name; the service
    /// resolves names to EnvironmentEntry IDs.
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

        var existing = db.FlagEntries
            .Include(f => f.Metadata)
            .Include(f => f.PerEnvironmentDefinitions)
            .FirstOrDefault(f => f.FileId == fileId && f.FlagKey == dto.Key);

        if (existing is not null)
        {
            var existingType = GetFlagType(existing);
            if (existingType != dto.Type)
            {
                db.FlagEntries.Remove(existing);
                db.SaveChanges();
                existing = null;
            }
        }

        if (existing is null)
        {
            existing = CreateFlagEntry(dto.Type, fileId, dto.Key);
            db.FlagEntries.Add(existing);
        }

        existing.State = Enum.Parse<FlagState>(dto.State);
        existing.GlobalTimeWindowId = dto.GlobalTimeWindow?.TimeWindowId;

        SetFlagValue(existing, dto);
        SetGlobalTimeWindowValue(existing, dto.GlobalTimeWindow);

        // Replace metadata
        db.FlagMetadataEntries.RemoveRange(existing.Metadata);
        existing.Metadata.Clear();
        if (dto.Metadata is not null)
        {
            foreach (var entry in dto.Metadata)
            {
                existing.Metadata.Add(new FlagMetadataEntry
                {
                    Key = entry.Key,
                    StringValue = entry.StringValue,
                    NumberValue = entry.NumberValue,
                    BooleanValue = entry.BooleanValue
                });
            }
        }

        // Replace per-environment definitions (resolve env names → IDs)
        db.PerEnvironmentDefinitions.RemoveRange(existing.PerEnvironmentDefinitions);
        existing.PerEnvironmentDefinitions.Clear();
        if (dto.PerEnvironmentDefinitions is not null)
        {
            var envNameToId = db.EnvironmentEntries
                .Where(e => e.FileId == fileId)
                .ToDictionary(e => e.Name, e => e.Id);

            foreach (var (envName, envDef) in dto.PerEnvironmentDefinitions)
            {
                if (!envNameToId.TryGetValue(envName, out var envId))
                    throw new KeyNotFoundException($"Environment '{envName}' not found in file {fileId}");

                existing.PerEnvironmentDefinitions.Add(new PerEnvironmentDefinition
                {
                    EnvironmentEntryId = envId,
                    BooleanValue = envDef.BooleanValue,
                    StringValue = envDef.StringValue,
                    NumberValue = envDef.NumberValue,
                    ObjectValue = envDef.ObjectValue,
                    TimeWindowId = envDef.TimeWindowId
                });
            }
        }

        db.SaveChanges();

        var envLookup = db.EnvironmentEntries
            .Where(e => e.FileId == fileId)
            .ToDictionary(e => e.Id, e => e.Name);
        return ToDto(existing, envLookup);
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
            .Include(e => e.Aliases)
            .OrderBy(e => e.Name)
            .ToList()
            .Select(ToDto)
            .ToList();
    }

    public EnvironmentEntryDto UpsertEnvironment(long fileId, EnvironmentEntryDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new ArgumentException("Environment name is required");

        using var db = _contextFactory();

        var existing = db.EnvironmentEntries
            .Include(e => e.Aliases)
            .FirstOrDefault(e => e.FileId == fileId && e.Name == dto.Name);

        if (existing is null)
        {
            existing = new EnvironmentEntry
            {
                FileId = fileId,
                Name = dto.Name
            };
            db.EnvironmentEntries.Add(existing);
        }

        // Replace aliases
        db.EnvironmentAliases.RemoveRange(existing.Aliases);
        existing.Aliases.Clear();
        foreach (var alias in dto.Aliases)
        {
            existing.Aliases.Add(new EnvironmentAlias { Alias = alias });
        }

        db.SaveChanges();
        return ToDto(existing);
    }

    public void DeleteEnvironment(long fileId, string name)
    {
        using var db = _contextFactory();
        var entry = db.EnvironmentEntries.FirstOrDefault(e => e.FileId == fileId && e.Name == name)
            ?? throw new KeyNotFoundException($"Environment '{name}' not found in file {fileId}");
        db.EnvironmentEntries.Remove(entry);
        db.SaveChanges();
    }

    // ─── Time window management ───────────────────────────────────────────

    public List<TimeWindowDto> GetTimeWindows(long fileId)
    {
        using var db = _contextFactory();
        return db.TimeWindows
            .Where(t => t.FileId == fileId)
            .OrderBy(t => t.Name)
            .ToList()
            .Select(ToDto)
            .ToList();
    }

    public TimeWindowDto CreateTimeWindow(long fileId, TimeWindowDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new ArgumentException("Time window name is required");

        using var db = _contextFactory();
        if (!db.FlagFiles.Any(f => f.Id == fileId))
            throw new KeyNotFoundException($"File {fileId} not found");

        var tw = new TimeWindow
        {
            FileId = fileId,
            Name = dto.Name,
            StartTime = dto.StartTime,
            EndTime = dto.EndTime
        };
        db.TimeWindows.Add(tw);
        db.SaveChanges();
        return ToDto(tw);
    }

    public TimeWindowDto UpdateTimeWindow(long fileId, long timeWindowId, TimeWindowDto dto)
    {
        using var db = _contextFactory();
        var tw = db.TimeWindows.FirstOrDefault(t => t.Id == timeWindowId && t.FileId == fileId)
            ?? throw new KeyNotFoundException($"Time window {timeWindowId} not found in file {fileId}");

        tw.Name = dto.Name;
        tw.StartTime = dto.StartTime;
        tw.EndTime = dto.EndTime;
        db.SaveChanges();
        return ToDto(tw);
    }

    public void DeleteTimeWindow(long fileId, long timeWindowId)
    {
        using var db = _contextFactory();
        var tw = db.TimeWindows.FirstOrDefault(t => t.Id == timeWindowId && t.FileId == fileId)
            ?? throw new KeyNotFoundException($"Time window {timeWindowId} not found in file {fileId}");
        db.TimeWindows.Remove(tw);
        db.SaveChanges();
    }

    // ─── Private helpers ──────────────────────────────────────────────────

    private static string GetFlagType(FlagEntry entry) => entry switch
    {
        BooleanFlagEntry => "boolean",
        StringFlagEntry => "string",
        NumberFlagEntry => "number",
        ObjectFlagEntry => "object",
        _ => throw new InvalidOperationException($"Unknown flag entry type: {entry.GetType()}")
    };

    private static FlagEntry CreateFlagEntry(string type, long fileId, string flagKey) => type switch
    {
        "boolean" => new BooleanFlagEntry { FileId = fileId, FlagKey = flagKey },
        "string" => new StringFlagEntry { FileId = fileId, FlagKey = flagKey },
        "number" => new NumberFlagEntry { FileId = fileId, FlagKey = flagKey },
        "object" => new ObjectFlagEntry { FileId = fileId, FlagKey = flagKey },
        _ => throw new ArgumentException($"Unknown flag type: {type}")
    };

    private static void SetFlagValue(FlagEntry entry, FlagEntryDto dto)
    {
        switch (entry)
        {
            case BooleanFlagEntry b: b.Value = dto.BooleanValue; break;
            case StringFlagEntry s: s.Value = dto.StringValue; break;
            case NumberFlagEntry n: n.Value = dto.NumberValue; break;
            case ObjectFlagEntry o: o.ObjectValue = dto.ObjectValue; break;
        }
    }

    private static void SetGlobalTimeWindowValue(FlagEntry entry, GlobalTimeWindowDto? tw)
    {
        switch (entry)
        {
            case BooleanFlagEntry b: b.GlobalTimeWindowValue = tw?.BooleanValue; break;
            case StringFlagEntry s: s.GlobalTimeWindowValue = tw?.StringValue; break;
            case NumberFlagEntry n: n.GlobalTimeWindowValue = tw?.NumberValue; break;
            case ObjectFlagEntry o: o.GlobalTimeWindowObjectValue = tw?.ObjectValue; break;
        }
    }

    private static FlagFileDto ToDto(FlagFile f) =>
        new(f.Id, f.Name, f.CreatedAt,
            f.Metadata.Count > 0
                ? f.Metadata.Select(m => new MetadataEntryDto(m.Key, m.StringValue, m.NumberValue, m.BooleanValue)).ToList()
                : null);

    private static FlagEntryDto ToDto(FlagEntry e, Dictionary<long, string> envIdToName)
    {
        var (type, boolVal, strVal, numVal, objVal) = e switch
        {
            BooleanFlagEntry b => ("boolean", b.Value, (string?)null, (double?)null, (string?)null),
            StringFlagEntry s => ("string", (bool?)null, s.Value, (double?)null, (string?)null),
            NumberFlagEntry n => ("number", (bool?)null, (string?)null, n.Value, (string?)null),
            ObjectFlagEntry o => ("object", (bool?)null, (string?)null, (double?)null, o.ObjectValue),
            _ => throw new InvalidOperationException($"Unknown flag entry type: {e.GetType()}")
        };

        var metadata = e.Metadata.Count > 0
            ? e.Metadata.Select(m => new MetadataEntryDto(m.Key, m.StringValue, m.NumberValue, m.BooleanValue)).ToList()
            : null;

        var perEnvDefs = e.PerEnvironmentDefinitions.Count > 0
            ? e.PerEnvironmentDefinitions.ToDictionary(
                d => envIdToName.GetValueOrDefault(d.EnvironmentEntryId, d.EnvironmentEntryId.ToString()),
                d => new PerEnvironmentDefinitionDto(
                    d.BooleanValue, d.StringValue, d.NumberValue, d.ObjectValue,
                    d.TimeWindowId))
            : null;

        GlobalTimeWindowDto? globalTw = null;
        if (e.GlobalTimeWindowId.HasValue)
        {
            var (twBool, twStr, twNum, twObj) = e switch
            {
                BooleanFlagEntry b => (b.GlobalTimeWindowValue, (string?)null, (double?)null, (string?)null),
                StringFlagEntry s => ((bool?)null, s.GlobalTimeWindowValue, (double?)null, (string?)null),
                NumberFlagEntry n => ((bool?)null, (string?)null, n.GlobalTimeWindowValue, (string?)null),
                ObjectFlagEntry o => ((bool?)null, (string?)null, (double?)null, o.GlobalTimeWindowObjectValue),
                _ => ((bool?)null, (string?)null, (double?)null, (string?)null)
            };
            globalTw = new GlobalTimeWindowDto(e.GlobalTimeWindowId.Value, twBool, twStr, twNum, twObj);
        }

        return new FlagEntryDto(
            e.FlagKey, type, e.State.ToString(),
            boolVal, strVal, numVal, objVal,
            metadata, perEnvDefs, globalTw);
    }

    private static EnvironmentEntryDto ToDto(EnvironmentEntry e) =>
        new(e.Name, e.Aliases.Select(a => a.Alias).ToArray());

    private static TimeWindowDto ToDto(TimeWindow t) =>
        new(t.Id, t.Name, t.StartTime, t.EndTime);
}
