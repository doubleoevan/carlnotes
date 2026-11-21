import { useEffect } from "react"
import { startVisiblePoll } from "@/lib/visiblePoll"

// re-fetch on a timer while any scan is running, at the caller's rates
export function usePollWhileScanning(
	isScanning: boolean,
	reload: () => Promise<void>,
	toPollMs: (watchedMs: number) => number,
): void {
	useEffect(() => {
		if (!isScanning) {
			return
		}
		// start the poll, and return its stop as the effect's cleanup
		return startVisiblePoll({ reload, toPollMs })
	}, [isScanning, reload, toPollMs])
}

export { useManualScanProgress } from "@carlnotes/core/hooks/useManualScanProgress"
