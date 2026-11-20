// what the worker adds to its minute line: the pollers, the backlog, and the oldest wait of each queue it gauges, with
// the backlogs that have waited too long, and the Redis gauges

import {
	PODCAST_EPISODE_ENCODE_TASK_QUEUE,
	PODCAST_EPISODE_SCHEDULED_CHAPTER_TASK_QUEUE,
} from "@carlnotes/contracts/podcastEpisodeWork"
import { HOUR_MS, MINUTE_MS } from "@carlnotes/contracts/time"
import { TOPIC_MEMORY_TASK_QUEUE } from "@carlnotes/contracts/topicMemoryWork"
import { TOPIC_VIDEO_TASK_QUEUE, TOPIC_VIDEO_WRITE_TASK_QUEUE } from "@carlnotes/contracts/topicVideoWork"
import { readRedisExtraGauges } from "@carlnotes/db/redisGauges"
import {
	SCAN_BACKLOG_CROSSING,
	SCAN_TASK_QUEUE,
	SCHEDULED_SCAN_TASK_QUEUE,
} from "@carlnotes/pipeline/scanWorkflowClient"
import {
	type BacklogCrossing,
	describeTaskQueue,
	type TaskQueueDescription,
	toBacklogCrossing,
} from "@carlnotes/pipeline/temporalTaskQueues"
import type { ThresholdCrossing } from "@carlnotes/server/monitoring"
import type { ExtraGaugesReading } from "@carlnotes/server/runtimeGauges"
import { readReportedTaskQueue } from "./taskQueueReads"
import { readWorkerQueueGroup, type WorkerQueueGroup } from "./workerQueueGroup"
import { countTopicVideosLeft } from "./workflows/backfillTopicVideosActivities"

// a queue in the minute line: the field its numbers go under, the queue's name, and the report of a backlog whose
// oldest task has waited too long, for a queue whose wait is reported
export type GaugedQueue = { field: string; taskQueue: string; backlogCrossing?: BacklogCrossing }

// a scheduled Scan's chapter may wait six hours in all for a slot and for speech capacity, so an hour's wait for a
// slot alone is reported long before any chapter is left out
const SCHEDULED_CHAPTER_BACKLOG_CROSSING: BacklogCrossing = {
	alertMs: HOUR_MS,
	condition: "scheduled-chapter-backlog",
	message: "a scheduled podcast chapter waited over an hour for a slot",
}

// an encode takes a minute or two of one core, so one that waited fifteen minutes for a core means the main worker
// has too few cores for the podcast episodes that finish recording
const PODCAST_ENCODE_BACKLOG_CROSSING: BacklogCrossing = {
	alertMs: 15 * MINUTE_MS,
	condition: "podcast-encode-backlog",
	message: "a podcast episode's encode waited over 15 minutes for a core",
}

// a Scan's topic memories are what its user opens next, so an update that waited fifteen minutes for a slot is
// reported, as a Scan that waited that long is
const TOPIC_MEMORY_BACKLOG_CROSSING: BacklogCrossing = {
	alertMs: 15 * MINUTE_MS,
	condition: "topic-memory-backlog",
	message: "a topic memory update waited over 15 minutes for a slot",
}

// a film waits in the film queue only while every film Worker's slots are taken, so an hour's wait means the film
// service has too few replicas for the films that publish
const TOPIC_VIDEO_BACKLOG_CROSSING: BacklogCrossing = {
	alertMs: HOUR_MS,
	condition: "topic-video-backlog",
	message: "a film waited over an hour for a slot",
}

// the queues that a main worker gauges: a Scan's ingest and review, a scheduled Scan's, a scheduled Scan's chapters,
// a podcast episode's encode, and a Scan's topic memory update. the scheduled Scans' backlog is the sweep's own dispatch, which its dispatch limit
// bounds, so its wait is gauged and never reported
const MAIN_GAUGED_QUEUES: GaugedQueue[] = [
	{ field: "scanQueue", taskQueue: SCAN_TASK_QUEUE, backlogCrossing: SCAN_BACKLOG_CROSSING },
	{ field: "scheduledScanQueue", taskQueue: SCHEDULED_SCAN_TASK_QUEUE },
	{
		field: "scheduledChapterQueue",
		taskQueue: PODCAST_EPISODE_SCHEDULED_CHAPTER_TASK_QUEUE,
		backlogCrossing: SCHEDULED_CHAPTER_BACKLOG_CROSSING,
	},
	{
		field: "podcastEncodeQueue",
		taskQueue: PODCAST_EPISODE_ENCODE_TASK_QUEUE,
		backlogCrossing: PODCAST_ENCODE_BACKLOG_CROSSING,
	},
	{ field: "topicMemoryQueue", taskQueue: TOPIC_MEMORY_TASK_QUEUE, backlogCrossing: TOPIC_MEMORY_BACKLOG_CROSSING },
]

// a film's row at queue time and its failure mark are short writes that a main worker runs, so one that waited
// fifteen minutes means no main worker polls their queue, and every new film waits there before it renders
const TOPIC_VIDEO_WRITE_BACKLOG_CROSSING: BacklogCrossing = {
	alertMs: 15 * MINUTE_MS,
	condition: "topic-video-write-backlog",
	message: "a film's short write waited over 15 minutes for a main worker",
}

