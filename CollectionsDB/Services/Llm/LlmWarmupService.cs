namespace CollectionsDB.Services.Llm;

/// <summary>
/// Loads the answer model once at startup, in the background, so the first search
/// doesn't pay the model load. Failure is only logged: the first search then loads it.
/// </summary>
public sealed class LlmWarmupService(
    IServiceScopeFactory scopeFactory,
    ILogger<LlmWarmupService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var answers = scope.ServiceProvider.GetRequiredService<OllamaCardAnswerService>();
            await answers.WarmUpAsync(stoppingToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "LLM warm-up failed; the first search will load the model");
        }
    }
}
