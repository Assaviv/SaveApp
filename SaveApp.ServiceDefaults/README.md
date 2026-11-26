# SaveApp.ServiceDefaults

Shared Aspire defaults for the .NET services. `CollectionsService` calls `builder.AddServiceDefaults()` in `Program.cs`.

| Concern | What it wires |
|---|---|
| Traces | ASP.NET Core requests (except `/health`), outgoing `HttpClient` calls (Ollama embeddings and chat), Npgsql SQL commands |
| Metrics | ASP.NET Core, `HttpClient`, .NET runtime (GC, thread pool, …), Npgsql connection pool and command duration |
| Logs | `ILogger` output as OpenTelemetry structured logs |
| Health | `AddHealthChecks()` (the service maps `/health` itself) |

Everything is exported over OTLP, but only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (Aspire sets it). Without it the service runs exactly as before.

The template's `AddStandardResilienceHandler()` is left out on purpose. Its 30 s total timeout would cut off the 2-minute streaming LLM call in `OllamaCardAnswerService`.
