/**
 * OpenTelemetry Tracing - Re-export
 *
 * All OpenTelemetry configuration is in src/instrumentation.ts
 * This file only re-exports for backward compatibility.
 *
 * @deprecated Import directly from '../../instrumentation.js' instead
 */

export { shutdownTracing } from '../../instrumentation.js';

/**
 * @deprecated OpenTelemetry is now initialized via --import flag.
 * This function is kept for backward compatibility but does nothing.
 */
export function initializeTracing(): void {
  // No-op: OpenTelemetry is initialized via --import ./src/instrumentation.ts
  // eslint-disable-next-line no-console
  console.log('[OTEL] initializeTracing() called - no-op (use --import instead)');
}
