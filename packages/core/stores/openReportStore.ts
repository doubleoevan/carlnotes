// the open report count an admin sees, as the badge poll or the admin console last read it
import { toStoreListeners } from "./storeListeners"

// what the last read returned
let openReportCount = 0
const { publish, useStoreVersion } = toStoreListeners()

/**
 * Replaces the open report count with the latest read, and publishes only a changed count.
 */
export function setOpenReportCount(updatedOpenReportCount: number): void {
	if (updatedOpenReportCount !== openReportCount) {
		openReportCount = updatedOpenReportCount
		publish()
	}
}

/** Reads the open report count. */
export function useOpenReportCount(): number {
	useStoreVersion()
	return openReportCount
}
