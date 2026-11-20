// a workflow interceptor for the Scan workflow's tests: the topic memory child's start fails, as a start that the
// Temporal server rejects would. a test worker loads this file by path
import type { WorkflowInterceptorsFactory, WorkflowOutboundCallsInterceptor } from "@temporalio/workflow"

// the start of a child workflow, as a workflow's outbound interceptor sees it
type StartChildWorkflow = NonNullable<WorkflowOutboundCallsInterceptor["startChildWorkflowExecution"]>

// fails the topic memory child's start. every other child of the Scan starts as it would in production
const startChildWorkflowExecution: StartChildWorkflow = (input, next) => {
	if (input.workflowType === "updateTopicMemoriesWorkflow") {
		throw new Error("the topic memory child could not be started")
	}
	return next(input)
}

export const interceptors: WorkflowInterceptorsFactory = () => ({ outbound: [{ startChildWorkflowExecution }] })
