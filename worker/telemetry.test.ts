// Langfuse records every model call on its own provider beside Sentry's, and a query's span stays in Sentry's tree.
// each case runs in its own process, where both providers register their process-wide globals afresh
import { expect, test } from "bun:test"

// starts telemetry, with Sentry first if asked, then reports which provider is global,
// whether Sentry traces model calls itself, and whether a model call's span records inside a request Sentry did not sample
const PROVIDER_PROBE_SCRIPT = `
// the two providers, the Langfuse lookup, and the monitoring and telemetry under test
import * as Sentry from "@sentry/bun"
import { trace } from "@opentelemetry/api"
import { getLangfuseTracerProvider } from "@langfuse/tracing"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { startMonitoring } from "./shared/monitoring"
import { startTelemetry } from "./worker/telemetry"

// start Sentry first if the case asks for it, the way the api does, then Langfuse
if (process.env.PROBE_WITH_SENTRY === "true") {
	startMonitoring()
}
startTelemetry()

// which provider has the global slot, whether Sentry's AI SDK integration is on,
// and whether a model call records inside an unsampled request
const isLangfuseGlobal = trace.getTracerProvider().getDelegate() instanceof NodeTracerProvider
const isSentryTracingModelCalls = Boolean(Sentry.getClient()?.getIntegrationByName("VercelAI"))
const isModelCallRecorded = Sentry.startSpan({ name: "GET /api/topics/:id", forceTransaction: true }, () => {
	const modelCallSpan = getLangfuseTracerProvider().getTracer("ai").startSpan("ai.generateText")
	const isRecording = modelCallSpan.isRecording()
	modelCallSpan.end()
	return isRecording
})

// report one line and exit before any exporter tries to flush
console.log(JSON.stringify({ isLangfuseGlobal, isSentryTracingModelCalls, isModelCallRecorded }))
process.exit(0)
`

// traces one request with Sentry recording it and Langfuse beside it, sends one query from inside a stage
// and another from inside a model call's span, then reports the span each query's span was parented to
const QUERY_PARENT_PROBE_SCRIPT = `
// the monitoring and telemetry under test, and the Langfuse lookup
import * as Sentry from "@sentry/bun"
import { context, trace } from "@opentelemetry/api"
import { getLangfuseTracerProvider } from "@langfuse/tracing"
import { startQuerySpan, traceRequestStage } from "./shared/monitoring"
import { startTelemetry } from "./worker/telemetry"

// Sentry keeps the request's transaction instead of sending it, and Langfuse starts beside it
let transactionEvent
Sentry.init({ dsn: "https://public@127.0.0.1:9/1", tracesSampleRate: 1, beforeSendTransaction: (event) => {
	transactionEvent = event
	return null
} })
startTelemetry()

// one query inside a stage, and one inside a model call's span, which only Langfuse records
await Sentry.startSpan({ name: "GET /api/topics/:id", op: "http.server", forceTransaction: true }, async (requestSpan) => {
	await traceRequestStage("topic_page.reads", async () => startQuerySpan("select 1", requestSpan)())
	const modelCallSpan = getLangfuseTracerProvider().getTracer("ai").startSpan("ai.generateText")
	context.with(trace.setSpan(context.active(), modelCallSpan), () => startQuerySpan("select 2", requestSpan)())
	modelCallSpan.end()
})
await Sentry.flush(1000)

// name each query's parent: the request, a span in the transaction, or a span the transaction does not include
const spans = transactionEvent?.spans ?? []
const toParentName = (statement) => {
	const parentSpanId = spans.find((span) => span.description === statement)?.parent_span_id
	const parentSpan = spans.find((span) => span.span_id === parentSpanId)
	return parentSpanId === transactionEvent?.contexts?.trace?.span_id ? "request" : (parentSpan?.description ?? "missing")
}

// report one line and exit
console.log(JSON.stringify({ stageQueryParent: toParentName("select 1"), modelCallQueryParent: toParentName("select 2") }))
process.exit(0)
`

// run a probe in a fresh process, with keys that reach no server and production's settings at a zero sample rate
function runProbe(probeScript: string, isSentryRunning: boolean): Record<string, unknown> {
	const probe = Bun.spawnSync(["bun", "-e", probeScript], {
		env: {
			...process.env,
			// Langfuse and Sentry keys whose servers never respond
			LANGFUSE_PUBLIC_KEY: "pk-test",
			LANGFUSE_SECRET_KEY: "sk-test",
			LANGFUSE_BASE_URL: "http://127.0.0.1:9",
			SENTRY_DSN: "https://public@127.0.0.1:9/1",
			// production at a zero sample rate, which startMonitoring reads if the probe calls it
			DOPPLER_ENVIRONMENT: "prd",
			SENTRY_TRACES_SAMPLE_RATE: "0",
			PROBE_WITH_SENTRY: String(isSentryRunning),
		},
	})
	return JSON.parse(probe.stdout.toString().trim().split("\n").at(-1) ?? "{}")
}

// beside Sentry, Langfuse stays off the global slot and records a call inside an unsampled request,
// and Sentry traces no model call of its own
test("with Sentry running, Langfuse keeps its own provider and records every model call", () => {
	expect(runProbe(PROVIDER_PROBE_SCRIPT, true)).toEqual({
		isLangfuseGlobal: false,
		isSentryTracingModelCalls: false,
		isModelCallRecorded: true,
	})
})

// alone, Langfuse's provider is the global one, as it was before
test("without Sentry, Langfuse's provider is the global one", () => {
	expect(runProbe(PROVIDER_PROBE_SCRIPT, false)).toEqual({
		isLangfuseGlobal: true,
		isSentryTracingModelCalls: false,
		isModelCallRecorded: true,
	})
})

// a query nests under the stage that sent it,
// and a query sent inside a model call's span, which only Langfuse records, nests under the request itself
test("a query's span nests under its stage and never under a model call's span", () => {
	expect(runProbe(QUERY_PARENT_PROBE_SCRIPT, true)).toEqual({
		stageQueryParent: "topic_page.reads",
		modelCallQueryParent: "request",
	})
})
