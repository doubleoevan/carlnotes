// the Temporal Workers that a worker replica creates, one per task queue, each with its activities and its slots

import {
	PERSONAL_SOURCES_EMAIL_TASK_QUEUE,
	PERSONAL_SOURCES_TASK_QUEUE,
} from "@carlnotes/contracts/personalSourcesWork"
import {
	PODCAST_EPISODE_ENCODE_TASK_QUEUE,
	PODCAST_EPISODE_SCHEDULED_CHAPTER_TASK_QUEUE,
	PODCAST_EPISODE_TASK_QUEUE,
} from "@carlnotes/contracts/podcastEpisodeWork"
import { TOPIC_MEMORY_TASK_QUEUE } from "@carlnotes/contracts/topicMemoryWork"
import {
	TOPIC_VIDEO_BACKFILL_TASK_QUEUE,
	TOPIC_VIDEO_REBUILD_TASK_QUEUE,
	TOPIC_VIDEO_TASK_QUEUE,
	TOPIC_VIDEO_WRITE_TASK_QUEUE,
} from "@carlnotes/contracts/topicVideoWork"
import { PUSH_TASK_QUEUE } from "@carlnotes/pipeline/pushWorkflows"
import { SCAN_TASK_QUEUE, SCHEDULED_SCAN_TASK_QUEUE } from "@carlnotes/pipeline/scanWorkflowClient"
import {
	ATTACHMENT_TASK_QUEUE,
	DASHBOARD_TASK_QUEUE,
	SOURCE_TASK_QUEUE,
	TOPIC_IMAGE_TASK_QUEUE,
	TOPIC_POST_TASK_QUEUE,
} from "@carlnotes/pipeline/temporalClient"
import { startTopicVideoBackfillWorkflow } from "@carlnotes/pipeline/topicVideo/topicVideoWorkflowClient"
import { toPositiveInteger } from "@carlnotes/server/envSettings"
import { reportError } from "@carlnotes/server/monitoring"
import {
	isTopicVideoBackfillEnabled,
	podcastEncodeConcurrency,
	podcastScheduledChapterConcurrency,
	topicVideoBackfillConcurrency,
	topicVideoConcurrency,
} from "@carlnotes/server/podcastEpisodeSettings"
import { topicMemoryConcurrency } from "@carlnotes/server/topicMemorySettings"
import { type NativeConnection, Worker, type WorkerOptions } from "@temporalio/worker"
import { readWorkerQueueGroup } from "./workerQueueGroup"
import * as topicVideoBackfillActivities from "./workflows/backfillTopicVideosActivities"
import * as dashboardActivities from "./workflows/buildDashboardSnapshotsActivities"
import * as attachmentActivities from "./workflows/processAttachmentActivities"
import * as topicPostActivities from "./workflows/publishTopicPostActivities"
import * as personalSourcesEmailActivities from "./workflows/receivePersonalSourcesEmailActivities"
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

// how many scan activities may run at once on this replica, from the SCAN_CONCURRENCY setting or the default. a
// Scan waits on fetches and model calls, so 24 at once, with the scheduled Scans' slots, took a fifth of a core and
// under 100 MB more than 16 did
const DEFAULT_SCAN_CONCURRENCY = 16
const SCAN_CONCURRENCY = toPositiveInteger(Bun.env.SCAN_CONCURRENCY, DEFAULT_SCAN_CONCURRENCY)

// how many scheduled scan activities may run at once on this replica beside those, from the
// SCHEDULED_SCAN_CONCURRENCY setting or the default
const DEFAULT_SCHEDULED_SCAN_CONCURRENCY = 8
const SCHEDULED_SCAN_CONCURRENCY = toPositiveInteger(
	Bun.env.SCHEDULED_SCAN_CONCURRENCY,
	DEFAULT_SCHEDULED_SCAN_CONCURRENCY,
)

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

// how many of a scheduled Scan's chapters record at once on this replica, from PODCAST_SCHEDULED_CHAPTER_CONCURRENCY or
// the default. each holds an open speech request while it waits for capacity
const PODCAST_SCHEDULED_CHAPTER_CONCURRENCY = podcastScheduledChapterConcurrency()

// how many podcast episodes encode at once on this replica, from PODCAST_ENCODE_CONCURRENCY or the default
const PODCAST_ENCODE_CONCURRENCY = podcastEncodeConcurrency()

// how many topic memory updates may run at once on this replica, from TOPIC_MEMORY_CONCURRENCY or the default
const TOPIC_MEMORY_CONCURRENCY = topicMemoryConcurrency()

// how many Dashboard build batches run at once on this replica. each reads a year of daily counts per Dashboard
const DASHBOARD_CONCURRENCY = 2

