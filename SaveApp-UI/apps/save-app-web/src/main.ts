import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/main/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

async function bootstrap() {
  // Lazy-loaded so the OpenTelemetry SDK is only in the bundle's lazy chunk and only loaded when enabled.
  const telemetryProviders = environment.telemetry.enabled
    ? (await import('./app/telemetry/telemetry')).initTelemetry(environment.telemetry)
    : [];
  await bootstrapApplication(AppComponent, {
    providers: [...appConfig.providers, ...telemetryProviders],
  });
}

bootstrap().catch((err) => console.error(err));
