// the film backfill in the Temporal test environment: it renders every listed podcast episode across pages as a child
// workflow under the film's own id, counts a failed render that its own workflow marked, logs its progress after each
// batch, returns the counts of what it did, waits while a new film waits for a film Worker, and skips a film whose
// render is already queued or running
import { afterAll, beforeAll, expect, spyOn, test } from "bun:test"
import { toTopicVideoWorkflowId } from "@carlnotes/contracts/topicVideoWork"
import { Context } from "@temporalio/activity"
import type { TestWorkflowEnvironment } from "@temporalio/testing"
import { Runtime } from "@temporalio/worker"
import type * as backfillActivities from "./backfillTopicVideosActivities"
import type * as renderActivities from "./renderTopicVideoActivities"
import {
	createWorkflowTestEnvironment,
	runTestWorkflow,
	runWithTestWorkers,
	toFilmWorkers,
	toRecordedWrites,
} from "./workflowTestFixtures"

// the local test server with time skipping, shared by the tests in this file
let testEnvironment: TestWorkflowEnvironment
beforeAll(async () => {
	testEnvironment = await createWorkflowTestEnvironment()
}, 120_000)
afterAll(async () => {
	await testEnvironment?.teardown()
})

// the backfill's workflows file, and a queue no other test or worker polls
const WORKFLOWS_PATH = new URL("./backfillTopicVideos.ts", import.meta.url).pathname
const TASK_QUEUE = "film-backfill-workflow-test"

// the backfill's own worker queue, which also runs each film's render workflow as the backfill's child
const WORKFLOW_QUEUE = { taskQueue: TASK_QUEUE, workflowsPath: WORKFLOWS_PATH }

// the backfill's activities as a test gives them: the listing, the read of the new films' queue, and the render
type BackfillTestActivities = Partial<typeof backfillActivities & typeof renderActivities>

// the cursor after the first page's last film
const FIRST_PAGE_CURSOR: backfillActivities.BackfillTopicVideoCursor = {
	kind: "film",
	publicRank: 0,
	id: "film-3",
}

// run the backfill on its two workers, and return its counts or its error
function runBackfill(
	backfillTestActivities: BackfillTestActivities,
	writeActivities: BackfillTestActivities,
	concurrency = 2,
): Promise<unknown> {
	return runTestWorkflow({
		testEnvironment,
		workflowName: "backfillTopicPodcastEpisodeVideosWorkflow",
		workflowArgs: [{ concurrency }],
		taskQueue: TASK_QUEUE,
		workers: toFilmWorkers(WORKFLOW_QUEUE, backfillTestActivities, writeActivities),
	})
}