// how many films render at once on this replica, and how many the backfill renders
const TOPIC_VIDEO_CONCURRENCY = topicVideoConcurrency()
const TOPIC_VIDEO_BACKFILL_CONCURRENCY = topicVideoBackfillConcurrency()

// how many of a film's short writes may run at once on this replica: the row written once a render is queued, and the
// failure mark
const TOPIC_VIDEO_WRITE_CONCURRENCY = 8

// what this replica starts for films. zero films turns films off, and a backfill concurrency of zero turns the
// backfill off
export const TOPIC_VIDEO_STARTUP = readTopicVideoStartup()

/**
 * Creates the main queue group's Workers: recording dispatch, the scans, and every queue outside film encoding.
 */
export function createMainWorkers(connection: NativeConnection): Promise<Worker>[] {
	return [
		// receive bounded mail independently of model calls and Scan slots
		createWorker(connection, {
			workflowFile: "receivePersonalSourcesEmail.ts",
			activities: personalSourcesEmailActivities,
			taskQueue: PERSONAL_SOURCES_EMAIL_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: SCAN_EMAIL_CONCURRENCY,
		}),
		// rebuild private personal sources context independently of Scan and attachment slots
		createWorker(connection, {
			workflowFile: "summarizePersonalSourcesContext.ts",
			activities: personalSourcesActivities,
			taskQueue: PERSONAL_SOURCES_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: SCREEN_CONCURRENCY,
		}),
		// extracts an attachment's text and generates its context
		createWorker(connection, {
			workflowFile: "processAttachment.ts",
			activities: attachmentActivities,
			taskQueue: ATTACHMENT_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: SCREEN_CONCURRENCY,
		}),
		// runs one dispatched Scan: ingest and review
		createWorker(connection, {
			workflowFile: "runTopicScan.ts",
			activities: scanActivities,
			taskQueue: SCAN_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: SCAN_CONCURRENCY,
		}),
		// runs the scheduled Scans on slots of their own, so a person's first or manual Scan never waits behind them
		createWorker(connection, {
			workflowFile: "runTopicScan.ts",
			activities: scanActivities,
			taskQueue: SCHEDULED_SCAN_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: SCHEDULED_SCAN_CONCURRENCY,
		}),
		// updates topic memories on slots of their own, apart from the scan and recording slots
		createWorker(connection, {
			workflowFile: "topicMemories.ts",
			activities: topicMemoryActivities,
			taskQueue: TOPIC_MEMORY_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: TOPIC_MEMORY_CONCURRENCY,
		}),
		// records a Scan's outcome: the closing writes on their own queue, with every scan activity registered
		createWorker(connection, {
			activities: scanActivities,
			taskQueue: SCAN_CLOSING_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: SCAN_CLOSING_CONCURRENCY,
		}),
		// emails a completed Scan's outcome, one activity per Resend call
		createWorker(connection, {
			workflowFile: "sendScanEmail.ts",
			activities: scanEmailActivities,
			taskQueue: SCAN_EMAIL_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: SCAN_EMAIL_CONCURRENCY,
		}),
		// pushes a Scan's new Findings and a room message's chat mentions to phones, then reads their receipts
		createWorker(connection, {
			workflowFile: "sendPushNotifications.ts",
			activities: pushActivities,
			taskQueue: PUSH_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: PUSH_CONCURRENCY,
		}),
		// records a succeeded Scan's Podcast Episode, one activity per script call and per chapter
		createWorker(connection, {
			workflowFile: "recordPodcastEpisode.ts",
			activities: podcastEpisodeActivities,
			taskQueue: PODCAST_EPISODE_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: PODCAST_RECORDING_CONCURRENCY,
		}),
		// records a scheduled Scan's chapters on their own queue, with every recording activity registered and no workflow
		// bundle, so a chapter that waits for speech capacity never holds a recording slot
		createWorker(connection, {
			activities: podcastEpisodeActivities,
			taskQueue: PODCAST_EPISODE_SCHEDULED_CHAPTER_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: PODCAST_SCHEDULED_CHAPTER_CONCURRENCY,
		}),
		// joins and encodes a podcast episode's audio on a queue of its own, with every recording activity registered
		// and no workflow bundle, so encodes that arrive together wait for a core instead of sharing one
		createWorker(connection, {
			activities: podcastEpisodeActivities,
			taskQueue: PODCAST_EPISODE_ENCODE_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: PODCAST_ENCODE_CONCURRENCY,
		}),
		// writes a film's row once its render is queued and marks a failed film, on a queue of their own with no workflow
		// bundle, so neither write waits behind a render or for a film replica
		createWorker(connection, {
			activities: {
				saveTopicPodcastEpisodeVideoRenderingActivity:
					topicVideoActivities.saveTopicPodcastEpisodeVideoRenderingActivity,
				markTopicPodcastEpisodeVideoFailedActivity: topicVideoActivities.markTopicPodcastEpisodeVideoFailedActivity,
			},
			taskQueue: TOPIC_VIDEO_WRITE_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: TOPIC_VIDEO_WRITE_CONCURRENCY,
		}),
		// draws a topic's image, one scene call and one image call then the store, and runs the backfill over them
		createWorker(connection, {
			workflowFile: "topicImageWorkflows.ts",
			activities: topicImageActivities,
			taskQueue: TOPIC_IMAGE_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: SCREEN_CONCURRENCY,
		}),
		// runs what follows a Topic Post's publish: its summary and the start of its image's render
		createWorker(connection, {
			workflowFile: "publishTopicPost.ts",
			activities: topicPostActivities,
			taskQueue: TOPIC_POST_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: SCREEN_CONCURRENCY,
		}),
		// fetches a url Source's page to check that it can be read
		createWorker(connection, {
			workflowFile: "screenSource.ts",
			activities: sourceActivities,
			taskQueue: SOURCE_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: SCREEN_CONCURRENCY,
		}),
		// builds the Dashboards' snapshots, nightly and after a change to who may see a Dashboard's items
		createWorker(connection, {
			workflowFile: "buildDashboardSnapshots.ts",
			activities: dashboardActivities,
			taskQueue: DASHBOARD_TASK_QUEUE,
			maxConcurrentActivityTaskExecutions: DASHBOARD_CONCURRENCY,
		}),
	]
}

