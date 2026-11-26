# SaveApp.AppHost

The .NET Aspire orchestrator for local development. One command starts the whole system and wires the services together with connection strings and environment variables.

```bash
aspire run        # from the repo root (aspire.config.json points here)
```

## Architecture

```mermaid
flowchart LR
    subgraph Containers
        PG[("postgres<br/>image: postgres-vector")]
        PGA[pgAdmin]
        OL["ollama<br/>nomic-embed-text, qwen3:4b-instruct-2507"]
        KC["keycloak :8443<br/>realm import ./Realms"]
    end

    subgraph Processes
        CS["collections-service<br/>(CollectionsDB project)"]
        GW["gateway :8000<br/>./gradlew bootRun"]
        UI["SaveAppUI / save-app-web :4200<br/>nx serve -c aspire"]
    end

    PGA --- PG
    CS -->|"CollectionsDB__ConnectionString"| PG
    CS -->|"Embedding__* / Llm__*"| OL
    GW -->|"COLLECTIONS_DB_URL"| CS
    GW -->|"KEYCLOAK_ISSUER_URI / JWK_SET_URI"| KC
    UI -->|"/api proxy"| GW
    UI -.->|login| KC
```

Startup order: `collections-service` waits for the database, and `gateway` waits for Keycloak.

### Ollama

The server is a CPU-only laptop, so `ollama` runs with `OLLAMA_KEEP_ALIVE=-1` (never unload a model; a reload took ~30 s and thrashed the disk), `OLLAMA_MAX_LOADED_MODELS=2` (embedding and answer model stay loaded together) and `OLLAMA_NUM_PARALLEL=1` (one KV cache). The answer model is `qwen3:4b-instruct-2507-q4_K_M` (~2.5 GB), picked to keep RAM free. `collections-service` waits for both models to be pulled before it starts. The container is persistent: if it keeps old env values after a change, `docker rm` it once (the model volume stays).

### Telemetry

The Aspire dashboard receives traces, metrics and logs from the backend services. A request shows as one trace: gateway → collections-service → Postgres/Ollama.

| Resource | How |
|---|---|
| `collections-service` | [SaveApp.ServiceDefaults](../SaveApp.ServiceDefaults/README.md) |
| `gateway` | OpenTelemetry Java agent, from `WithOtlpExporter()`. Java doesn't trust the dashboard's ASP.NET dev certificate, so `WithCertificateTrustConfiguration` passes Aspire's CA bundle as `OTEL_EXPORTER_OTLP_CERTIFICATE`. |
| `keycloak` | Keycloak's built-in OpenTelemetry. `WithKeycloakTelemetry()` (`KeycloakTelemetryExtensions.cs`) maps the `OTEL_*` values onto `KC_TRACING_*` / `KC_TELEMETRY_*` (including the API-key header), enables the `opentelemetry-logs` and `opentelemetry-metrics` features, and sets `KC_TRUSTSTORE_PATHS` to Aspire's CA bundle. |

Use `aspire otel logs|spans|traces <resource>` to read telemetry from the terminal.

## Configuration

`appsettings.json` → `App` section:

| Key | Effect |
|---|---|
| `AuthenticationEnabled` | Passed to the gateway as `APP_SECURITY_ENABLED`. |
| `Realm`, `ClientId` | Keycloak realm (`save-app`) and the web client. |
| `KeycloakUrl` / `KeycloakPublicUrl` | Both are accepted token issuers. The public URL is the Tailscale host, which the mobile app uses. |
| `IsPersistent` | When `true`, Postgres and Keycloak get data volumes. When `false`, all data is lost on restart. |

`Realms/save-app-realm.json` is imported into Keycloak at startup. It defines the `save-app` realm, the public PKCE clients `save-app-ui` and `save-app-mobile`, and their redirect URIs (web origins, `capacitor://localhost`, `com.aviv.saveapp:/…`).

## Prerequisites

- Build the Postgres image: `docker build -f CollectionsDB/Dockerfile.postgres -t postgres-vector CollectionsDB`
- `npm install` in `SaveApp-UI/`. The AppHost runs it with `install: false`, so it won't install for you.
- JDK 25 for the gateway.
