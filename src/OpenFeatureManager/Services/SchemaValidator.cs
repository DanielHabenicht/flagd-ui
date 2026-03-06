namespace OpenFeatureManager.Services;

/// <summary>
/// Validates JSON strings against the flagd JSON Schema using NJsonSchema.
/// Create via <see cref="CreateAsync"/> with the path to <c>flagd-schema.json</c>.
/// The schema's relative <c>$ref</c> to <c>targeting.json</c> is resolved automatically
/// when both files are in the same directory.
/// </summary>
public class SchemaValidator
{
    private readonly NJsonSchema.JsonSchema _schema;

    private SchemaValidator(NJsonSchema.JsonSchema schema)
    {
        _schema = schema;
    }

    /// <summary>
    /// Load the flagd JSON Schema from disk. The file's directory is used to
    /// resolve sibling <c>$ref</c> references (e.g. <c>targeting.json</c>).
    /// </summary>
    public static async Task<SchemaValidator> CreateAsync(string schemaFilePath)
    {
        var schema = await NJsonSchema.JsonSchema.FromFileAsync(schemaFilePath);
        return new SchemaValidator(schema);
    }

    /// <summary>
    /// Validate the given JSON string against the schema.
    /// Throws <see cref="SchemaValidationException"/> on failure.
    /// </summary>
    public void ValidateOrThrow(string json)
    {
        var errors = _schema.Validate(json);
        if (errors.Count > 0)
        {
            var details = errors
                .Select(e => $"{e.Path}: {e.Kind}")
                .ToList();
            throw new SchemaValidationException(details);
        }
    }
}

/// <summary>
/// Thrown when a flagd schema JSON document fails validation.
/// </summary>
public class SchemaValidationException : Exception
{
    public IReadOnlyList<string> Errors { get; }

    public SchemaValidationException(IReadOnlyList<string> errors)
        : base($"Schema validation failed with {errors.Count} error(s):{Environment.NewLine}"
              + string.Join(Environment.NewLine, errors.Select(e => $"  {e}")))
    {
        Errors = errors;
    }
}
