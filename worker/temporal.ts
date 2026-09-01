// the Temporal worker process
import { shutdownAnalytics } from "@shared/analytics"
import { shutdownMonitoring, startMonitoring } from "@shared/monitoring"
import { NativeConnection, Worker } from "@temporalio/worker"
import { shutdownTelemetry, startTelemetry } from "./telemetry"
import { ATTACHMENT_TASK_QUEUE, SCAN_TASK_QUEUE, SOURCE_TASK_QUEUE } from "./temporal-client"
import * as attachmentActivities from "./workflows/process-attachment-activities"
import * as scanActivities from "./workflows/run-topic-scan-activities"
import * as sourceActivities from "./workflows/screen-source-activities"

// the SDK shuts a Worker down on its own on SIGINT/SIGTERM, but gives an in-flight activity zero time to finish
const SHUTDOWN_GRACE_MS = 2 * 60 * 1000

// how many scan activities may run at once
const MAX_CONCURRENT_SCAN_ACTIVITIES = 8

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
	// tracing and monitoring for this worker's model calls. both no-op without their keys
	startTelemetry()
	startMonitoring()

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
			maxConcurrentActivityTaskExecutions: MAX_CONCURRENT_SCAN_ACTIVITIES,
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

// a worker failure exits with an error code
run().catch((error) => {
	console.error("temporal worker failed", error)
	process.exit(1)
})
