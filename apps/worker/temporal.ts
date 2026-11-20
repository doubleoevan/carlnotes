// the Temporal worker process

import { readPoolGauges, sizeConnectionPool } from "@carlnotes/db"
import { shutdownTelemetry, startTelemetry } from "@carlnotes/models/telemetry"
import { shutdownAnalytics } from "@carlnotes/server/analytics"
import { exitOnFatalError, shutdownMonitoring, startMonitoring } from "@carlnotes/server/monitoring"
import { validatePersonalSourcesEmailSettings } from "@carlnotes/server/personalSourcesSettings"
import { runWithRetries } from "@carlnotes/server/retry"
import { startRuntimeGauges } from "@carlnotes/server/runtimeGauges"
import { NativeConnection, type Worker } from "@temporalio/worker"
import {
	createMainWorkers,
	createTopicVideoWorkers,
	startTopicVideoBackfill,
	TOPIC_VIDEO_STARTUP,
} from "./temporalWorkers"
import { serveDemandGauges } from "./workerDemand"
import { readWorkerExtraGauges } from "./workerGauges"
import { readWorkerQueueGroup } from "./workerQueueGroup"

// how often and how long to keep retrying the first connection
const CONNECT_RETRY_DELAY_MS = 3 * 1000
const CONNECT_ATTEMPTS = 20

// whether the workers have started polling their queues, which tells a startup failure from a stopped worker
let hasStartedPolling = false

// connect to Temporal, retrying while its server is still starting. after a reboot this worker and the
// dockerized server race. the last attempt's failure lets the process exit
function connectWithRetry(): Promise<NativeConnection> {
	return runWithRetries({
		attempts: CONNECT_ATTEMPTS,
		delayMs: CONNECT_RETRY_DELAY_MS,
		runAttempt: () => NativeConnection.connect({ address: Bun.env.TEMPORAL_ADDRESS }),
		onRetry: (attempt) =>
			console.warn(`temporal not reachable yet (attempt ${attempt}/${CONNECT_ATTEMPTS}), retrying…`),
	})
}

// connect to Temporal, build a worker per queue, and poll until the process stops
async function run(): Promise<void> {
	// A disabled film replica can pass its deployment health check without opening database or queue connections.
	if (readWorkerQueueGroup() === "films" && !TOPIC_VIDEO_STARTUP.isTopicVideoQueuePolled) {
		console.info("Film worker idle while TOPIC_VIDEO_CONCURRENCY is zero")
		for (;;) {
			await Bun.sleep(86_400_000)
		}
	}

	// monitoring, then tracing for this worker's model calls, in that order so Langfuse keeps its own provider beside Sentry's.
	// both do nothing without their keys. then size the connection pool from the database: a worker that runs Scans
	// takes two pool shares, and a film replica one
	startMonitoring()
	startTelemetry()
	if (readWorkerQueueGroup() !== "films") {
		validatePersonalSourcesEmailSettings()
	}
	await sizeConnectionPool(readWorkerQueueGroup() === "films" ? 1 : 2)

	// a Worker polls exactly one queue and takes one workflowsPath
	const connection = await connectWithRetry()
	const mainWorkers = readWorkerQueueGroup() === "films" ? [] : createMainWorkers(connection)
	const workers = await Promise.all([
		...mainWorkers,
		...(TOPIC_VIDEO_STARTUP.isTopicVideoQueuePolled ? createTopicVideoWorkers(connection) : []),
	])

	// log the pool, the event loop delay, each gauged queue, and Redis once a minute, and warn on a backed-up queue or a
	// Redis connection that is down. it starts after the workflow bundles build, so building them never reads as a stall
	startRuntimeGauges({ processName: "worker", readPoolGauges, readExtraGauges: readWorkerExtraGauges })

	// serve this replica's demand for the platform's autoscaling: what its Workers have in progress on a gauge's queues,
	// and its share of the backlog
	const stopServingDemandGauges = serveDemandGauges({
		queueGroup: readWorkerQueueGroup(),
		readInFlightCount: (taskQueues) => toInFlightActivityCount(workers, taskQueues),
	})

	// any worker stopping ends the process. once the workers poll, the film backfill starts or joins without a wait,
	// unless the backfill is off
	hasStartedPolling = true
	if (TOPIC_VIDEO_STARTUP.isTopicVideoBackfillStarted) {
		startTopicVideoBackfill()
	}
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
		stopServingDemandGauges()
		await connection.close()
		await shutdownTelemetry()
		await shutdownAnalytics()
		await shutdownMonitoring()
	}
}

/**
 * Returns how many activities the Workers on some task queues have in progress. A render that waits for a film slot
 * counts, because its Worker has already taken the task.
 */
export function toInFlightActivityCount(
	workers: Pick<Worker, "options" | "getStatus">[],
	taskQueues: string[],
): number {
	return workers
		.filter((worker) => taskQueues.includes(worker.options.taskQueue))
		.reduce((inFlightCount, worker) => inFlightCount + worker.getStatus().numInFlightActivities, 0)
}

// start the worker if this file is run as the process's entry point. report a worker failure under startup before
// polling and under worker after. exit once the report sends
if (import.meta.main) {
	run().catch((error: unknown) =>
		exitOnFatalError({ error, stage: hasStartedPolling ? "worker" : "startup", message: "temporal worker failed" }),
	)
}
