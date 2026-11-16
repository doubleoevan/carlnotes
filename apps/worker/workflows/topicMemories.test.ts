import { afterAll, beforeAll, expect, test } from "bun:test"
import { TOPIC_MEMORY_TASK_QUEUE } from "@carlnotes/contracts/topicMemoryWork"
import type { TestWorkflowEnvironment } from "@temporalio/testing"
import { SCAN_CLOSING_TASK_QUEUE } from "./runTopicScan"
import { createWorkflowTestEnvironment, runTestWorkflow } from "./workflowTestFixtures"

let testEnvironment: TestWorkflowEnvironment
beforeAll(async () => {
	testEnvironment = await createWorkflowTestEnvironment()
}, 120_000)
afterAll(async () => {
	await testEnvironment?.teardown()
})

test("a completed Scan starts its Journal child after the closing write", async () => {
	// run the real workflow pair without fetching Sources or starting unrelated media and email activities
	const scanId = "completed-journal-brew"
	const events: string[] = []
	const result = await runTestWorkflow({
		testEnvironment,
		workflowName: "runTopicScanWorkflow",
		workflowArgs: [scanId, "topic-1", "owner-1", "manual"],
		taskQueue: "journal-scan-test",
		childWorkflowIds: [`topic-memories-${scanId}`],
		workers: [
			{
				taskQueue: "journal-scan-test",
				workflowsPath: new URL("./runTopicScan.ts", import.meta.url).pathname,
				activities: {
					ingestForScan: async () => ({ status: "succeeded", budget: {} }),
					reviewForScan: async () => ({ budget: {} }),
				},
			},
			{
				taskQueue: SCAN_CLOSING_TASK_QUEUE,
				activities: {
					finishScan: async (closedScanId: string) => {
						events.push(`closed ${closedScanId}`)
					},
				},
			},
			{
				taskQueue: TOPIC_MEMORY_TASK_QUEUE,
				workflowsPath: new URL("./topicMemories.ts", import.meta.url).pathname,
				activities: {
					updateTopicMemoriesActivity: async (journalScanId: string) => {
						events.push(`updated ${journalScanId}`)
					},
				},
			},
		],
	})
	expect(result).toBeUndefined()
	expect(events).toEqual([`closed ${scanId}`, `updated ${scanId}`])
}, 30_000)

test("backfill continues by Topic and skips a paused brew without retrying it", async () => {
	// a full workflow history wraps the first page and continues with its cursor and accumulated counts
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
					listTopicMemoryBackfillPage: async ({ afterTopicId }: { afterTopicId?: string }) =>
						afterTopicId
							? { scanIdsByTopic: [["third"]] }
							: { scanIdsByTopic: [["first", "second"]], afterTopicId: "topic-1" },
					updateTopicMemoriesActivity: async (scanId: string) => {
						seen.push(scanId)
						return scanId === "first" ? "paused" : "updated"
					},
				},
			},
		],
	})
	expect(result).toEqual({ updated: 2, skipped: 0, paused: 1, failed: 0 })
	expect(seen).toEqual(["first", "second", "third"])
}, 30_000)
