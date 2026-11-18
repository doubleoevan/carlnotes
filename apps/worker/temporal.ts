// the Temporal worker process

import {
	PERSONAL_SOURCES_EMAIL_TASK_QUEUE,
	PERSONAL_SOURCES_TASK_QUEUE,
} from "@carlnotes/contracts/personalSourcesWork"
import { TOPIC_MEMORY_TASK_QUEUE } from "@carlnotes/contracts/topicMemoryWork"
import { TOPIC_VIDEO_BACKFILL_TASK_QUEUE, TOPIC_VIDEO_TASK_QUEUE } from "@carlnotes/contracts/topicVideoWork"
import { readPoolGauges, sizeConnectionPool } from "@carlnotes/db"
import { readRedisExtraGauges } from "@carlnotes/db/redisGauges"
import { shutdownTelemetry, startTelemetry } from "@carlnotes/models/telemetry"
import { PUSH_TASK_QUEUE } from "@carlnotes/pipeline/pushWorkflows"
import { describeScanQueue, SCAN_TASK_QUEUE, toScanBacklogCrossing } from "@carlnotes/pipeline/scanWorkflowClient"
import {
	ATTACHMENT_TASK_QUEUE,
	DASHBOARD_TASK_QUEUE,
	SOURCE_TASK_QUEUE,
	startTopicVideoBackfillWorkflow,
	TOPIC_IMAGE_TASK_QUEUE,
	TOPIC_POST_TASK_QUEUE,
} from "@carlnotes/pipeline/temporalClient"
import { shutdownAnalytics } from "@carlnotes/server/analytics"
import { toPositiveInteger } from "@carlnotes/server/envSettings"
import { exitOnFatalError, reportError, shutdownMonitoring, startMonitoring } from "@carlnotes/server/monitoring"
import { validatePersonalSourcesEmailSettings } from "@carlnotes/server/personalSourcesSettings"
import {
	isTopicVideoBackfillEnabled,
	topicVideoBackfillConcurrency,
	topicVideoConcurrency,
} from "@carlnotes/server/podcastEpisodeSettings"
import { runWithRetries } from "@carlnotes/server/retry"
import { type ExtraGaugesReading, startRuntimeGauges } from "@carlnotes/server/runtimeGauges"
import { NativeConnection, Worker } from "@temporalio/worker"
import { readWorkerQueueGroup } from "./workerQueueGroup"
import * as topicVideoBackfillActivities from "./workflows/backfillTopicVideosActivities"
import * as dashboardActivities from "./workflows/buildDashboardSnapshotsActivities"
import * as attachmentActivities from "./workflows/processAttachmentActivities"
import * as topicPostActivities from "./workflows/publishTopicPostActivities"
import * as personalSourcesEmailActivities from "./workflows/receivePersonalSourcesEmailActivities"
import { PODCAST_EPISODE_TASK_QUEUE } from "./workflows/recordPodcastEpisode"
import * as podcastEpisodeActivities from "./workflows/recordPodcastEpisodeActivities"
import * as topicVideoActivities from "./workflows/renderTopicVideoActivities"
import { SCAN_CLOSING_TASK_QUEUE } from "./workflows/runTopicScan"
import * as scanActivities from "./workflows/runTopicScanActivities"
import * as sourceActivities from "./workflows/screenSourceActivities"
import * as pushActivities from "./workflows/sendPushNotificationsActivities"
import { SCAN_EMAIL_TASK_QUEUE } from "./workflows/sendScanEmail"
import * as scanEmailActivities from "./workflows/sendScanEmailActivities"
import * as personalSourcesActivities from "./workflows/summarizePersonalSourcesContextActivities"
import * as topicImageActivities from "./workflows/topicImageWorkflowActivities"
import * as topicMemoryActivities from "./workflows/topicMemoriesActivities"

// the SDK shuts a Worker down on its own on SIGINT/SIGTERM, but gives a running activity zero time to finish
const SHUTDOWN_GRACE_MS = 2 * 60 * 1000

// how many scan activities may run at once on this replica, from the SCAN_CONCURRENCY setting or the default
const DEFAULT_SCAN_CONCURRENCY = 8
const SCAN_CONCURRENCY = toPositiveInteger(Bun.env.SCAN_CONCURRENCY, DEFAULT_SCAN_CONCURRENCY)

// how many closing writes may run at once on this replica
const SCAN_CLOSING_CONCURRENCY = 8

