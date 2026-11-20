import { afterAll, beforeAll, expect, test } from "bun:test"
import { TOPIC_MEMORY_TASK_QUEUE } from "@carlnotes/contracts/topicMemoryWork"
import { ApplicationFailure } from "@temporalio/activity"
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

// a Scan's workers, each with its workflows file, its activities, and its queue
type ScanWorkers = Parameters<typeof runTestWorkflow>[0]["workers"]

// the workers of a Scan whose stages end at once with the given ingest status, with the closing queue's events kept
// in order. the Scan's own worker loads the given workflow interceptor files
function toScanWorkers(
	events: string[],
	{ ingestStatus = "succeeded", workflowModules = [] }: { ingestStatus?: string; workflowModules?: string[] } = {},
): ScanWorkers {
	return [
		{
			taskQueue: "journal-scan-test",
			workflowsPath: new URL("./runTopicScan.ts", import.meta.url).pathname,
			interceptors: { workflowModules },
			activities: {
				ingestForScan: async () => ({ status: ingestStatus, budget: {} }),
				reviewForScan: async () => ({ budget: {} }),
			},
		},
		{
			taskQueue: SCAN_CLOSING_TASK_QUEUE,
			activities: {
				finishScan: async (closedScanId: string) => {
					events.push(`closed ${closedScanId}`)
				},
				reportTopicMemoriesNotStarted: async (reportedScanId: string, reason: string) => {
					events.push(`not started ${reportedScanId}: ${reason}`)
				},
			},
		},
	]
}

test("a topic memory child that cannot start is reported and the Scan still finishes", async () => {
	// the Scan's own worker fails the child's start through the interceptor
	const scanId = "unstarted-journal-brew"
	const events: string[] = []
	const interceptorPath = new URL("./failingTopicMemoryStartTestFixtures.ts", import.meta.url).pathname
	const result = await runTestWorkflow({
		testEnvironment,
		workflowName: "runTopicScanWorkflow",
		workflowArgs: [scanId, "topic-1", "owner-1", "manual"],
		taskQueue: "journal-scan-test",
		workers: toScanWorkers(events, { workflowModules: [interceptorPath] }),
	})
	// the closing write came first, and the failed start is reported with its reason
	expect(result).toBeUndefined()
	expect(events).toEqual([`closed ${scanId}`, `not started ${scanId}: the topic memory child could not be started`])
}, 30_000)

test("a topic memory update that fails never fails its Scan", async () => {
	// the child's one activity fails for good after the Scan has closed
	const scanId = "failed-journal-brew"
	const events: string[] = []
	const result = await runTestWorkflow({
		testEnvironment,
		workflowName: "runTopicScanWorkflow",
		workflowArgs: [scanId, "topic-1", "owner-1", "manual"],
		taskQueue: "journal-scan-test",
		childWorkflowIds: [`topic-memories-${scanId}`],
		workers: [
			...toScanWorkers(events),
			{
				taskQueue: TOPIC_MEMORY_TASK_QUEUE,
				workflowsPath: new URL("./topicMemories.ts", import.meta.url).pathname,
				activities: {
					updateTopicMemoriesActivity: async () => {
						events.push("update failed")
						throw ApplicationFailure.nonRetryable("the update failed", "TopicMemoryAuthenticationFailed")
					},
				},
			},
		],
	})
	expect(result).toBeUndefined()
	expect(events).toEqual([`closed ${scanId}`, "update failed"])
}, 30_000)

test("a Scan that did not succeed starts no topic memory child", async () => {
	const scanId = "partial-journal-brew"
	const events: string[] = []
	const result = await runTestWorkflow({
		testEnvironment,
		workflowName: "runTopicScanWorkflow",
		workflowArgs: [scanId, "topic-1", "owner-1", "manual"],
		taskQueue: "journal-scan-test",
		workers: toScanWorkers(events, { ingestStatus: "failed" }),
	})
	// the Scan closes, and no workflow was ever started under the child's id
	expect(result).toBeUndefined()
	expect(events).toEqual([`closed ${scanId}`])
	const child = testEnvironment.client.workflow.getHandle(`topic-memories-${scanId}`)
	await expect(child.describe()).rejects.toThrow()
}, 30_000)

test("backfill continues by Topic and skips a paused brew without retrying it", async () => {
	// a full workflow history wraps the first page and continues with its cursor and accumulated counts
	const seen: string[] = []
	const platformBilledUpdates: (boolean | undefined)[] = []
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
					updateTopicMemoriesActivity: async (scanId: string, isPlatformBilled?: boolean) => {
						seen.push(scanId)
						platformBilledUpdates.push(isPlatformBilled)
						return scanId === "first" ? "paused" : "updated"
					},
				},
			},
		],
	})
	expect(result).toEqual({ updated: 2, skipped: 0, paused: 1, failed: 0 })
	expect(seen).toEqual(["first", "second", "third"])

	// every update of the backfill is the platform's to pay for
	expect(platformBilledUpdates).toEqual([true, true, true])
}, 30_000)
