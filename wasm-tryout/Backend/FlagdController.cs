using System.Text.Json;
using Bootsharp;

namespace Backend;

/// <summary>
/// REST-style controller that routes incoming requests to <see cref="FlagdService"/> methods.
///
/// Can be called from JavaScript via WASM:
/// <code>Backend.FlagdController.handleRequest('GET', '/api/files', null)</code>
/// or used to simulate a REST API from any other entry-point.
///
/// Route table:
/// <list type="table">
///   <listheader><term>Method + Path</term><description>Action</description></listheader>
///   <item><term>GET  /api/files</term><description>List all files</description></item>
///   <item><term>POST /api/files</term><description>Create file – body: {"name":"…"}</description></item>
///   <item><term>PUT  /api/files/{id}</term><description>Rename file – body: {"name":"…"}</description></item>
///   <item><term>DELETE /api/files/{id}</term><description>Delete file and all its data</description></item>
///   <item><term>GET  /api/files/{id}/flags</term><description>List flags</description></item>
///   <item><term>POST /api/files/{id}/flags</term><description>Upsert flag – body: FlagEntryDto JSON</description></item>
///   <item><term>DELETE /api/files/{id}/flags/{key}</term><description>Delete flag</description></item>
///   <item><term>GET  /api/files/{id}/environments</term><description>List environments</description></item>
///   <item><term>POST /api/files/{id}/environments</term><description>Upsert environment – body: EnvironmentEntryDto JSON</description></item>
///   <item><term>DELETE /api/files/{id}/environments/{name}</term><description>Delete environment</description></item>
///   <item><term>GET  /api/files/{id}/schema</term><description>Export schema as JSON</description></item>
///   <item><term>POST /api/files/{id}/schema</term><description>Import schema – body: FlagdSchema JSON</description></item>
/// </list>
/// </summary>
public static class FlagdController
{
    [JSInvokable]
    public static string HandleRequest(string method, string path, string? body)
    {
        try
        {
            var segments = path.Trim('/').Split('/');

            // Must start with /api/files
            if (segments.Length < 2 || segments[0] != "api" || segments[1] != "files")
                return Error($"Route not found: {method} {path}");

            // /api/files
            if (segments.Length == 2)
            {
                return method.ToUpperInvariant() switch
                {
                    "GET" => FlagdService.GetFiles(),
                    "POST" => FlagdService.CreateFile(ExtractString(body, "name")),
                    _ => Error("Method not allowed"),
                };
            }

            if (!long.TryParse(segments[2], out var fileId))
                return Error("Invalid file ID");

            // /api/files/{id}
            if (segments.Length == 3)
            {
                return method.ToUpperInvariant() switch
                {
                    "PUT" => FlagdService.RenameFile(fileId, ExtractString(body, "name")),
                    "DELETE" => FlagdService.DeleteFile(fileId),
                    _ => Error("Method not allowed"),
                };
            }

            var resource = segments[3];

            // /api/files/{id}/flags[/{key}]
            if (resource == "flags")
            {
                if (segments.Length == 4)
                {
                    return method.ToUpperInvariant() switch
                    {
                        "GET" => FlagdService.GetFlags(fileId),
                        "POST" or "PUT" => FlagdService.UpsertFlag(fileId, body ?? "{}"),
                        _ => Error("Method not allowed"),
                    };
                }

                if (segments.Length == 5 && method.Equals("DELETE", StringComparison.OrdinalIgnoreCase))
                    return FlagdService.DeleteFlag(fileId, Uri.UnescapeDataString(segments[4]));
            }

            // /api/files/{id}/environments[/{name}]
            if (resource == "environments")
            {
                if (segments.Length == 4)
                {
                    return method.ToUpperInvariant() switch
                    {
                        "GET" => FlagdService.GetEnvironments(fileId),
                        "POST" or "PUT" => FlagdService.UpsertEnvironment(fileId, body ?? "{}"),
                        _ => Error("Method not allowed"),
                    };
                }

                if (segments.Length == 5 && method.Equals("DELETE", StringComparison.OrdinalIgnoreCase))
                    return FlagdService.DeleteEnvironment(fileId, Uri.UnescapeDataString(segments[4]));
            }

            // /api/files/{id}/schema
            if (resource == "schema" && segments.Length == 4)
            {
                return method.ToUpperInvariant() switch
                {
                    "GET" => FlagdService.ExportSchema(fileId),
                    "POST" => FlagdService.ImportSchema(fileId, body ?? "{}"),
                    _ => Error("Method not allowed"),
                };
            }

            return Error($"Route not found: {method} {path}");
        }
        catch (Exception ex)
        {
            return Error(ex.Message);
        }
    }

    private static string Error(string message) => $"Error: {message}";

    private static string ExtractString(string? json, string key)
    {
        if (string.IsNullOrEmpty(json)) return string.Empty;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty(key, out var prop))
                return prop.GetString() ?? string.Empty;
        }
        catch { /* ignore */ }
        return string.Empty;
    }
}
