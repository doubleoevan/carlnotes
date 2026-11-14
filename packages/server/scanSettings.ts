// the scan setting that reads the environment: how many Scans one sweep may hand to Temporal

import { toWholeNumber } from "./envSettings"

// how many Scans one sweep may hand to Temporal by default
const DEFAULT_SCAN_DISPATCH_LIMIT = 100

/**
 * Returns how many Scans one sweep may hand to Temporal, from SCAN_DISPATCH_LIMIT. Zero starts no scheduled Scan.
 */
export function scanDispatchLimit(): number {
	return toWholeNumber(Bun.env.SCAN_DISPATCH_LIMIT, DEFAULT_SCAN_DISPATCH_LIMIT)
}
