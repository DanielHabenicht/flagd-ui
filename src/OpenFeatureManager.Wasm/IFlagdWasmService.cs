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
    FlagsCollectionDto GetCollection(string id);
    FlagsCollectionDto CreateCollection(string name);
    FlagsCollectionDto RenameCollection(string id, string name);
    void DeleteCollection(string id);
    void ClearCollectionData(string collectionId);
    void UpdateCollectionMetadata(string collectionId, MetadataEntryDto[] metadata);

    // ─── Flags ────────────────────────────────────────────────────────

    FlagEntryDto[] GetFlags(string collectionId);
    FlagEntryDto UpsertFlag(string collectionId, FlagEntryDto dto);
    void DeleteFlag(string collectionId, string flagKey);

    // ─── Environments ─────────────────────────────────────────────────

    EnvironmentEntryDto[] GetEnvironments(string collectionId);
    EnvironmentEntryDto UpsertEnvironment(string collectionId, EnvironmentEntryDto dto);
    void DeleteEnvironment(string collectionId, string name);

    // ─── Time Windows ─────────────────────────────────────────────────

    TimeWindowDto[] GetTimeWindows(string collectionId);
    TimeWindowDto CreateTimeWindow(string collectionId, TimeWindowDto dto);
    TimeWindowDto UpdateTimeWindow(string collectionId, string timeWindowId, TimeWindowDto dto);
    void DeleteTimeWindow(string collectionId, string timeWindowId);

    // ─── Schema ───────────────────────────────────────────────────────

    string ExportSchema(string collectionId);
    void ImportSchema(string collectionId, string schemaJson);

    PerEnvironmentDefinitionDto Dummy();
}
