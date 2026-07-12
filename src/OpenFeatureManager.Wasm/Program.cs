using Bootsharp;
using Bootsharp.Inject;
using Microsoft.Extensions.DependencyInjection;
using OpenFeatureManager.Wasm;

[assembly: JSExport(
    typeof(IDatabaseWasmService),
    typeof(IFlagdWasmService))]

public static partial class Program
{
    public static void Main()
    {
        // Ensure trimmer preserves EF Core types needed at runtime
        TrimmerRoots.PreserveTypes();

        new ServiceCollection()
            .AddBootsharp()
            .AddSingleton<WasmRuntime>()
            .AddSingleton<IDatabaseWasmService, DatabaseWasmService>()
            .AddSingleton<IFlagdWasmService, FlagdWasmService>()
            .BuildServiceProvider()
            .RunBootsharp();

        OnReady("Backend .NET runtime initialized.");
    }

    [JSEvent]
    public static partial void OnReady(string message);
}

