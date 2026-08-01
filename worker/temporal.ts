// the Temporal worker process: it bundles the workflows, registers the activities, and polls the attachment task queue.
// run it as its own process (bun run dev:temporal). it needs a reachable Temporal server at TEMPORAL_ADDRESS
import { startMonitoring } from "@shared/monitoring"
import { NativeConnection, Worker } from "@temporalio/worker"
import { shutdownTelemetry, startTelemetry } from "./telemetry"
import { ATTACHMENT_TASK_QUEUE } from "./temporal-client"
import * as activities from "./workflows/process-attachment-activities"

// connect to Temporal, build the worker over the workflow bundle and the activities, and poll until the process stops
async function run(): Promise<void> {
	// this worker makes the attachment model calls, so it traces and monitors them. both no-op without their keys
	startTelemetry()
	startMonitoring()

	const connection = await NativeConnection.connect({ address: Bun.env.TEMPORAL_ADDRESS })
	const worker = await Worker.create({
		connection,
		workflowsPath: new URL("./workflows/process-attachment.ts", import.meta.url).pathname,
		activities,
		taskQueue: ATTACHMENT_TASK_QUEUE,
	})

	// flush telemetry on the way out
	try {
		await worker.run()
	} finally {
		await shutdownTelemetry()
	}
}

// a worker failure should exit non-zero so the supervisor restarts it
run().catch((error) => {
	console.error("temporal worker failed", error)
	process.exit(1)
})