// how many activities the attachment Worker and the source-screen Worker may each run at once on this replica, from
// the SCREEN_CONCURRENCY setting or the default
const DEFAULT_SCREEN_CONCURRENCY = 8
const SCREEN_CONCURRENCY = toPositiveInteger(Bun.env.SCREEN_CONCURRENCY, DEFAULT_SCREEN_CONCURRENCY)

// how many scan email activities may run at once on this replica. a few keep each wait for a Resend slot short,
// and the rest of a burst waits in the Temporal queue
const SCAN_EMAIL_CONCURRENCY = 4

// how many push activities may run at once on this replica. each sends its chunks one after another, inside the push
// service's 600 a second per project, and the rest of a burst waits in the Temporal queue
const PUSH_CONCURRENCY = 4

// how many podcast episode activities may run at once on this replica, from PODCAST_RECORDING_CONCURRENCY or the default.
// the rest of a burst of recordings waits in the Temporal queue
const DEFAULT_PODCAST_RECORDING_CONCURRENCY = 16
const PODCAST_RECORDING_CONCURRENCY = toPositiveInteger(
	Bun.env.PODCAST_RECORDING_CONCURRENCY,
	DEFAULT_PODCAST_RECORDING_CONCURRENCY,
)

// how many Dashboard build batches run at once on this replica. each reads a year of daily counts per Dashboard
const DASHBOARD_CONCURRENCY = 2

// how many films render at once on this replica, and how many the backfill renders
const TOPIC_VIDEO_CONCURRENCY = topicVideoConcurrency()
const TOPIC_VIDEO_BACKFILL_CONCURRENCY = topicVideoBackfillConcurrency()

// what this replica starts for films. zero films turns films off, and a backfill concurrency of zero turns the
// backfill off
const TOPIC_VIDEO_STARTUP = readTopicVideoStartup()

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
	// both do nothing without their keys. then size the connection pool from the database
	startMonitoring()
	startTelemetry()
	if (readWorkerQueueGroup() !== "films") {
		validatePersonalSourcesEmailSettings()
	}
	await sizeConnectionPool()

	// a Worker polls exactly one queue and takes one workflowsPath
	const connection = await connectWithRetry()
	const mainWorkers = readWorkerQueueGroup() === "films" ? [] : createMainWorkers(connection)
	const workers = await Promise.all([
		...mainWorkers,
		...(TOPIC_VIDEO_STARTUP.isTopicVideoQueuePolled ? createTopicVideoWorkers(connection) : []),
	])

	// log the pool, the event loop delay, the scan queue, and Redis once a minute, and warn on a backed-up queue or a
	// Redis connection that is down. it starts after the workflow bundles build, so building them never reads as a stall
	startRuntimeGauges({ processName: "worker", readPoolGauges, readExtraGauges: readWorkerExtraGauges })

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
		await connection.close()
		await shutdownTelemetry()
		await shutdownAnalytics()
		await shutdownMonitoring()
	}
}

// The main queue group owns recording dispatch, scans and every queue outside film encoding.
function createMainWorkers(connection: NativeConnection): Promise<Worker>[] {
	return [
		// receive bounded mail independently of model calls and Scan slots
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/receivePersonalSourcesEmail.ts", import.meta.url).pathname,
			activities: personalSourcesEmailActivities,
			taskQueue: PERSONAL_SOURCES_EMAIL_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: SCAN_EMAIL_CONCURRENCY,
		}),
		// rebuild private personal sources context independently of Scan and attachment slots
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/summarizePersonalSourcesContext.ts", import.meta.url).pathname,
			activities: personalSourcesActivities,
			taskQueue: PERSONAL_SOURCES_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: SCREEN_CONCURRENCY,
		}),
		// extracts an attachment's text and generates its context
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/processAttachment.ts", import.meta.url).pathname,
			activities: attachmentActivities,
			taskQueue: ATTACHMENT_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: SCREEN_CONCURRENCY,
		}),
		// runs one dispatched Scan: ingest and review
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/runTopicScan.ts", import.meta.url).pathname,
			activities: scanActivities,
			taskQueue: SCAN_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: SCAN_CONCURRENCY,
		}),
		// consolidate topic memories independently of the brew and podcast slots
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/topicMemories.ts", import.meta.url).pathname,
			activities: topicMemoryActivities,
			taskQueue: TOPIC_MEMORY_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: 2,
		}),
		// records a Scan's outcome: the closing writes on their own queue, with every scan activity registered
		Worker.create({
			connection,
			activities: scanActivities,
			taskQueue: SCAN_CLOSING_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: SCAN_CLOSING_CONCURRENCY,
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
		// pushes a Scan's new Findings and a room message's chat mentions to phones, then reads their receipts
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/sendPushNotifications.ts", import.meta.url).pathname,
			activities: pushActivities,
			taskQueue: PUSH_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: PUSH_CONCURRENCY,
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
		// draws a topic's image, one scene call and one image call then the store, and runs the backfill over them
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/topicImageWorkflows.ts", import.meta.url).pathname,
			activities: topicImageActivities,
			taskQueue: TOPIC_IMAGE_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: SCREEN_CONCURRENCY,
		}),
		// runs what follows a Topic Post's publish: its summary and the start of its image's render
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/publishTopicPost.ts", import.meta.url).pathname,
			activities: topicPostActivities,
			taskQueue: TOPIC_POST_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: SCREEN_CONCURRENCY,
		}),
		// fetches a url Source's page to check that it can be read
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/screenSource.ts", import.meta.url).pathname,
			activities: sourceActivities,
			taskQueue: SOURCE_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: SCREEN_CONCURRENCY,
		}),
		// builds the Dashboards' snapshots, nightly and after a change to who may see a Dashboard's items
		Worker.create({
			connection,
			workflowsPath: new URL("./workflows/buildDashboardSnapshots.ts", import.meta.url).pathname,
			activities: dashboardActivities,
			taskQueue: DASHBOARD_TASK_QUEUE,
			shutdownGraceTime: SHUTDOWN_GRACE_MS,
			maxConcurrentActivityTaskExecutions: DASHBOARD_CONCURRENCY,
		}),
	]
}

