import { toScanPollMs } from "@carlnotes/core/lib/scanPoll"
import { useEffect } from "react"
import { startVisiblePoll } from "@/lib/visiblePoll"

// re-fetch the topic page on a timer while any of its scans are running
export function usePollWhileScanning(isScanning: boolean, reload: () => Promise<void>): void {
	useEffect(() => {
		if (!isScanning) {
			return
		}
		// start the poll at the scan's rates, and return its stop as the effect's cleanup
		return startVisiblePoll({ reload, toPollMs: toScanPollMs })
	}, [isScanning, reload])
}

export { useManualScanProgress } from "@carlnotes/core/hooks/useManualScanProgress"

export { toScanPollMs } from "@carlnotes/core/lib/scanPoll"
