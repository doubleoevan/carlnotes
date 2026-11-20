// a task queue read whose failure is logged and reported, so the minute line and the sweep report it alike

import type { TaskQueueDescription } from "@carlnotes/pipeline/temporalTaskQueues"
import { type ReportedStage, reportError } from "@carlnotes/server/monitoring"

// the queue to read, how it is read, and how its failure is reported
type ReadReportedTaskQueueOptions = {
	taskQueue: string
	readTaskQueue: (taskQueue: string) => Promise<TaskQueueDescription>
	stage: ReportedStage
	failureMessage: string
}

/**
 * Returns a task queue's description, or null if Temporal could not be read. A failed read is logged with the queue's
 * name and reported under the failure message.
 */
export async function readReportedTaskQueue({
	taskQueue,
	readTaskQueue,
	stage,
	failureMessage,
}: ReadReportedTaskQueueOptions): Promise<TaskQueueDescription | null> {
	try {
		return await readTaskQueue(taskQueue)
	} catch (error) {
		// the failure is logged and reported, and the queue reads as null
		console.error(`could not read the ${taskQueue} task queue`, error)
		reportError(new Error(failureMessage), stage, { taskQueue })
		return null
	}
}
