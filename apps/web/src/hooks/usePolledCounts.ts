import { useEffect, useState } from "react"
import { startVisiblePoll } from "@/lib/visiblePoll"

// how often a visible page reads its counts again
const COUNTS_POLL_MS = 60_000

/**
 * Returns a page's latest counts, read once the page mounts and then on a poll while the page is visible, or null
 * before the first read. A failed read keeps the counts already shown.
 */
export function usePolledCounts<Counts>(readCounts: () => Promise<Counts | null>): Counts | null {
	const [counts, setCounts] = useState<Counts | null>(null)
	// readCounts keeps its identity between renders, or each render restarts the poll
	useEffect(() => {
		// read at once and then on the poll, and ignore a read that settles after the cleanup
		let isActive = true
		const reload = async (): Promise<void> => {
			const nextCounts = await readCounts()
			if (isActive && nextCounts) {
				setCounts(nextCounts)
			}
		}
		const stopPoll = startVisiblePoll({ reload, toPollMs: () => COUNTS_POLL_MS, isReloadingAtStart: true })

		// the cleanup stops the poll and drops any read still in flight
		return () => {
			isActive = false
			stopPoll()
		}
	}, [readCounts])
	return counts
}
