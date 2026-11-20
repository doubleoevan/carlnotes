// tests for the queues that a Scan runs on: a manual Scan has slots that no scheduled Scan takes, and a Scan runs its
// stages on the queue that its workflow started on
import { afterAll, beforeAll, expect, test } from "bun:test"
import { SCAN_TASK_QUEUE, SCHEDULED_SCAN_TASK_QUEUE, toScanTaskQueue } from "@carlnotes/pipeline/scanWorkflowClient"
import type { TestWorkflowEnvironment } from "@temporalio/testing"
import { SCAN_CLOSING_TASK_QUEUE } from "./runTopicScan"
import {
	createWorkflowTestEnvironment,
	runTestWorkflow,
	runWithTestWorkers,
	type WorkflowTestWorker,
} from "./workflowTestFixtures"

let testEnvironment: TestWorkflowEnvironment
beforeAll(async () => {
	testEnvironment = await createWorkflowTestEnvironment()
}, 120_000)
afterAll(async () => {
	await testEnvironment?.teardown()
})

// a started Scan's workflow, which a test waits on
type ScanRun = Awaited<ReturnType<TestWorkflowEnvironment["client"]["workflow"]["start"]>>

// the Scan workflows file that both scan Workers load
const SCAN_WORKFLOWS_PATH = new URL("./runTopicScan.ts", import.meta.url).pathname

// a scan Worker on one queue, whose stages record the queue they ran on. its ingest ends as failed, so the Scan starts
// no podcast episode, push, or topic memory child, and it waits for the given release first
function toScanWorker(
	taskQueue: string,
	events: string[],
	{
		whenIngestReleased = Promise.resolve(),
		...workerOptions
	}: Partial<WorkflowTestWorker> & {
		whenIngestReleased?: Promise<void>
	} = {},
): WorkflowTestWorker {
	return {
		taskQueue,
		workflowsPath: SCAN_WORKFLOWS_PATH,
		...workerOptions,
		activities: {
			ingestForScan: async (scanId: string) => {
				events.push(`${taskQueue} ingest ${scanId}`)
				await whenIngestReleased
				return { status: "failed", budget: {} }
			},
			reviewForScan: async (scanId: string) => {
				events.push(`${taskQueue} review ${scanId}`)
				return { budget: {} }
			},
		},
	}
}

// the Worker of the closing queue, which records each Scan it closes
function toClosingWorker(events: string[]): WorkflowTestWorker {
	return {
		taskQueue: SCAN_CLOSING_TASK_QUEUE,
		activities: {
			finishScan: async (scanId: string) => {
				events.push(`closed ${scanId}`)
			},
		},
	}
}

test("a manual Scan runs to its end while scheduled Scans hold and wait for the scheduled queue's only slot", async () => {
	// a scheduled Worker with one activity slot, whose ingest holds the slot until the test releases it
	const events: string[] = []
	const { promise: whenIngestReleased, resolve: releaseIngest } = Promise.withResolvers<void>()
	const workers = [
		toScanWorker(SCAN_TASK_QUEUE, events),
		toScanWorker(SCHEDULED_SCAN_TASK_QUEUE, events, { whenIngestReleased, maxConcurrentActivityTaskExecutions: 1 }),
		toClosingWorker(events),
	]
	const { workflow } = testEnvironment.client
	const startScan = (scanId: string, trigger: "manual" | "scheduled"): Promise<ScanRun> =>
		workflow.start("runTopicScanWorkflow", {
			taskQueue: toScanTaskQueue(trigger),
			workflowId: `scan-${scanId}-${crypto.randomUUID()}`,
			args: [scanId, `topic-${scanId}`, "owner-1", trigger],
		})

	const eventsAtManualEnd = await runWithTestWorkers(testEnvironment, workers, async () => {
		// two scheduled Scans: one takes the slot, and the other waits behind it
		const scheduledScans = await Promise.all([
			startScan("scheduled-a", "scheduled"),
			startScan("scheduled-b", "scheduled"),
		])
		while (!events.some((event) => event.startsWith(`${SCHEDULED_SCAN_TASK_QUEUE} ingest`))) {
			await Bun.sleep(20)
		}

		// the manual Scan starts after them and ends before either scheduled ingest does
		const manualScan = await startScan("manual", "manual")
		await manualScan.result()
		const eventsSoFar = [...events]

		// free the slot, so both scheduled Scans end
		releaseIngest()
		await Promise.all(scheduledScans.map((scheduledScan) => scheduledScan.result()))
		return eventsSoFar
	})

	// the manual Scan's stages ran on the Scan queue, in order, and it closed
	const manualEvents = eventsAtManualEnd.filter((event) => event.endsWith(" manual"))
	expect(manualEvents).toEqual([
		`${SCAN_TASK_QUEUE} ingest manual`,
		`${SCAN_TASK_QUEUE} review manual`,
		"closed manual",
	])

	// by then one scheduled ingest held the slot, and nothing else of a scheduled Scan had run
	const scheduledEventsAtManualEnd = eventsAtManualEnd.filter((event) => !event.endsWith(" manual"))
	expect(scheduledEventsAtManualEnd).toHaveLength(1)
	expect(scheduledEventsAtManualEnd[0]).toStartWith(`${SCHEDULED_SCAN_TASK_QUEUE} ingest scheduled-`)

	// every stage of both scheduled Scans ran on the scheduled queue, and both closed
	const scheduledEvents = events.filter((event) => !event.endsWith(" manual"))
	expect(scheduledEvents.filter((event) => event.startsWith(SCHEDULED_SCAN_TASK_QUEUE))).toHaveLength(4)
	expect(scheduledEvents.filter((event) => event.startsWith("closed"))).toHaveLength(2)
	expect(scheduledEvents).toHaveLength(6)
}, 30_000)

// a workflow that an older worker started on the Scan queue is still open when the new worker takes over
test("a scheduled Scan that started on the Scan queue runs its stages there", async () => {
	const events: string[] = []
	const result = await runTestWorkflow({
		testEnvironment,
		workflowName: "runTopicScanWorkflow",
		workflowArgs: ["scheduled-before", "topic-1", "owner-1", "scheduled"],
		taskQueue: SCAN_TASK_QUEUE,
		workers: [
			toScanWorker(SCAN_TASK_QUEUE, events),
			toScanWorker(SCHEDULED_SCAN_TASK_QUEUE, events),
			toClosingWorker(events),
		],
	})
	expect(result).toBeUndefined()
	expect(events).toEqual([
		`${SCAN_TASK_QUEUE} ingest scheduled-before`,
		`${SCAN_TASK_QUEUE} review scheduled-before`,
		"closed scheduled-before",
	])
}, 30_000)

test("the trigger picks the queue that a Scan's workflow starts on", () => {
	expect(toScanTaskQueue("scheduled")).toBe("topic-scans-scheduled")
	expect(toScanTaskQueue("manual")).toBe("topic-scans")
	expect(toScanTaskQueue("creation")).toBe("topic-scans")
})
