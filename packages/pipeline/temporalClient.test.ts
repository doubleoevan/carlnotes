// Temporal client tests: a failed connection is retried, a connected client is reused, a chat mention push and a
// film rebuild each start once, and a Topic Post's edits share one summary rewrite
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { Connection, WorkflowClient, WorkflowExecutionAlreadyStartedError } from "@temporalio/client"
import {
	describeScanQueue,
	startChatMentionPushWorkflow,
	startTopicPodcastEpisodeVideoRebuild,
	startTopicPostSummaryWorkflow,
} from "./temporalClient"

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

	// the first call fails with the connect's error, and the second call connects
	await expect(describeScanQueue()).rejects.toThrow("temporal is not reachable yet")
	expect(await describeScanQueue()).toEqual({ pollerCount: 1, backlogCount: 0, oldestBacklogAgeMs: null })

	// the third call reuses the connected client, and every connect gives up after the call deadline
	await describeScanQueue()
	expect(connectSpy).toHaveBeenCalledTimes(2)
	expect(connectSpy.mock.calls[0]?.[0]).toMatchObject({ connectTimeout: 10_000 })
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

// a film rebuild starts on the film queue under the podcast episode's id, a second start is ignored, and a failure throws
test("a film rebuild starts once per podcast episode", async () => {
	// a connected client whose start succeeds, then finds the rebuild running, then fails
	spyOn(Connection, "connect").mockResolvedValue(toFakeConnection())
	const startSpy = spyOn(WorkflowClient.prototype, "start")
		.mockResolvedValueOnce({} as never)
		.mockRejectedValueOnce(new WorkflowExecutionAlreadyStartedError("running", "episode-video-rebuild-e1", "workflow"))
		.mockRejectedValueOnce(new Error("temporal is down"))

	// the first start names the queue and the podcast episode, the repeat resolves, and the failure throws
	await startTopicPodcastEpisodeVideoRebuild("e1")
	expect(startSpy.mock.calls[0]?.[0]).toBe("rebuildTopicPodcastEpisodeVideoWorkflow")
	expect(startSpy.mock.calls[0]?.[1]).toMatchObject({
		taskQueue: "episode-videos",
		workflowId: "episode-video-rebuild-e1",
		args: [{ podcastEpisodeId: "e1" }],
	})
	await startTopicPodcastEpisodeVideoRebuild("e1")
	await expect(startTopicPodcastEpisodeVideoRebuild("e1")).rejects.toThrow("temporal is down")
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
