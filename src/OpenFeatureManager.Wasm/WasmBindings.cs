using Bootsharp;
using OpenFeatureManager;

namespace OpenFeatureManager.Wasm;

/// <summary>
/// WASM bindings for database lifecycle operations.
/// Exposes InitDatabase, ImportDatabase, and ExportDatabase to JavaScript via Bootsharp.
/// All domain logic lives in <see cref="Backend.Shared.FlagdService"/>.
/// </summary>
public static class WasmBindings
{
    private const string ConnectionString = "Data Source=FlagdDb;Mode=Memory;Cache=Shared";
    private static readonly DatabaseManager DbManager = new(ConnectionString);

    /// <summary>The shared service instance, available after <see cref="InitDatabase"/> or <see cref="ImportDatabase"/>.</summary>
    public static FlagdService? Service { get; private set; }

    [JSInvokable]
    public static string InitDatabase()
    {
        try
        {
            DbManager.InitializeDatabase();
            Service = new FlagdService(() => new FlagdDbContext(ConnectionString));
            return "Database initialized successfully.";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    [JSInvokable]
    public static string ImportDatabase(byte[] data)
    {
        try
        {
            DbManager.ImportDatabase(data);
            Service = new FlagdService(() => new FlagdDbContext(ConnectionString));
            return "Database imported successfully.";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    [JSInvokable]
    public static byte[] ExportDatabase()
    {
        return DbManager.ExportDatabase();
    }
}
