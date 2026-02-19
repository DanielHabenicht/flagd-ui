using System.Text.Json;
using Bootsharp;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Backend;

/// <summary>
/// SQLite-backed todo service using EF Core DbContext, exposed to JS via Bootsharp.
/// The database runs entirely in-memory in the WASM runtime.
/// Raw bytes are synced to IndexedDB from the JS side via Export/ImportDatabase.
/// </summary>
public static class TodoService
{
    private static SqliteConnection? _keepAliveConnection;
    // Use source-generated JSON context for trimming compatibility
    private static readonly TodoJsonContext JsonCtx = TodoJsonContext.Default;

    /// <summary>
    /// The in-memory connection string shared by all DbContext instances.
    /// Using a named in-memory DB + a keep-alive connection so EF can
    /// open/close connections freely without losing the data.
    /// </summary>
    private const string ConnectionString = "Data Source=TodoDb;Mode=Memory;Cache=Shared";

    private static TodoDbContext CreateContext() => new(ConnectionString);

    [JSInvokable]
    public static string InitDatabase()
    {
        try
        {
            // Keep one connection open so the in-memory DB survives DbContext disposal
            _keepAliveConnection = new SqliteConnection(ConnectionString);
            _keepAliveConnection.Open();

            using var db = CreateContext();
            db.Database.EnsureCreated();

            return "Database initialized successfully (EF Core).";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    /// <summary>
    /// Import a previously exported database from IndexedDB bytes.
    /// Restores data into the shared in-memory database via SQLite backup API.
    /// </summary>
    [JSInvokable]
    public static string ImportDatabase(byte[] data)
    {
        try
        {
            // Open the keep-alive connection first
            _keepAliveConnection = new SqliteConnection(ConnectionString);
            _keepAliveConnection.Open();

            // Ensure schema exists
            using (var db = CreateContext())
            {
                db.Database.EnsureCreated();
            }

            // Restore from bytes via temp file + SQLite backup API
            var tempPath = Path.GetTempFileName();
            File.WriteAllBytes(tempPath, data);

            using var source = new SqliteConnection($"Data Source={tempPath}");
            source.Open();
            source.BackupDatabase(_keepAliveConnection);
            source.Close();

            try { File.Delete(tempPath); } catch { /* best effort */ }

            return "Database imported successfully (EF Core).";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    /// <summary>
    /// Export the in-memory database as raw bytes for IndexedDB persistence.
    /// </summary>
    [JSInvokable]
    public static byte[] ExportDatabase()
    {
        if (_keepAliveConnection is null) return Array.Empty<byte>();

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

    [JSInvokable]
    public static string AddTodo(string title)
    {
        try
        {
            using var db = CreateContext();
            var todo = new TodoItem { Title = title };
            db.Todos.Add(todo);
            db.SaveChanges();
            return JsonSerializer.Serialize(todo, JsonCtx.TodoItem);
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    [JSInvokable]
    public static string GetAllTodos()
    {
        try
        {
            using var db = CreateContext();
            var todos = db.Todos.OrderBy(t => t.Id).ToList();
            return JsonSerializer.Serialize(todos, JsonCtx.ListTodoItem);
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    [JSInvokable]
    public static string ToggleTodo(int id)
    {
        try
        {
            using var db = CreateContext();
            var todo = db.Todos.Find((long)id);
            if (todo is null) return $"Todo {id} not found";

            todo.Completed = !todo.Completed;
            db.SaveChanges();
            return $"Toggled todo {id}";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    [JSInvokable]
    public static string DeleteTodo(int id)
    {
        try
        {
            using var db = CreateContext();
            var todo = db.Todos.Find((long)id);
            if (todo is null) return $"Todo {id} not found";

            db.Todos.Remove(todo);
            db.SaveChanges();
            return $"Deleted todo {id}";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    [JSInvokable]
    public static string GetTodoCount()
    {
        try
        {
            using var db = CreateContext();
            var count = db.Todos.Count();
            return $"{{\"count\":{count}}}";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }
}
