// the five kinds of row that the sweep's reaper reaps, each with the read of its rows past their limit, the restart of
// a row's work, and the write that fails a row for good, and the sweep's reap of them all. each limit is the kind's
// workflow's longest run from stageTimeouts.ts and the reaper's margin.
// ponytail: each kind's read scans its table once a sweep, except the podcast episodes', which has an index. give a
// kind a partial index on its status if its table passes a few hundred thousand rows

import { toPodcastEpisodeWorkflowId } from "@carlnotes/contracts/podcastEpisodeWork"
import { toTopicVideoWorkflowId } from "@carlnotes/contracts/topicVideoWork"
import { db } from "@carlnotes/db"
import { toFirstScanFilter } from "@carlnotes/db/dailySpendCutoffs"
import { podcastEpisodes, topicVideos } from "@carlnotes/db/schema/podcast"
import { scans } from "@carlnotes/db/schema/scans"
import { topicImageRenders } from "@carlnotes/db/schema/topicImages"
import { topicPostDiscussions } from "@carlnotes/db/schema/topicPosts"
import { attachments } from "@carlnotes/db/schema/topics"
import { failPodcastEpisode } from "@carlnotes/pipeline/podcast/publishPodcastEpisode"
import {
	MAX_ATTACHMENT_PROCESSING_MS,
	MAX_PODCAST_EPISODE_RECORDING_MS,
	MAX_TOPIC_IMAGE_RENDER_MS,
	MAX_TOPIC_POST_DISCUSSION_RECORDING_MS,
	MAX_TOPIC_VIDEO_RENDER_MS,
	REAPER_MARGIN_MS,
} from "@carlnotes/pipeline/stageTimeouts"
import {
	startAttachmentWorkflow,
	startPodcastEpisodeRecordingWorkflow,
	startTopicImageWorkflow,
	startTopicPostDiscussionWorkflow,
	toAttachmentWorkflowId,
	toTopicImageWorkflowId,
	toTopicPostDiscussionWorkflowId,
} from "@carlnotes/pipeline/temporalClient"
import { deletePendingTopicImageRender } from "@carlnotes/pipeline/topicImages/topicImageRenders"
import { failTopicPostDiscussion } from "@carlnotes/pipeline/topicPosts/topicPostDiscussions"
import { markTopicVideoFailed } from "@carlnotes/pipeline/topicVideo/topicVideoFailures"
import { startTopicVideoRenderWorkflow } from "@carlnotes/pipeline/topicVideo/topicVideoWorkflowClient"
import { reportError } from "@carlnotes/server/monitoring"
import { newTopicVideoRenderVersion } from "@carlnotes/server/podcastEpisodeSettings"
import { and, asc, eq, type InferColumnsDataTypes, isNull, lt, sql } from "drizzle-orm"
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core"
import {
	REAP_BATCH_SIZE,
	type ReapedKind,
	type ReapSummary,
	reapStaleRows,
	type StaleRow,
	toCreatedStaleRow,
	toRestartState,
	toStartedBeforeFilter,
} from "./reaper"
import { toScanTrigger } from "./scanQueue"
import { failAttachment } from "./workflows/processAttachmentActivities"
import { isTopicPodcastEpisodeVideoEnabled } from "./workflows/recordPodcastEpisodeActivities"

// a podcast episode still recording past its limit, with what a restart of its recording takes: its Scan, its Topic,
// the user it bills, and what asked for the Scan
type StalePodcastEpisodeRow = StaleRow & {
	scanId: string | null
	topicId: string | null
	ownerId: string
	isManualScan: boolean
	isFirstScan: boolean
}

// read the podcast episodes still recording whose recording began before a time. the status is written into the query
// as a literal, so the planner can prove the partial index's predicate
async function loadStalePodcastEpisodeRows(startedBefore: Date): Promise<StalePodcastEpisodeRow[]> {
	const podcastEpisodeRows = await db
		.select({
			id: podcastEpisodes.id,
			scanId: podcastEpisodes.scanId,
			topicId: podcastEpisodes.topicId,
			ownerId: podcastEpisodes.ownerId,
			createdAt: podcastEpisodes.createdAt,
			restartedAt: podcastEpisodes.restartedAt,
			isManualScan: scans.isManual,
			isFirstScan: sql<boolean>`${toFirstScanFilter()}`,
		})
		.from(podcastEpisodes)
		.leftJoin(scans, eq(scans.id, podcastEpisodes.scanId))
		.where(
			and(
				sql`${podcastEpisodes.status} = 'recording'`,
				toStartedBeforeFilter(podcastEpisodes.restartedAt, podcastEpisodes.createdAt, startedBefore),
			),
		)
		.orderBy(asc(podcastEpisodes.createdAt))
		.limit(REAP_BATCH_SIZE)

	// a recording is named by its Scan, and it can start again only with its Scan and its Topic still there
	return podcastEpisodeRows.map(({ createdAt, restartedAt, isManualScan, ...podcastEpisodeRow }) => ({
		...podcastEpisodeRow,
		isManualScan: isManualScan ?? false,
		workflowId: podcastEpisodeRow.scanId ? toPodcastEpisodeWorkflowId(podcastEpisodeRow.scanId) : null,
		startedAt: restartedAt ?? createdAt,
		restartState: toRestartState(restartedAt, podcastEpisodeRow.topicId !== null),
	}))
}

