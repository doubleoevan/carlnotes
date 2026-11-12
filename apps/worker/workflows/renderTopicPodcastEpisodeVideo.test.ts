// the film workflows in the Temporal test environment: a render that fails all three attempts is marked failed, and a
// rebuild calls its activity once
import { afterAll, beforeAll, expect, test } from "bun:test"
import type { TestWorkflowEnvironment } from "@temporalio/testing"
import type * as activities from "./renderTopicPodcastEpisodeVideoActivities"
import { createWorkflowTestEnvironment, runTestWorkflow } from "./workflowTestFixtures"

// the local test server with time skipping, shared by the tests in this file
let testEnvironment: TestWorkflowEnvironment
beforeAll(async () => {
	testEnvironment = await createWorkflowTestEnvironment()
}, 120_000)
afterAll(async () => {
	await testEnvironment?.teardown()
})

// the film workflows' file, and a queue no other test or worker polls
const WORKFLOWS_PATH = new URL("./renderTopicPodcastEpisodeVideo.ts", import.meta.url).pathname
const TASK_QUEUE = "film-workflow-test"

// run a film workflow on a worker with the given activities, and return its result or its error
async function runFilmWorkflow(
	workflowName: "renderTopicPodcastEpisodeVideoWorkflow" | "rebuildTopicPodcastEpisodeVideoWorkflow",
	filmActivities: Partial<typeof activities>,
): Promise<unknown> {
	return runTestWorkflow({
		testEnvironment,
		workflowName,
		workflowArgs: [{ podcastEpisodeId: "episode-1" }],
		taskQueue: TASK_QUEUE,
		workers: [{ taskQueue: TASK_QUEUE, workflowsPath: WORKFLOWS_PATH, activities: filmActivities }],
	})
}

test("a render that fails all three attempts is marked failed with its reason, and the workflow fails", async () => {
	// a render that always throws, and the failure marks it sends
	let renderAttemptCount = 0
	const failureMarks: { podcastEpisodeId: string; reason: string }[] = []
	const workflowResult = await runFilmWorkflow("renderTopicPodcastEpisodeVideoWorkflow", {
		renderTopicPodcastEpisodeVideoActivity: async () => {
			renderAttemptCount += 1
			throw new Error("ffmpeg exited with code 1")
		},
		markTopicPodcastEpisodeVideoFailedActivity: async (failureMark) => {
			failureMarks.push(failureMark)
		},
	})

	// three attempts, one failure mark that names the podcast episode, and a failed workflow
	expect(renderAttemptCount).toBe(3)
	expect(failureMarks).toHaveLength(1)
	expect(failureMarks[0]?.podcastEpisodeId).toBe("episode-1")
	expect(failureMarks[0]?.reason).not.toBe("")
	expect(workflowResult).toBeInstanceOf(Error)
}, 60_000)

test("a render that succeeds marks nothing failed", async () => {
	// a render that draws the film on its first attempt, and the failure marks it sends
	const failureMarks: unknown[] = []
	const workflowResult = await runFilmWorkflow("renderTopicPodcastEpisodeVideoWorkflow", {
		renderTopicPodcastEpisodeVideoActivity: async () => ({
			outcome: "rendered",
			renderSeconds: 12,
			byteSize: 1024,
			generatedChapterImageCount: 0,
		}),
		markTopicPodcastEpisodeVideoFailedActivity: async (failureMark) => {
			failureMarks.push(failureMark)
		},
	})

	// a finished workflow, and no failure mark
	expect(workflowResult).toBeUndefined()
	expect(failureMarks).toEqual([])
}, 60_000)

test("a rebuild runs its activity for the podcast episode", async () => {
	// the rebuilds the activity was asked for
	const rebuiltPodcastEpisodeIds: string[] = []
	await runFilmWorkflow("rebuildTopicPodcastEpisodeVideoWorkflow", {
		rebuildTopicPodcastEpisodeVideoActivity: async (podcastEpisodeId) => {
			rebuiltPodcastEpisodeIds.push(podcastEpisodeId)
			return { outcome: "rebuilt", renderSeconds: 3 }
		},
	})

	// one rebuild of the podcast episode
	expect(rebuiltPodcastEpisodeIds).toEqual(["episode-1"])
}, 60_000)
