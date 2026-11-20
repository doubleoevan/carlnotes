// Temporal client tests: a failed connection is retried, a connected client is reused, a chat mention push and a
// film rebuild each start once, a Topic Post's edits share one summary rewrite, a recording starts again under its
// Scan's id, and a workflow's state is read as running, closed, or not found
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import {
	Connection,
	WorkflowClient,
	WorkflowExecutionAlreadyStartedError,
	WorkflowNotFoundError,
} from "@temporalio/client"
import { describeScanQueue } from "./scanWorkflowClient"
import {
	getClient,
	isTemporalTransportFailure,
	isWorkflowRunning,
	startChatMentionPushWorkflow,
	startPodcastEpisodeRecordingWorkflow,
	startTopicPostSummaryWorkflow,
	TemporalConnectError,
	terminateWorkflow,
} from "./temporalClient"
import { describeTaskQueue } from "./temporalTaskQueues"
import { startTopicVideoRebuild, startTopicVideoRenderWorkflow } from "./topicVideo/topicVideoWorkflowClient"

// put the real connect back after each test
afterEach(() => {
	mock.restore()
})

// a fake connection whose scan queue has one poller and nothing waiting, and whose deadline runs the call as is
function toFakeConnection(): Connection {
	const describeTaskQueue = async (): Promise<unknown> => ({ pollers: [{}], taskQueueStatus: { backlogCountHint: 0 } })
	const withDeadline = <Result>(_deadline: number, runCall: () => Promise<Result>): Promise<Result> => runCall()
	return { workflowService: { describeTaskQueue }, withDeadline } as unknown as Connection
}

// the first connect fails, the next call connects, and the third call reuses the client
test("a failed connection is retried and a connected client is reused", async () => {
	// a connect that fails once and then succeeds
	const connectSpy = spyOn(Connection, "connect")
		.mockRejectedValueOnce(new Error("temporal is not reachable yet"))
		.mockResolvedValueOnce(toFakeConnection())

	// the first call fails as a connect that the server never took, with the connect's error as its cause, and the
	// second call connects
	const connectFailure = await describeScanQueue().catch((error: unknown) => error)
	expect(connectFailure).toBeInstanceOf(TemporalConnectError)
	expect((connectFailure as Error).cause).toMatchObject({ message: "temporal is not reachable yet" })
	expect(isTemporalTransportFailure(connectFailure)).toBe(true)
	expect(await describeScanQueue()).toEqual({ pollerCount: 1, backlogCount: 0, oldestBacklogAgeMs: null })

	// the third call reuses the connected client, and every connect gives up after the call deadline
	await describeScanQueue()
	expect(connectSpy).toHaveBeenCalledTimes(2)
	expect(connectSpy.mock.calls[0]?.[0]).toMatchObject({ connectTimeout: 10_000 })
})

// any queue is described by its name, with its pollers, its backlog, and how long its oldest task has waited
test("a task queue is described by its name, with its backlog's depth and age", async () => {
	// the connected client's queue read returns two pollers and nine tasks, the oldest waiting ninety and a half
	// seconds
	spyOn(Connection, "connect").mockResolvedValue(toFakeConnection())
	const client = await getClient()
	const describeSpy = spyOn(client.workflowService, "describeTaskQueue").mockResolvedValue({
		pollers: [{}, {}],
		stats: { approximateBacklogCount: 9, approximateBacklogAge: { seconds: 90, nanos: 500_000_000 } },
	} as never)

	// the read names the queue it was given
	expect(await describeTaskQueue("episode-scheduled-chapters")).toEqual({
		pollerCount: 2,
		backlogCount: 9,
		oldestBacklogAgeMs: 90_500,
	})
	expect(describeSpy.mock.calls[0]?.[0]).toMatchObject({ taskQueue: { name: "episode-scheduled-chapters" } })
})

// a mention push starts on the push queue under the message's id, a second start is ignored, and a failure throws
test("a chat mention push starts once per message", async () => {
	// a connected client whose start succeeds, then finds the workflow running, then fails
	spyOn(Connection, "connect").mockResolvedValue(toFakeConnection())
	const startSpy = spyOn(WorkflowClient.prototype, "start")
		.mockResolvedValueOnce({} as never)
		.mockRejectedValueOnce(new WorkflowExecutionAlreadyStartedError("running", "chat-mention-push-7", "workflow"))
		.mockRejectedValueOnce(new Error("temporal is down"))

	// the first start names the queue and the message, the repeat resolves, and the failure throws
	await startChatMentionPushWorkflow(7)
	expect(startSpy.mock.calls[0]?.[0]).toBe("sendChatMentionPushWorkflow")
	expect(startSpy.mock.calls[0]?.[1]).toMatchObject({
		taskQueue: "push-notifications",
		workflowId: "chat-mention-push-7",
		args: [{ chatMessageId: 7 }],
	})
	await startChatMentionPushWorkflow(7)
	await expect(startChatMentionPushWorkflow(7)).rejects.toThrow("temporal is down")
})

