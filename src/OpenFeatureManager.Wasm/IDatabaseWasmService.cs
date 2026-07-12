namespace OpenFeatureManager.Wasm;

/// <summary>
/// Database lifecycle operations exposed to JavaScript via Bootsharp.
/// </summary>
public interface IDatabaseWasmService
{
    string InitDatabase();
    string ImportDatabase(byte[] data);
    byte[] ExportDatabase();
}
