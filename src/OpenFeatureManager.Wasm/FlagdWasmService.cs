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

    public FlagsCollectionDto GetCollection(string id) =>
        _runtime.RequireService().GetCollection(Guid.Parse(id));

    public FlagsCollectionDto CreateCollection(string name) =>
        _runtime.RequireService().CreateCollection(name);

    public FlagsCollectionDto RenameCollection(string id, string name) =>
        _runtime.RequireService().RenameCollection(Guid.Parse(id), name);

    public void DeleteCollection(string id) =>
        _runtime.RequireService().DeleteCollection(Guid.Parse(id));

    public void ClearCollectionData(string collectionId) =>
        _runtime.RequireService().ClearCollectionData(Guid.Parse(collectionId));

    public void UpdateCollectionMetadata(string collectionId, MetadataEntryDto[] metadata) =>
        _runtime.RequireService().UpdateCollectionMetadata(Guid.Parse(collectionId), metadata.ToList());

    // ─── Flags ────────────────────────────────────────────────────────

    public FlagEntryDto[] GetFlags(string collectionId) =>
        _runtime.RequireService().GetFlags(Guid.Parse(collectionId)).ToArray();

    public FlagEntryDto UpsertFlag(string collectionId, FlagEntryDto dto) =>
        _runtime.RequireService().UpsertFlag(Guid.Parse(collectionId), dto);

    public void DeleteFlag(string collectionId, string flagKey) =>
        _runtime.RequireService().DeleteFlag(Guid.Parse(collectionId), flagKey);

    // ─── Environments ─────────────────────────────────────────────────

    public EnvironmentEntryDto[] GetEnvironments(string collectionId) =>
        _runtime.RequireService().GetEnvironments(Guid.Parse(collectionId)).ToArray();

    public EnvironmentEntryDto UpsertEnvironment(string collectionId, EnvironmentEntryDto dto) =>
        _runtime.RequireService().UpsertEnvironment(Guid.Parse(collectionId), dto);

    public void DeleteEnvironment(string collectionId, string name) =>
        _runtime.RequireService().DeleteEnvironment(Guid.Parse(collectionId), name);

    // ─── Time Windows ─────────────────────────────────────────────────

    public TimeWindowDto[] GetTimeWindows(string collectionId) =>
        _runtime.RequireService().GetTimeWindows(Guid.Parse(collectionId)).ToArray();

    public TimeWindowDto CreateTimeWindow(string collectionId, TimeWindowDto dto) =>
        _runtime.RequireService().CreateTimeWindow(Guid.Parse(collectionId), dto);

    public TimeWindowDto UpdateTimeWindow(string collectionId, string timeWindowId, TimeWindowDto dto) =>
        _runtime.RequireService().UpdateTimeWindow(Guid.Parse(collectionId), Guid.Parse(timeWindowId), dto);

    public void DeleteTimeWindow(string collectionId, string timeWindowId) =>
        _runtime.RequireService().DeleteTimeWindow(Guid.Parse(collectionId), Guid.Parse(timeWindowId));

    // ─── Schema ───────────────────────────────────────────────────────

    public string ExportSchema(string collectionId) =>
        _runtime.RequireSchemaService().ExportSchema(Guid.Parse(collectionId));

    public void ImportSchema(string collectionId, string schemaJson) =>
        _runtime.RequireSchemaService().ImportSchema(Guid.Parse(collectionId), schemaJson);

    public PerEnvironmentDefinitionDto Dummy() => new PerEnvironmentDefinitionDto(BooleanValue: true);
}
