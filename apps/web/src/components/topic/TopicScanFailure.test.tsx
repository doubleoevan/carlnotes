// the scan failure line: the manual scans cutoff reads plainly with a See account link, a spent budget offers Upgrade
import { expect, test } from "bun:test"
import {
	FIRST_SCAN_PAUSED_REASON,
	FIRST_SCAN_SPENT_BUDGET_REASON,
	MANUAL_SCAN_PAUSED_LABEL,
} from "@carlnotes/contracts/scanFailure"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { TopicScanFailure } from "./TopicScanFailure"

// a first Scan past the manual scans cutoff shows the paused label in muted text, linking the account meter
test("a first scan past the manual scans cutoff reads plainly and links the account", async () => {
	const html = await renderWithRouter(<TopicScanFailure error={FIRST_SCAN_PAUSED_REASON} />)
	expect(html).toContain(MANUAL_SCAN_PAUSED_LABEL)
	expect(html).toContain('href="/account"')
	expect(html).not.toContain("text-destructive")
})

// a first Scan at a spent budget offers the Upgrade button
test("a first scan at a spent budget offers Upgrade", async () => {
	const html = await renderWithRouter(<TopicScanFailure error={FIRST_SCAN_SPENT_BUDGET_REASON} />)
	expect(html).toContain('href="/plans"')
	expect(html).toContain("text-destructive")
})

// any other failure shows its reason with no way out
test("any other failure shows its reason alone", async () => {
	const html = await renderWithRouter(<TopicScanFailure error="connection rejected" />)
	expect(html).toContain("connection rejected")
	expect(html).not.toContain("href=")
})