// the film workers: new films and rebuilds on one queue, and the backfill of each Topic's latest podcast episode on
// another, so neither waits behind the other and neither takes a recording's slot
function createTopicVideoWorkers(connection: NativeConnection): Promise<Worker>[] {
	// renders a published podcast episode's film, and rebuilds one for a new image
	const topicVideoWorker = Worker.create({
		connection,
		workflowsPath: new URL("./workflows/renderTopicVideo.ts", import.meta.url).pathname,
		activities: topicVideoActivities,
		taskQueue: TOPIC_VIDEO_TASK_QUEUE,
		shutdownGraceTime: SHUTDOWN_GRACE_MS,
		maxConcurrentActivityTaskExecutions: TOPIC_VIDEO_CONCURRENCY,
	})

	// leave the backfill's queue unpolled if the backfill is off
	if (!TOPIC_VIDEO_STARTUP.isTopicVideoBackfillStarted) {
		return [topicVideoWorker]
	}

	// gives each Topic's latest podcast episode a film, with the film render's activities
	const topicVideoBackfillWorker = Worker.create({
		connection,
		workflowsPath: new URL("./workflows/backfillTopicVideos.ts", import.meta.url).pathname,
		activities: { ...topicVideoActivities, ...topicVideoBackfillActivities },
		taskQueue: TOPIC_VIDEO_BACKFILL_TASK_QUEUE,
		shutdownGraceTime: SHUTDOWN_GRACE_MS,
		maxConcurrentActivityTaskExecutions: TOPIC_VIDEO_BACKFILL_CONCURRENCY,
	})
	return [topicVideoWorker, topicVideoBackfillWorker]
}

// start or join the film backfill without waiting for it. the workflow logs its own summary, and a failed start is
// reported while the worker keeps polling
function startTopicVideoBackfill(): void {
	startTopicVideoBackfillWorkflow(TOPIC_VIDEO_BACKFILL_CONCURRENCY).catch((error: unknown) =>
		reportError(error, "topic-video", { step: "backfill" }),
	)
}

// what a replica starts for films: whether a Worker polls the film queue, and whether the film backfill starts, with a
// Worker on the backfill's own queue
type TopicVideoStartup = {
	isTopicVideoQueuePolled: boolean
	isTopicVideoBackfillStarted: boolean
}

/**
 * Returns what a replica starts for films, read from the film settings. Films that are off start nothing, and a
 * backfill concurrency of zero starts no backfill and leaves the film queue polled.
 */
export function readTopicVideoStartup(): TopicVideoStartup {
	return {
		isTopicVideoQueuePolled: readWorkerQueueGroup() !== "main" && topicVideoConcurrency() > 0,
		isTopicVideoBackfillStarted: readWorkerQueueGroup() !== "main" && isTopicVideoBackfillEnabled(),
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

// start the worker if this file is run as the process's entry point. report a worker failure under startup before
// polling and under worker after. exit once the report sends
if (import.meta.main) {
	run().catch((error: unknown) =>
		exitOnFatalError({ error, stage: hasStartedPolling ? "worker" : "startup", message: "temporal worker failed" }),
	)
}
