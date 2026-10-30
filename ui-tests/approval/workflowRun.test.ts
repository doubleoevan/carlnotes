// the run checks: a UI tests run from a push, the schedule, or a dispatch is trusted, another workflow's run and a pull
// request's run are not, and a run id that is not a number is rejected before gh runs
import { expect, test } from "bun:test"
import { readUiTestsRun, toWorkflowRunProblem } from "./workflowRun"

// a UI tests run that a push started
const PUSH_RUN = { headSha: "head", event: "push", workflowName: "UI tests" }

// the runs that the commands read from: this workflow's push, scheduled, and dispatched runs
test("a UI tests run from a push, the schedule, or a dispatch is trusted", () => {
	for (const event of ["push", "schedule", "workflow_dispatch"]) {
		expect(toWorkflowRunProblem("42", { ...PUSH_RUN, event })).toBeNull()
	}
})

// another workflow's run, and any run that a pull request started, are never read from
test("another workflow's run and a pull request's run are rejected", () => {
	expect(toWorkflowRunProblem("42", { ...PUSH_RUN, workflowName: "CI" })).toBe("run 42 is a run of CI, not of UI tests")
	expect(toWorkflowRunProblem("42", { ...PUSH_RUN, event: "pull_request" })).toContain("pull_request event")
	expect(toWorkflowRunProblem("42", { ...PUSH_RUN, event: "pull_request_target" })).toContain("never trust")
})

// a run id that could climb out of a folder never reaches a path or gh
test("a run id that is not a number is rejected before gh runs", () => {
	expect(() => readUiTestsRun("../../..")).toThrow('a run id is a number, and "../../.." is not one')
})
