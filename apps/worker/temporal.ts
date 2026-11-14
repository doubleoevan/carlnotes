// the Temporal worker process

import {
	PERSONAL_SOURCES_EMAIL_TASK_QUEUE,
	PERSONAL_SOURCES_TASK_QUEUE,
} from "@carlnotes/contracts/personalSourcesWork"
import {
	TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_TASK_QUEUE,
	TOPIC_PODCAST_EPISODE_VIDEO_TASK_QUEUE,
} from "@carlnotes/contracts/topicPodcastEpisodeVideoWork"
import { readPoolGauges, sizeConnectionPool } from "@carlnotes/db"
import { readRedisExtraGauges } from "@carlnotes/db/redisGauges"
import { shutdownTelemetry, startTelemetry } from "@carlnotes/models/telemetry"
import { PUSH_TASK_QUEUE } from "@carlnotes/pipeline/pushWorkflows"
import { describeScanQueue, SCAN_TASK_QUEUE, toScanBacklogCrossing } from "@carlnotes/pipeline/scanWorkflowClient"
import {
	ATTACHMENT_TASK_QUEUE,
	DASHBOARD_TASK_QUEUE,
	SOURCE_TASK_QUEUE,
	startTopicPodcastEpisodeVideoBackfillWorkflow,
	TOPIC_IMAGE_TASK_QUEUE,
	TOPIC_POST_TASK_QUEUE,
} from "@carlnotes/pipeline/temporalClient"
import { shutdownAnalytics } from "@carlnotes/server/analytics"
import { toPositiveInteger } from "@carlnotes/server/envSettings"
import { exitOnFatalError, reportError, shutdownMonitoring, startMonitoring } from "@carlnotes/server/monitoring"
import { validatePersonalSourcesEmailSettings } from "@carlnotes/server/personalSourcesSettings"
import {
	isTopicPodcastEpisodeVideoBackfillEnabled,
	topicPodcastEpisodeVideoBackfillConcurrency,
	topicPodcastEpisodeVideoConcurrency,
} from "@carlnotes/server/podcastEpisodeSettings"
import { runWithRetries } from "@carlnotes/server/retry"
import { type ExtraGaugesReading, startRuntimeGauges } from "@carlnotes/server/runtimeGauges"
import { NativeConnection, Worker } from "@temporalio/worker"
import * as topicPodcastEpisodeVideoBackfillActivities from "./workflows/backfillTopicPodcastEpisodeVideosActivities"
import * as dashboardActivities from "./workflows/buildDashboardSnapshotsActivities"
import * as attachmentActivities from "./workflows/processAttachmentActivities"
import * as topicPostActivities from "./workflows/publishTopicPostActivities"
import * as personalSourcesEmailActivities from "./workflows/receivePersonalSourcesEmailActivities"
import { PODCAST_EPISODE_TASK_QUEUE } from "./workflows/recordPodcastEpisode"
import * as podcastEpisodeActivities from "./workflows/recordPodcastEpisodeActivities"
import * as topicPodcastEpisodeVideoActivities from "./workflows/renderTopicPodcastEpisodeVideoActivities"
import { SCAN_CLOSING_TASK_QUEUE } from "./workflows/runTopicScan"
import * as scanActivities from "./workflows/runTopicScanActivities"
import * as sourceActivities from "./workflows/screenSourceActivities"
import * as pushActivities from "./workflows/sendPushNotificationsActivities"
import { SCAN_EMAIL_TASK_QUEUE } from "./workflows/sendScanEmail"
import * as scanEmailActivities from "./workflows/sendScanEmailActivities"
import * as personalSourcesActivities from "./workflows/summarizePersonalSourcesContextActivities"
import * as topicImageActivities from "./workflows/topicImageWorkflowActivities"

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
const TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY = topicPodcastEpisodeVideoConcurrency()
const TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY = topicPodcastEpisodeVideoBackfillConcurrency()

