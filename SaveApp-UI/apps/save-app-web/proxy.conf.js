// Dev-server proxy.
// /api  → gateway.
// /otlp → the Aspire dashboard's OTLP/HTTP endpoint, only when Aspire set OTEL_EXPORTER_OTLP_ENDPOINT.
//         The dashboard API key (OTEL_EXPORTER_OTLP_HEADERS) is added here, so it never reaches the browser.
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const otlpHeaders = Object.fromEntries(
  (process.env.OTEL_EXPORTER_OTLP_HEADERS ?? '')
    .split(',')
    .filter((h) => h.includes('='))
    .map((h) => [h.slice(0, h.indexOf('=')).trim(), h.slice(h.indexOf('=') + 1).trim()]),
);

module.exports = {
  '/api': {
    target: 'http://localhost:8000',
    secure: false,
    changeOrigin: true,
  },
  ...(otlpEndpoint && {
    '/otlp': {
      target: otlpEndpoint,
      secure: false, // dashboard uses the ASP.NET dev certificate
      changeOrigin: true,
      pathRewrite: { '^/otlp': '' },
      headers: otlpHeaders,
    },
  }),
};
