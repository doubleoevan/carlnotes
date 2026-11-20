// the reaper's five kinds of row: each kind's read of its rows still in progress, its restart on the same row, and the
// write that fails a row for good
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as publishPodcastEpisode from "@carlnotes/pipeline/podcast/publishPodcastEpisode"
import {
	MAX_ATTACHMENT_PROCESSING_MS,
	MAX_PODCAST_EPISODE_RECORDING_MS,
	MAX_TOPIC_IMAGE_RENDER_MS,
	MAX_TOPIC_POST_DISCUSSION_RECORDING_MS,
	MAX_TOPIC_VIDEO_RENDER_MS,
	REAPER_MARGIN_MS,
} from "@carlnotes/pipeline/stageTimeouts"
import * as temporalClient from "@carlnotes/pipeline/temporalClient"
import * as topicImageRenders from "@carlnotes/pipeline/topicImages/topicImageRenders"
import * as topicPostDiscussions from "@carlnotes/pipeline/topicPosts/topicPostDiscussions"
import * as topicVideoFailures from "@carlnotes/pipeline/topicVideo/topicVideoFailures"
import * as topicVideoWorkflowClient from "@carlnotes/pipeline/topicVideo/topicVideoWorkflowClient"
import * as monitoring from "@carlnotes/server/monitoring"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import {
	STALE_ATTACHMENTS,
	STALE_PODCAST_EPISODES,
	STALE_TOPIC_IMAGE_RENDERS,
	STALE_TOPIC_POST_DISCUSSIONS,
	STALE_TOPIC_VIDEOS,
} from "./reapedKinds"
import { NOT_RESTARTABLE_REASON, REAPED_REASON, reapStaleRows } from "./reaper"
import { NOW, spyOnTemporal } from "./reaperTestFixtures"
import * as attachmentActivities from "./workflows/processAttachmentActivities"
import * as recordingActivities from "./workflows/recordPodcastEpisodeActivities"

// put back the connection pool, the module mocks, and the film settings after each test
const restoreEnvSettings = saveEnvSettings(["TOPIC_VIDEO_ANIMATED_CHAPTERS", "TOPIC_VIDEO_CONCURRENCY"])
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
	restoreEnvSettings()
})

// a podcast episode row as the reaper reads it: id, Scan, Topic, owner, created, restarted, manual Scan, first Scan
function toPodcastEpisodeRow(podcastEpisodeRow: {
	scanId?: string | null
	topicId?: string | null
	restartedAt?: Date | null
	isManualScan?: boolean | null
	isFirstScan?: boolean
}): unknown[] {
	// a scheduled Scan's podcast episode that began recording nine hours ago, unless a field says otherwise
	const { scanId = "scan-1", topicId = "topic-1", restartedAt = null } = podcastEpisodeRow
	const { isManualScan = false, isFirstScan = false } = podcastEpisodeRow
	const createdAt = new Date(NOW.getTime() - 9 * 60 * 60 * 1000)
	return ["episode-1", scanId, topicId, "owner-1", createdAt, restartedAt, isManualScan, isFirstScan]
}

// stub the pool so the reaper reads one podcast episode row, with Temporal holding no workflow for it
function stubPodcastEpisodeReap(podcastEpisodeRow: unknown[]): {
	sentQueries: SentQuery[]
	startSpy: ReturnType<typeof spyOn>
	failSpy: ReturnType<typeof spyOn>
} {
	spyOnTemporal({ isRunning: false })
	const sentQueries = stubConnectionPool(({ text }) => (text.startsWith("select") ? [podcastEpisodeRow] : []))
	return {
		sentQueries,
		startSpy: spyOn(temporalClient, "startPodcastEpisodeRecordingWorkflow").mockResolvedValue(undefined),
		failSpy: spyOn(publishPodcastEpisode, "failPodcastEpisode").mockResolvedValue(undefined),
	}
}

test("the reaper reads only the podcast episodes still recording past the recording's longest run", async () => {
	const { sentQueries } = stubPodcastEpisodeReap(toPodcastEpisodeRow({}))
	await reapStaleRows({ reapedKind: STALE_PODCAST_EPISODES, now: NOW })

	// the status is a literal, so a published, failed, or removed row is never read, and the partial index serves it
	const readQuery = sentQueries[0]
	expect(readQuery?.text).toContain(`"episodes"."status" = 'recording'`)
	expect(readQuery?.text).toContain(`coalesce("episodes"."restarted_at", "episodes"."created_at") < `)
	expect(readQuery?.text).toContain(`order by "episodes"."created_at" asc limit `)

	// the limit is the recording's longest run with the margin: 9 hours 9 minutes and 15 seconds
	expect(STALE_PODCAST_EPISODES.limitMs).toBe(MAX_PODCAST_EPISODE_RECORDING_MS + REAPER_MARGIN_MS)
	expect(STALE_PODCAST_EPISODES.limitMs).toBe(32_955_000)
})

