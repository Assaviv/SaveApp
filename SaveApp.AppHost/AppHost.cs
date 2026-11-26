using Microsoft.Extensions.Configuration;

var builder = DistributedApplication.CreateBuilder(args);

var configMap = builder.Configuration.GetSection("App");
var isSecure = configMap.GetValue<bool>("AuthenticationEnabled").ToString().ToLower();
var isPersistent = configMap.GetValue<bool>("IsPersistent");


// DATABSASES: postgres
var postgres = builder.AddPostgres("postgres")
    .WithImageRegistry(null)
    .WithImage("postgres-vector")
    .WithImageTag("latest")
    .WithPgAdmin();

var collectionsDb = postgres.AddDatabase("collections");


// MODELS: nomic-embed-text + answer model
// The server is a CPU-only laptop: keep both models loaded (reloading one costs ~30 s and
// thrashes the disk), and run one request at a time so only one KV cache is allocated.
var ollama = builder.AddOllama("ollama")
    .WithDataVolume()
    .WithLifetime(ContainerLifetime.Persistent)
    .WithEnvironment("OLLAMA_KEEP_ALIVE", "-1")
    .WithEnvironment("OLLAMA_MAX_LOADED_MODELS", "2")
    .WithEnvironment("OLLAMA_NUM_PARALLEL", "1");

var embeddingModel = ollama.AddModel("nomic-embed-text");
const string answerModelName = "qwen3:4b-instruct-2507-q4_K_M";
var answerModel = ollama.AddModel(answerModelName);


// BACKEND: collections-service
var server = builder.AddProject<Projects.CollectionsService>("collections-service")
    .WithReference(collectionsDb)
    .WithEnvironment("CollectionsDB__ConnectionString", collectionsDb.Resource.ConnectionStringExpression)
    .WithEnvironment("Embedding__Endpoint",
        ReferenceExpression.Create($"{ollama.GetEndpoint("http")}/v1/embeddings"))
    .WithEnvironment("Embedding__Model", "nomic-embed-text")
    .WithEnvironment("Llm__Endpoint",
        ReferenceExpression.Create($"{ollama.GetEndpoint("http")}/v1/chat/completions"))
    .WithEnvironment("Llm__Model", answerModelName)
    .WithEnvironment("Llm__OllamaEndpoint",
        ReferenceExpression.Create($"{ollama.GetEndpoint("http")}"))
    .WaitFor(collectionsDb)
    // Start only once both models are pulled, so the warm-up and the first search find them.
    .WaitFor(embeddingModel)
    .WaitFor(answerModel)
    .WithHttpHealthCheck("/health")
    .WithExternalHttpEndpoints(); 


// SECURITY: Keycloak
var keycloakLocal = configMap["KeycloakUrl"];
var keycloakPublic = configMap["KeycloakPublicUrl"];
var realm = configMap["Realm"];

var allowedIssuers = string.Join(",",
    $"{keycloakLocal}/realms/{realm}",
    $"{keycloakPublic}/realms/{realm}");
// var issuer = $"{keycloakUrl}/realms/{configMap["Realm"]}"; 

var keycloak = builder.AddKeycloak("keycloak", 8443)
    // .WithEnvironment("KC_HOSTNAME", keycloakUrl)
    .WithEnvironment("KC_HOSTNAME_STRICT", "false")
    .WithEnvironment("KC_PROXY_HEADERS", "xforwarded")
    .WithRealmImport("./Realms")
    .WithKeycloakTelemetry();

var gateway = builder.AddExecutable("gateway", "./gradlew", "../SaveAppGateway", "bootRun")
    .WithHttpEndpoint(port: 8000, env: "SERVER_PORT", name: "http")
    .WithEnvironment("COLLECTIONS_DB_URL", server.GetEndpoint("http"))
    .WithEnvironment("APP_SECURITY_ENABLED", isSecure)
    // .WithEnvironment("KEYCLOAK_ISSUER_URI", issuer)
    .WithEnvironment("KEYCLOAK_ISSUER_URI", $"{keycloakLocal}/realms/{realm}")
    .WithEnvironment("KEYCLOAK_JWK_SET_URI", $"https://localhost:8443/realms/{realm}/protocol/openid-connect/certs")
    .WithEnvironment("APP_SECURITY_ALLOWED_ISSUERS", allowedIssuers)
    .WithEnvironment("SPRING_PROFILES_ACTIVE", "dev")
    .WithOtlpExporter() // picked up by the OpenTelemetry Java agent (see SaveAppGateway/build.gradle)
    // Java doesn't trust the dashboard's ASP.NET dev certificate; hand the agent Aspire's CA bundle (PEM).
    .WithCertificateTrustConfiguration(ctx =>
    {
        ctx.EnvironmentVariables["OTEL_EXPORTER_OTLP_CERTIFICATE"] = ctx.CertificateBundlePath;
        return Task.CompletedTask;
    })
    .WaitFor(keycloak);


// FRONTEND: SaveApp Mobile, SaveApp Desktop
builder.AddNxApp("SaveAppUI", "../SaveApp-UI")
    .WithNpm(install: false)
    .WithPackageManagerLaunch()
    .AddApp("save-app-web")
    .WithHttpsEndpoint(port: 4200, env: "PORT", isProxied: false)
    .WithExternalHttpEndpoints()
    .WithArgs("-c", "aspire");


// CONDITIONAL BUILD
if (isPersistent)
{
    postgres.WithVolume("collections-pgdata", "/var/lib/postgresql");
    keycloak.WithDataVolume();
}

builder.Build().Run();
