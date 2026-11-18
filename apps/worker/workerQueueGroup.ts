// The default queue group preserves the single-process development worker.
export type WorkerQueueGroup = "main" | "films" | "all"

/** Selects queues before any Workers are created. A typo must never enable every queue. */
export function readWorkerQueueGroup(value = Bun.env.WORKER_QUEUE_GROUP ?? Bun.env.WORKER_ROLE): WorkerQueueGroup {
	if (!value) {
		return "all"
	}
	if (value === "main" || value === "films") {
		return value
	}
	throw new Error("WORKER_QUEUE_GROUP must be main, films, or unset")
}
