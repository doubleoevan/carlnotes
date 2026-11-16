// the Journal workers' queue, backfill, and rules for updating takeaways
export const TOPIC_MEMORY_TASK_QUEUE = "topic-memories"
export const TOPIC_MEMORY_FACT_FORMAT_VERSION = 1
export const TOPIC_MEMORY_BACKFILL_WORKFLOW = "backfillTopicTakeawaysWorkflow"
export type TopicMemoryBackfillSummary = { updated: number; skipped: number; paused: number; failed: number }

// leave time for a cancelled activity to release its lease before Temporal retries it
export const TOPIC_MEMORY_ACTIVITY_TIMEOUT_MS = 5 * 60 * 1000
export const TOPIC_MEMORY_ATTEMPT_DEADLINE_MS = 4 * 60 * 1000

export const TOPIC_MEMORY_CLUSTER_SIMILARITY = 0.92
export const TOPIC_MEMORY_MERGE_SIMILARITY = 0.98
export const TOPIC_MEMORY_REVIEW_SIMILARITY = 0.8
export const TOPIC_MEMORY_CLEANUP_INTERVAL = 5
export const TOPIC_MEMORY_SAVED_TAKEAWAY_LIMIT = 30
export const TOPIC_MEMORY_RECENCY_DECAY = 0.9
export const TOPIC_MEMORY_NEIGHBOR_LIMIT = 5
export const TOPIC_MEMORY_PROMPT_LIMIT = 20