// start a podcast episode's recording again with the input its Scan started it with, then record the restart on the
// row. the recording reuses its row, its saved script, and its stored chapters
async function restartPodcastEpisodeRecording(staleRow: StalePodcastEpisodeRow): Promise<void> {
	const { scanId, topicId, ownerId, isManualScan, isFirstScan } = staleRow
	if (!scanId || !topicId) {
		throw new Error(`podcast episode ${staleRow.id} has no Scan or no Topic to record from`)
	}

	// the same workflow, id, queue, and input as the Scan's own child start
	const trigger = toScanTrigger({ isManual: isManualScan, isFirstScan })
	await startPodcastEpisodeRecordingWorkflow({ scanId, topicId, billedUserId: ownerId, trigger })
	await recordRestart(podcastEpisodes, staleRow.id, "recording")
}

// the podcast episodes stuck recording. the limit is the recording's longest run and the margin
export const STALE_PODCAST_EPISODES: ReapedKind<StalePodcastEpisodeRow> = {
	name: "podcast episode",
	stage: "podcast-episode",
	limitMs: MAX_PODCAST_EPISODE_RECORDING_MS + REAPER_MARGIN_MS,
	loadStaleRows: loadStalePodcastEpisodeRows,
	restartWork: restartPodcastEpisodeRecording,
	failRow: (staleRow, reason) => failPodcastEpisode({ podcastEpisodeId: staleRow.id, reason }),
}

// a film still rendering past its limit: its podcast episode, and whether the platform pays for a render started again
type StaleTopicVideoRow = StaleRow & { podcastEpisodeId: string; isPlatformBilled: boolean }

// read the first renders still rendering whose row was last written before a time, or none while films are off or
// paused. each attempt of a first render writes its row, so the limit runs from the last write. a film marked rendering
// after its image was removed keeps its stored film, which its rebuild finishes, so the read leaves it out
async function loadStaleTopicVideoRows(startedBefore: Date): Promise<StaleTopicVideoRow[]> {
	if (!(await isTopicPodcastEpisodeVideoEnabled())) {
		return []
	}
	const topicVideoRows = await db
		.select({
			id: topicVideos.id,
			podcastEpisodeId: topicVideos.podcastEpisodeId,
			cost: topicVideos.cost,
			updatedAt: topicVideos.updatedAt,
			restartedAt: topicVideos.restartedAt,
		})
		.from(topicVideos)
		.where(
			and(
				sql`${topicVideos.status} = 'rendering'`,
				isNull(topicVideos.filmKey),
				lt(topicVideos.updatedAt, startedBefore),
			),
		)
		.orderBy(asc(topicVideos.updatedAt))
		.limit(REAP_BATCH_SIZE)

	// a render is named by its podcast episode. a row that no user was charged for, as a backfill's first render reads,
	// is the platform's to pay for again
	return topicVideoRows.map(({ cost, updatedAt, restartedAt, ...topicVideoRow }) => ({
		...topicVideoRow,
		isPlatformBilled: Number(cost) === 0,
		workflowId: toTopicVideoWorkflowId(topicVideoRow.podcastEpisodeId),
		startedAt: updatedAt,
		restartState: toRestartState(restartedAt, true),
	}))
}

// start a film's render again at the version that new films render at, then record the restart on the row. the write
// also starts the row's limit again
async function restartTopicVideoRender({ id, podcastEpisodeId, isPlatformBilled }: StaleTopicVideoRow): Promise<void> {
	const renderVersion = newTopicVideoRenderVersion()
	await startTopicVideoRenderWorkflow({ podcastEpisodeId, renderVersion, isPlatformBilled })
	await recordRestart(topicVideos, id, "rendering")
}

