// starts and stops LLM call tracing to Langfuse. a no-op without both Langfuse keys set,
// so the worker behaves identically with or without observability configured
import { LangfuseSpanProcessor } from "@langfuse/otel"
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { registerTelemetry } from "ai"

// the running SDK instance, held so shutdown can flush it. null means telemetry never started
let telemetrySDK: NodeSDK | null = null

/**
 * Starts LLM call tracing to Langfuse, or no-ops when Langfuse keys are unset.
 */
export function startTelemetry(): void {
	// already started. a second call must not spin up a duplicate SDK instance
	if (telemetrySDK) {
		return
	}

	// both keys are required. the client and span processor read them from env themselves
	if (!Bun.env.LANGFUSE_PUBLIC_KEY || !Bun.env.LANGFUSE_SECRET_KEY) {
		return
	}

	// export every ai-sdk call as a Langfuse-shaped span, then start the exporter
	telemetrySDK = new NodeSDK({ spanProcessors: [new LangfuseSpanProcessor()] })
	telemetrySDK.start()
	registerTelemetry(new LangfuseVercelAiSdkIntegration())
}

/**
 * Flushes pending spans before the process exits. Safe to call whether or not telemetry started.
 */
export async function shutdownTelemetry(): Promise<void> {
	// nothing to flush if telemetry never started
	if (!telemetrySDK) {
		return
	}

	// a telemetry flush failure must never fail the process it is tracing
	try {
		await telemetrySDK.shutdown()
	} catch (error) {
		console.error("telemetry shutdown failed", error)
	}
}
