// starts and stops LLM call tracing to Langfuse
import { LangfuseSpanProcessor } from "@langfuse/otel"
import { startActiveObservation } from "@langfuse/tracing"
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { registerTelemetry } from "ai"
import type { Budget } from "./budget"

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
 * Runs one pipeline stage inside its own Langfuse span on the Scan's trace, recording what it cost and what it decided.
 * Token counts are not added here. The model calls that the stage makes report their own.
 * Without Langfuse keys, the stage still runs, just untraced.
 */
export async function traceStage<Result>(
	name: string,
	budget: Budget,
	runStage: () => Promise<Result>,
	describeStage?: (result: Result) => Record<string, unknown>,
): Promise<Result> {
	return startActiveObservation(name, async (span) => {
		// what the stage spends is the difference across it, so record the total going in
		const spentBefore = budget.spentDollars
		try {
			const stageResult = await runStage()
			span.update({ metadata: { costUsd: budget.spentDollars - spentBefore, ...describeStage?.(stageResult) } })
			return stageResult
		} catch (error) {
			// a stage that failed still spent, which is when the number matters most. record it, then rethrow
			span.update({ metadata: { costUsd: budget.spentDollars - spentBefore, isFailed: true } })
			throw error
		}
	})
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