test("the backfill renders each page, counts a failed render, logs its progress, and returns the counts", async () => {
	// two pages: three podcast episodes of the four left and a cursor, then the last podcast episode and no cursor
	const listedCursors: unknown[] = []
	const platformBilledRenders: (boolean | undefined)[] = []
	const { writtenRows, failureMarks, writeActivities } = toRecordedWrites()
	const backfillTestActivities: BackfillTestActivities = {
		listBackfillPodcastEpisodeIds: async ({ afterCursor }) => {
			// the second page follows the first page's cursor
			listedCursors.push(afterCursor)
			return afterCursor
				? {
						podcastEpisodeIds: ["episode-4"],
						nextCursor: null,
						remainingPodcastEpisodeCount: 1,
						estimatedRemainingCostDollars: 0.24,
					}
				: {
						podcastEpisodeIds: ["episode-1", "episode-2", "episode-3"],
						nextCursor: FIRST_PAGE_CURSOR,
						remainingPodcastEpisodeCount: 4,
						estimatedRemainingCostDollars: 0.96,
					}
		},
		hasWaitingNewTopicVideo: async () => false,
		renderTopicPodcastEpisodeVideoActivity: toBackfillRender(platformBilledRenders),
	}

	// run the backfill two films at a time, keeping every line the worker logs
	const workerLog = spyOn(Runtime.instance().logger, "log")
	const backfillSummary = await runBackfill(backfillTestActivities, writeActivities)
	const progressLines = workerLog.mock.calls.filter((logCall) => logCall[1] === "film backfill progress")
	const startLines = workerLog.mock.calls.filter((logCall) => logCall[1] === "film backfill started")
	workerLog.mockRestore()

	// the first run alone logs what the whole backfill has to render and what that is estimated to cost
	expect(startLines.map((logCall) => logCall[2])).toMatchObject([
		{ remainingPodcastEpisodeCount: 4, estimatedRemainingCostDollars: 0.96 },
	])

	// both pages were listed, two films rendered, one was already current and skipped, and one failed with its mark,
	// which the backfill moved past. every render attempt, the failed film's included, went on the platform's bill
	expect(listedCursors).toEqual([undefined, FIRST_PAGE_CURSOR])
	expect(backfillSummary).toEqual({
		renderedCount: 2,
		skippedCount: 1,
		failedCount: 1,
		generatedChapterImageCount: 7,
		renderSeconds: 30,
		byteSize: 3000,
	})
	expect(failureMarks.map((failureMark) => failureMark.podcastEpisodeId)).toEqual(["episode-3"])
	expect(platformBilledRenders).toHaveLength(6)
	expect(platformBilledRenders.every(Boolean)).toBe(true)

	// each film's own workflow wrote its row once the render was queued
	expect([...writtenRows].sort()).toEqual(["episode-1", "episode-2", "episode-3", "episode-4"])

	// one progress line after each batch, with the counts so far and the podcast episodes left
	expect(progressLines.map((logCall) => logCall[2])).toMatchObject([
		{
			renderedCount: 1,
			skippedCount: 1,
			failedCount: 0,
			generatedChapterImageCount: 3,
			remainingPodcastEpisodeCount: 2,
			estimatedRemainingCostDollars: 0.48,
		},
		{
			renderedCount: 1,
			skippedCount: 1,
			failedCount: 1,
			generatedChapterImageCount: 3,
			remainingPodcastEpisodeCount: 1,
			estimatedRemainingCostDollars: 0.24,
		},
		{
			renderedCount: 2,
			skippedCount: 1,
			failedCount: 1,
			generatedChapterImageCount: 7,
			remainingPodcastEpisodeCount: 0,
			estimatedRemainingCostDollars: 0,
		},
	])
}, 60_000)

// a render where episode-2's film is already current and skipped, episode-3 fails every attempt, and the others render.
// it records the bill of each attempt
function toBackfillRender(
	platformBilledRenders: (boolean | undefined)[],
): (typeof renderActivities)["renderTopicPodcastEpisodeVideoActivity"] {
	return async ({ podcastEpisodeId, isPlatformBilled }) => {
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
	}
}

// one page of one podcast episode, which the backfill's listing returns once
function toOnePageListing(podcastEpisodeId: string): (typeof backfillActivities)["listBackfillPodcastEpisodeIds"] {
	return async () => ({ podcastEpisodeIds: [podcastEpisodeId], nextCursor: null, remainingPodcastEpisodeCount: 1 })
}

// a person's film never waits behind the platform's own renders
test("the backfill starts no render while a new film waits for a film Worker", async () => {
	// the new films' queue has a backlog for the first two reads, and each step is recorded in order
	const steps: string[] = []
	const { writeActivities } = toRecordedWrites()
	const backfillTestActivities: BackfillTestActivities = {
		listBackfillPodcastEpisodeIds: toOnePageListing("episode-1"),
		hasWaitingNewTopicVideo: async () => {
			steps.push("read the new films' queue")
			return steps.length <= 2
		},
		renderTopicPodcastEpisodeVideoActivity: async () => {
			steps.push("render")
			return { outcome: "rendered", renderSeconds: 10, byteSize: 1000, generatedChapterImageCount: 0 }
		},
	}

	// the render starts only after the read that finds no new film waiting
	const backfillSummary = await runBackfill(backfillTestActivities, writeActivities)
	expect(backfillSummary).toMatchObject({ renderedCount: 1 })
	expect(steps).toEqual([
		"read the new films' queue",
		"read the new films' queue",
		"read the new films' queue",
		"render",
	])
}, 60_000)

