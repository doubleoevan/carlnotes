// the film backfill in the Temporal test environment: it renders every listed podcast episode across pages, marks a
// failed render, and returns the counts of what it did
import { afterAll, beforeAll, expect, test } from "bun:test"
import type { TestWorkflowEnvironment } from "@temporalio/testing"
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

// the cursor after the first page's last Topic
const FIRST_PAGE_CURSOR: backfillActivities.BackfillTopicPodcastEpisodeVideoCursor = {
	publicRank: 0,
	createdAt: "2026-11-01T00:00:00.000Z",
	id: "topic-3",
}

test("the backfill renders each page, marks a failed render, and returns the counts", async () => {
	// two pages: three podcast episodes and a cursor, then one podcast episode and no cursor
	const listedCursors: unknown[] = []
	const backfillTestActivities: Partial<typeof backfillActivities & typeof renderActivities> = {
		listBackfillPodcastEpisodeIds: async ({ afterTopic }) => {
			listedCursors.push(afterTopic)
			return afterTopic
				? { podcastEpisodeIds: ["episode-4"], nextCursor: null }
				: { podcastEpisodeIds: ["episode-1", "episode-2", "episode-3"], nextCursor: FIRST_PAGE_CURSOR }
		},
		...toBackfillRenderActivities(),
	}

	// run the backfill two films at a time
	const backfillSummary = await runTestWorkflow({
		testEnvironment,
		workflowName: "backfillTopicPodcastEpisodeVideosWorkflow",
		workflowArgs: [{ concurrency: 2 }],
		taskQueue: TASK_QUEUE,
		workers: [{ taskQueue: TASK_QUEUE, workflowsPath: WORKFLOWS_PATH, activities: backfillTestActivities }],
	})

	// both pages were listed, two films rendered, one was skipped, and one failed with its mark. every render attempt,
	// the failed film's included, went on the platform's bill
	expect(listedCursors).toEqual([undefined, FIRST_PAGE_CURSOR])
	expect(backfillSummary).toEqual({
		renderedCount: 2,
		skippedCount: 1,
		failedCount: 1,
		renderSeconds: 30,
		byteSize: 3000,
	})
	expect(failureMarks).toEqual(["episode-3"])
	expect(platformBilledRenders).toHaveLength(6)
	expect(platformBilledRenders.every(Boolean)).toBe(true)
}, 60_000)

// the failure marks and the render bills the render activities record
const failureMarks: string[] = []
const platformBilledRenders: (boolean | undefined)[] = []

// renders where episode-2 is skipped, episode-3 fails every attempt, and the others render
function toBackfillRenderActivities(): Partial<typeof renderActivities> {
	return {
		renderTopicPodcastEpisodeVideoActivity: async ({ podcastEpisodeId, isPlatformBilled }) => {
			// record the bill, then skip, fail, or render by podcast episode
			platformBilledRenders.push(isPlatformBilled)
			if (podcastEpisodeId === "episode-2") {
				return { outcome: "skipped", reason: "missing-inputs" }
			}
			if (podcastEpisodeId === "episode-3") {
				throw new Error("ffmpeg exited with code 1")
			}

			// the rendered films differ in time and size, so the sums show both counted
			return podcastEpisodeId === "episode-1"
				? { outcome: "rendered", renderSeconds: 10, byteSize: 1000 }
				: { outcome: "rendered", renderSeconds: 20, byteSize: 2000 }
		},
		markTopicPodcastEpisodeVideoFailedActivity: async ({ podcastEpisodeId }) => {
			failureMarks.push(podcastEpisodeId)
		},
	}
}
