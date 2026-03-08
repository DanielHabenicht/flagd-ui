using OpenFeatureManager.Data;
using OpenFeatureManager.Services;

namespace OpenFeatureManager.Wasm;

/// <summary>
/// Shared singleton holding the database manager and lazily-created services.
/// Services become available after <see cref="InitializeServices"/> is called
/// (triggered by <see cref="IDatabaseWasmService.InitDatabase"/> or
/// <see cref="IDatabaseWasmService.ImportDatabase"/>).
/// </summary>
public class WasmRuntime
{
    private const string ConnectionString = "Data Source=FlagdDb;Mode=Memory;Cache=Shared";

    public DatabaseManager DbManager { get; } = new(ConnectionString);
    public FlagdService? FlagdService { get; private set; }
    public FlagdSchemaService? SchemaService { get; private set; }

    public void InitializeServices()
    {
        FlagdService = new FlagdService(() => new FlagdDbContext(ConnectionString));
        SchemaService = new FlagdSchemaService(FlagdService);
    }

    public FlagdService RequireService() =>
        FlagdService ?? throw new InvalidOperationException("Database not initialized. Call InitDatabase first.");

    public FlagdSchemaService RequireSchemaService() =>
        SchemaService ?? throw new InvalidOperationException("Database not initialized. Call InitDatabase first.");
}