// two renders of one film would write the same files, and the one that fails would delete what the other plays
test("the backfill skips a film whose render is already queued or running", async () => {
	// the film's own workflow is already running, on a queue that no worker polls
	const { workflow } = testEnvironment.client
	const runningFilm = await workflow.start("renderTopicPodcastEpisodeVideoWorkflow", {
		taskQueue: "film-queue-with-no-worker",
		workflowId: toTopicVideoWorkflowId("episode-1"),
		args: [{ podcastEpisodeId: "episode-1" }],
	})

	// the backfill lists the same film
	let renderAttemptCount = 0
	const { writeActivities } = toRecordedWrites()
	const backfillTestActivities: BackfillTestActivities = {
		listBackfillPodcastEpisodeIds: toOnePageListing("episode-1"),
		hasWaitingNewTopicVideo: async () => false,
		renderTopicPodcastEpisodeVideoActivity: async () => {
			renderAttemptCount += 1
			return { outcome: "rendered", renderSeconds: 10, byteSize: 1000, generatedChapterImageCount: 0 }
		},
	}

	// Temporal rejects the second workflow, and the backfill counts the film as skipped with no render of its own
	const backfillSummary = await runBackfill(backfillTestActivities, writeActivities).finally(() =>
		runningFilm.terminate(),
	)
	expect(backfillSummary).toMatchObject({ renderedCount: 0, skippedCount: 1, failedCount: 0 })
	expect(renderAttemptCount).toBe(0)
}, 60_000)

// a cancelled backfill must not leave a first render's row rendering
test("a cancelled backfill ends after its running render's own workflow has settled its row", async () => {
	// a render that runs until its attempt is cancelled
	const renderStarted = Promise.withResolvers<void>()
	const cancelledMarks: unknown[] = []
	const backfillTestActivities: BackfillTestActivities = {
		listBackfillPodcastEpisodeIds: toOnePageListing("episode-9"),
		hasWaitingNewTopicVideo: async () => false,
		renderTopicPodcastEpisodeVideoActivity: async () => {
			renderStarted.resolve()
			await Context.current().cancelled
			return { outcome: "skipped", reason: "ready" }
		},
	}
	const writeActivities: BackfillTestActivities = {
		saveTopicPodcastEpisodeVideoRenderingActivity: async () => undefined,
		markTopicPodcastEpisodeVideoFailedActivity: async (failureMark) => {
			cancelledMarks.push(failureMark)
		},
	}

	// cancel the backfill once its render runs
	const { workflow } = testEnvironment.client
	const cancelledBackfill = await runWithTestWorkers(
		testEnvironment,
		toFilmWorkers(WORKFLOW_QUEUE, backfillTestActivities, writeActivities),
		async () => {
			const backfillRun = await workflow.start("backfillTopicPodcastEpisodeVideosWorkflow", {
				taskQueue: TASK_QUEUE,
				workflowId: `cancelled-backfill-${crypto.randomUUID()}`,
				args: [{ concurrency: 1 }],
			})
			await renderStarted.promise
			await backfillRun.cancel()
			return backfillRun.result().catch((error: unknown) => error)
		},
	)

	// the backfill ends cancelled, and the film's workflow sent the mark that fails a first render alone
	expect(cancelledBackfill).toBeInstanceOf(Error)
	expect(cancelledMarks).toEqual([{ podcastEpisodeId: "episode-9", reason: "cancelled", isCancelled: true }])
}, 60_000)