// what this replica starts for films. zero films turns films off, and a backfill concurrency of zero turns the
// backfill off
const TOPIC_PODCAST_EPISODE_VIDEO_STARTUP = readTopicPodcastEpisodeVideoStartup()

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
	// monitoring, then tracing for this worker's model calls, in that order so Langfuse keeps its own provider beside Sentry's.
	// both do nothing without their keys. then size the connection pool from the database
	startMonitoring()
	startTelemetry()
	validatePersonalSourcesEmailSettings()
	await sizeConnectionPool()

	// a Worker polls exactly one queue and takes one workflowsPath
	const connection = await connectWithRetry()
	const workers = await Promise.all([
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
		...(TOPIC_PODCAST_EPISODE_VIDEO_STARTUP.isTopicPodcastEpisodeVideoQueuePolled
			? createTopicPodcastEpisodeVideoWorkers(connection)
			: []),
	])

	// log the pool, the event loop delay, the scan queue, and Redis once a minute, and warn on a backed-up queue or a
	// Redis connection that is down. it starts after the workflow bundles build, so building them never reads as a stall
	startRuntimeGauges({ processName: "worker", readPoolGauges, readExtraGauges: readWorkerExtraGauges })

	// any worker stopping ends the process. once the workers poll, the film backfill starts or joins without a wait,
	// unless the backfill is off
	hasStartedPolling = true
	if (TOPIC_PODCAST_EPISODE_VIDEO_STARTUP.isTopicPodcastEpisodeVideoBackfillStarted) {
		startTopicPodcastEpisodeVideoBackfill()
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

// the film workers: new films and rebuilds on one queue, and the backfill of each Topic's latest podcast episode on
// another, so neither waits behind the other and neither takes a recording's slot
function createTopicPodcastEpisodeVideoWorkers(connection: NativeConnection): Promise<Worker>[] {
	// renders a published podcast episode's film, and rebuilds one for a new image
	const topicPodcastEpisodeVideoWorker = Worker.create({
		connection,
		workflowsPath: new URL("./workflows/renderTopicPodcastEpisodeVideo.ts", import.meta.url).pathname,
		activities: topicPodcastEpisodeVideoActivities,
		taskQueue: TOPIC_PODCAST_EPISODE_VIDEO_TASK_QUEUE,
		shutdownGraceTime: SHUTDOWN_GRACE_MS,
		maxConcurrentActivityTaskExecutions: TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY,
	})

	// leave the backfill's queue unpolled if the backfill is off
	if (!TOPIC_PODCAST_EPISODE_VIDEO_STARTUP.isTopicPodcastEpisodeVideoBackfillStarted) {
		return [topicPodcastEpisodeVideoWorker]
	}

	// gives each Topic's latest podcast episode a film, with the film render's activities
	const topicPodcastEpisodeVideoBackfillWorker = Worker.create({
		connection,
		workflowsPath: new URL("./workflows/backfillTopicPodcastEpisodeVideos.ts", import.meta.url).pathname,
		activities: { ...topicPodcastEpisodeVideoActivities, ...topicPodcastEpisodeVideoBackfillActivities },
		taskQueue: TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_TASK_QUEUE,
		shutdownGraceTime: SHUTDOWN_GRACE_MS,
		maxConcurrentActivityTaskExecutions: TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY,
	})
	return [topicPodcastEpisodeVideoWorker, topicPodcastEpisodeVideoBackfillWorker]
}

// start or join the film backfill without waiting for it. the workflow logs its own summary, and a failed start is
// reported while the worker keeps polling
function startTopicPodcastEpisodeVideoBackfill(): void {
	startTopicPodcastEpisodeVideoBackfillWorkflow(TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY).catch(
		(error: unknown) => reportError(error, "topic-podcast-episode-video", { step: "backfill" }),
	)
}

// what a replica starts for films: whether a Worker polls the film queue, and whether the film backfill starts, with a
// Worker on the backfill's own queue
type TopicPodcastEpisodeVideoStartup = {
	isTopicPodcastEpisodeVideoQueuePolled: boolean
	isTopicPodcastEpisodeVideoBackfillStarted: boolean
}

/**
 * Returns what a replica starts for films, read from the film settings. Films that are off start nothing, and a
 * backfill concurrency of zero starts no backfill and leaves the film queue polled.
 */
export function readTopicPodcastEpisodeVideoStartup(): TopicPodcastEpisodeVideoStartup {
	return {
		isTopicPodcastEpisodeVideoQueuePolled: topicPodcastEpisodeVideoConcurrency() > 0,
		isTopicPodcastEpisodeVideoBackfillStarted: isTopicPodcastEpisodeVideoBackfillEnabled(),
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
