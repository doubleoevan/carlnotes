// starts and stops LLM call tracing to Langfuse
import { LangfuseSpanProcessor } from "@langfuse/otel"
import { setLangfuseTracerProvider, startActiveObservation } from "@langfuse/tracing"
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk"
import { AlwaysOnSampler, NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { isMonitoringStarted } from "@shared/monitoring"
import { registerTelemetry } from "ai"
import type { Budget } from "./budget"

// Langfuse's own tracer provider, kept so shutdown can flush it. null means telemetry never started
let langfuseTracerProvider: NodeTracerProvider | null = null

/**
 * Starts tracing model calls to Langfuse, or does nothing if the Langfuse keys are unset.
 * Langfuse keeps its own tracer provider, which records every model call whatever Sentry samples.
 * Start Sentry first. If Sentry runs, Sentry keeps the global provider and Langfuse's stays beside it,
 * and if Sentry does not run, Langfuse's provider is the global one.
 */
export function startTelemetry(): void {
	// already started. a second call must not create a second provider
	if (langfuseTracerProvider) {
		return
	}

	// both keys are required. the span processor reads them from env itself
	if (!Bun.env.LANGFUSE_PUBLIC_KEY || !Bun.env.LANGFUSE_SECRET_KEY) {
		return
	}

	// the sampler records every model call, including one inside a request Sentry did not sample
	langfuseTracerProvider = new NodeTracerProvider({
		sampler: new AlwaysOnSampler(),
		spanProcessors: [new LangfuseSpanProcessor()],
	})

	// beside Sentry, Langfuse's observations use this provider and Sentry keeps the global one and its context.
	// alone, this provider is the global one, with the context that nests a stage's calls inside it
	if (isMonitoringStarted()) {
		setLangfuseTracerProvider(langfuseTracerProvider)
	} else {
		langfuseTracerProvider.register()
	}

	// every AI SDK call is traced through Langfuse's provider
	registerTelemetry(new LangfuseVercelAiSdkIntegration({ tracer: langfuseTracerProvider.getTracer("ai") }))
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
	if (!langfuseTracerProvider) {
		return
	}

	// a telemetry flush failure must never fail the process it is tracing
	try {
		await langfuseTracerProvider.shutdown()
	} catch (error) {
		console.error("telemetry shutdown failed", error)
	}
}
