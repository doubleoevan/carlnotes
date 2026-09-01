import type { TopicResponse } from "@shared/contracts"
import { useEffect, useState } from "react"

// how often to re-fetch the page while a scan is running, so history and the manual scan button follow it
// live. a watched scan shows its first findings within seconds, and a long one is not worth a refetch every
// three seconds for minutes on end, so the rate steps down the longer the scan runs
const FAST_POLL_MS = 3000
const MEDIUM_POLL_MS = 10_000
const SLOW_POLL_MS = 30_000

// how long the poll holds each of the first two rates before stepping down
const FAST_POLL_UNTIL_MS = 30_000
const MEDIUM_POLL_UNTIL_MS = 120_000

/**
 * The delay before the next refetch, from how long this scan has been watched.
 */
export function toScanPollMs(watchedMs: number): number {
	if (watchedMs < FAST_POLL_UNTIL_MS) {
		return FAST_POLL_MS
	}
	return watchedMs < MEDIUM_POLL_UNTIL_MS ? MEDIUM_POLL_MS : SLOW_POLL_MS
}

// re-fetch the topic page on a timer while any of its scans are running
export function usePollWhileScanning(isScanning: boolean, reload: () => Promise<void>): void {
	useEffect(() => {
		if (!isScanning) {
			return
		}

		// the timer reschedules itself so the delay can grow, which one interval could not do
		const startedAt = Date.now()
		let pollTimer: ReturnType<typeof setTimeout> | undefined
		const schedule = (): void => {
			pollTimer = setTimeout(
				() => {
					void reload()
					schedule()
				},
				toScanPollMs(Date.now() - startedAt),
			)
		}

		// a hidden tab polls nothing at all. coming back refetches once and picks the timer up again,
		// so a phone in a pocket costs nothing and the page is still current when it is looked at
		const handleVisibility = (): void => {
			clearTimeout(pollTimer)
			if (document.visibilityState === "visible") {
				void reload()
				schedule()
			}
		}
		document.addEventListener("visibilitychange", handleVisibility)
		if (document.visibilityState === "visible") {
			schedule()
		}

		// the cleared timer lets the page rest once the scan resolves
		return () => {
			clearTimeout(pollTimer)
			document.removeEventListener("visibilitychange", handleVisibility)
		}
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
