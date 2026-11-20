// what a topic memory update gives each of its model calls, and the runner that those calls go through
import { runModelCall } from "@carlnotes/models/modelCallRetry"
import type { TopicMemorySpend } from "./topicMemorySpend"

// the Topic owner's key, or none for the platform's own key, the signal that ends the attempt, the update's running
// spend, which a call outside an update has none of, and the moment after which no retry wait may end
export type TopicMemoryModelInput = {
	litellmApiKey: string | undefined
	signal: AbortSignal
	spend?: TopicMemorySpend
	waitDeadlineAt?: number
}

/**
 * Runs one model call of an update. A rate limit, a failing provider, or a timeout waits and tries again inside the
 * update's attempt, and a cancelled update ends the call at once.
 */
export function runTopicMemoryModelCall<Result>(
	{ signal, waitDeadlineAt }: Pick<TopicMemoryModelInput, "signal" | "waitDeadlineAt">,
	runAttempt: () => Promise<Result>,
): Promise<Result> {
	return runModelCall({ runAttempt, waitDeadlineAt: waitDeadlineAt ?? null, label: "topicMemories", signal })
}