/**
 * Creates the film Workers: new films on one queue, rebuilds on another, and the backfill of each Topic's latest
 * podcast episode on a third, so none waits behind another for a Worker and none takes a recording's slot.
 */
export function createTopicVideoWorkers(connection: NativeConnection): Promise<Worker>[] {
	// renders a published podcast episode's film. it keeps the rebuild registered for a rebuild that started on this
	// queue before the rebuilds had their own
	const topicVideoWorker = createWorker(connection, {
		workflowFile: "renderTopicVideo.ts",
		activities: topicVideoActivities,
		taskQueue: TOPIC_VIDEO_TASK_QUEUE,
		maxConcurrentActivityTaskExecutions: TOPIC_VIDEO_CONCURRENCY,
	})

	// rebuilds a film for a new image, one at a time, in the rebuilds' own slot
	const topicVideoRebuildWorker = createWorker(connection, {
		workflowFile: "renderTopicVideo.ts",
		activities: topicVideoActivities,
		taskQueue: TOPIC_VIDEO_REBUILD_TASK_QUEUE,
		maxConcurrentActivityTaskExecutions: 1,
	})

	// leave the backfill's queue unpolled if the backfill is off
	if (!TOPIC_VIDEO_STARTUP.isTopicVideoBackfillStarted) {
		return [topicVideoWorker, topicVideoRebuildWorker]
	}

	// gives each Topic's latest podcast episode a film. each render is the film's own workflow as the backfill's child,
	// so the Worker's bundle and activities hold the film render's too
	const topicVideoBackfillWorker = createWorker(connection, {
		workflowFile: "backfillTopicVideos.ts",
		activities: { ...topicVideoActivities, ...topicVideoBackfillActivities },
		taskQueue: TOPIC_VIDEO_BACKFILL_TASK_QUEUE,
		maxConcurrentActivityTaskExecutions: TOPIC_VIDEO_BACKFILL_CONCURRENCY,
	})
	return [topicVideoWorker, topicVideoRebuildWorker, topicVideoBackfillWorker]
}

// a Worker's options without its connection and shutdown grace, which every Worker shares, and with the name of its
// workflow file under ./workflows/ if it runs workflows
type CreateWorkerOptions = Omit<WorkerOptions, "connection" | "shutdownGraceTime" | "workflowsPath"> & {
	workflowFile?: string
}

// create one Worker on the connection with the shutdown grace, bundling its workflow file if it has one
function createWorker(
	connection: NativeConnection,
	{ workflowFile, ...workerOptions }: CreateWorkerOptions,
): Promise<Worker> {
	const workflowsPath = workflowFile ? new URL(`./workflows/${workflowFile}`, import.meta.url).pathname : undefined
	return Worker.create({
		connection,
		...(workflowsPath && { workflowsPath }),
		shutdownGraceTime: SHUTDOWN_GRACE_MS,
		...workerOptions,
	})
}

/**
 * Starts or joins the film backfill without waiting for it. The workflow logs its own summary, and a failed start is
 * reported while the worker keeps polling.
 */
export function startTopicVideoBackfill(): void {
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
