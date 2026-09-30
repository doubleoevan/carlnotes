// the Temporal worker process
import { shutdownAnalytics } from "@shared/analytics"
import { shutdownMonitoring, startMonitoring } from "@shared/monitoring"
import { type ExtraGaugesReading, startRuntimeGauges } from "@shared/runtimeGauges"
import { NativeConnection, Worker } from "@temporalio/worker"
import { readPoolGauges, toPositiveInteger } from "../db"
import { shutdownTelemetry, startTelemetry } from "./telemetry"
import {
	ATTACHMENT_TASK_QUEUE,
	describeScanQueue,
	SCAN_TASK_QUEUE,
	SOURCE_TASK_QUEUE,
	toScanBacklogCrossing,
} from "./temporal-client"
import * as attachmentActivities from "./workflows/process-attachment-activities"
import * as scanActivities from "./workflows/run-topic-scan-activities"
import * as sourceActivities from "./workflows/screen-source-activities"

// the SDK shuts a Worker down on its own on SIGINT/SIGTERM, but gives an in-flight activity zero time to finish
const SHUTDOWN_GRACE_MS = 2 * 60 * 1000

// how many scan activities may run at once on this replica, from the SCAN_CONCURRENCY setting or the default
const DEFAULT_SCAN_CONCURRENCY = 8
const SCAN_CONCURRENCY = toPositiveInteger(Bun.env.SCAN_CONCURRENCY, DEFAULT_SCAN_CONCURRENCY)

// how often and how long to keep retrying the first connection
const CONNECT_RETRY_DELAY_MS = 3 * 1000
const CONNECT_ATTEMPTS = 20

// connect to Temporal, retrying while its server is still starting. after a reboot this worker and the
// dockerized server race
async function connectWithRetry(): Promise<NativeConnection> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await NativeConnection.connect({ address: Bun.env.TEMPORAL_ADDRESS })
		} catch (error) {
			// the last attempt gives up and lets the process exit
			if (attempt >= CONNECT_ATTEMPTS) {
				throw error
			}

			// wait out the server's startup and try again
			console.warn(`temporal not reachable yet (attempt ${attempt}/${CONNECT_ATTEMPTS}), retrying…`)
			await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_DELAY_MS))
		}
	}
}

// connect to Temporal, build a worker per queue, and poll until the process stops
async function run(): Promise<void> {
	// monitoring, then tracing for this worker's model calls, in that order so Langfuse keeps its own provider beside Sentry's.
	// both do nothing without their keys
	startMonitoring()
	startTelemetry()

	// a Worker polls exactly one queue and takes one workflowsPath
	const connection = await connectWithRetry()
	const workers = await Promise.all([
		// extracts an attachment's text, screens it with llm-guard, and generates its context
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/process-attachment.ts", import.meta.url).pathname,
			activities: attachmentActivities,
			taskQueue: ATTACHMENT_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
		}),
		// runs one dispatched Scan: ingest, review, and the final write
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/run-topic-scan.ts", import.meta.url).pathname,
			activities: scanActivities,
			taskQueue: SCAN_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: SCAN_CONCURRENCY,
		}),
		// fetches a url Source's page and screens it with llm-guard
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/screen-source.ts", import.meta.url).pathname,
			activities: sourceActivities,
			taskQueue: SOURCE_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
		}),
	])

	// log the pool, the event loop delay, and the scan queue once a minute, and warn on a backed-up queue.
	// the reporter starts once the workflow bundles are built, so building them never reads as a stall
	startRuntimeGauges({ processName: "worker", readPoolGauges, readExtraGauges: readScanQueueGauges })

	// any worker stopping ends the process
	const runningWorkers = workers.map((worker) => worker.run())
	try {
		await Promise.race(runningWorkers)
	} finally {
		// the other workers still polling on the shared connection are stopped before that connection closes
		for (const worker of workers) {
			try {
				worker.shutdown()
			} catch {}
		}

		// drain every worker before the connection and everything they report go away
		await Promise.allSettled(runningWorkers)
		await connection.close()
		await shutdownTelemetry()
		await shutdownAnalytics()
		await shutdownMonitoring()
	}
}

// the scan queue's numbers for the minute line, and its backlog if the oldest waiting Scan has waited too long
async function readScanQueueGauges(): Promise<ExtraGaugesReading> {
	const scanQueue = await describeScanQueue()
	const backlogCrossing = toScanBacklogCrossing(scanQueue)
	return { gauges: { scanQueue }, thresholdCrossings: backlogCrossing ? [backlogCrossing] : [] }
}

// a worker failure exits with an error code
run().catch((error) => {
	console.error("temporal worker failed", error)
	process.exit(1)
})
