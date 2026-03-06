using Microsoft.Data.Sqlite;

namespace OpenFeatureManager;

/// <summary>
/// Manages SQLite in-memory database lifecycle: initialization, export, and import.
/// Used by the WASM project for IndexedDB persistence and available to any host
/// that needs raw database backup/restore.
/// </summary>
public class DatabaseManager
{
    private readonly string _connectionString;
    private SqliteConnection? _keepAliveConnection;

    public DatabaseManager(string connectionString)
    {
        _connectionString = connectionString;
    }

    /// <summary>Gets the keep-alive connection (null until <see cref="InitializeDatabase"/> is called).</summary>
    public SqliteConnection? KeepAliveConnection => _keepAliveConnection;

    /// <summary>
    /// Open a keep-alive connection and ensure the schema is created.
    /// Required for in-memory SQLite databases to prevent the DB from being destroyed.
    /// </summary>
    public void InitializeDatabase()
    {
        _keepAliveConnection = new SqliteConnection(_connectionString);
        _keepAliveConnection.Open();
        using var db = new FlagdDbContext(_connectionString);
        db.Database.EnsureCreated();
    }

    /// <summary>Restore the database from raw SQLite bytes previously exported via <see cref="ExportDatabase"/>.</summary>
    public void ImportDatabase(byte[] data)
    {
        _keepAliveConnection = new SqliteConnection(_connectionString);
        _keepAliveConnection.Open();
        using (var db = new FlagdDbContext(_connectionString))
        {
            db.Database.EnsureCreated();
        }

        var tempPath = Path.GetTempFileName();
        File.WriteAllBytes(tempPath, data);
        using var source = new SqliteConnection($"Data Source={tempPath}");
        source.Open();
        source.BackupDatabase(_keepAliveConnection);
        source.Close();
        try { File.Delete(tempPath); } catch { /* best effort */ }
    }

    /// <summary>Export the in-memory database as raw bytes for persistence (e.g. IndexedDB).</summary>
    public byte[] ExportDatabase()
    {
        if (_keepAliveConnection is null) return [];

        var tempPath = Path.GetTempFileName();
        try
        {
            using var dest = new SqliteConnection($"Data Source={tempPath}");
            dest.Open();
            _keepAliveConnection.BackupDatabase(dest);
            dest.Close();
            return File.ReadAllBytes(tempPath);
        }
        finally
        {
            try { File.Delete(tempPath); } catch { /* best effort */ }
        }
    }
}
