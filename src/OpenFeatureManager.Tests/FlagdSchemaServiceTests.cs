using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using OpenFeatureManager.Data;
using OpenFeatureManager.Models;
using OpenFeatureManager.Services;

namespace OpenFeatureManager.Tests;

public class FlagdSchemaServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly FlagdService _flagdService;
    private readonly FlagdSchemaService _schemaService;
    private readonly SchemaValidator _validator;

    public FlagdSchemaServiceTests()
    {
        // Shared in-memory SQLite connection (stays open for the test lifetime)
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<FlagdDbContext>()
            .UseSqlite(_connection)
            .Options;

        // Ensure schema exists
        using (var ctx = new FlagdDbContext(options))
            ctx.Database.EnsureCreated();

        _flagdService = new FlagdService(() => new FlagdDbContext(options));

        var schemaPath = FindSchemaFile();
        _validator = SchemaValidator.CreateAsync(schemaPath).GetAwaiter().GetResult();

        _schemaService = new FlagdSchemaService(_flagdService, _validator);
    }

    public void Dispose()
    {
        _connection.Dispose();
        GC.SuppressFinalize(this);
    }

    // ─── Import tests ─────────────────────────────────────────────────────

    [Fact]
    public void ImportSchema_BooleanFlag_StoresCorrectly()
    {
        var file = _flagdService.CreateFile("test");
        var json = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "my-flag": {
              "state": "ENABLED",
              "variants": { "on": true, "off": false },
              "defaultVariant": "on"
            }
          }
        }
        """;

        _schemaService.ImportSchema(file.Id, json);

        var flags = _flagdService.GetFlags(file.Id);
        Assert.Single(flags);
        var flag = flags[0];
        Assert.Equal("my-flag", flag.Key);
        Assert.Equal("boolean", flag.Type);
        Assert.Equal("ENABLED", flag.State);
        Assert.Equal(true, flag.BooleanValue);
    }

    [Fact]
    public void ImportSchema_StringFlag_StoresCorrectly()
    {
        var file = _flagdService.CreateFile("test");
        var json = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "color": {
              "state": "DISABLED",
              "variants": { "red": "#FF0000", "blue": "#0000FF" },
              "defaultVariant": "red"
            }
          }
        }
        """;

        _schemaService.ImportSchema(file.Id, json);

        var flags = _flagdService.GetFlags(file.Id);
        Assert.Single(flags);
        var flag = flags[0];
        Assert.Equal("color", flag.Key);
        Assert.Equal("string", flag.Type);
        Assert.Equal("DISABLED", flag.State);
        Assert.Equal("#FF0000", flag.StringValue);
    }

    [Fact]
    public void ImportSchema_NumberFlag_StoresCorrectly()
    {
        var file = _flagdService.CreateFile("test");
        var json = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "rate-limit": {
              "state": "ENABLED",
              "variants": { "default": 100 },
              "defaultVariant": "default"
            }
          }
        }
        """;

        _schemaService.ImportSchema(file.Id, json);

        var flags = _flagdService.GetFlags(file.Id);
        Assert.Single(flags);
        Assert.Equal("number", flags[0].Type);
        Assert.Equal(100.0, flags[0].NumberValue);
    }

    [Fact]
    public void ImportSchema_ObjectFlag_StoresCorrectly()
    {
        var file = _flagdService.CreateFile("test");
        var json = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "config": {
              "state": "ENABLED",
              "variants": { "default": { "key": "value" } },
              "defaultVariant": "default"
            }
          }
        }
        """;

        _schemaService.ImportSchema(file.Id, json);

        var flags = _flagdService.GetFlags(file.Id);
        Assert.Single(flags);
        Assert.Equal("object", flags[0].Type);
        Assert.NotNull(flags[0].ObjectValue);
        using var doc = JsonDocument.Parse(flags[0].ObjectValue!);
        Assert.Equal("value", doc.RootElement.GetProperty("key").GetString());
    }

    [Fact]
    public void ImportSchema_WithFlagMetadata_StoresMetadata()
    {
        var file = _flagdService.CreateFile("test");
        var json = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "feature": {
              "state": "ENABLED",
              "variants": { "on": true, "off": false },
              "defaultVariant": "on",
              "metadata": { "owner": "team-a" }
            }
          }
        }
        """;

        _schemaService.ImportSchema(file.Id, json);

        var flags = _flagdService.GetFlags(file.Id);
        Assert.NotNull(flags[0].Metadata);
        Assert.Single(flags[0].Metadata!);
        var entry = flags[0].Metadata![0];
        Assert.Equal("owner", entry.Key);
        Assert.Equal("team-a", entry.StringValue);
    }

    [Fact]
    public void ImportSchema_WithEvaluators_StoresEnvironments()
    {
        var file = _flagdService.CreateFile("test");
        var json = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "feature": {
              "state": "ENABLED",
              "variants": { "on": true, "off": false },
              "defaultVariant": "on"
            }
          },
          "$evaluators": {
            "isProduction": {
              "in": [ { "var": "environment" }, [ "prod", "production" ] ]
            },
            "isStaging": {
              "in": [ { "var": "environment" }, [ "staging" ] ]
            }
          }
        }
        """;

        _schemaService.ImportSchema(file.Id, json);

        var envs = _flagdService.GetEnvironments(file.Id);
        Assert.Equal(2, envs.Count);

        var prod = envs.First(e => e.Name == "Production");
        Assert.Equal(["prod", "production"], prod.Aliases);

        var staging = envs.First(e => e.Name == "Staging");
        Assert.Equal(["staging"], staging.Aliases);
    }

    [Fact]
    public void ImportSchema_WithFileMetadata_StoresOnFile()
    {
        var file = _flagdService.CreateFile("test");
        var json = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "feature": {
              "state": "ENABLED",
              "variants": { "on": true, "off": false },
              "defaultVariant": "on"
            }
          },
          "metadata": { "version": "1.0" }
        }
        """;

        _schemaService.ImportSchema(file.Id, json);

        var updatedFile = _flagdService.GetFile(file.Id);
        Assert.NotNull(updatedFile.Metadata);
        Assert.Single(updatedFile.Metadata!);
        Assert.Equal("version", updatedFile.Metadata![0].Key);
        Assert.Equal("1.0", updatedFile.Metadata![0].StringValue);
    }

    [Fact]
    public void ImportSchema_MultipleFlags_StoresAll()
    {
        var file = _flagdService.CreateFile("test");
        var json = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "alpha": {
              "state": "ENABLED",
              "variants": { "on": true, "off": false },
              "defaultVariant": "on"
            },
            "beta": {
              "state": "DISABLED",
              "variants": { "default": "hello" },
              "defaultVariant": "default"
            },
            "gamma": {
              "state": "ENABLED",
              "variants": { "default": 42 },
              "defaultVariant": "default"
            }
          }
        }
        """;

        _schemaService.ImportSchema(file.Id, json);

        var flags = _flagdService.GetFlags(file.Id);
        Assert.Equal(3, flags.Count);
        Assert.Equal("boolean", flags.First(f => f.Key == "alpha").Type);
        Assert.Equal("string", flags.First(f => f.Key == "beta").Type);
        Assert.Equal("number", flags.First(f => f.Key == "gamma").Type);
    }

    [Fact]
    public void ImportSchema_ReplacesExistingData()
    {
        var file = _flagdService.CreateFile("test");

        // First import
        var json1 = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "old-flag": {
              "state": "ENABLED",
              "variants": { "on": true, "off": false },
              "defaultVariant": "on"
            }
          }
        }
        """;
        _schemaService.ImportSchema(file.Id, json1);
        Assert.Single(_flagdService.GetFlags(file.Id));

        // Second import replaces
        var json2 = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "new-flag": {
              "state": "DISABLED",
              "variants": { "default": "value" },
              "defaultVariant": "default"
            }
          }
        }
        """;
        _schemaService.ImportSchema(file.Id, json2);

        var flags = _flagdService.GetFlags(file.Id);
        Assert.Single(flags);
        Assert.Equal("new-flag", flags[0].Key);
    }

    [Fact]
    public void ImportSchema_NonexistentFile_ThrowsKeyNotFoundException()
    {
        var json = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "feature": {
              "state": "ENABLED",
              "variants": { "on": true, "off": false },
              "defaultVariant": "on"
            }
          }
        }
        """;

        Assert.Throws<KeyNotFoundException>(() => _schemaService.ImportSchema(999, json));
    }

    // ─── Export tests ─────────────────────────────────────────────────────

    [Fact]
    public void ExportSchema_BooleanFlag_ProducesValidJson()
    {
        var file = _flagdService.CreateFile("test");
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("my-flag", "boolean", "ENABLED", BooleanValue: true));

        var json = _schemaService.ExportSchema(file.Id);

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        Assert.Equal("https://flagd.dev/schema/v0/flags.json", root.GetProperty("$schema").GetString());

        var flag = root.GetProperty("flags").GetProperty("my-flag");
        Assert.Equal("ENABLED", flag.GetProperty("state").GetString());
        Assert.Equal("on", flag.GetProperty("defaultVariant").GetString());
        Assert.True(flag.GetProperty("variants").GetProperty("on").GetBoolean());
    }

    [Fact]
    public void ExportSchema_NonBooleanFlag_UsesDefaultVariantKey()
    {
        var file = _flagdService.CreateFile("test");
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("color", "string", "ENABLED", StringValue: "red"));

        var json = _schemaService.ExportSchema(file.Id);

        using var doc = JsonDocument.Parse(json);
        var flag = doc.RootElement.GetProperty("flags").GetProperty("color");
        Assert.Equal("default", flag.GetProperty("defaultVariant").GetString());
        Assert.Equal("red", flag.GetProperty("variants").GetProperty("default").GetString());
    }

    [Fact]
    public void ExportSchema_WithFlagMetadata_IncludesMetadataBlock()
    {
        var file = _flagdService.CreateFile("test");
        var metadata = new List<MetadataEntryDto> { new("owner", StringValue: "team-a") };
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("feature", "boolean", "ENABLED", BooleanValue: true, Metadata: metadata));

        var json = _schemaService.ExportSchema(file.Id);

        using var doc = JsonDocument.Parse(json);
        var flag = doc.RootElement.GetProperty("flags").GetProperty("feature");
        Assert.True(flag.TryGetProperty("metadata", out var m));
        Assert.Equal("team-a", m.GetProperty("owner").GetString());
    }

    [Fact]
    public void ExportSchema_WithEnvironments_IncludesEvaluators()
    {
        var file = _flagdService.CreateFile("test");
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("feature", "boolean", "ENABLED", BooleanValue: true));
        _flagdService.UpsertEnvironment(file.Id, new EnvironmentEntryDto("Production", ["prod", "production"]));

        var json = _schemaService.ExportSchema(file.Id);

        using var doc = JsonDocument.Parse(json);
        var evaluators = doc.RootElement.GetProperty("$evaluators");
        var prod = evaluators.GetProperty("isProduction");
        var inArray = prod.GetProperty("in");
        Assert.Equal("environment", inArray[0].GetProperty("var").GetString());
        Assert.Equal("prod", inArray[1][0].GetString());
        Assert.Equal("production", inArray[1][1].GetString());
    }

    [Fact]
    public void ExportSchema_WithFileMetadata_IncludesTopLevelMetadata()
    {
        var file = _flagdService.CreateFile("test");
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("feature", "boolean", "ENABLED", BooleanValue: true));
        _flagdService.UpdateFileMetadata(file.Id, [new MetadataEntryDto("version", StringValue: "2.0")]);

        var json = _schemaService.ExportSchema(file.Id);

        using var doc = JsonDocument.Parse(json);
        var meta = doc.RootElement.GetProperty("metadata");
        Assert.Equal("2.0", meta.GetProperty("version").GetString());
    }

    [Fact]
    public void ExportSchema_EmptyFile_ProducesMinimalValidJson()
    {
        var file = _flagdService.CreateFile("test");

        var json = _schemaService.ExportSchema(file.Id);

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        Assert.Equal("https://flagd.dev/schema/v0/flags.json", root.GetProperty("$schema").GetString());
        Assert.Empty(root.GetProperty("flags").EnumerateObject());
    }

    [Fact]
    public void ExportSchema_NonexistentFile_ThrowsKeyNotFoundException()
    {
        Assert.Throws<KeyNotFoundException>(() => _schemaService.ExportSchema(999));
    }

    // ─── Round-trip tests ─────────────────────────────────────────────────

    [Fact]
    public void ImportThenExport_PreservesFlags()
    {
        var file = _flagdService.CreateFile("test");
        var input = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "bool-flag": {
              "state": "ENABLED",
              "variants": { "on": true, "off": false },
              "defaultVariant": "on"
            },
            "str-flag": {
              "state": "DISABLED",
              "variants": { "a": "hello", "b": "world" },
              "defaultVariant": "a"
            }
          }
        }
        """;

        _schemaService.ImportSchema(file.Id, input);
        var output = _schemaService.ExportSchema(file.Id);

        using var doc = JsonDocument.Parse(output);
        var flags = doc.RootElement.GetProperty("flags");

        // bool flag preserved
        var boolFlag = flags.GetProperty("bool-flag");
        Assert.Equal("ENABLED", boolFlag.GetProperty("state").GetString());
        Assert.True(boolFlag.GetProperty("variants").GetProperty("on").GetBoolean());

        // string flag preserved (import stores only the default variant value)
        var strFlag = flags.GetProperty("str-flag");
        Assert.Equal("DISABLED", strFlag.GetProperty("state").GetString());
    }

    [Fact]
    public void ImportThenExport_PreservesEnvironments()
    {
        var file = _flagdService.CreateFile("test");
        var input = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "feature": {
              "state": "ENABLED",
              "variants": { "on": true, "off": false },
              "defaultVariant": "on"
            }
          },
          "$evaluators": {
            "isStaging": {
              "in": [ { "var": "environment" }, [ "stg", "staging" ] ]
            }
          }
        }
        """;

        _schemaService.ImportSchema(file.Id, input);
        var output = _schemaService.ExportSchema(file.Id);

        using var doc = JsonDocument.Parse(output);
        var evaluators = doc.RootElement.GetProperty("$evaluators");
        var staging = evaluators.GetProperty("isStaging");
        var aliases = staging.GetProperty("in")[1];
        Assert.Equal("stg", aliases[0].GetString());
        Assert.Equal("staging", aliases[1].GetString());
    }

    // ─── Typed flag CRUD tests ────────────────────────────────────────────

    [Fact]
    public void UpsertFlag_BooleanFlag_RoundTrips()
    {
        var file = _flagdService.CreateFile("test");
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("toggle", "boolean", "ENABLED", BooleanValue: true));

        var flags = _flagdService.GetFlags(file.Id);
        Assert.Single(flags);
        Assert.Equal("boolean", flags[0].Type);
        Assert.Equal(true, flags[0].BooleanValue);
        Assert.Null(flags[0].StringValue);
        Assert.Null(flags[0].NumberValue);
        Assert.Null(flags[0].ObjectValue);
    }

    [Fact]
    public void UpsertFlag_StringFlag_RoundTrips()
    {
        var file = _flagdService.CreateFile("test");
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("color", "string", "ENABLED", StringValue: "blue"));

        var flags = _flagdService.GetFlags(file.Id);
        Assert.Single(flags);
        Assert.Equal("string", flags[0].Type);
        Assert.Equal("blue", flags[0].StringValue);
    }

    [Fact]
    public void UpsertFlag_NumberFlag_RoundTrips()
    {
        var file = _flagdService.CreateFile("test");
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("rate", "number", "ENABLED", NumberValue: 42.5));

        var flags = _flagdService.GetFlags(file.Id);
        Assert.Single(flags);
        Assert.Equal("number", flags[0].Type);
        Assert.Equal(42.5, flags[0].NumberValue);
    }

    [Fact]
    public void UpsertFlag_ObjectFlag_RoundTrips()
    {
        var file = _flagdService.CreateFile("test");
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("config", "object", "ENABLED", ObjectValue: """{"a":1}"""));

        var flags = _flagdService.GetFlags(file.Id);
        Assert.Single(flags);
        Assert.Equal("object", flags[0].Type);
        Assert.Equal("""{"a":1}""", flags[0].ObjectValue);
    }

    [Fact]
    public void UpsertFlag_TypeChange_ReplacesEntity()
    {
        var file = _flagdService.CreateFile("test");
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("flag", "boolean", "ENABLED", BooleanValue: true));
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("flag", "string", "ENABLED", StringValue: "hello"));

        var flags = _flagdService.GetFlags(file.Id);
        Assert.Single(flags);
        Assert.Equal("string", flags[0].Type);
        Assert.Equal("hello", flags[0].StringValue);
    }

    [Fact]
    public void UpsertFlag_WithMetadata_StoresAndRetrieves()
    {
        var file = _flagdService.CreateFile("test");
        var metadata = new List<MetadataEntryDto>
        {
            new("owner", StringValue: "team-a"),
            new("priority", NumberValue: 1.0),
            new("active", BooleanValue: true)
        };
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("flag", "boolean", "ENABLED", BooleanValue: true, Metadata: metadata));

        var flags = _flagdService.GetFlags(file.Id);
        Assert.NotNull(flags[0].Metadata);
        Assert.Equal(3, flags[0].Metadata!.Count);
        Assert.Equal("team-a", flags[0].Metadata!.First(m => m.Key == "owner").StringValue);
        Assert.Equal(1.0, flags[0].Metadata!.First(m => m.Key == "priority").NumberValue);
        Assert.Equal(true, flags[0].Metadata!.First(m => m.Key == "active").BooleanValue);
    }

    [Fact]
    public void UpsertFlag_WithPerEnvironmentDefinitions_StoresAndRetrieves()
    {
        var file = _flagdService.CreateFile("test");
        // Environments must exist before referencing them in per-env definitions
        _flagdService.UpsertEnvironment(file.Id, new EnvironmentEntryDto("Production", ["prod"]));
        _flagdService.UpsertEnvironment(file.Id, new EnvironmentEntryDto("Staging", ["staging"]));
        var perEnv = new Dictionary<string, PerEnvironmentDefinitionDto>
        {
            ["Production"] = new(BooleanValue: false),
            ["Staging"] = new(BooleanValue: true)
        };
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("flag", "boolean", "ENABLED", BooleanValue: true, PerEnvironmentDefinitions: perEnv));

        var flags = _flagdService.GetFlags(file.Id);
        Assert.NotNull(flags[0].PerEnvironmentDefinitions);
        Assert.Equal(2, flags[0].PerEnvironmentDefinitions!.Count);
        Assert.Equal(false, flags[0].PerEnvironmentDefinitions!["Production"].BooleanValue);
        Assert.Equal(true, flags[0].PerEnvironmentDefinitions!["Staging"].BooleanValue);
    }

    [Fact]
    public void UpsertFlag_WithGlobalTimeWindow_StoresAndRetrieves()
    {
        var file = _flagdService.CreateFile("test");
        var start = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(2026, 12, 31, 23, 59, 59, DateTimeKind.Utc);
        var tw = _flagdService.CreateTimeWindow(file.Id, new TimeWindowDto(0, "Test Window", start, end));
        var globalTw = new GlobalTimeWindowDto(tw.Id, BooleanValue: false);
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("flag", "boolean", "ENABLED", BooleanValue: true, GlobalTimeWindow: globalTw));

        var flags = _flagdService.GetFlags(file.Id);
        Assert.NotNull(flags[0].GlobalTimeWindow);
        Assert.Equal(tw.Id, flags[0].GlobalTimeWindow!.TimeWindowId);
        Assert.Equal(false, flags[0].GlobalTimeWindow!.BooleanValue);
    }

    // ─── Invalid schema tests ─────────────────────────────────────────────

    [Fact]
    public void ImportSchema_InvalidJson_Throws()
    {
        var file = _flagdService.CreateFile("test");
        Assert.ThrowsAny<Exception>(() => _schemaService.ImportSchema(file.Id, "not json at all"));
    }

    [Fact]
    public void ImportSchema_MissingFlags_ThrowsSchemaValidationException()
    {
        var file = _flagdService.CreateFile("test");
        var json = """{ "notFlags": {} }""";
        Assert.Throws<SchemaValidationException>(() => _schemaService.ImportSchema(file.Id, json));
    }

    [Fact]
    public void ImportSchema_InvalidFlagDefinition_ThrowsSchemaValidationException()
    {
        var file = _flagdService.CreateFile("test");
        var json = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "bad-flag": {
              "state": "ENABLED"
            }
          }
        }
        """;
        Assert.Throws<SchemaValidationException>(() => _schemaService.ImportSchema(file.Id, json));
    }

    [Fact]
    public void ImportSchema_InvalidState_ThrowsSchemaValidationException()
    {
        var file = _flagdService.CreateFile("test");
        var json = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "bad": {
              "state": "BROKEN",
              "variants": { "on": true },
              "defaultVariant": "on"
            }
          }
        }
        """;
        Assert.Throws<SchemaValidationException>(() => _schemaService.ImportSchema(file.Id, json));
    }

    [Fact]
    public void ImportSchema_FlagWithInvalidVariantType_ThrowsSchemaValidationException()
    {
        var file = _flagdService.CreateFile("test");
        var json = """
        {
          "$schema": "https://flagd.dev/schema/v0/flags.json",
          "flags": {
            "bad": {
              "state": "ENABLED",
              "variants": { "on": true },
              "defaultVariant": 42
            }
          }
        }
        """;
        Assert.Throws<SchemaValidationException>(() => _schemaService.ImportSchema(file.Id, json));
    }

    [Fact]
    public void SchemaValidationException_ContainsErrorDetails()
    {
        var file = _flagdService.CreateFile("test");
        var json = """{ "notFlags": {} }""";

        var ex = Assert.Throws<SchemaValidationException>(() => _schemaService.ImportSchema(file.Id, json));
        Assert.NotEmpty(ex.Errors);
        Assert.Contains("error", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // ─── Time window CRUD tests ───────────────────────────────────────────

    [Fact]
    public void CreateTimeWindow_RoundTrips()
    {
        var file = _flagdService.CreateFile("test");
        var start = new DateTime(2026, 12, 24, 0, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(2026, 12, 26, 23, 59, 59, DateTimeKind.Utc);
        var tw = _flagdService.CreateTimeWindow(file.Id, new TimeWindowDto(0, "Christmas Time", start, end));

        Assert.True(tw.Id > 0);
        Assert.Equal("Christmas Time", tw.Name);
        Assert.Equal(start, tw.StartTime);
        Assert.Equal(end, tw.EndTime);
    }

    [Fact]
    public void GetTimeWindows_ReturnsAll()
    {
        var file = _flagdService.CreateFile("test");
        _flagdService.CreateTimeWindow(file.Id, new TimeWindowDto(0, "Window A"));
        _flagdService.CreateTimeWindow(file.Id, new TimeWindowDto(0, "Window B"));

        var windows = _flagdService.GetTimeWindows(file.Id);
        Assert.Equal(2, windows.Count);
    }

    [Fact]
    public void UpdateTimeWindow_ChangesFields()
    {
        var file = _flagdService.CreateFile("test");
        var tw = _flagdService.CreateTimeWindow(file.Id, new TimeWindowDto(0, "Old Name"));
        var newStart = new DateTime(2027, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var updated = _flagdService.UpdateTimeWindow(file.Id, tw.Id, new TimeWindowDto(tw.Id, "New Name", newStart));

        Assert.Equal("New Name", updated.Name);
        Assert.Equal(newStart, updated.StartTime);
    }

    [Fact]
    public void DeleteTimeWindow_RemovesEntry()
    {
        var file = _flagdService.CreateFile("test");
        var tw = _flagdService.CreateTimeWindow(file.Id, new TimeWindowDto(0, "Temporary"));

        _flagdService.DeleteTimeWindow(file.Id, tw.Id);

        Assert.Empty(_flagdService.GetTimeWindows(file.Id));
    }

    [Fact]
    public void PerEnvironmentDefinition_WithTimeWindowReference_RoundTrips()
    {
        var file = _flagdService.CreateFile("test");
        _flagdService.UpsertEnvironment(file.Id, new EnvironmentEntryDto("Production", ["prod"]));
        var tw = _flagdService.CreateTimeWindow(file.Id, new TimeWindowDto(0, "Holiday Window"));
        var perEnv = new Dictionary<string, PerEnvironmentDefinitionDto>
        {
            ["Production"] = new(BooleanValue: false, TimeWindowId: tw.Id)
        };
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("flag", "boolean", "ENABLED", BooleanValue: true, PerEnvironmentDefinitions: perEnv));

        var flags = _flagdService.GetFlags(file.Id);
        Assert.NotNull(flags[0].PerEnvironmentDefinitions);
        Assert.Equal(tw.Id, flags[0].PerEnvironmentDefinitions!["Production"].TimeWindowId);
    }

    // ─── Helper ───────────────────────────────────────────────────────────

    private static string FindSchemaFile()
    {
        var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (dir != null)
        {
            var candidate = Path.Combine(dir.FullName, "schema", "flagd-schema.json");
            if (File.Exists(candidate))
                return candidate;
            dir = dir.Parent;
        }
        throw new FileNotFoundException("Could not find schema/flagd-schema.json");
    }
}
