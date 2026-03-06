using NJsonSchema;
using NJsonSchema.CodeGeneration;
using NJsonSchema.CodeGeneration.CSharp;

if (args.Length < 2)
{
    Console.Error.WriteLine("Usage: OpenFeatureManager.SchemaGenerator <schema-path> <output-path>");
    return 1;
}

var schemaPath = Path.GetFullPath(args[0]);
var outputPath = Path.GetFullPath(args[1]);

if (!File.Exists(schemaPath))
{
    Console.Error.WriteLine($"Schema file not found: {schemaPath}");
    return 1;
}

var schema = await JsonSchema.FromFileAsync(schemaPath);

var settings = new CSharpGeneratorSettings
{
    Namespace = "OpenFeatureManager.Generated",
    GenerateDataAnnotations = false,
    GenerateJsonMethods = false,
    ClassStyle = CSharpClassStyle.Poco,
    JsonLibrary = CSharpJsonLibrary.SystemTextJson,
    GenerateOptionalPropertiesAsNullable = true,
    GenerateNullableReferenceTypes = true,
    PropertyNameGenerator = new OperatorSafePropertyNameGenerator(),
};

var generator = new CSharpGenerator(schema, settings);
var code = generator.GenerateFile();

// Post-process: NJsonSchema cannot always resolve complex oneOf/anyOf union types.
// Replace missing "Anonymous4" (the "args" union) with System.Text.Json.JsonElement.
code = code.Replace("Anonymous4", "System.Text.Json.JsonElement");

// Post-process: fix duplicate enum member names for semver operators "~" and "^".
code = code.Replace(
    """
            [System.Runtime.Serialization.EnumMember(Value = @"~")]
            _ = 6,


            [System.Runtime.Serialization.EnumMember(Value = @"^")]
            _ = 7,
    """,
    """
            [System.Runtime.Serialization.EnumMember(Value = @"~")]
            MatchMinor = 6,


            [System.Runtime.Serialization.EnumMember(Value = @"^")]
            MatchMajor = 7,
    """);

Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
await File.WriteAllTextAsync(outputPath, code);

Console.WriteLine($"Generated schema classes to: {outputPath}");
return 0;

/// <summary>
/// Converts JSONLogic operator property names (==, !=, &lt;, etc.) into valid C# identifiers.
/// </summary>
sealed class OperatorSafePropertyNameGenerator : IPropertyNameGenerator
{
    private static readonly Dictionary<string, string> OperatorMap = new()
    {
        ["=="] = "Equal",
        ["==="] = "StrictEqual",
        ["!="] = "NotEqual",
        ["!=="] = "StrictNotEqual",
        ["<"] = "LessThan",
        ["<="] = "LessThanOrEqual",
        [">"] = "GreaterThan",
        [">="] = "GreaterThanOrEqual",
        ["%"] = "Modulo",
        ["/"] = "Divide",
        ["*"] = "Multiply",
        ["+"] = "Add",
        ["-"] = "Subtract",
        ["!"] = "Not",
        ["!!"] = "DoubleNot",
    };

    public string Generate(JsonSchemaProperty property)
    {
        var name = property.Name;
        if (OperatorMap.TryGetValue(name, out var mapped))
            return mapped;
        return ConversionUtilities.ConvertToUpperCamelCase(name.Replace("$", string.Empty)
            .Replace("@", string.Empty), firstCharacterMustBeAlpha: true);
    }
}
