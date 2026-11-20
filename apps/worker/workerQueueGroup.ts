import { readEnumSetting } from "@carlnotes/server/envSettings"

// The default queue group preserves the single-process development worker.
export type WorkerQueueGroup = "main" | "films" | "all"

/** Selects queues before any Workers are created. A typo must never enable every queue. */
export function readWorkerQueueGroup(value = Bun.env.WORKER_QUEUE_GROUP ?? Bun.env.WORKER_ROLE): WorkerQueueGroup {
	return readEnumSetting({
		settingName: "WORKER_QUEUE_GROUP",
		value,
		allowedValues: ["main", "films"],
		defaultValue: "all",
	})
}
