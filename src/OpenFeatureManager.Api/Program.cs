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

builder.Services.AddOpenApi("openapi");

var app = builder.Build();

// Ensure database is created on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<FlagdDbContext>();
    db.Database.EnsureCreated();
}

app.MapOpenApi();

// ─── Collection endpoints ─────────────────────────────────────────────

app.MapGet("/api/collections", (FlagdService svc) => TypedResults.Ok(svc.GetCollections()))
    .WithName("listCollections").WithTags("collections");

app.MapPost("/api/collections", (CreateCollectionRequest req, FlagdService svc) =>
{
    var collection = svc.CreateCollection(req.Name);
    return TypedResults.Created($"/api/collections/{collection.Id}", collection);
}).WithName("createCollection").WithTags("collections");

app.MapPut("/api/collections/{id}", (long id, RenameCollectionRequest req, FlagdService svc) =>
    TypedResults.Ok(svc.RenameCollection(id, req.Name)))
    .WithName("renameCollection").WithTags("collections");

app.MapDelete("/api/collections/{id}", (long id, FlagdService svc) =>
{
    svc.DeleteCollection(id);
    return TypedResults.NoContent();
}).WithName("deleteCollection").WithTags("collections");

// ─── Flag endpoints ───────────────────────────────────────────────────

app.MapGet("/api/collections/{id}/flags", (long id, FlagdService svc) =>
    TypedResults.Ok(svc.GetFlags(id)))
    .WithName("getFlags").WithTags("flags");

app.MapPost("/api/collections/{id}/flags", (long id, FlagEntryDto dto, FlagdService svc) =>
    TypedResults.Ok(svc.UpsertFlag(id, dto)))
    .WithName("createFlag").WithTags("flags");

app.MapPut("/api/collections/{id}/flags", (long id, FlagEntryDto dto, FlagdService svc) =>
    TypedResults.Ok(svc.UpsertFlag(id, dto)))
    .WithName("updateFlag").WithTags("flags");

app.MapDelete("/api/collections/{id}/flags/{key}", (long id, string key, FlagdService svc) =>
{
    svc.DeleteFlag(id, Uri.UnescapeDataString(key));
    return TypedResults.NoContent();
}).WithName("deleteFlag").WithTags("flags");

// ─── Environment endpoints ────────────────────────────────────────────

app.MapGet("/api/collections/{id}/environments", (long id, FlagdService svc) =>
    TypedResults.Ok(svc.GetEnvironments(id)))
    .WithName("getEnvironments").WithTags("environments");

app.MapPost("/api/collections/{id}/environments", (long id, EnvironmentEntryDto dto, FlagdService svc) =>
    TypedResults.Ok(svc.UpsertEnvironment(id, dto)))
    .WithName("createEnvironment").WithTags("environments");

app.MapPut("/api/collections/{id}/environments", (long id, EnvironmentEntryDto dto, FlagdService svc) =>
    TypedResults.Ok(svc.UpsertEnvironment(id, dto)))
    .WithName("updateEnvironment").WithTags("environments");

app.MapDelete("/api/collections/{id}/environments/{name}", (long id, string name, FlagdService svc) =>
{
    svc.DeleteEnvironment(id, Uri.UnescapeDataString(name));
    return TypedResults.NoContent();
}).WithName("deleteEnvironment").WithTags("environments");

// ─── Time window endpoints ────────────────────────────────────────────

app.MapGet("/api/collections/{id}/timewindows", (long id, FlagdService svc) =>
    TypedResults.Ok(svc.GetTimeWindows(id)))
    .WithName("getTimeWindows").WithTags("timewindows");

app.MapPost("/api/collections/{id}/timewindows", (long id, TimeWindowDto dto, FlagdService svc) =>
{
    var tw = svc.CreateTimeWindow(id, dto);
    return TypedResults.Created($"/api/collections/{id}/timewindows/{tw.Id}", tw);
}).WithName("createTimeWindow").WithTags("timewindows");

app.MapPut("/api/collections/{id}/timewindows/{twId}", (long id, long twId, TimeWindowDto dto, FlagdService svc) =>
    TypedResults.Ok(svc.UpdateTimeWindow(id, twId, dto)))
    .WithName("updateTimeWindow").WithTags("timewindows");

app.MapDelete("/api/collections/{id}/timewindows/{twId}", (long id, long twId, FlagdService svc) =>
{
    svc.DeleteTimeWindow(id, twId);
    return TypedResults.NoContent();
}).WithName("deleteTimeWindow").WithTags("timewindows");

// ─── Schema endpoints ─────────────────────────────────────────────────

app.MapGet("/api/collections/{id}/schema", (long id, FlagdSchemaService svc) =>
    TypedResults.Text(svc.ExportSchema(id), "application/json"))
    .WithName("exportSchema").WithTags("schema");

app.MapPost("/api/collections/{id}/schema", async (long id, HttpRequest request, FlagdSchemaService svc) =>
{
    using var reader = new StreamReader(request.Body);
    var body = await reader.ReadToEndAsync();
    svc.ImportSchema(id, body);
    return TypedResults.Ok("Schema imported successfully.");
}).WithName("importSchema").WithTags("schema");

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

record CreateCollectionRequest(string Name);
record RenameCollectionRequest(string Name);
