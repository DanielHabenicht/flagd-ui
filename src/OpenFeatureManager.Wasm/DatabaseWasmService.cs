namespace OpenFeatureManager.Wasm;

public class DatabaseWasmService : IDatabaseWasmService
{
    private readonly WasmRuntime _runtime;

    public DatabaseWasmService(WasmRuntime runtime)
    {
        _runtime = runtime;
    }

    public string InitDatabase()
    {
        try
        {
            _runtime.DbManager.InitializeDatabase();
            _runtime.InitializeServices();
            return "Database initialized successfully.";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    public string ImportDatabase(byte[] data)
    {
        try
        {
            _runtime.DbManager.ImportDatabase(data);
            _runtime.InitializeServices();
            return "Database imported successfully.";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    public byte[] ExportDatabase()
    {
        return _runtime.DbManager.ExportDatabase();
    }
}
