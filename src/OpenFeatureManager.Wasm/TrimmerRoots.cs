using System.Diagnostics.CodeAnalysis;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace OpenFeatureManager.Wasm;

/// <summary>
/// Prevents the trimmer from removing types that EF Core needs via reflection.
/// </summary>
public static class TrimmerRoots
{
    [DynamicDependency(DynamicallyAccessedMemberTypes.All, typeof(EntryCurrentValueComparer<int>))]
    [DynamicDependency(DynamicallyAccessedMemberTypes.All, typeof(EntryCurrentValueComparer<long>))]
    [DynamicDependency(DynamicallyAccessedMemberTypes.All, typeof(EntryCurrentValueComparer<string>))]
    [DynamicDependency(DynamicallyAccessedMemberTypes.All, typeof(EntryCurrentValueComparer<bool>))]
    [DynamicDependency(DynamicallyAccessedMemberTypes.All, typeof(EntryCurrentValueComparer<DateTime>))]
    [DynamicDependency(DynamicallyAccessedMemberTypes.All, typeof(EntryCurrentValueComparer<Guid>))]
    [DynamicDependency(DynamicallyAccessedMemberTypes.All, "Microsoft.EntityFrameworkCore.ChangeTracking.EntryCurrentValueComparer`1", "Microsoft.EntityFrameworkCore")]
    public static void PreserveTypes() { }
}
