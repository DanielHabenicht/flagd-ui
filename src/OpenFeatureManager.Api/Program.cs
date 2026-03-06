using Microsoft.EntityFrameworkCore;
using OpenFeatureManager.Data;
using OpenFeatureManager.Models;
using OpenFeatureManager.Services;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Flagd")
    ?? "Data Source=flagd.db";

var schemaPath = builder.Configuration["FlagdSchemaFile"]
    ?? FindSchemaFile();

SchemaValidator? validator = null;
if (schemaPath != null && File.Exists(schemaPath))
    validator = SchemaValidator.CreateAsync(Path.GetFullPath(schemaPath)).GetAwaiter().GetResult();

builder.Services.AddDbContext<FlagdDbContext>(options =>
    options.UseSqlite(connectionString));

builder.Services.AddScoped<FlagdService>(sp =>
    new FlagdService(() => sp.GetRequiredService<FlagdDbContext>()));

builder.Services.AddScoped<FlagdSchemaService>(sp =>
    new FlagdSchemaService(sp.GetRequiredService<FlagdService>(), validator));

var app = builder.Build();

// Ensure database is created on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<FlagdDbContext>();
    db.Database.EnsureCreated();
}

// ─── File endpoints ───────────────────────────────────────────────────

app.MapGet("/api/files", (FlagdService svc) => Results.Ok(svc.GetFiles()));

app.MapPost("/api/files", (CreateFileRequest req, FlagdService svc) =>
    Results.Created($"/api/files/{req.Name}", svc.CreateFile(req.Name)));

app.MapPut("/api/files/{id}", (long id, RenameFileRequest req, FlagdService svc) =>
    Results.Ok(svc.RenameFile(id, req.Name)));

app.MapDelete("/api/files/{id}", (long id, FlagdService svc) =>
{
    svc.DeleteFile(id);
    return Results.NoContent();
});

// ─── Flag endpoints ───────────────────────────────────────────────────

app.MapGet("/api/files/{id}/flags", (long id, FlagdService svc) =>
    Results.Ok(svc.GetFlags(id)));

app.MapPost("/api/files/{id}/flags", (long id, FlagEntryDto dto, FlagdService svc) =>
    Results.Ok(svc.UpsertFlag(id, dto)));

app.MapPut("/api/files/{id}/flags", (long id, FlagEntryDto dto, FlagdService svc) =>
    Results.Ok(svc.UpsertFlag(id, dto)));

app.MapDelete("/api/files/{id}/flags/{key}", (long id, string key, FlagdService svc) =>
{
    svc.DeleteFlag(id, Uri.UnescapeDataString(key));
    return Results.NoContent();
});

// ─── Environment endpoints ────────────────────────────────────────────

app.MapGet("/api/files/{id}/environments", (long id, FlagdService svc) =>
    Results.Ok(svc.GetEnvironments(id)));

app.MapPost("/api/files/{id}/environments", (long id, EnvironmentEntryDto dto, FlagdService svc) =>
    Results.Ok(svc.UpsertEnvironment(id, dto)));

app.MapPut("/api/files/{id}/environments", (long id, EnvironmentEntryDto dto, FlagdService svc) =>
    Results.Ok(svc.UpsertEnvironment(id, dto)));

app.MapDelete("/api/files/{id}/environments/{name}", (long id, string name, FlagdService svc) =>
{
    svc.DeleteEnvironment(id, Uri.UnescapeDataString(name));
    return Results.NoContent();
});

// ─── Schema endpoints ─────────────────────────────────────────────────

app.MapGet("/api/files/{id}/schema", (long id, FlagdSchemaService svc) =>
    Results.Content(svc.ExportSchema(id), "application/json"));

app.MapPost("/api/files/{id}/schema", async (long id, HttpRequest request, FlagdSchemaService svc) =>
{
    using var reader = new StreamReader(request.Body);
    var body = await reader.ReadToEndAsync();
    svc.ImportSchema(id, body);
    return Results.Ok("Schema imported successfully.");
});

app.Run();

// ─── Local helpers ────────────────────────────────────────────────────

static string? FindSchemaFile()
{
    var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
    while (dir != null)
    {
        var candidate = Path.Combine(dir.FullName, "schema", "flagd-schema.json");
        if (File.Exists(candidate))
            return candidate;
        dir = dir.Parent;
    }
    return null;
}

// ─── Request DTOs ─────────────────────────────────────────────────────

record CreateFileRequest(string Name);
record RenameFileRequest(string Name);
