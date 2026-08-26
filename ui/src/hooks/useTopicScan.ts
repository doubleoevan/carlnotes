import type { TopicResponse } from "@shared/contracts"
import { useEffect, useState } from "react"

// how often to re-fetch the page while a scan is running, so history and the manual scan button follow it live
const SCAN_POLL_MS = 3000

// re-fetch the topic page on a timer while any of its scans are running
export function usePollWhileScanning(isScanning: boolean, reload: () => Promise<void>): void {
	useEffect(() => {
		if (!isScanning) {
			return
		}

		// poll until the running scan resolves, then the cleared timer lets the page rest
		const pollTimer = setInterval(() => {
			void reload()
		}, SCAN_POLL_MS)
		return () => clearInterval(pollTimer)
	}, [isScanning, reload])
}

// the manual scan button's live state. isScanning is a recent running row, and isRunningScan sets the flag optimistically
export function useManualScanProgress(scans: TopicResponse["scans"] | undefined): {
	isScanning: boolean
	isRunningScan: boolean
	isCancellingScan: boolean
	// the flags above are set by these, one pair for the trigger and one for the cancel
	startScan: () => void
	stopScan: () => void
	cancelScan: () => void
	stopCancelling: () => void
} {
	// the optimistic flags covering the gap between a click and the row that confirms it
	const [isRunningScan, setIsRunningScan] = useState(false)
	const [isCancellingScan, setIsCancellingScan] = useState(false)
	const [scanTriggeredAt, setScanTriggeredAt] = useState<number | null>(null)

	// the topic's current scan status
	const isScanning = scans?.some((scan) => scan.status === "running") ?? false
	const hasScanSinceTrigger =
		scanTriggeredAt !== null && (scans?.some((scan) => new Date(scan.startedAt).getTime() >= scanTriggeredAt) ?? false)

	// hand the button over from the optimistic flag to the database row when hasScanSinceTrigger is true
	useEffect(() => {
		if (isScanning || hasScanSinceTrigger) {
			setIsRunningScan(false)
		}
	}, [isScanning, hasScanSinceTrigger])

	// a cancel takes a moment to reach the running stage, so the flag resets only once no scan is running
	useEffect(() => {
		if (!isScanning) {
			setIsCancellingScan(false)
		}
	}, [isScanning])

	// the live flags, then the actions the button drives them with
	return {
		isScanning,
		isRunningScan,
		isCancellingScan,
		// a trigger optimistically sets the flag and the timestamp that the database should override
		startScan: () => {
			setIsRunningScan(true)
			setScanTriggeredAt(Date.now())
		},
		stopScan: () => setIsRunningScan(false),
		cancelScan: () => setIsCancellingScan(true),
		// a cancel that the api rejected leaves the scan running, so the cancel control comes back to be tried again
		stopCancelling: () => setIsCancellingScan(false),
	}
}
