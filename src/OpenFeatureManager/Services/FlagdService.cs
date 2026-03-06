using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using OpenFeatureManager.Data;
using OpenFeatureManager.Entities;
using OpenFeatureManager.Models;

namespace OpenFeatureManager.Services;

/// <summary>
/// SQLite-backed flagd CRUD service.
///
/// Provides multi-file flag/environment management.
/// Instantiate with a <see cref="Func{FlagdDbContext}"/> factory so that callers
/// (WASM, REST API, tests) can supply their own DB configuration.
/// </summary>
public class FlagdService
{
    private static readonly FlagdJsonContext JsonCtx = FlagdJsonContext.Default;
    private readonly Func<FlagdDbContext> _contextFactory;

    public FlagdService(Func<FlagdDbContext> contextFactory)
    {
        _contextFactory = contextFactory;
    }

    // ─── File management ──────────────────────────────────────────────────

    public FlagFileDto GetFile(long id)
    {
        using var db = _contextFactory();
        var file = db.FlagFiles.Find(id) ?? throw new KeyNotFoundException($"File {id} not found");
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

    public void ClearFileData(long fileId)
    {
        using var db = _contextFactory();
        if (!db.FlagFiles.Any(f => f.Id == fileId))
            throw new KeyNotFoundException($"File {fileId} not found");
        db.EnvironmentEntries.RemoveRange(db.EnvironmentEntries.Where(e => e.FileId == fileId));
        db.FlagEntries.RemoveRange(db.FlagEntries.Where(f => f.FileId == fileId));
        db.SaveChanges();
    }

    public void UpdateFileMetadata(long fileId, string? metadataJson)
    {
        using var db = _contextFactory();
        var file = db.FlagFiles.Find(fileId) ?? throw new KeyNotFoundException($"File {fileId} not found");
        file.MetadataJson = metadataJson;
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
}
