// the topic memory setting that reads the environment: how many updates one worker replica runs at once

import { toPositiveInteger } from "./envSettings"

// two updates at once on a replica by default. an update makes up to four model calls at a time
const DEFAULT_TOPIC_MEMORY_CONCURRENCY = 2

/**
 * Returns how many topic memory updates run at once on a worker replica, from TOPIC_MEMORY_CONCURRENCY. Unset, zero,
 * and anything but a whole number above zero read as 2.
 */
export function topicMemoryConcurrency(): number {
	return toPositiveInteger(Bun.env.TOPIC_MEMORY_CONCURRENCY, DEFAULT_TOPIC_MEMORY_CONCURRENCY)
}