// a film rebuild starts on the rebuilds' queue under the podcast episode's id, a second start is ignored, and a failure throws
test("a film rebuild starts once per podcast episode", async () => {
	// a connected client whose start succeeds, then finds the rebuild running, then fails
	spyOn(Connection, "connect").mockResolvedValue(toFakeConnection())
	const startSpy = spyOn(WorkflowClient.prototype, "start")
		.mockResolvedValueOnce({} as never)
		.mockRejectedValueOnce(new WorkflowExecutionAlreadyStartedError("running", "episode-video-rebuild-e1", "workflow"))
		.mockRejectedValueOnce(new Error("temporal is down"))

	// the first start names the queue and the podcast episode, the repeat resolves, and the failure throws
	await startTopicVideoRebuild("e1")
	expect(startSpy.mock.calls[0]?.[0]).toBe("rebuildTopicPodcastEpisodeVideoWorkflow")
	expect(startSpy.mock.calls[0]?.[1]).toMatchObject({
		taskQueue: "episode-video-rebuilds",
		workflowId: "episode-video-rebuild-e1",
		args: [{ podcastEpisodeId: "e1" }],
	})
	await startTopicVideoRebuild("e1")
	await expect(startTopicVideoRebuild("e1")).rejects.toThrow("temporal is down")
})

// the reaper starts a film's render again under the id its recording gave it, so a render still running is left alone
test("a film render started again names its podcast episode, its version, and its restart", async () => {
	// a connected client whose start succeeds, then finds the render running
	spyOn(Connection, "connect").mockResolvedValue(toFakeConnection())
	const startSpy = spyOn(WorkflowClient.prototype, "start")
		.mockResolvedValueOnce({} as never)
		.mockRejectedValueOnce(new WorkflowExecutionAlreadyStartedError("running", "episode-video-e1", "workflow"))

	// a platform-billed restart says so, and an owner's leaves the field out
	await startTopicVideoRenderWorkflow({ podcastEpisodeId: "e1", renderVersion: 4, isPlatformBilled: true })
	expect(startSpy.mock.calls[0]?.[0]).toBe("renderTopicPodcastEpisodeVideoWorkflow")
	expect(startSpy.mock.calls[0]?.[1]).toMatchObject({
		taskQueue: "episode-videos",
		workflowId: "episode-video-e1",
		args: [{ podcastEpisodeId: "e1", renderVersion: 4, isRestart: true, isPlatformBilled: true }],
	})
	await startTopicVideoRenderWorkflow({ podcastEpisodeId: "e1", renderVersion: 3, isPlatformBilled: false })
	expect(startSpy.mock.calls[1]?.[1]?.args).toEqual([{ podcastEpisodeId: "e1", renderVersion: 3, isRestart: true }])
})

// a summary rewrite starts under the post's id alone, and a start while one is running is ignored
test("the edits of one Topic Post share one summary rewrite", async () => {
	// a connected client whose start succeeds, then finds the rewrite running
	spyOn(Connection, "connect").mockResolvedValue(toFakeConnection())
	const startSpy = spyOn(WorkflowClient.prototype, "start")
		.mockResolvedValueOnce({} as never)
		.mockRejectedValueOnce(new WorkflowExecutionAlreadyStartedError("running", "topic-post-summary-p1", "workflow"))

	// the first start names the post alone, and the repeat resolves
	await startTopicPostSummaryWorkflow("p1")
	expect(startSpy.mock.calls[0]?.[0]).toBe("summarizeTopicPostWorkflow")
	expect(startSpy.mock.calls[0]?.[1]).toMatchObject({
		workflowId: "topic-post-summary-p1",
		args: [{ topicPostId: "p1" }],
	})
	await startTopicPostSummaryWorkflow("p1")
	expect(startSpy).toHaveBeenCalledTimes(2)
})

