// the film workflows in the Temporal test environment: a render's row is written before a film slot is free, a render
// that fails all three attempts is marked failed on the short writes' queue, an attempt that a worker's shutdown cut
// short is scheduled again without counting, a cancelled render settles its row, a render that the reaper started
// again tells its activity so, and a rebuild calls its activity once
import { afterAll, beforeAll, expect, test } from "bun:test"
import { WORKER_SHUTDOWN_FAILURE_TYPE } from "@carlnotes/contracts/scanFailure"
import { ApplicationFailure, Context } from "@temporalio/activity"
import type { TestWorkflowEnvironment } from "@temporalio/testing"
import {
	createWorkflowTestEnvironment,
	type FilmTestActivities,
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

// wait until what a test's workers recorded meets a condition
async function waitUntil(isMet: () => boolean): Promise<void> {
	while (!isMet()) {
		await Bun.sleep(20)
	}
}

// the film workflows' file, a queue no other test or worker polls, and the two together
const WORKFLOWS_PATH = new URL("./renderTopicVideo.ts", import.meta.url).pathname
const TASK_QUEUE = "film-workflow-test"
const WORKFLOW_QUEUE = { taskQueue: TASK_QUEUE, workflowsPath: WORKFLOWS_PATH }

// what a render returns once it has drawn a film
const RENDERED_FILM = { outcome: "rendered", renderSeconds: 12, byteSize: 1024, generatedChapterImageCount: 0 } as const

// run a film workflow on its two workers, and return its result or its error
function runFilmWorkflow(
	workflowName: "renderTopicPodcastEpisodeVideoWorkflow" | "rebuildTopicPodcastEpisodeVideoWorkflow",
	renderActivities: FilmTestActivities,
	writeActivities: FilmTestActivities = toRecordedWrites().writeActivities,
	workflowInput: Record<string, unknown> = {},
): Promise<unknown> {
	return runTestWorkflow({
		testEnvironment,
		workflowName,
		workflowArgs: [{ podcastEpisodeId: "episode-1", ...workflowInput }],
		taskQueue: TASK_QUEUE,
		workers: toFilmWorkers(WORKFLOW_QUEUE, renderActivities, writeActivities),
	})
}

test("a render that fails all three attempts is marked failed on the short writes' queue, and the workflow fails", async () => {
	// a render that always throws, with no failure mark on its own queue
	let renderAttemptCount = 0
	const { writtenRows, failureMarks, writeActivities } = toRecordedWrites()
	const renderActivities: FilmTestActivities = {
		renderTopicPodcastEpisodeVideoActivity: async () => {
			renderAttemptCount += 1
			throw new Error("ffmpeg exited with code 1")
		},
	}
	const workflowResult = await runFilmWorkflow(
		"renderTopicPodcastEpisodeVideoWorkflow",
		renderActivities,
		writeActivities,
	)

	// the row at queue time, three attempts, one failure mark that names the podcast episode, and a failed workflow
	expect(writtenRows).toEqual(["episode-1"])
	expect(renderAttemptCount).toBe(3)
	expect(failureMarks).toEqual([{ podcastEpisodeId: "episode-1", reason: "ffmpeg exited with code 1" }])
	expect(workflowResult).toBeInstanceOf(Error)
}, 60_000)

test("a render that succeeds returns what it did and marks nothing failed", async () => {
	const { failureMarks, writeActivities } = toRecordedWrites()
	const renderActivities: FilmTestActivities = { renderTopicPodcastEpisodeVideoActivity: async () => RENDERED_FILM }
	const workflowResult = await runFilmWorkflow(
		"renderTopicPodcastEpisodeVideoWorkflow",
		renderActivities,
		writeActivities,
	)
	expect(workflowResult).toEqual(RENDERED_FILM)
	expect(failureMarks).toEqual([])
}, 60_000)

// a film that waits for a slot shows its card, is read by the reaper, and is never listed by the backfill
test("a queued film has its row before a film slot is free", async () => {
	// one film slot, held by the first film's render until the test lets it end
	const firstRenderEnd = Promise.withResolvers<void>()
	const startedRenders: string[] = []
	const endedRenders: string[] = []
	const { writtenRows, writeActivities } = toRecordedWrites()
	const renderActivities: FilmTestActivities = {
		renderTopicPodcastEpisodeVideoActivity: async ({ podcastEpisodeId }) => {
			// the first film's render waits to be ended, and the second's ends at once
			startedRenders.push(podcastEpisodeId)
			await (podcastEpisodeId === "episode-1" ? firstRenderEnd.promise : undefined)
			endedRenders.push(podcastEpisodeId)
			return RENDERED_FILM
		},
	}
	const [renderWorker, writeWorker] = toFilmWorkers(WORKFLOW_QUEUE, renderActivities, writeActivities)

	// start the first film, then the second once the first holds the slot. no result is awaited while a render runs,
	// because the test server skips time while a result is awaited, past the render's heartbeat timeout
	const { workflow } = testEnvironment.client
	const workers = [{ ...renderWorker, maxConcurrentActivityTaskExecutions: 1 }, { ...writeWorker }]
	const startFilm = (podcastEpisodeId: string): ReturnType<typeof workflow.start> =>
		workflow.start("renderTopicPodcastEpisodeVideoWorkflow", {
			taskQueue: TASK_QUEUE,
			workflowId: `queued-film-${podcastEpisodeId}-${crypto.randomUUID()}`,
			args: [{ podcastEpisodeId }],
		})
	await runWithTestWorkers(testEnvironment, workers, async () => {
		try {
			const firstFilm = await startFilm("episode-1")
			await waitUntil(() => startedRenders.length === 1)
			const secondFilm = await startFilm("episode-2")

			// the second film's row is written while the first still holds the slot, and its render has not started
			await waitUntil(() => writtenRows.length === 2)
			expect(writtenRows).toEqual(["episode-1", "episode-2"])
			expect(startedRenders).toEqual(["episode-1"])

			// the first render ends, and the second takes the slot
			firstRenderEnd.resolve()
			await waitUntil(() => endedRenders.length === 2)
			await Promise.all([firstFilm.result(), secondFilm.result()])
		} finally {
			// a failed check must not leave the first render holding its worker
			firstRenderEnd.resolve()
		}
	})
	expect(startedRenders).toEqual(["episode-1", "episode-2"])
}, 60_000)

// the failure of an attempt that its worker's shutdown cut short, as the render's activity throws it
function toShutdownFailure(attempt: number): ApplicationFailure {
	return ApplicationFailure.create({
		message: "the worker shut down during the render",
		type: WORKER_SHUTDOWN_FAILURE_TYPE,
		nonRetryable: true,
		details: [attempt],
	})
}

// three deploys in a row must not fail a film
test("three attempts that a worker's shutdown cut short do not fail the film", async () => {
	// a render whose first three runs each meet a shutdown, and the input of each run
	const renderInputs: unknown[] = []
	const { failureMarks, writeActivities } = toRecordedWrites()
	const renderActivities: FilmTestActivities = {
		renderTopicPodcastEpisodeVideoActivity: async (renderInput) => {
			// the shutdown ends whichever attempt the run is on
			renderInputs.push(renderInput)
			if (renderInputs.length <= 3) {
				throw toShutdownFailure(Context.current().info.attempt)
			}
			return RENDERED_FILM
		},
	}
	const workflowResult = await runFilmWorkflow(
		"renderTopicPodcastEpisodeVideoWorkflow",
		renderActivities,
		writeActivities,
		{ renderVersion: 4 },
	)

	// the fourth run renders the film, and nothing is marked failed
	expect(workflowResult).toEqual(RENDERED_FILM)
	expect(failureMarks).toEqual([])

	// each run asks to be scheduled again after a shutdown, and each run after the first reuses what was stored
	const rescheduledInput = { podcastEpisodeId: "episode-1", renderVersion: 4, isShutdownRescheduled: true }
	expect(renderInputs).toEqual([
		rescheduledInput,
		{ ...rescheduledInput, isRestart: true },
		{ ...rescheduledInput, isRestart: true },
		{ ...rescheduledInput, isRestart: true },
	])
}, 60_000)

// a film that fails for its own reasons must still fail after three attempts, whatever shutdowns fall between them
test("the attempts that failed before a shutdown still count toward the render's three", async () => {
	// a render that fails, meets a shutdown on its second attempt, and then fails every attempt it has left
	let renderRunCount = 0
	const { failureMarks, writeActivities } = toRecordedWrites()
	const renderActivities: FilmTestActivities = {
		renderTopicPodcastEpisodeVideoActivity: async () => {
			// the second run is the first activity's second attempt, which the shutdown ends
			renderRunCount += 1
			if (renderRunCount === 2) {
				throw toShutdownFailure(Context.current().info.attempt)
			}
			throw new Error("ffmpeg exited with code 1")
		},
	}
	const workflowResult = await runFilmWorkflow(
		"renderTopicPodcastEpisodeVideoWorkflow",
		renderActivities,
		writeActivities,
	)

	// one failure, the shutdown, then the two attempts left: three counted failures and one mark
	expect(renderRunCount).toBe(4)
	expect(failureMarks).toHaveLength(1)
	expect(workflowResult).toBeInstanceOf(Error)
}, 60_000)

// a worker that cannot stay up must not render one film forever
test("the twenty-first shutdown in a row fails the film", async () => {
	// a render that meets a shutdown on every run
	let renderRunCount = 0
	const { failureMarks, writeActivities } = toRecordedWrites()
	const renderActivities: FilmTestActivities = {
		renderTopicPodcastEpisodeVideoActivity: async () => {
			renderRunCount += 1
			throw toShutdownFailure(Context.current().info.attempt)
		},
	}
	const workflowResult = await runFilmWorkflow(
		"renderTopicPodcastEpisodeVideoWorkflow",
		renderActivities,
		writeActivities,
	)

	// twenty runs are scheduled again, and the twenty-first marks the film failed with the shutdown's reason
	expect(renderRunCount).toBe(21)
	expect(failureMarks).toEqual([{ podcastEpisodeId: "episode-1", reason: "the worker shut down during the render" }])
	expect(workflowResult).toBeInstanceOf(Error)
}, 60_000)

// a cancelled backfill or a render cancelled by hand must not leave its row rendering
test("a cancelled render settles its row as cancelled, at any render version", async () => {
	for (const renderVersion of [undefined, 4] as const) {
		// a render that runs until its attempt is cancelled
		const renderStarted = Promise.withResolvers<void>()
		const { failureMarks, writeActivities } = toRecordedWrites()
		const renderActivities: FilmTestActivities = {
			renderTopicPodcastEpisodeVideoActivity: async () => {
				renderStarted.resolve()
				await Context.current().cancelled
				return RENDERED_FILM
			},
		}

		// cancel the film's workflow once its render runs
		const { workflow } = testEnvironment.client
		const cancelledRun = await runWithTestWorkers(
			testEnvironment,
			toFilmWorkers(WORKFLOW_QUEUE, renderActivities, writeActivities),
			async () => {
				const filmRun = await workflow.start("renderTopicPodcastEpisodeVideoWorkflow", {
					taskQueue: TASK_QUEUE,
					workflowId: `cancelled-film-${crypto.randomUUID()}`,
					args: [{ podcastEpisodeId: "episode-1", ...(renderVersion ? { renderVersion } : {}) }],
				})
				await renderStarted.promise
				await filmRun.cancel()
				return filmRun.result().catch((error: unknown) => error)
			},
		)

		// the workflow ends cancelled, after the mark that fails a first render alone
		expect(cancelledRun).toBeInstanceOf(Error)
		expect(failureMarks).toEqual([
			{
				podcastEpisodeId: "episode-1",
				reason: "cancelled",
				isCancelled: true,
				...(renderVersion ? { renderVersion } : {}),
			},
		])
	}
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

// the reaper starts a film's render again under the same id, and the render has to know
test("a render started again passes its version, its bill, and the restart to the activity, and a first render passes none", async () => {
	// a render that records its input
	const renderInputs: unknown[] = []
	const renderActivities: FilmTestActivities = {
		renderTopicPodcastEpisodeVideoActivity: async (renderInput) => {
			renderInputs.push(renderInput)
			return { outcome: "skipped", reason: "ready" }
		},
	}

	// a recording's own start from before render versions, then the reaper's restart of a platform-billed film
	await runFilmWorkflow("renderTopicPodcastEpisodeVideoWorkflow", renderActivities)
	const restartInput = { renderVersion: 4, isPlatformBilled: true, isRestart: true }
	await runFilmWorkflow("renderTopicPodcastEpisodeVideoWorkflow", renderActivities, undefined, restartInput)
	const firstRenderInput = { podcastEpisodeId: "episode-1", isShutdownRescheduled: true }
	expect(renderInputs).toEqual([firstRenderInput, { ...firstRenderInput, ...restartInput }])
}, 60_000)