test("a podcast episode whose workflow is gone records again on its own row, with its Scan's input", async () => {
	// a scheduled Scan's, a manual Scan's, and a first Scan's podcast episode
	const scanRows = [
		{ row: {}, trigger: "scheduled" },
		{ row: { isManualScan: true }, trigger: "manual" },
		{ row: { isFirstScan: true }, trigger: "creation" },
	]
	for (const { row, trigger } of scanRows) {
		const { sentQueries, startSpy, failSpy } = stubPodcastEpisodeReap(toPodcastEpisodeRow(row))
		expect(await reapStaleRows({ reapedKind: STALE_PODCAST_EPISODES, now: NOW })).toMatchObject({
			restarted: 1,
			failed: 0,
		})

		// the recording starts under its Scan's id with the input the Scan gave it
		const recordingInput = { scanId: "scan-1", topicId: "topic-1", billedUserId: "owner-1", trigger }
		expect(startSpy.mock.calls).toEqual([[recordingInput]])
		expect(temporalClient.isWorkflowRunning).toHaveBeenCalledWith("episode-scan-1")

		// the restart is recorded on the row, only while it still reads recording, and nothing is failed
		const restartQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "episodes"'))
		expect(restartQuery?.text).toContain(`set "restarted_at" = `)
		expect(restartQuery?.values).toContain("recording")
		expect(failSpy).not.toHaveBeenCalled()
		restoreConnectionPool()
		mock.restore()
	}
})

test("a podcast episode that was already started again is failed with the reaper's reason", async () => {
	const restartedAt = new Date(NOW.getTime() - 9 * 60 * 60 * 1000)
	const { startSpy, failSpy } = stubPodcastEpisodeReap(toPodcastEpisodeRow({ restartedAt }))
	expect(await reapStaleRows({ reapedKind: STALE_PODCAST_EPISODES, now: NOW })).toMatchObject({
		restarted: 0,
		failed: 1,
	})
	expect(startSpy).not.toHaveBeenCalled()
	expect(failSpy.mock.calls).toEqual([[{ podcastEpisodeId: "episode-1", reason: REAPED_REASON }]])
})

// a deleted Scan clears the row's Scan id, which is the only name its workflow has
test("a podcast episode with no Scan is failed with no restart and no Temporal read", async () => {
	const { startSpy, failSpy } = stubPodcastEpisodeReap(toPodcastEpisodeRow({ scanId: null, isManualScan: null }))
	expect(await reapStaleRows({ reapedKind: STALE_PODCAST_EPISODES, now: NOW })).toMatchObject({
		restarted: 0,
		failed: 1,
	})
	expect(startSpy).not.toHaveBeenCalled()
	expect(temporalClient.isWorkflowRunning).not.toHaveBeenCalled()
	expect(failSpy.mock.calls).toEqual([[{ podcastEpisodeId: "episode-1", reason: NOT_RESTARTABLE_REASON }]])
})

// a recording cannot be planned again without its Topic
test("a podcast episode whose Topic is gone is failed once its workflow is gone", async () => {
	const { startSpy, failSpy } = stubPodcastEpisodeReap(toPodcastEpisodeRow({ topicId: null }))
	expect(await reapStaleRows({ reapedKind: STALE_PODCAST_EPISODES, now: NOW })).toMatchObject({
		restarted: 0,
		failed: 1,
	})
	expect(startSpy).not.toHaveBeenCalled()
	expect(failSpy.mock.calls).toEqual([[{ podcastEpisodeId: "episode-1", reason: NOT_RESTARTABLE_REASON }]])
})

// when a row past every limit was written: a day ago
const A_DAY_AGO = new Date(NOW.getTime() - 24 * 60 * 60 * 1000)

// stub the pool so a kind's read returns one row, with Temporal holding no workflow for it and films rendering
function stubStaleRowRead(staleRow: unknown[]): SentQuery[] {
	spyOnTemporal({ isRunning: false })
	spyOn(recordingActivities, "isTopicPodcastEpisodeVideoEnabled").mockResolvedValue(true)
	return stubConnectionPool(({ text }) => (text.startsWith("select") ? [staleRow] : []))
}