// the films stuck rendering. a film that is rendered again keeps its row ready, so the reaper never reads it
export const STALE_TOPIC_VIDEOS: ReapedKind<StaleTopicVideoRow> = {
	name: "film",
	stage: "topic-video",
	limitMs: MAX_TOPIC_VIDEO_RENDER_MS + REAPER_MARGIN_MS,
	loadStaleRows: loadStaleTopicVideoRows,
	restartWork: restartTopicVideoRender,
	failRow: ({ podcastEpisodeId }, reason) => markTopicVideoFailed({ podcastEpisodeId, reason }),
}

// start a discussion's recording again on its own row, so it counts as no second regeneration and bills the user who
// started it, then record the restart. the starter's note for the hosts went to the first workflow alone and is never
// stored, and a script already saved is reused
async function restartDiscussionRecording({ id }: StaleRow): Promise<void> {
	await startTopicPostDiscussionWorkflow({ discussionId: id })
	await recordRestart(topicPostDiscussions, id, "recording")
}

// the Topic Post Discussions stuck recording. a failed one leaves the Topic Post's earlier discussion playing
export const STALE_TOPIC_POST_DISCUSSIONS: ReapedKind<StaleRow> = {
	name: "topic post discussion",
	stage: "podcast-episode",
	limitMs: MAX_TOPIC_POST_DISCUSSION_RECORDING_MS + REAPER_MARGIN_MS,
	loadStaleRows: (startedBefore) =>
		loadCreatedStaleRows({
			table: topicPostDiscussions,
			status: "recording",
			toWorkflowId: toTopicPostDiscussionWorkflowId,
			startedBefore,
		}),
	restartWork: restartDiscussionRecording,
	failRow: (staleRow, reason) => failTopicPostDiscussion(staleRow.id, reason),
}

// a topic image render still pending past its limit, with the Topic its workflow is started for
type StaleTopicImageRenderRow = StaleRow & { topicId: string }

// start a topic image render again on its own row, then record the restart. the owner's image prompt went to the first
// workflow alone and is never stored: a scene already written is reused, and one not yet written follows the house
// style
async function restartTopicImageRender({ id, topicId }: StaleTopicImageRenderRow): Promise<void> {
	await startTopicImageWorkflow({ topicId, renderId: id })
	await recordRestart(topicImageRenders, id, "pending")
}

// delete a render row for good and report it. the deleted row gives its regeneration back to the month's count, and
// the current image stays as it was
async function deleteStaleTopicImageRender({ id }: StaleTopicImageRenderRow, reason: string): Promise<void> {
	if (await deletePendingTopicImageRender(id)) {
		reportError(new Error("a topic image render never finished and was deleted"), "topic-image", {
			renderId: id,
			reason,
		})
	}
}

// the topic image renders stuck pending
export const STALE_TOPIC_IMAGE_RENDERS: ReapedKind<StaleTopicImageRenderRow> = {
	name: "topic image render",
	stage: "topic-image",
	limitMs: MAX_TOPIC_IMAGE_RENDER_MS + REAPER_MARGIN_MS,
	loadStaleRows: (startedBefore) =>
		loadCreatedStaleRows({
			table: topicImageRenders,
			status: "pending",
			toWorkflowId: toTopicImageWorkflowId,
			startedBefore,
			extraColumns: { topicId: topicImageRenders.topicId },
		}),
	restartWork: restartTopicImageRender,
	failRow: deleteStaleTopicImageRender,
}

// start an attachment's processing again on its own row and its stored file, then record the restart
async function restartAttachmentProcessing({ id }: StaleRow): Promise<void> {
	await startAttachmentWorkflow(id)
	await recordRestart(attachments, id, "pending")
}

// fail an attachment that is still pending, as its own workflow fails it, and report it
async function failStaleAttachment({ id }: StaleRow, reason: string): Promise<void> {
	await failAttachment(id, reason, true)
	reportError(new Error("an attachment never finished processing and was failed"), "worker", {
		attachmentId: id,
		reason,
	})
}

// the attachments stuck pending
export const STALE_ATTACHMENTS: ReapedKind<StaleRow> = {
	name: "attachment",
	stage: "worker",
	limitMs: MAX_ATTACHMENT_PROCESSING_MS + REAPER_MARGIN_MS,
	loadStaleRows: (startedBefore) =>
		loadCreatedStaleRows({
			table: attachments,
			status: "pending",
			toWorkflowId: toAttachmentWorkflowId,
			startedBefore,
		}),
	restartWork: restartAttachmentProcessing,
	failRow: failStaleAttachment,
}

// a table whose rows the reaper starts again: its id, its status, and when the reaper last started a row again
type RestartedTable = PgTable & { id: PgColumn; status: PgColumn; restartedAt: PgColumn }

