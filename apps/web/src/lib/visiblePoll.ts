import { type StartActivePollOptions, startActivePoll } from "@carlnotes/core/lib/activePoll"

/**
 * Polls a visible browser page using the shared serialized timer.
 */
export function startVisiblePoll(options: Omit<StartActivePollOptions, "isActive" | "subscribe">): () => void {
	return startActivePoll({
		...options,
		isActive: () => document.visibilityState === "visible",
		subscribe: (listener) => {
			document.addEventListener("visibilitychange", listener)
			return () => document.removeEventListener("visibilitychange", listener)
		},
	})
}
