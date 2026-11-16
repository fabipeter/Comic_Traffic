using System.Reflection;
using Xunit;

namespace ComicTraffic.Tests;

public static class TestRunnerProgram
{
    public static async Task<int> Main(string[] args)
    {
        Console.WriteLine("=== ComicTraffic .NET CQRS & Encryption Unit Test Runner ===");
        var testClass = new ComicTrafficBackendTests();
        var methods = typeof(ComicTrafficBackendTests)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .Where(m => m.GetCustomAttribute<FactAttribute>() != null)
            .ToList();

        int passed = 0;
        int failed = 0;

        foreach (var method in methods)
        {
            try
            {
                var result = method.Invoke(testClass, null);
                if (result is Task task)
                {
                    await task;
                }
                Console.WriteLine($"  [PASS] {method.Name}");
                passed++;
            }
            catch (Exception ex)
            {
                var inner = ex.InnerException ?? ex;
                Console.WriteLine($"  [FAIL] {method.Name}: {inner.Message}");
                failed++;
            }
        }

        Console.WriteLine($"=== Summary: {passed} Passed, {failed} Failed (Total: {methods.Count}) ===");
        return failed == 0 ? 0 : 1;
    }
}
