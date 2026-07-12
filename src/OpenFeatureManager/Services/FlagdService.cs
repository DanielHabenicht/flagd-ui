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

    // ─── Collection management ──────────────────────────────────────────

    public FlagsCollectionDto GetCollection(Guid id)
    {
        using var db = _contextFactory();
        var collection = db.FlagsCollections.Include(f => f.Metadata).FirstOrDefault(f => f.Id == id)
            ?? throw new KeyNotFoundException($"Collection {id} not found");
        return ToDto(collection);
    }

    public FlagsCollectionDto CreateCollection(string name)
    {
        using var db = _contextFactory();
        var collection = new FlagsCollection { Name = name };
        db.FlagsCollections.Add(collection);
        db.SaveChanges();
        return ToDto(collection);
    }

    public List<FlagsCollectionDto> GetCollections()
    {
        using var db = _contextFactory();
        return db.FlagsCollections.Include(f => f.Metadata).OrderBy(f => f.Id).ToList().Select(ToDto).ToList();
    }

    public FlagsCollectionDto RenameCollection(Guid id, string name)
    {
        using var db = _contextFactory();
        var collection = db.FlagsCollections.Include(f => f.Metadata).FirstOrDefault(f => f.Id == id)
            ?? throw new KeyNotFoundException($"Collection {id} not found");
        collection.Name = name;
        db.SaveChanges();
        return ToDto(collection);
    }

    public void DeleteCollection(Guid id)
    {
        using var db = _contextFactory();
        var collection = db.FlagsCollections.Find(id) ?? throw new KeyNotFoundException($"Collection {id} not found");
        db.CollectionMetadataEntries.RemoveRange(db.CollectionMetadataEntries.Where(m => m.CollectionId == id));
        db.FlagEntries.RemoveRange(db.FlagEntries.Where(f => f.CollectionId == id));
        db.EnvironmentEntries.RemoveRange(db.EnvironmentEntries.Where(e => e.CollectionId == id));
        db.TimeWindows.RemoveRange(db.TimeWindows.Where(t => t.CollectionId == id));
        db.FlagsCollections.Remove(collection);
        db.SaveChanges();
    }

    public void ClearCollectionData(Guid collectionId)
    {
        using var db = _contextFactory();
        if (!db.FlagsCollections.Any(f => f.Id == collectionId))
            throw new KeyNotFoundException($"Collection {collectionId} not found");
        db.CollectionMetadataEntries.RemoveRange(db.CollectionMetadataEntries.Where(m => m.CollectionId == collectionId));
        db.EnvironmentEntries.RemoveRange(db.EnvironmentEntries.Where(e => e.CollectionId == collectionId));
        db.FlagEntries.RemoveRange(db.FlagEntries.Where(f => f.CollectionId == collectionId));
        db.TimeWindows.RemoveRange(db.TimeWindows.Where(t => t.CollectionId == collectionId));
        db.SaveChanges();
    }

    public void UpdateCollectionMetadata(Guid collectionId, List<MetadataEntryDto> metadata)
    {
        using var db = _contextFactory();
        var collection = db.FlagsCollections.Find(collectionId) ?? throw new KeyNotFoundException($"Collection {collectionId} not found");

        db.CollectionMetadataEntries.RemoveRange(db.CollectionMetadataEntries.Where(m => m.CollectionId == collectionId));
        foreach (var entry in metadata)
        {
            db.CollectionMetadataEntries.Add(new CollectionMetadataEntry
            {
                CollectionId = collectionId,
                Key = entry.Key,
                StringValue = entry.StringValue,
                NumberValue = entry.NumberValue,
                BooleanValue = entry.BooleanValue
            });
        }
        db.SaveChanges();
    }

    // ─── Flag management ──────────────────────────────────────────────────

    public List<FlagEntryDto> GetFlags(Guid collectionId)
    {
        using var db = _contextFactory();
        var envLookup = db.EnvironmentEntries
            .Where(e => e.CollectionId == collectionId)
            .ToDictionary(e => e.Id, e => e.Name);

        return db.FlagEntries
            .Where(f => f.CollectionId == collectionId)
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
    public FlagEntryDto UpsertFlag(Guid collectionId, FlagEntryDto dto)
    {
        using var db = _contextFactory();

        // Handle rename: remove the old entry when the key changes
        if (!string.IsNullOrEmpty(dto.PreviousKey) && dto.PreviousKey != dto.Key)
        {
            var old = db.FlagEntries.FirstOrDefault(f => f.CollectionId == collectionId && f.FlagKey == dto.PreviousKey);
            if (old is not null) db.FlagEntries.Remove(old);
        }

        var existing = db.FlagEntries
            .Include(f => f.Metadata)
            .Include(f => f.PerEnvironmentDefinitions)
            .FirstOrDefault(f => f.CollectionId == collectionId && f.FlagKey == dto.Key);

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
            existing = CreateFlagEntry(dto.Type, collectionId, dto.Key);
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
                .Where(e => e.CollectionId == collectionId)
                .ToDictionary(e => e.Name, e => e.Id);

            foreach (var (envName, envDef) in dto.PerEnvironmentDefinitions)
            {
                if (!envNameToId.TryGetValue(envName, out var envId))
                    throw new KeyNotFoundException($"Environment '{envName}' not found in collection {collectionId}");

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
            .Where(e => e.CollectionId == collectionId)
            .ToDictionary(e => e.Id, e => e.Name);
        return ToDto(existing, envLookup);
    }

    public void DeleteFlag(Guid collectionId, string flagKey)
    {
        using var db = _contextFactory();
        var entry = db.FlagEntries.FirstOrDefault(f => f.CollectionId == collectionId && f.FlagKey == flagKey)
            ?? throw new KeyNotFoundException($"Flag '{flagKey}' not found in collection {collectionId}");
        db.FlagEntries.Remove(entry);
        db.SaveChanges();
    }

    // ─── Environment management ───────────────────────────────────────────

    public List<EnvironmentEntryDto> GetEnvironments(Guid collectionId)
    {
        using var db = _contextFactory();
        return db.EnvironmentEntries
            .Where(e => e.CollectionId == collectionId)
            .Include(e => e.Aliases)
            .OrderBy(e => e.Name)
            .ToList()
            .Select(ToDto)
            .ToList();
    }

    public EnvironmentEntryDto UpsertEnvironment(Guid collectionId, EnvironmentEntryDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new ArgumentException("Environment name is required");

        using var db = _contextFactory();

        var existing = db.EnvironmentEntries
            .Include(e => e.Aliases)
            .FirstOrDefault(e => e.CollectionId == collectionId && e.Name == dto.Name);

        if (existing is null)
        {
            existing = new EnvironmentEntry
            {
                CollectionId = collectionId,
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

    public void DeleteEnvironment(Guid collectionId, string name)
    {
        using var db = _contextFactory();
        var entry = db.EnvironmentEntries.FirstOrDefault(e => e.CollectionId == collectionId && e.Name == name)
            ?? throw new KeyNotFoundException($"Environment '{name}' not found in collection {collectionId}");
        db.EnvironmentEntries.Remove(entry);
        db.SaveChanges();
    }

    // ─── Time window management ───────────────────────────────────────────

    public List<TimeWindowDto> GetTimeWindows(Guid collectionId)
    {
        using var db = _contextFactory();
        return db.TimeWindows
            .Where(t => t.CollectionId == collectionId)
            .OrderBy(t => t.Name)
            .ToList()
            .Select(ToDto)
            .ToList();
    }

    public TimeWindowDto CreateTimeWindow(Guid collectionId, TimeWindowDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new ArgumentException("Time window name is required");

        using var db = _contextFactory();
        if (!db.FlagsCollections.Any(f => f.Id == collectionId))
            throw new KeyNotFoundException($"Collection {collectionId} not found");

        var tw = new TimeWindow
        {
            CollectionId = collectionId,
            Name = dto.Name,
            StartTime = dto.StartTime,
            EndTime = dto.EndTime
        };
        db.TimeWindows.Add(tw);
        db.SaveChanges();
        return ToDto(tw);
    }

    public TimeWindowDto UpdateTimeWindow(Guid collectionId, Guid timeWindowId, TimeWindowDto dto)
    {
        using var db = _contextFactory();
        var tw = db.TimeWindows.FirstOrDefault(t => t.Id == timeWindowId && t.CollectionId == collectionId)
            ?? throw new KeyNotFoundException($"Time window {timeWindowId} not found in collection {collectionId}");

        tw.Name = dto.Name;
        tw.StartTime = dto.StartTime;
        tw.EndTime = dto.EndTime;
        db.SaveChanges();
        return ToDto(tw);
    }

    public void DeleteTimeWindow(Guid collectionId, Guid timeWindowId)
    {
        using var db = _contextFactory();
        var tw = db.TimeWindows.FirstOrDefault(t => t.Id == timeWindowId && t.CollectionId == collectionId)
            ?? throw new KeyNotFoundException($"Time window {timeWindowId} not found in collection {collectionId}");
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

    private static FlagEntry CreateFlagEntry(string type, Guid collectionId, string flagKey) => type switch
    {
        "boolean" => new BooleanFlagEntry { CollectionId = collectionId, FlagKey = flagKey },
        "string" => new StringFlagEntry { CollectionId = collectionId, FlagKey = flagKey },
        "number" => new NumberFlagEntry { CollectionId = collectionId, FlagKey = flagKey },
        "object" => new ObjectFlagEntry { CollectionId = collectionId, FlagKey = flagKey },
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

    private static FlagsCollectionDto ToDto(FlagsCollection f) =>
        new(f.Id, f.Name, f.CreatedAt,
            f.Metadata.Count > 0
                ? f.Metadata.Select(m => new MetadataEntryDto(m.Key, m.StringValue, m.NumberValue, m.BooleanValue)).ToList()
                : null);

    private static FlagEntryDto ToDto(FlagEntry e, Dictionary<Guid, string> envIdToName)
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
