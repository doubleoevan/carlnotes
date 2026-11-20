// the backfill's pause, on a test server of its own: the Scan workflow's tests leave abandoned child workflows that no
// worker polls, and a server with work outstanding never skips a timer
import { afterAll, beforeAll, expect, test } from "bun:test"
import { TOPIC_MEMORY_TASK_QUEUE } from "@carlnotes/contracts/topicMemoryWork"
import { ApplicationFailure } from "@temporalio/activity"
import type { TestWorkflowEnvironment } from "@temporalio/testing"
import { createWorkflowTestEnvironment, runTestWorkflow } from "./workflowTestFixtures"

let testEnvironment: TestWorkflowEnvironment
beforeAll(async () => {
	testEnvironment = await createWorkflowTestEnvironment()
}, 120_000)
afterAll(async () => {
	await testEnvironment?.teardown()
})

test("backfill waits after three failures in a row and tries the same Scan once more", async () => {
	// the first three Scans fail, as under a rate limit, and the third succeeds once the backfill has waited
	const seen: string[] = []
	const result = await runTestWorkflow({
		testEnvironment,
		workflowName: "backfillTopicMemoriesWorkflow",
		workflowArgs: [],
		taskQueue: TOPIC_MEMORY_TASK_QUEUE,
		workers: [
			{
				taskQueue: TOPIC_MEMORY_TASK_QUEUE,
				workflowsPath: new URL("./topicMemories.ts", import.meta.url).pathname,
				activities: {
					listTopicMemoryBackfillPage: async () => ({
						scanIdsByTopic: [
							["first", "second"],
							["third", "fourth"],
						],
					}),
					updateTopicMemoriesActivity: async (scanId: string) => {
						seen.push(scanId)
						const isRateLimited = seen.length <= 3
						if (isRateLimited) {
							throw ApplicationFailure.nonRetryable("rate limited", "TopicMemoryUpdateFailed")
						}
						return "updated"
					},
				},
			},
		],
	})
	// the third Scan ran twice, and only the first two count as failed
	expect(seen).toEqual(["first", "second", "third", "third", "fourth"])
	expect(result).toEqual({ updated: 2, skipped: 0, paused: 0, failed: 2 })
}, 30_000)
