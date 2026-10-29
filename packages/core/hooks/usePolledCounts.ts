import { useEffect, useState } from "react"
import { startCountsPoll } from "../lib/countsPoll"

/**
 * Returns a page's latest counts, read once the page shows and then every minute while the app is focused and online,
 * or null before the first read. A failed read keeps the counts already shown, and isEnabled false stops the poll
 * while the page is off the screen.
 */
export function usePolledCounts<Counts>(
	readCounts: (signal: AbortSignal) => Promise<Counts | null>,
	isEnabled = true,
): Counts | null {
	const [counts, setCounts] = useState<Counts | null>(null)
	// readCounts keeps its identity between renders, or each render restarts the poll
	useEffect(() => {
		if (!isEnabled) {
			return
		}
		return startCountsPoll({ readCounts, onCounts: setCounts })
	}, [readCounts, isEnabled])
	return counts
}
