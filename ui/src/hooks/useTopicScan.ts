import type { TopicResponse } from "@shared/contracts"
import { useEffect, useState } from "react"

// how often to re-fetch the page while a scan is running, so history and the manual scan button follow it live
const SCAN_POLL_MS = 3000

// re-fetch the topic page on a timer while any of its scans are running,
// so the history status row and the "Brew" button follow a scan to completion without a manual reload.
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
	startScan: () => void
	stopScan: () => void
} {
	const [isRunningScan, setIsRunningScan] = useState(false)
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

	return {
		isScanning,
		isRunningScan,
		startScan: () => {
			setIsRunningScan(true)
			setScanTriggeredAt(Date.now())
		},
		stopScan: () => setIsRunningScan(false),
	}
}
