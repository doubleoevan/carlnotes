// the reads of a Temporal task queue's pollers and activity backlog, and the backlog's report once it waits too long

import type { ThresholdCrossing } from "@carlnotes/server/monitoring"
import { getClient, withClientDeadline } from "./temporalClient"

// Temporal's TASK_QUEUE_TYPE_ACTIVITY, a queue's activity side, where an activity waits for a worker slot
const ACTIVITY_TASK_QUEUE_TYPE = 2

// a task queue's pollers and its activity backlog: how many tasks wait, and how long the oldest one has waited, which
// is null if the server cannot say
export type TaskQueueDescription = { pollerCount: number; backlogCount: number; oldestBacklogAgeMs: number | null }

/**
 * Describes a task queue's activity side: how many workers poll it, and how many activities wait for a slot and for
 * how long. Zero pollers means nothing on the queue will run.
 */
export async function describeTaskQueue(taskQueue: string): Promise<TaskQueueDescription> {
	const client = await getClient()

	// the stats a current server reports, and the backlog hint an older one returns instead, under the call deadline
	const queue = await withClientDeadline(client, () =>
		client.workflowService.describeTaskQueue({
			namespace: client.options.namespace,
			taskQueue: { name: taskQueue },
			taskQueueType: ACTIVITY_TASK_QUEUE_TYPE,
			reportStats: true,
			includeTaskQueueStatus: true,
		}),
	)

	// a server without stats gives a depth from its hint and no age
	const pollerCount = queue.pollers?.length ?? 0
	if (!queue.stats) {
		return { pollerCount, backlogCount: Number(queue.taskQueueStatus?.backlogCountHint ?? 0), oldestBacklogAgeMs: null }
	}
	const backlogAge = queue.stats.approximateBacklogAge
	return {
		pollerCount,
		backlogCount: Number(queue.stats.approximateBacklogCount ?? 0),
		oldestBacklogAgeMs: backlogAge
			? Number(backlogAge.seconds ?? 0) * 1000 + Math.round((backlogAge.nanos ?? 0) / 1_000_000)
			: null,
	}
}

// the report of a queue's backlog: how long its oldest task may wait before the backlog is reported, and the condition
// and message of that report
export type BacklogCrossing = { alertMs: number; condition: string; message: string }

// a queue's description, and the report of its backlog
type ToBacklogCrossingOptions = BacklogCrossing & { taskQueueDescription: TaskQueueDescription }

/**
 * Returns a queue's backlog as a threshold crossing if its oldest task has waited past the alert time, and null
 * otherwise, including if the server cannot say how long.
 */
export function toBacklogCrossing({
	taskQueueDescription: { backlogCount, oldestBacklogAgeMs },
	alertMs,
	condition,
	message,
}: ToBacklogCrossingOptions): ThresholdCrossing | null {
	if (oldestBacklogAgeMs === null || oldestBacklogAgeMs <= alertMs) {
		return null
	}
	return { condition, message, values: { backlogCount, oldestBacklogAgeMs } }
}
