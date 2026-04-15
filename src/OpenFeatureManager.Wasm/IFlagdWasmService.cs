using OpenFeatureManager.Models;

namespace OpenFeatureManager.Wasm;

/// <summary>
/// All flagd domain operations exposed to JavaScript via Bootsharp.
/// Mirrors the endpoints in the ASP.NET API project.
/// </summary>
public interface IFlagdWasmService
{
    // ─── Collections ──────────────────────────────────────────────────

    FlagsCollectionDto[] GetCollections();
    FlagsCollectionDto GetCollection(long id);
    FlagsCollectionDto CreateCollection(string name);
    FlagsCollectionDto RenameCollection(long id, string name);
    void DeleteCollection(long id);
    void ClearCollectionData(long collectionId);
    void UpdateCollectionMetadata(long collectionId, MetadataEntryDto[] metadata);

    // ─── Flags ────────────────────────────────────────────────────────

    FlagEntryDto[] GetFlags(long collectionId);
    FlagEntryDto UpsertFlag(long collectionId, FlagEntryDto dto);
    void DeleteFlag(long collectionId, string flagKey);

    // ─── Environments ─────────────────────────────────────────────────

    EnvironmentEntryDto[] GetEnvironments(long collectionId);
    EnvironmentEntryDto UpsertEnvironment(long collectionId, EnvironmentEntryDto dto);
    void DeleteEnvironment(long collectionId, string name);

    // ─── Time Windows ─────────────────────────────────────────────────

    TimeWindowDto[] GetTimeWindows(long collectionId);
    TimeWindowDto CreateTimeWindow(long collectionId, TimeWindowDto dto);
    TimeWindowDto UpdateTimeWindow(long collectionId, long timeWindowId, TimeWindowDto dto);
    void DeleteTimeWindow(long collectionId, long timeWindowId);

    // ─── Schema ───────────────────────────────────────────────────────

    string ExportSchema(long collectionId);
    void ImportSchema(long collectionId, string schemaJson);

    PerEnvironmentDefinitionDto Dummy();
}
