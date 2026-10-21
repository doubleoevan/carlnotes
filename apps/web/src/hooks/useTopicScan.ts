import type { TopicResponse } from "@carlnotes/contracts/topics"
import { useEffect, useState } from "react"

// how often to re-fetch the page while a scan is running
// a polled scan shows its first findings within seconds, and a long one is not worth as fast of a refetch.
// the rate steps down the longer the scan runs.
const FAST_POLL_MS = 3000
const MEDIUM_POLL_MS = 10_000
const SLOW_POLL_MS = 30_000

// how long the topic scan poll holds each of the first two poll rates before slowing down
const FAST_POLL_UNTIL_MS = 30_000
const MEDIUM_POLL_UNTIL_MS = 120_000

/**
 * The delay before the next refetch, based on how long this scan has been watched.
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
		// start the poll, and return its stop as the effect's cleanup
		return startScanPoll(reload)
	}, [isScanning, reload])
}

/**
 * Polls reload while the page is visible, one request at a time. The next tick is scheduled once the previous reload
 * settles, and a slow response never overlaps the next request. Returns the call that stops the poll.
 */
export function startScanPoll(reload: () => Promise<void>): () => void {
	// the timer reschedules itself so the delay can grow, which a single interval can't do
	const startedAt = Date.now()
	let pollTimer: ReturnType<typeof setTimeout> | undefined
	// the id of the poll in progress. a stop or a restart gives the next poll a new id, so a reload still in flight
	// from an ended poll schedules nothing when it settles
	let activePollId = 0

	// schedule the next tick at the rate for how long the scan has been watched
	function schedule(pollId: number): void {
		pollTimer = setTimeout(() => reloadThenSchedule(pollId), toScanPollMs(Date.now() - startedAt))
	}

	// reload, then schedule the next tick once the reload settles, while the poll is still the one in progress
	function reloadThenSchedule(pollId: number): void {
		void reload().finally(() => {
			if (pollId === activePollId) {
				schedule(pollId)
			}
		})
	}

	// end the poll in progress and clear its timer
	function stopPoll(): void {
		activePollId += 1
		clearTimeout(pollTimer)
	}

	// only poll the page when it is visible. a page shown again reloads right away, then polls on
	function handleVisibilityChange(): void {
		stopPoll()
		if (document.visibilityState === "visible") {
			reloadThenSchedule(activePollId)
		}
	}

	// listen for the page's visibility, and start polling if the page is visible now
	document.addEventListener("visibilitychange", handleVisibilityChange)
	if (document.visibilityState === "visible") {
		schedule(activePollId)
	}

	// the stop ends the poll and stops listening
	return () => {
		stopPoll()
		document.removeEventListener("visibilitychange", handleVisibilityChange)
	}
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
