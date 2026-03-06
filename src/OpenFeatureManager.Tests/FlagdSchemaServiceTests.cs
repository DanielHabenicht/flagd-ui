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
        Assert.Equal("true", flag.ValueJson);
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
        Assert.Equal("\"#FF0000\"", flag.ValueJson);
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
        Assert.Equal("100", flags[0].ValueJson);
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
        // ValueJson should be a valid JSON object
        using var doc = JsonDocument.Parse(flags[0].ValueJson!);
        Assert.Equal("value", doc.RootElement.GetProperty("key").GetString());
    }

    [Fact]
    public void ImportSchema_WithTargeting_StoresTargetingJson()
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
              "targeting": {
                "if": [ true, "on", "off" ]
              }
            }
          }
        }
        """;

        _schemaService.ImportSchema(file.Id, json);

        var flags = _flagdService.GetFlags(file.Id);
        Assert.NotNull(flags[0].TargetingJson);
        using var doc = JsonDocument.Parse(flags[0].TargetingJson!);
        Assert.True(doc.RootElement.TryGetProperty("if", out _));
    }

    [Fact]
    public void ImportSchema_WithFlagMetadata_StoresMetadataJson()
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
        Assert.NotNull(flags[0].MetadataJson);
        using var doc = JsonDocument.Parse(flags[0].MetadataJson!);
        Assert.Equal("team-a", doc.RootElement.GetProperty("owner").GetString());
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

        var prod = envs.First(e => e.Name == "production");
        Assert.Equal("Production", prod.DisplayName);
        Assert.Equal(["prod", "production"], prod.Aliases);

        var staging = envs.First(e => e.Name == "staging");
        Assert.Equal("Staging", staging.DisplayName);
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
        Assert.NotNull(updatedFile.MetadataJson);
        using var doc = JsonDocument.Parse(updatedFile.MetadataJson!);
        Assert.Equal("1.0", doc.RootElement.GetProperty("version").GetString());
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
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("my-flag", "boolean", "ENABLED", "true"));

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
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("color", "string", "ENABLED", "\"red\""));

        var json = _schemaService.ExportSchema(file.Id);

        using var doc = JsonDocument.Parse(json);
        var flag = doc.RootElement.GetProperty("flags").GetProperty("color");
        Assert.Equal("default", flag.GetProperty("defaultVariant").GetString());
        Assert.Equal("red", flag.GetProperty("variants").GetProperty("default").GetString());
    }

    [Fact]
    public void ExportSchema_WithTargeting_IncludesTargetingBlock()
    {
        var file = _flagdService.CreateFile("test");
        var targeting = """{"if":[true,"on","off"]}""";
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("feature", "boolean", "ENABLED", "true", TargetingJson: targeting));

        var json = _schemaService.ExportSchema(file.Id);

        using var doc = JsonDocument.Parse(json);
        var flag = doc.RootElement.GetProperty("flags").GetProperty("feature");
        Assert.True(flag.TryGetProperty("targeting", out var t));
        Assert.True(t.TryGetProperty("if", out _));
    }

    [Fact]
    public void ExportSchema_WithFlagMetadata_IncludesMetadataBlock()
    {
        var file = _flagdService.CreateFile("test");
        var metadata = """{"owner":"team-a"}""";
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("feature", "boolean", "ENABLED", "true", MetadataJson: metadata));

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
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("feature", "boolean", "ENABLED", "true"));
        _flagdService.UpsertEnvironment(file.Id, new EnvironmentEntryDto("production", "Production", ["prod", "production"]));

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
        _flagdService.UpsertFlag(file.Id, new FlagEntryDto("feature", "boolean", "ENABLED", "true"));
        _flagdService.UpdateFileMetadata(file.Id, """{"version":"2.0"}""");

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

    // ─── Invalid schema tests ─────────────────────────────────────────────

    [Fact]
    public void ImportSchema_InvalidJson_Throws()
    {
        var file = _flagdService.CreateFile("test");
        // NJsonSchema validator uses Newtonsoft internally, so invalid JSON
        // throws Newtonsoft.Json.JsonReaderException (via SchemaValidationException
        // or directly). We just assert any exception is thrown.
        Assert.ThrowsAny<Exception>(() => _schemaService.ImportSchema(file.Id, "not json at all"));
    }

    [Fact]
    public void ImportSchema_MissingFlags_ThrowsSchemaValidationException()
    {
        var file = _flagdService.CreateFile("test");
        // Valid JSON but doesn't conform to flagd schema (missing "flags" property)
        var json = """{ "notFlags": {} }""";

        Assert.Throws<SchemaValidationException>(() => _schemaService.ImportSchema(file.Id, json));
    }

    [Fact]
    public void ImportSchema_InvalidFlagDefinition_ThrowsSchemaValidationException()
    {
        var file = _flagdService.CreateFile("test");
        // Flag missing required "variants" and "defaultVariant"
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
        // State must be "ENABLED" or "DISABLED"
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
        // defaultVariant must be a string, not a number
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
