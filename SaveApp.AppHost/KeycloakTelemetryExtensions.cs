// Keycloak ignores the standard OTEL_* variables, so copy what WithOtlpExporter() set onto Keycloak's own
// telemetry options (traces, metrics, logs), including the dashboard API key header.
public static class KeycloakTelemetryExtensions
{
    public static IResourceBuilder<KeycloakResource> WithKeycloakTelemetry(this IResourceBuilder<KeycloakResource> builder)
    {
        return builder
            .WithOtlpExporter()
            .WithEnvironment(context =>
            {
                var env = context.EnvironmentVariables;
                env["KC_FEATURES"] = "opentelemetry-logs,opentelemetry-metrics";
                env["KC_TRACING_ENABLED"] = "true";
                env["KC_METRICS_ENABLED"] = "true";
                env["KC_TELEMETRY_METRICS_ENABLED"] = "true";
                env["KC_TELEMETRY_LOGS_ENABLED"] = "true";
                env["KC_TELEMETRY_ENDPOINT"] = env["OTEL_EXPORTER_OTLP_ENDPOINT"];
                env["KC_TELEMETRY_PROTOCOL"] = env["OTEL_EXPORTER_OTLP_PROTOCOL"];
                env["KC_TELEMETRY_SERVICE_NAME"] = env["OTEL_SERVICE_NAME"];

                // OTEL_EXPORTER_OTLP_HEADERS is "name=value[,name=value]"; Keycloak wants one option per header.
                if (env.TryGetValue("OTEL_EXPORTER_OTLP_HEADERS", out var headers) && headers is string list)
                {
                    foreach (var header in list.Split(',', StringSplitOptions.RemoveEmptyEntries))
                    {
                        var (name, value) = (header[..header.IndexOf('=')], header[(header.IndexOf('=') + 1)..]);
                        env[$"KC_TELEMETRY_HEADER_{name.Replace('-', '_').ToUpperInvariant()}"] = value;
                    }
                }
            })
            // The dashboard's OTLP endpoint uses the ASP.NET dev certificate; let Keycloak trust Aspire's CA bundle.
            .WithCertificateTrustConfiguration(context =>
            {
                context.EnvironmentVariables["KC_TRUSTSTORE_PATHS"] = context.CertificateBundlePath;
                return Task.CompletedTask;
            });
    }
}
