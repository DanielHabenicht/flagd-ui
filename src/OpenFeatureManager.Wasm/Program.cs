using Bootsharp;
using OpenFeatureManager.Wasm;

public static partial class Program
{
    public static void Main()
    {
        // Ensure trimmer preserves EF Core types needed at runtime
        TrimmerRoots.PreserveTypes();
        OnReady("Backend .NET runtime initialized.");
    }

    [JSEvent]
    public static partial void OnReady(string message);
}

