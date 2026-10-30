// the UI tests run that a command reads. its id is checked before it reaches a path or a command, and what gh reports
// about it keeps every baseline and report from another workflow's run and from a run that a pull request started
import { runCommand } from "../commands"

/** A workflow run as gh reports it: its commit, the event that started it, and its workflow's name. */
export type WorkflowRun = { headSha: string; event: string; workflowName: string }

// the workflow's name as gh reports it, and the form of a run id
const UI_TESTS_WORKFLOW_NAME = "UI tests"
const WORKFLOW_RUN_ID_PATTERN = /^\d+$/

/**
 * Returns a UI tests run as gh reports it, after checking its id and that no pull request started it. Throws an error
 * that names what is wrong otherwise.
 */
export function readUiTestsRun(workflowRunId: string): WorkflowRun {
	// a run id is a number, checked before it reaches a path or a command
	if (!WORKFLOW_RUN_ID_PATTERN.test(workflowRunId)) {
		throw new Error(`a run id is a number, and ${JSON.stringify(workflowRunId)} is not one`)
	}

	// the run as gh reports it, which must be a UI tests run that no pull request started
	const workflowRunText = runCommand(["gh", "run", "view", workflowRunId, "--json", "headSha,event,workflowName"])
	const workflowRun = JSON.parse(workflowRunText) as WorkflowRun
	const runProblem = toWorkflowRunProblem(workflowRunId, workflowRun)
	if (runProblem) {
		throw new Error(runProblem)
	}
	return workflowRun
}

/**
 * Returns why a run is never trusted for a baseline or a report: it is another workflow's run, or a pull request started
 * it. null for a UI tests run from a push, the schedule, or a dispatch.
 */
export function toWorkflowRunProblem(workflowRunId: string, workflowRun: WorkflowRun): string | null {
	if (workflowRun.workflowName !== UI_TESTS_WORKFLOW_NAME) {
		return `run ${workflowRunId} is a run of ${workflowRun.workflowName}, not of ${UI_TESTS_WORKFLOW_NAME}`
	}
	return workflowRun.event.startsWith("pull_request")
		? `run ${workflowRunId} was started by a ${workflowRun.event} event, which the UI test commands never trust`
		: null
}