// the queues that a film replica gauges: the new films' renders, and the films' short writes, which the films it
// renders wait on
const FILM_GAUGED_QUEUES: GaugedQueue[] = [
	{ field: "topicVideoQueue", taskQueue: TOPIC_VIDEO_TASK_QUEUE, backlogCrossing: TOPIC_VIDEO_BACKLOG_CROSSING },
	{
		field: "topicVideoWriteQueue",
		taskQueue: TOPIC_VIDEO_WRITE_TASK_QUEUE,
		backlogCrossing: TOPIC_VIDEO_WRITE_BACKLOG_CROSSING,
	},
]

/**
 * Returns the queues that a worker in a queue group gauges: only the queues its own Workers poll, and every queue for
 * a worker with no queue group, which hosts every Worker.
 */
export function toGaugedQueues(queueGroup: WorkerQueueGroup): GaugedQueue[] {
	if (queueGroup === "main") {
		return MAIN_GAUGED_QUEUES
	}
	return queueGroup === "films" ? FILM_GAUGED_QUEUES : [...MAIN_GAUGED_QUEUES, ...FILM_GAUGED_QUEUES]
}

// the worker's queue group, and how a queue and the films left are read
type ReadWorkerExtraGaugesOptions = {
	queueGroup?: WorkerQueueGroup
	readTaskQueue?: (taskQueue: string) => Promise<TaskQueueDescription>
	readTopicVideosLeftCount?: () => Promise<number>
}

/**
 * Returns the worker's queue group, each gauged queue's numbers, and the Redis gauges for the minute line, with a
 * threshold crossing for each backlog whose oldest task has waited too long and for Redis. A worker that renders
 * films adds how many films are left to render. A queue that cannot be read is reported, shows as null, and leaves
 * the rest of the line as it is.
 */
export async function readWorkerExtraGauges({
	queueGroup = readWorkerQueueGroup(),
	readTaskQueue = describeTaskQueue,
	readTopicVideosLeftCount = readKeptTopicVideosLeftCount,
}: ReadWorkerExtraGaugesOptions = {}): Promise<ExtraGaugesReading> {
	// read every queue, the films left, and Redis together
	const [queueReadings, topicVideoGauges, redisExtraGauges] = await Promise.all([
		Promise.all(toGaugedQueues(queueGroup).map((gaugedQueue) => readGaugedQueue(gaugedQueue, readTaskQueue))),
		queueGroup === "main" ? {} : readTopicVideoGauges(readTopicVideosLeftCount),
		readRedisExtraGauges(),
	])

	// each queue's numbers under its field, then Redis
	const queueGauges = Object.fromEntries(
		queueReadings.map(({ gaugedQueue, taskQueueDescription }) => [gaugedQueue.field, taskQueueDescription]),
	)
	const backlogCrossings = queueReadings.flatMap(({ backlogCrossing }) => backlogCrossing ?? [])
	return {
		gauges: { queueGroup, ...queueGauges, ...topicVideoGauges, ...redisExtraGauges.gauges },
		thresholdCrossings: [...backlogCrossings, ...redisExtraGauges.thresholdCrossings],
	}
}

// how long the films left count is kept before it is read again, because the count is a pass over every Topic
const TOPIC_VIDEOS_LEFT_READ_MS = 10 * MINUTE_MS

// the last films left count and the time it was read, null before the first read
let topicVideosLeftReading: { topicVideosLeftCount: number; readAt: number } | null = null

// how many films are left to render, counted again at most every ten minutes. a failed count throws and keeps the
// last reading, so the next minute's line counts again
async function readKeptTopicVideosLeftCount(): Promise<number> {
	// the last count while it is under ten minutes old
	if (topicVideosLeftReading && Date.now() - topicVideosLeftReading.readAt < TOPIC_VIDEOS_LEFT_READ_MS) {
		return topicVideosLeftReading.topicVideosLeftCount
	}

	// count again, and keep the count with its time
	const topicVideosLeftCount = await countTopicVideosLeft()
	topicVideosLeftReading = { topicVideosLeftCount, readAt: Date.now() }
	return topicVideosLeftCount
}

// how many films are left to render: each Topic's latest podcast episode with no film, and each ready film below the
// current render version. a failed count shows as null and leaves the rest of the line as it is
async function readTopicVideoGauges(
	readTopicVideosLeftCount: () => Promise<number>,
): Promise<{ topicVideosLeftCount: number | null }> {
	try {
		return { topicVideosLeftCount: await readTopicVideosLeftCount() }
	} catch (error) {
		console.error("could not count the films left to render", error)
		return { topicVideosLeftCount: null }
	}
}

// one queue's reading: its numbers, or null if Temporal could not be read, and its backlog's crossing if it waited
// too long
type GaugedQueueReading = {
	gaugedQueue: GaugedQueue
	taskQueueDescription: TaskQueueDescription | null
	backlogCrossing: ThresholdCrossing | null
}

// read one queue, which shows as null in the line if Temporal could not be read
async function readGaugedQueue(
	gaugedQueue: GaugedQueue,
	readTaskQueue: (taskQueue: string) => Promise<TaskQueueDescription>,
): Promise<GaugedQueueReading> {
	const taskQueueDescription = await readReportedTaskQueue({
		taskQueue: gaugedQueue.taskQueue,
		readTaskQueue,
		stage: "worker",
		failureMessage: "the worker could not read a task queue",
	})
	const backlogCrossing =
		taskQueueDescription && gaugedQueue.backlogCrossing
			? toBacklogCrossing({ taskQueueDescription, ...gaugedQueue.backlogCrossing })
			: null
	return { gaugedQueue, taskQueueDescription, backlogCrossing }
}
