// the Temporal worker process
import { shutdownAnalytics } from "@shared/analytics"
import { shutdownMonitoring, startMonitoring } from "@shared/monitoring"
import { type ExtraGaugesReading, startRuntimeGauges } from "@shared/runtimeGauges"
import { NativeConnection, Worker } from "@temporalio/worker"
import { readPoolGauges, toPositiveInteger } from "../db"
import { readRedisExtraGauges } from "../db/redis"
import { runWithRetries } from "./retry"
import { shutdownTelemetry, startTelemetry } from "./telemetry"
import {
	ATTACHMENT_TASK_QUEUE,
	describeScanQueue,
	SCAN_TASK_QUEUE,
	SOURCE_TASK_QUEUE,
	toScanBacklogCrossing,
} from "./temporalClient"
import * as attachmentActivities from "./workflows/processAttachmentActivities"
import { PODCAST_EPISODE_TASK_QUEUE } from "./workflows/recordPodcastEpisode"
import * as podcastEpisodeActivities from "./workflows/recordPodcastEpisodeActivities"
import * as scanActivities from "./workflows/runTopicScanActivities"
import * as sourceActivities from "./workflows/screenSourceActivities"
import { SCAN_EMAIL_TASK_QUEUE } from "./workflows/sendScanEmail"
import * as scanEmailActivities from "./workflows/sendScanEmailActivities"

// the SDK shuts a Worker down on its own on SIGINT/SIGTERM, but gives an in-flight activity zero time to finish
const SHUTDOWN_GRACE_MS = 2 * 60 * 1000

// how many scan activities may run at once on this replica, from the SCAN_CONCURRENCY setting or the default
const DEFAULT_SCAN_CONCURRENCY = 8
const SCAN_CONCURRENCY = toPositiveInteger(Bun.env.SCAN_CONCURRENCY, DEFAULT_SCAN_CONCURRENCY)

// how many scan email activities may run at once on this replica. a few keep each wait for a Resend slot short,
// and the rest of a burst waits in the Temporal queue
const SCAN_EMAIL_CONCURRENCY = 4

// how many podcast episode activities may run at once on this replica, from PODCAST_RECORDING_CONCURRENCY or the default.
// the rest of a burst of recordings waits in the Temporal queue
const DEFAULT_PODCAST_RECORDING_CONCURRENCY = 16
const PODCAST_RECORDING_CONCURRENCY = toPositiveInteger(
	Bun.env.PODCAST_RECORDING_CONCURRENCY,
	DEFAULT_PODCAST_RECORDING_CONCURRENCY,
)

// how often and how long to keep retrying the first connection
const CONNECT_RETRY_DELAY_MS = 3 * 1000
const CONNECT_ATTEMPTS = 20

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
			workflowsPath: new URL("./workflows/processAttachment.ts", import.meta.url).pathname,
			activities: attachmentActivities,
			taskQueue: ATTACHMENT_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
		}),
		// runs one dispatched Scan: ingest, review, and the final write
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/runTopicScan.ts", import.meta.url).pathname,
			activities: scanActivities,
			taskQueue: SCAN_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: SCAN_CONCURRENCY,
		}),
		// emails a completed Scan's outcome, one activity per Resend call
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/sendScanEmail.ts", import.meta.url).pathname,
			activities: scanEmailActivities,
			taskQueue: SCAN_EMAIL_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: SCAN_EMAIL_CONCURRENCY,
		}),
		// records a succeeded Scan's Podcast Episode, one activity per script call and per chapter
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/recordPodcastEpisode.ts", import.meta.url).pathname,
			activities: podcastEpisodeActivities,
			taskQueue: PODCAST_EPISODE_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: PODCAST_RECORDING_CONCURRENCY,
		}),
		// fetches a url Source's page and screens it with llm-guard
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/screenSource.ts", import.meta.url).pathname,
			activities: sourceActivities,
			taskQueue: SOURCE_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
		}),
	])

	// log the pool, the event loop delay, the scan queue, and Redis once a minute, and warn on a backed-up queue or a
	// Redis connection that is down. it starts after the workflow bundles build, so building them never reads as a stall
	startRuntimeGauges({ processName: "worker", readPoolGauges, readExtraGauges: readWorkerExtraGauges })

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

// the scan queue's numbers and the Redis gauges for the minute line, with the scan backlog if the oldest waiting Scan
// has waited too long and Redis-down if the command connection is down
async function readWorkerExtraGauges(): Promise<ExtraGaugesReading> {
	const [scanQueue, redisExtraGauges] = await Promise.all([describeScanQueue(), readRedisExtraGauges()])
	const backlogCrossing = toScanBacklogCrossing(scanQueue)
	return {
		gauges: { scanQueue, ...redisExtraGauges.gauges },
		thresholdCrossings: [...(backlogCrossing ? [backlogCrossing] : []), ...redisExtraGauges.thresholdCrossings],
	}
}

// a worker failure exits with an error code
run().catch((error) => {
	console.error("temporal worker failed", error)
	process.exit(1)
})
