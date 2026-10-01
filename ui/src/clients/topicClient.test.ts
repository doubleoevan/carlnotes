// topic client tests: a manual scan rejected because of a spent budget returns "budget",
// and a started scan returns the scans left today
import { afterEach, expect, test } from "bun:test"
import { SCAN_SPENT_BUDGET_LABEL } from "@shared/scanFailure"
import { sendManualScan } from "./topicClient"

// the real fetch to put back after each test
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

// a 402 from the scan route is a spent budget, and a started scan returns the scans left today
test("sendManualScan maps a 402 to budget and returns the scans left on a start", async () => {
	// the scan route rejects the scan because of the budget
	globalThis.fetch = (async () =>
		Response.json({ error: SCAN_SPENT_BUDGET_LABEL }, { status: 402 })) as unknown as typeof fetch
	expect(await sendManualScan("topic-1")).toBe("budget")

	// the scan route starts the scan
	globalThis.fetch = (async () => Response.json({ remainingScans: 3 })) as unknown as typeof fetch
	expect(await sendManualScan("topic-1")).toBe(3)
})
