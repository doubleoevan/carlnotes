import { useEffect, useRef, useState } from "react"
import { startCountsPoll } from "../lib/countsPoll"

/**
 * Returns a page's latest counts, read once the page shows and then every minute while the app is focused and online,
 * or null before the first read. A page whose read holds its saved counts shows them once it mounts and reads a minute
 * later, and the server render shows none. A failed read keeps the counts already shown, and isEnabled false stops the
 * poll while the page is off the screen.
 */
export function usePolledCounts<Counts>(
	readCounts: (signal: AbortSignal) => Promise<Counts | null>,
	isEnabled = true,
	savedCounts: Counts | null = null,
): Counts | null {
	const [counts, setCounts] = useState<Counts | null>(null)

	// the saved counts of the page that readCounts reads, which a new object of the same counts does not restart
	const savedCountsRef = useRef(savedCounts)
	savedCountsRef.current = savedCounts

	// readCounts keeps its identity between renders, or each render restarts the poll
	useEffect(() => {
		if (!isEnabled) {
			return
		}

		// show the saved counts after the server render, and read first a minute later, or read at once with none
		const shownSavedCounts = savedCountsRef.current
		if (shownSavedCounts) {
			setCounts(shownSavedCounts)
		}
		return startCountsPoll({ readCounts, onCounts: setCounts, isReadingAtStart: !shownSavedCounts })
	}, [readCounts, isEnabled])
	return counts
}
