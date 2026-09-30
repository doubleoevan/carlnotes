// Temporal client tests: a failed connection is retried, and a connected client is reused
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { Connection } from "@temporalio/client"
import { describeScanQueue } from "./temporalClient"

// put the real connect back after each test
afterEach(() => {
	mock.restore()
})

// a fake connection whose scan queue has one poller and nothing waiting
function toFakeConnection(): Connection {
	const describeTaskQueue = async (): Promise<unknown> => ({ pollers: [{}], taskQueueStatus: { backlogCountHint: 0 } })
	return { workflowService: { describeTaskQueue } } as unknown as Connection
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

	// the third call reuses the connected client
	await describeScanQueue()
	expect(connectSpy).toHaveBeenCalledTimes(2)
})
