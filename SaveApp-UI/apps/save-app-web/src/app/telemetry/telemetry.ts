import { ErrorHandler, Provider } from '@angular/core';
import { context, metrics, propagation, trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { Metric, onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

export interface TelemetryConfig {
  enabled: boolean;
  serviceName?: string;
  /** Same-origin base URL; the dev-server proxy forwards it to the OTLP/HTTP endpoint with the API key. */
  otlpUrl?: string;
}

/**
 * Browser OpenTelemetry: traces (page load, fetch/XHR, with traceparent sent to /api so a click
 * continues into the gateway and backend), web-vitals metrics, and error logs.
 * Returns the Angular providers to add (an ErrorHandler that also logs to OTLP).
 */
export function initTelemetry(config: TelemetryConfig): Provider[] {
  const url = config.otlpUrl ?? '/otlp';
  const resource = resourceFromAttributes({ 'service.name': config.serviceName ?? 'save-app-web' });

  context.setGlobalContextManager(new ZoneContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  trace.setGlobalTracerProvider(
    new TracerProvider({
      resource,
      spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter({ url: `${url}/v1/traces` }) })],
    }),
  );
  metrics.setGlobalMeterProvider(
    new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({ url: `${url}/v1/metrics` }),
          exportIntervalMillis: 15_000,
        }),
      ],
    }),
  );
  logs.setGlobalLoggerProvider(
    new LoggerProvider({
      resource,
      processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${url}/v1/logs` }) })],
    }),
  );

  // Don't trace the exporters' own requests.
  const ignoreUrls = [new RegExp(`${url}/`)];
  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new FetchInstrumentation({ ignoreUrls }),
      new XMLHttpRequestInstrumentation({ ignoreUrls }),
    ],
  });

  recordWebVitals();
  logs.getLogger('save-app-web').emit({
    severityNumber: SeverityNumber.INFO,
    severityText: 'INFO',
    body: 'Web app started',
    attributes: { 'user_agent.original': navigator.userAgent },
  });

  return [{ provide: ErrorHandler, useClass: TelemetryErrorHandler }];
}

function recordWebVitals(): void {
  const meter = metrics.getMeter('save-app-web');
  const histograms = new Map<string, ReturnType<typeof meter.createHistogram>>();
  const record = ({ name, value, rating }: Metric) => {
    let histogram = histograms.get(name);
    if (!histogram) {
      histogram = meter.createHistogram(`web_vitals.${name.toLowerCase()}`, {
        unit: name === 'CLS' ? '1' : 'ms',
        description: `Web Vitals ${name}`,
      });
      histograms.set(name, histogram);
    }
    histogram.record(value, { rating });
  };
  [onCLS, onFCP, onINP, onLCP, onTTFB].forEach((on) => on(record));
}

/** Logs every uncaught Angular error as an OTLP log record (correlated with the active span), then to the console. */
class TelemetryErrorHandler extends ErrorHandler {
  private readonly logger = logs.getLogger('save-app-web');

  override handleError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: err.message,
      attributes: {
        'exception.type': err.name,
        'exception.message': err.message,
        'exception.stacktrace': err.stack ?? '',
      },
    });
    super.handleError(error);
  }
}