test("each kind's limit is its workflow's longest run and the reaper's fifteen minutes", () => {
	// a film's three four-hour attempts and its failure mark, a discussion's script, recording, and failure write, an
	// image's scene, render, and failure write, and an attachment's four steps
	expect(MAX_TOPIC_VIDEO_RENDER_MS).toBe(12 * 3_600_000 + 3_000 + 6 * 60_000 + 3_000)
	expect(MAX_TOPIC_POST_DISCUSSION_RECORDING_MS).toBe(44 * 60_000 + 34_000)
	expect(MAX_TOPIC_IMAGE_RENDER_MS).toBe(27 * 60_000 + 51_000)
	expect(MAX_ATTACHMENT_PROCESSING_MS).toBe(63 * 60_000)

	// each kind adds the margin to its own run
	const limits = [STALE_TOPIC_VIDEOS, STALE_TOPIC_POST_DISCUSSIONS, STALE_TOPIC_IMAGE_RENDERS, STALE_ATTACHMENTS]
	expect(limits.map(({ limitMs }) => limitMs - REAPER_MARGIN_MS)).toEqual([
		MAX_TOPIC_VIDEO_RENDER_MS,
		MAX_TOPIC_POST_DISCUSSION_RECORDING_MS,
		MAX_TOPIC_IMAGE_RENDER_MS,
		MAX_ATTACHMENT_PROCESSING_MS,
	])
})

test("the reaper reads only the first renders still rendering, by when each row was last written", async () => {
	const sentQueries = stubStaleRowRead(["video-1", "episode-1", "0", A_DAY_AGO, null])
	spyOn(topicVideoWorkflowClient, "startTopicVideoRenderWorkflow").mockResolvedValue(undefined)
	await reapStaleRows({ reapedKind: STALE_TOPIC_VIDEOS, now: NOW })

	// a ready film that is rendering again is never read, nor is a film that kept its files for a rebuild
	const readQuery = sentQueries[0]
	expect(readQuery?.text).toContain(`"topic_videos"."status" = 'rendering'`)
	expect(readQuery?.text).toContain(`"topic_videos"."film_key" is null`)
	expect(readQuery?.text).toContain(`"topic_videos"."updated_at" < `)
	expect(readQuery?.text).toContain(`order by "topic_videos"."updated_at" asc limit `)
})

test("a film whose workflow is gone renders again once, on the platform's bill if no user was charged", async () => {
	// a backfill's film, which cost its owner nothing, and an owner's film that holds the cost of its own image
	const billedRows = [
		{ cost: "0", isPlatformBilled: true },
		{ cost: "0.310000", isPlatformBilled: false },
	]
	for (const { cost, isPlatformBilled } of billedRows) {
		const sentQueries = stubStaleRowRead(["video-1", "episode-1", cost, A_DAY_AGO, null])
		const startSpy = spyOn(topicVideoWorkflowClient, "startTopicVideoRenderWorkflow").mockResolvedValue(undefined)
		delete Bun.env.TOPIC_VIDEO_ANIMATED_CHAPTERS
		const reapSummary = await reapStaleRows({ reapedKind: STALE_TOPIC_VIDEOS, now: NOW })

		// the render starts under its podcast episode's id, at the version new films render at
		expect(reapSummary).toMatchObject({ restarted: 1, failed: 0 })
		expect(temporalClient.isWorkflowRunning).toHaveBeenCalledWith("episode-video-episode-1")
		expect(startSpy.mock.calls).toEqual([[{ podcastEpisodeId: "episode-1", renderVersion: 4, isPlatformBilled }]])

		// the restart is recorded on the row, only while it still reads rendering
		const restartQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "topic_videos"'))
		expect(restartQuery?.text).toContain(`"restarted_at" = `)
		expect(restartQuery?.values).toContain("rendering")
		restoreConnectionPool()
		mock.restore()
	}
})

test("a film that was already started again is failed through the render's own failure mark", async () => {
	stubStaleRowRead(["video-1", "episode-1", "0", A_DAY_AGO, A_DAY_AGO])
	const startSpy = spyOn(topicVideoWorkflowClient, "startTopicVideoRenderWorkflow").mockResolvedValue(undefined)
	const failSpy = spyOn(topicVideoFailures, "markTopicVideoFailed").mockResolvedValue(undefined)
	expect(await reapStaleRows({ reapedKind: STALE_TOPIC_VIDEOS, now: NOW })).toMatchObject({ restarted: 0, failed: 1 })
	expect(startSpy).not.toHaveBeenCalled()
	expect(failSpy.mock.calls).toEqual([[{ podcastEpisodeId: "episode-1", reason: REAPED_REASON }]])
})

test("while films are off or paused the reaper leaves the films stuck rendering as they are", async () => {
	const sentQueries = stubStaleRowRead(["video-1", "episode-1", "0", A_DAY_AGO, null])
	spyOn(recordingActivities, "isTopicPodcastEpisodeVideoEnabled").mockResolvedValue(false)
	const reapSummary = await reapStaleRows({ reapedKind: STALE_TOPIC_VIDEOS, now: NOW })
	expect(reapSummary).toEqual({ restarted: 0, failed: 0, running: 0, terminated: 0, unread: 0 })
	expect(sentQueries).toEqual([])
})