// the table to read, the status of its rows still in progress, a row's workflow id, the time their work began before,
// and any more columns that a kind's restart reads
type LoadCreatedStaleRowsOptions<ExtraColumns extends Record<string, PgColumn>> = {
	table: RestartedTable & { createdAt: PgColumn }
	status: string
	toWorkflowId: (id: string) => string
	startedBefore: Date
	extraColumns?: ExtraColumns
}

// read a table's rows still in a status whose work began before a time, oldest first, for a kind whose limit runs
// from a row's creation. the status is written into the query as a literal
async function loadCreatedStaleRows<ExtraColumns extends Record<string, PgColumn> = Record<never, PgColumn>>({
	table,
	status,
	toWorkflowId,
	startedBefore,
	extraColumns,
}: LoadCreatedStaleRowsOptions<ExtraColumns>): Promise<(StaleRow & ExtraRowData<ExtraColumns>)[]> {
	const createdRows = await db
		.select({ id: table.id, ...extraColumns, createdAt: table.createdAt, restartedAt: table.restartedAt })
		.from(table)
		.where(
			and(
				sql`${table.status} = ${sql.raw(`'${status}'`)}`,
				toStartedBeforeFilter(table.restartedAt, table.createdAt, startedBefore),
			),
		)
		.orderBy(asc(table.createdAt))
		.limit(REAP_BATCH_SIZE)

	// each row's workflow is named by its id, and any more columns go with it
	return (createdRows as CreatedStaleRowData<ExtraColumns>[]).map(({ id, createdAt, restartedAt, ...extraRow }) => ({
		...extraRow,
		...toCreatedStaleRow({ id, createdAt, restartedAt, workflowId: toWorkflowId(id) }),
	}))
}

// a row that loadCreatedStaleRows reads: its id, when it was written and started again, and any more columns
type CreatedStaleRowData<ExtraColumns extends Record<string, PgColumn>> = {
	id: string
	createdAt: Date
	restartedAt: Date | null
} & InferColumnsDataTypes<ExtraColumns>

// the more columns of a row that loadCreatedStaleRows reads, without the ones every row has
type ExtraRowData<ExtraColumns extends Record<string, PgColumn>> = Omit<
	CreatedStaleRowData<ExtraColumns>,
	"id" | "createdAt" | "restartedAt"
>

// record on a row that the reaper started its work again, if the row still has the status the reaper read
async function recordRestart<Table extends RestartedTable>(table: Table, id: string, status: string): Promise<void> {
	await db
		.update(table)
		.set({ restartedAt: new Date() } as PgUpdateSetSource<Table>)
		.where(and(eq(table.id, id), eq(table.status, status)))
}

// reap one kind's rows, with the signal that the sweep's lease aborts
type ReapKind = (signal?: AbortSignal) => Promise<ReapSummary>

// the five kinds in the order the sweep reaps them, each under the name its log line and its report use
const REAPED_KINDS: Record<string, ReapKind> = {
	"podcast episodes": (signal) => reapStaleRows({ reapedKind: STALE_PODCAST_EPISODES, signal }),
	films: (signal) => reapStaleRows({ reapedKind: STALE_TOPIC_VIDEOS, signal }),
	"topic post discussions": (signal) => reapStaleRows({ reapedKind: STALE_TOPIC_POST_DISCUSSIONS, signal }),
	"topic image renders": (signal) => reapStaleRows({ reapedKind: STALE_TOPIC_IMAGE_RENDERS, signal }),
	attachments: (signal) => reapStaleRows({ reapedKind: STALE_ATTACHMENTS, signal }),
}

/**
 * Reaps every kind of row left in progress past its limit, after the sweep has reaped its stale Scans, and logs what it
 * did with each kind. A kind whose reap fails is reported, and the next kind still runs.
 */
export async function reapStaleWork(signal?: AbortSignal): Promise<void> {
	for (const [kindName, reapKind] of Object.entries(REAPED_KINDS)) {
		signal?.throwIfAborted()
		try {
			// log a kind that had a row past its limit
			const reapSummary = await reapKind(signal)
			if (Object.values(reapSummary).some((rowCount) => rowCount > 0)) {
				const { restarted, failed, running, terminated, unread } = reapSummary
				console.log(
					`reaper: ${kindName}: ${restarted} started again, ${failed} failed, ${running} still running, ${terminated} terminated, ${unread} left unread`,
				)
			}
		} catch (error) {
			// a lost lease stops the sweep, and anything else is this kind's failure alone
			signal?.throwIfAborted()
			console.error(`could not reap the stale ${kindName}`, error)
			reportError(error, "scheduled-scan", { reapedKind: kindName })
		}
	}
}
