// the Temporal test environment that the workflow tests share: a time-skipping test server with quiet worker logs, and
// a run of one workflow and its named children while the given workers poll
import { TestWorkflowEnvironment } from "@temporalio/testing"
import { DefaultLogger, Runtime, Worker, type WorkerOptions } from "@temporalio/worker"

// the workers that a workflow run polls with, each with its workflows file, its activities, and its queue
type WorkflowTestWorker = Pick<WorkerOptions, "taskQueue" | "workflowsPath" | "activities">

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
 * Runs one workflow, and then its named child workflows, while every given worker polls, and returns the workflow's
 * result, or the error it failed with.
 */
export async function runTestWorkflow({
	testEnvironment,
	workflowName,
	workflowArgs,
	taskQueue,
	workers,
	childWorkflowIds = [],
}: RunTestWorkflowOptions): Promise<unknown> {
	// create each worker on the test server's connection
	const createdWorkers = await Promise.all(
		workers.map((workerOptions) => Worker.create({ connection: testEnvironment.nativeConnection, ...workerOptions })),
	)

	// run the workflow, with a fresh id, until it settles, then wait for each named child to settle, while every worker
	// polls. a child's failure is left to the test's own checks
	const { workflow } = testEnvironment.client
	const workflowRun = workflow
		.execute(workflowName, { taskQueue, workflowId: `${workflowName}-${crypto.randomUUID()}`, args: workflowArgs })
		.catch((error: unknown) => error)
		.then(async (workflowResult) => {
			await Promise.allSettled(childWorkflowIds.map((childWorkflowId) => workflow.getHandle(childWorkflowId).result()))
			return workflowResult
		})

	// keep every worker polling until the run settles
	const [firstWorker, ...otherWorkers] = createdWorkers
	if (!firstWorker) {
		return workflowRun
	}
	return otherWorkers.reduce(
		(runningWorkflow, otherWorker) => otherWorker.runUntil(runningWorkflow),
		firstWorker.runUntil(workflowRun),
	)
}