test("a discussion whose workflow is gone records again on its own row, and a second loss fails it", async () => {
	// a discussion that began a day ago and was never started again
	const sentQueries = stubStaleRowRead(["discussion-1", A_DAY_AGO, null])
	const startSpy = spyOn(temporalClient, "startTopicPostDiscussionWorkflow").mockResolvedValue(undefined)
	const failSpy = spyOn(topicPostDiscussions, "failTopicPostDiscussion").mockResolvedValue(undefined)
	const reapedKind = STALE_TOPIC_POST_DISCUSSIONS
	expect(await reapStaleRows({ reapedKind, now: NOW })).toMatchObject({ restarted: 1, failed: 0 })

	// only a recording row is read, and the restart names the row, with no note for the hosts
	expect(sentQueries[0]?.text).toContain(`"topic_post_discussions"."status" = 'recording'`)
	expect(temporalClient.isWorkflowRunning).toHaveBeenCalledWith("topic-post-discussion-discussion-1")
	expect(startSpy.mock.calls).toEqual([[{ discussionId: "discussion-1" }]])

	// the restart writes its time on the same row and no second row, so it is no second regeneration
	expect(sentQueries.some(({ text }) => text.startsWith("insert"))).toBe(false)
	expect(sentQueries.at(-1)?.text).toStartWith('update "topic_post_discussions" set "restarted_at" = ')

	// started again once already, the discussion is failed through its workflow's own failing write
	stubConnectionPool(({ text }) => (text.startsWith("select") ? [["discussion-1", A_DAY_AGO, A_DAY_AGO]] : []))
	expect(await reapStaleRows({ reapedKind, now: NOW })).toMatchObject({ restarted: 0, failed: 1 })
	expect(failSpy.mock.calls).toEqual([["discussion-1", REAPED_REASON]])
})

test("a pending image render draws again on its own row, and a second loss deletes the row and reports it", async () => {
	// a render that began a day ago and was never started again
	const sentQueries = stubStaleRowRead(["render-1", "topic-1", A_DAY_AGO, null])
	const startSpy = spyOn(temporalClient, "startTopicImageWorkflow").mockResolvedValue(undefined)
	const reapedKind = STALE_TOPIC_IMAGE_RENDERS
	expect(await reapStaleRows({ reapedKind, now: NOW })).toMatchObject({ restarted: 1, failed: 0 })

	// only a pending row is read, and the workflow starts for the row with no image prompt, which was never stored
	expect(sentQueries[0]?.text).toContain(`"topic_image_renders"."status" = 'pending'`)
	expect(temporalClient.isWorkflowRunning).toHaveBeenCalledWith("topic-image-render-1")
	expect(startSpy.mock.calls).toEqual([[{ topicId: "topic-1", renderId: "render-1" }]])

	// started again once already, the row is deleted, which gives its regeneration back, and the loss is reported
	stubConnectionPool(({ text }) => (text.startsWith("select") ? [["render-1", "topic-1", A_DAY_AGO, A_DAY_AGO]] : []))
	const deleteSpy = spyOn(topicImageRenders, "deletePendingTopicImageRender").mockResolvedValue(true)
	expect(await reapStaleRows({ reapedKind, now: NOW })).toMatchObject({ restarted: 0, failed: 1 })
	expect(deleteSpy.mock.calls).toEqual([["render-1"]])
	expect(monitoring.reportError).toHaveBeenCalledWith(expect.any(Error), "topic-image", {
		renderId: "render-1",
		reason: REAPED_REASON,
	})
})

test("a pending attachment is processed again on its own row, and a second loss fails it only if still pending", async () => {
	// an attachment that was stored a day ago and was never started again
	const sentQueries = stubStaleRowRead(["attachment-1", A_DAY_AGO, null])
	const startSpy = spyOn(temporalClient, "startAttachmentWorkflow").mockResolvedValue(undefined)
	const failSpy = spyOn(attachmentActivities, "failAttachment").mockResolvedValue(undefined)
	expect(await reapStaleRows({ reapedKind: STALE_ATTACHMENTS, now: NOW })).toMatchObject({ restarted: 1, failed: 0 })

	// only a pending row is read, and its processing starts again under its own id
	expect(sentQueries[0]?.text).toContain(`"attachments"."status" = 'pending'`)
	expect(temporalClient.isWorkflowRunning).toHaveBeenCalledWith("attachment-attachment-1")
	expect(startSpy.mock.calls).toEqual([["attachment-1"]])

	// started again once already, the attachment is failed as its workflow fails it, and only while it is pending
	stubConnectionPool(({ text }) => (text.startsWith("select") ? [["attachment-1", A_DAY_AGO, A_DAY_AGO]] : []))
	expect(await reapStaleRows({ reapedKind: STALE_ATTACHMENTS, now: NOW })).toMatchObject({ restarted: 0, failed: 1 })
	expect(failSpy.mock.calls).toEqual([["attachment-1", REAPED_REASON, true]])
})