// a recording that the reaper starts again takes the workflow, the id, the queue, and the input of the Scan's own child
// start, and a recording that still runs under the id is left alone
test("a recording starts again under its Scan's id", async () => {
	// a connected client whose start succeeds, then finds the recording running, then fails
	spyOn(Connection, "connect").mockResolvedValue(toFakeConnection())
	const startSpy = spyOn(WorkflowClient.prototype, "start")
		.mockResolvedValueOnce({} as never)
		.mockRejectedValueOnce(new WorkflowExecutionAlreadyStartedError("running", "episode-s1", "workflow"))
		.mockRejectedValueOnce(new Error("temporal is down"))

	// the first start names the recording's workflow, queue, id, and input
	const recordingInput = { scanId: "s1", topicId: "t1", billedUserId: "u1", trigger: "scheduled" as const }
	await startPodcastEpisodeRecordingWorkflow(recordingInput)
	expect(startSpy.mock.calls[0]?.[0]).toBe("recordPodcastEpisodeWorkflow")
	expect(startSpy.mock.calls[0]?.[1]).toMatchObject({
		taskQueue: "episode-recordings",
		workflowId: "episode-s1",
		args: [recordingInput],
	})

	// the repeat resolves, and the failure throws
	await startPodcastEpisodeRecordingWorkflow(recordingInput)
	await expect(startPodcastEpisodeRecordingWorkflow(recordingInput)).rejects.toThrow("temporal is down")
})

// make every workflow handle describe itself with one status, or reject with one error
function spyOnWorkflowDescribe(describe: () => Promise<unknown>): void {
	spyOn(Connection, "connect").mockResolvedValue(toFakeConnection())
	spyOn(WorkflowClient.prototype, "getHandle").mockReturnValue({ describe } as never)
}

test("a workflow that runs reads as running", async () => {
	spyOnWorkflowDescribe(async () => ({ status: { name: "RUNNING" } }))
	expect(await isWorkflowRunning("episode-s1")).toBe(true)
})

// completed, failed, cancelled, terminated, and timed out all mean that no worker will move the workflow on
test("a workflow that ended, however it ended, reads as not running", async () => {
	for (const statusName of ["COMPLETED", "FAILED", "CANCELLED", "TERMINATED", "TIMED_OUT"]) {
		spyOnWorkflowDescribe(async () => ({ status: { name: statusName } }))
		expect(await isWorkflowRunning("episode-s1")).toBe(false)
		mock.restore()
	}
})

test("a workflow the server does not hold reads as not running", async () => {
	spyOnWorkflowDescribe(async () => {
		throw new WorkflowNotFoundError("not found", "episode-s1", undefined)
	})
	expect(await isWorkflowRunning("episode-s1")).toBe(false)
})

// an unreachable server is never taken for a missing workflow, which would start a healthy workflow's work again
test("a failed read of a workflow's state throws", async () => {
	spyOnWorkflowDescribe(async () => {
		throw new Error("temporal is down")
	})
	await expect(isWorkflowRunning("episode-s1")).rejects.toThrow("temporal is down")
})

// a terminate includes its reason, a workflow that is gone has nothing to terminate, and a failed call throws
test("a workflow is terminated with a reason, and a missing one is left", async () => {
	// a handle whose terminate succeeds, then finds no workflow, then fails
	spyOn(Connection, "connect").mockResolvedValue(toFakeConnection())
	const terminate = mock()
		.mockResolvedValueOnce(undefined)
		.mockRejectedValueOnce(new WorkflowNotFoundError("not found", "episode-s1", undefined))
		.mockRejectedValueOnce(new Error("temporal is down"))
	spyOn(WorkflowClient.prototype, "getHandle").mockReturnValue({ terminate } as never)

	// the reason reaches the server, the missing workflow resolves, and the failure throws
	await terminateWorkflow("episode-s1", "its row was reaped")
	expect(terminate.mock.calls[0]).toEqual(["its row was reaped"])
	await terminateWorkflow("episode-s1", "its row was reaped")
	await expect(terminateWorkflow("episode-s1", "its row was reaped")).rejects.toThrow("temporal is down")
})

// a start that could not reach the server fails every later start the same way, and one Topic's own failure does not
test("an unreachable server is told apart from a failure of one call", () => {
	// a gRPC failure as the client throws it, alone or as a start's cause
	const toGrpcFailure = (code: number): Error =>
		Object.assign(new Error("grpc call failed"), { code, details: "", metadata: {} })
	const unavailable = toGrpcFailure(14)
	const deadlineExceeded = toGrpcFailure(4)
	expect(isTemporalTransportFailure(unavailable)).toBe(true)
	expect(isTemporalTransportFailure(deadlineExceeded)).toBe(true)
	expect(isTemporalTransportFailure(new Error("start failed", { cause: unavailable }))).toBe(true)

	// a workflow that already runs, a bad argument, and an error of our own are failures of the one call
	expect(isTemporalTransportFailure(toGrpcFailure(6))).toBe(false)
	expect(isTemporalTransportFailure(toGrpcFailure(3))).toBe(false)
	expect(isTemporalTransportFailure(new Error("could not create scan for topic topic-1"))).toBe(false)
	expect(isTemporalTransportFailure(null)).toBe(false)
})
