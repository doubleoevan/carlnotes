// the film backfill in the Temporal test environment: it renders every listed podcast episode across pages, marks a
// failed render, logs its progress after each batch, and returns the counts of what it did
import { afterAll, beforeAll, expect, spyOn, test } from "bun:test"
import type { TestWorkflowEnvironment } from "@temporalio/testing"
import { Runtime } from "@temporalio/worker"
import type * as backfillActivities from "./backfillTopicPodcastEpisodeVideosActivities"
import type * as renderActivities from "./renderTopicPodcastEpisodeVideoActivities"
import { createWorkflowTestEnvironment, runTestWorkflow } from "./workflowTestFixtures"

// the local test server with time skipping, shared by the tests in this file
let testEnvironment: TestWorkflowEnvironment
beforeAll(async () => {
	testEnvironment = await createWorkflowTestEnvironment()
}, 120_000)
afterAll(async () => {
	await testEnvironment?.teardown()
})

// the backfill's workflows file, and a queue no other test or worker polls
const WORKFLOWS_PATH = new URL("./backfillTopicPodcastEpisodeVideos.ts", import.meta.url).pathname
const TASK_QUEUE = "film-backfill-workflow-test"

// the cursor after the first page's last film
const FIRST_PAGE_CURSOR: backfillActivities.BackfillTopicPodcastEpisodeVideoCursor = {
	kind: "film",
	publicRank: 0,
	id: "film-3",
}

test("the backfill renders each page, marks a failed render, logs its progress, and returns the counts", async () => {
	// two pages: three podcast episodes of the four left and a cursor, then the last podcast episode and no cursor
	const listedCursors: unknown[] = []
	const backfillTestActivities: Partial<typeof backfillActivities & typeof renderActivities> = {
		listBackfillPodcastEpisodeIds: async ({ afterCursor }) => {
			listedCursors.push(afterCursor)
			return afterCursor
				? { podcastEpisodeIds: ["episode-4"], nextCursor: null, remainingPodcastEpisodeCount: 1 }
				: {
						podcastEpisodeIds: ["episode-1", "episode-2", "episode-3"],
						nextCursor: FIRST_PAGE_CURSOR,
						remainingPodcastEpisodeCount: 4,
					}
		},
		...toBackfillRenderActivities(),
	}

	// run the backfill two films at a time, keeping every line the worker logs
	const workerLog = spyOn(Runtime.instance().logger, "log")
	const backfillSummary = await runTestWorkflow({
		testEnvironment,
		workflowName: "backfillTopicPodcastEpisodeVideosWorkflow",
		workflowArgs: [{ concurrency: 2 }],
		taskQueue: TASK_QUEUE,
		workers: [{ taskQueue: TASK_QUEUE, workflowsPath: WORKFLOWS_PATH, activities: backfillTestActivities }],
	})
	const progressLines = workerLog.mock.calls.filter((logCall) => logCall[1] === "film backfill progress")
	workerLog.mockRestore()

	// both pages were listed, two films rendered, one was already current and skipped, and one failed with its mark, which
	// the backfill moved past. every render attempt, the failed film's included, went on the platform's bill
	expect(listedCursors).toEqual([undefined, FIRST_PAGE_CURSOR])
	expect(backfillSummary).toEqual({
		renderedCount: 2,
		skippedCount: 1,
		failedCount: 1,
		generatedChapterImageCount: 7,
		renderSeconds: 30,
		byteSize: 3000,
	})
	expect(failureMarks).toEqual(["episode-3"])
	expect(platformBilledRenders).toHaveLength(6)
	expect(platformBilledRenders.every(Boolean)).toBe(true)

	// one progress line after each batch, with the counts so far and the podcast episodes left
	expect(progressLines.map((logCall) => logCall[2])).toMatchObject([
		{
			renderedCount: 1,
			skippedCount: 1,
			failedCount: 0,
			generatedChapterImageCount: 3,
			remainingPodcastEpisodeCount: 2,
		},
		{
			renderedCount: 1,
			skippedCount: 1,
			failedCount: 1,
			generatedChapterImageCount: 3,
			remainingPodcastEpisodeCount: 1,
		},
		{
			renderedCount: 2,
			skippedCount: 1,
			failedCount: 1,
			generatedChapterImageCount: 7,
			remainingPodcastEpisodeCount: 0,
		},
	])
}, 60_000)

// the failure marks and the render bills the render activities record
const failureMarks: string[] = []
const platformBilledRenders: (boolean | undefined)[] = []

// renders where episode-2's film is already current and skipped, episode-3 fails every attempt, and the others render
function toBackfillRenderActivities(): Partial<typeof renderActivities> {
	return {
		renderTopicPodcastEpisodeVideoActivity: async ({ podcastEpisodeId, isPlatformBilled }) => {
			// record the bill, then skip, fail, or render by podcast episode
			platformBilledRenders.push(isPlatformBilled)
			if (podcastEpisodeId === "episode-2") {
				return { outcome: "skipped", reason: "ready" }
			}
			if (podcastEpisodeId === "episode-3") {
				throw new Error("ffmpeg exited with code 1")
			}

			// the rendered films differ in time, size, and generated images, so the sums show both counted
			return podcastEpisodeId === "episode-1"
				? { outcome: "rendered", renderSeconds: 10, byteSize: 1000, generatedChapterImageCount: 3 }
				: { outcome: "rendered", renderSeconds: 20, byteSize: 2000, generatedChapterImageCount: 4 }
		},
		markTopicPodcastEpisodeVideoFailedActivity: async ({ podcastEpisodeId }) => {
			failureMarks.push(podcastEpisodeId)
		},
	}
}
