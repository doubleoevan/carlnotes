// the Temporal worker process: it bundles the workflows, registers the activities, and polls both task queues.
// run it as its own process (bun run dev:temporal). it needs a reachable Temporal server at TEMPORAL_ADDRESS
import { shutdownAnalytics } from "@shared/analytics"
import { shutdownMonitoring, startMonitoring } from "@shared/monitoring"
import { NativeConnection, Worker } from "@temporalio/worker"
import { shutdownTelemetry, startTelemetry } from "./telemetry"
import { ATTACHMENT_TASK_QUEUE, SCAN_TASK_QUEUE } from "./temporal-client"
import * as attachmentActivities from "./workflows/process-attachment-activities"
import * as scanActivities from "./workflows/run-topic-scan-activities"

// the SDK shuts a Worker down on its own on SIGINT/SIGTERM, but gives an in-flight activity zero time to
// finish unless told to wait. review has no retry, so a shutdown mid-review otherwise abandons it outright.
// this only covers an activity that is nearly done: one just starting when the signal arrives still exceeds
// it and gets abandoned, and the deploy platform's own kill timeout can still cut this short regardless
const SHUTDOWN_GRACE_MS = 2 * 60 * 1000

// connect to Temporal, build a worker per queue, and poll until the process stops
async function run(): Promise<void> {
	// this worker makes the attachment and scan model calls, so it traces and monitors them. both no-op without their keys
	startTelemetry()
	startMonitoring()

	// a Worker polls exactly one queue and takes one workflowsPath,
	// so the attachment and topic scan each get their own Worker instead of sharing one.
	// they share this process and its connection, so it stays one process to run and supervise
	const connection = await NativeConnection.connect({ address: Bun.env.TEMPORAL_ADDRESS })
	const workers = await Promise.all([
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/process-attachment.ts", import.meta.url).pathname,
			activities: attachmentActivities,
			taskQueue: ATTACHMENT_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
		}),
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/run-topic-scan.ts", import.meta.url).pathname,
			activities: scanActivities,
			taskQueue: SCAN_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
		}),
	])

	// either worker stopping ends the process, so the process is restarted instead of silently failing to poll
	const runningWorkers = workers.map((worker) => worker.run())
	try {
		await Promise.race(runningWorkers)
	} finally {
		// the other worker is still polling on the shared connection, so it is stopped and drained before that connection closes.
		// a worker that already stopped refuses a second shutdown
		for (const worker of workers) {
			try {
				worker.shutdown()
			} catch {}
		}

		// drain both workers before the connection and everything they report go away.
		// this process records the activation event and its own errors, and both batch,
		// so an exit that skips the flush drops whatever was still queued
		await Promise.allSettled(runningWorkers)
		await connection.close()
		await shutdownTelemetry()
		await shutdownAnalytics()
		await shutdownMonitoring()
	}
}

// a worker failure should exit with an error code so the supervisor restarts it
run().catch((error) => {
	console.error("temporal worker failed", error)
	process.exit(1)
})
