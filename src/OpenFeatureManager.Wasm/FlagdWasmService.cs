using OpenFeatureManager.Models;

namespace OpenFeatureManager.Wasm;

public class FlagdWasmService : IFlagdWasmService
{
    private readonly WasmRuntime _runtime;

    public FlagdWasmService(WasmRuntime runtime)
    {
        _runtime = runtime;
    }

    // ─── Collections ──────────────────────────────────────────────────

    public FlagsCollectionDto[] GetCollections() =>
        _runtime.RequireService().GetCollections().ToArray();

    public FlagsCollectionDto GetCollection(long id) =>
        _runtime.RequireService().GetCollection(id);

    public FlagsCollectionDto CreateCollection(string name) =>
        _runtime.RequireService().CreateCollection(name);

    public FlagsCollectionDto RenameCollection(long id, string name) =>
        _runtime.RequireService().RenameCollection(id, name);

    public void DeleteCollection(long id) =>
        _runtime.RequireService().DeleteCollection(id);

    public void ClearCollectionData(long collectionId) =>
        _runtime.RequireService().ClearCollectionData(collectionId);

    public void UpdateCollectionMetadata(long collectionId, MetadataEntryDto[] metadata) =>
        _runtime.RequireService().UpdateCollectionMetadata(collectionId, metadata.ToList());

    // ─── Flags ────────────────────────────────────────────────────────

    public FlagEntryDto[] GetFlags(long collectionId) =>
        _runtime.RequireService().GetFlags(collectionId).ToArray();

    public FlagEntryDto UpsertFlag(long collectionId, FlagEntryDto dto) =>
        _runtime.RequireService().UpsertFlag(collectionId, dto);

    public void DeleteFlag(long collectionId, string flagKey) =>
        _runtime.RequireService().DeleteFlag(collectionId, flagKey);

    // ─── Environments ─────────────────────────────────────────────────

    public EnvironmentEntryDto[] GetEnvironments(long collectionId) =>
        _runtime.RequireService().GetEnvironments(collectionId).ToArray();

    public EnvironmentEntryDto UpsertEnvironment(long collectionId, EnvironmentEntryDto dto) =>
        _runtime.RequireService().UpsertEnvironment(collectionId, dto);

    public void DeleteEnvironment(long collectionId, string name) =>
        _runtime.RequireService().DeleteEnvironment(collectionId, name);

    // ─── Time Windows ─────────────────────────────────────────────────

    public TimeWindowDto[] GetTimeWindows(long collectionId) =>
        _runtime.RequireService().GetTimeWindows(collectionId).ToArray();

    public TimeWindowDto CreateTimeWindow(long collectionId, TimeWindowDto dto) =>
        _runtime.RequireService().CreateTimeWindow(collectionId, dto);

    public TimeWindowDto UpdateTimeWindow(long collectionId, long timeWindowId, TimeWindowDto dto) =>
        _runtime.RequireService().UpdateTimeWindow(collectionId, timeWindowId, dto);

    public void DeleteTimeWindow(long collectionId, long timeWindowId) =>
        _runtime.RequireService().DeleteTimeWindow(collectionId, timeWindowId);

    // ─── Schema ───────────────────────────────────────────────────────

    public string ExportSchema(long collectionId) =>
        _runtime.RequireSchemaService().ExportSchema(collectionId);

    public void ImportSchema(long collectionId, string schemaJson) =>
        _runtime.RequireSchemaService().ImportSchema(collectionId, schemaJson);

    public PerEnvironmentDefinitionDto Dummy() => new PerEnvironmentDefinitionDto(BooleanValue: true);
}
