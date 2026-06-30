import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';

// The SDK automatically resolves OTLP endpoint from the environment variable:
// - OTEL_EXPORTER_OTLP_ENDPOINT (e.g. http://tempo.monitoring:4317)
// - OTEL_SERVICE_NAME (e.g. taskflow-api)
const traceExporter = new OTLPTraceExporter();

const sdk = new NodeSDK({
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy fs operations to keep tracing clean
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
    }),
  ],
});

try {
  sdk.start();
  console.log('🤖 OpenTelemetry SDK initialized successfully');
} catch (error) {
  console.error('❌ Error initializing OpenTelemetry SDK:', error);
}

// Ensure spans are flushed and SDK is shut down gracefully on container stop
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('SDK shut down successfully'))
    .catch((error) => console.log('Error shutting down SDK', error))
    .finally(() => process.exit(0));
});
