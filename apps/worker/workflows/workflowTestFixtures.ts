// the Temporal test environment that the workflow tests share: a time-skipping test server with quiet worker logs, a
// run of a test's own steps while the given workers poll, a run of one workflow and its named children, and the film
// workflows' workers and recorded writes
import { TOPIC_VIDEO_WRITE_TASK_QUEUE } from "@carlnotes/contracts/topicVideoWork"
import { TestWorkflowEnvironment } from "@temporalio/testing"
import { DefaultLogger, Runtime, Worker, type WorkerOptions } from "@temporalio/worker"
import type * as renderActivities from "./renderTopicVideoActivities"

// the workers that a workflow run polls with, each with its workflows file, its activities, its queue, how many
// activities it runs at once, and any interceptors that stand in for a failure the test server cannot produce
export type WorkflowTestWorker = Pick<
	WorkerOptions,
	"taskQueue" | "workflowsPath" | "activities" | "interceptors" | "maxConcurrentActivityTaskExecutions"
>

// the test environment, the workflow and its input, the queue it starts on, every worker that the run polls with, and
// the ids of the abandoned child workflows to wait for after the workflow settles
type RunTestWorkflowOptions = {
	testEnvironment: TestWorkflowEnvironment
	workflowName: string
	workflowArgs: unknown[]
	taskQueue: string
	workers: WorkflowTestWorker[]
	childWorkflowIds?: string[]
}

/**
 * Starts a time-skipping Temporal test server. The first start downloads the test server binary, which later runs reuse.
 */
export async function createWorkflowTestEnvironment(): Promise<TestWorkflowEnvironment> {
	// log only worker warnings. the runtime installs once per process, and a second install keeps the first one's logger
	try {
		Runtime.install({ logger: new DefaultLogger("WARN") })
	} catch {}
	return TestWorkflowEnvironment.createTimeSkipping()
}

/**
 * Runs a test's own steps while every given worker polls, and returns what the steps returned.
 */
export async function runWithTestWorkers<StepsResult>(
	testEnvironment: TestWorkflowEnvironment,
	workers: WorkflowTestWorker[],
	runSteps: () => Promise<StepsResult>,
): Promise<StepsResult> {
	// create each worker on the test server's connection
	const createdWorkers = await Promise.all(
		workers.map((workerOptions) => Worker.create({ connection: testEnvironment.nativeConnection, ...workerOptions })),
	)

	// keep every worker polling until the steps settle
	const steps = runSteps()
	const [firstWorker, ...otherWorkers] = createdWorkers
	if (!firstWorker) {
		return steps
	}
	return otherWorkers.reduce(
		(runningSteps, otherWorker) => otherWorker.runUntil(runningSteps),
		firstWorker.runUntil(steps),
	)
}

/**
 * Runs one workflow, and then its named child workflows, while every given worker polls, and returns the workflow's
 * result, or the error it failed with.
 */
export function runTestWorkflow({
	testEnvironment,
	workflowName,
	workflowArgs,
	taskQueue,
	workers,
	childWorkflowIds = [],
}: RunTestWorkflowOptions): Promise<unknown> {
	// run the workflow, with a fresh id, until it settles, then wait for each named child to settle. a child's failure is
	// left to the test's own checks
	const { workflow } = testEnvironment.client
	return runWithTestWorkers(testEnvironment, workers, () =>
		workflow
			.execute(workflowName, { taskQueue, workflowId: `${workflowName}-${crypto.randomUUID()}`, args: workflowArgs })
			.catch((error: unknown) => error)
			.then(async (workflowResult) => {
				await Promise.allSettled(
					childWorkflowIds.map((childWorkflowId) => workflow.getHandle(childWorkflowId).result()),
				)
				return workflowResult
			}),
	)
}

// a film's activities as a test gives them: any of them, each on the queue the workflow schedules it on
export type FilmTestActivities = Partial<typeof renderActivities>

// a film's failure mark as its activity takes it
type FilmFailureMark = Parameters<(typeof renderActivities)["markTopicPodcastEpisodeVideoFailedActivity"]>[0]

/**
 * Returns the workers a film workflow runs on: one on the workflow's own queue with its activities, which also runs a
 * film's render workflow as a child, and one on the short writes' queue with the writes' activities, as the main queue
 * group hosts it.
 */
export function toFilmWorkers(
	workflowQueue: Pick<WorkflowTestWorker, "taskQueue" | "workflowsPath">,
	workflowActivities: WorkflowTestWorker["activities"],
	writeActivities: FilmTestActivities,
): [WorkflowTestWorker, WorkflowTestWorker] {
	return [
		{ ...workflowQueue, activities: workflowActivities },
		{ taskQueue: TOPIC_VIDEO_WRITE_TASK_QUEUE, activities: writeActivities },
	]
}

/**
 * Returns the short writes that a film test's workers record: the podcast episode of each row written at queue time,
 * and each failure mark, with the write activities that record them in place of a database write.
 */
export function toRecordedWrites(): {
	writtenRows: string[]
	failureMarks: FilmFailureMark[]
	writeActivities: FilmTestActivities
} {
	const writtenRows: string[] = []
	const failureMarks: FilmFailureMark[] = []

	// each write is kept in place of a database write
	const writeActivities: FilmTestActivities = {
		saveTopicPodcastEpisodeVideoRenderingActivity: async (podcastEpisodeId) => {
			writtenRows.push(podcastEpisodeId)
		},
		markTopicPodcastEpisodeVideoFailedActivity: async (failureMark) => {
			failureMarks.push(failureMark)
		},
	}
	return { writtenRows, failureMarks, writeActivities }
}
