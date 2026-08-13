// manual-scan email tests: the rendered HTML reports each outcome, and the subject matches the body
import { expect, test } from "bun:test"
import { renderManualScanEmail, toManualScanSubject } from "./manual-scan-email"

// a successful manual scan lists its findings with the recap above them and doesn't offer an unsubscribe link
test("renderManualScanEmail lists a succeeded scan's findings under its recap", async () => {
	const html = await renderManualScanEmail({
		status: "succeeded",
		topicName: "LLM tooling",
		findings: [{ title: "Agent news", url: "https://a.com/1", relevanceExplanation: "covers agents" }],
		scanSummary: "Carl kept one thing.",
		topicUrl: "https://carlnotes.example.com/topics/abc",
	})

	// the recap, the finding, and the manual-trigger footer, with no subscription language
	expect(html).toContain("Carl kept one thing.")
	expect(html).toContain("https://a.com/1")
	expect(html).toContain("you started this brew yourself")
	expect(html).not.toContain("Unsubscribe")
})

// a scan that found nothing still sends an email, since the user is waiting on the results
test("renderManualScanEmail reports a succeeded scan that found nothing", async () => {
	const html = await renderManualScanEmail({ status: "succeeded", topicName: "LLM tooling", findings: [] })
	expect(html).toContain("found nothing new worth your time")
	expect(html).toContain("Carl has high standards.")
})

// a failed scan reports why it stopped instead of a findings list and says that the scan is scheduled to retry
test("renderManualScanEmail reports a failed scan's reason", async () => {
	const html = await renderManualScanEmail({
		status: "failed",
		topicName: "LLM tooling",
		failureReason: "Carl hit this month's budget.",
	})

	// matched without their apostrophes, since the renderer escapes those to HTML entities
	expect(html).toContain("finish the brew you started")
	expect(html).toContain("Carl hit this month")
	expect(html).toContain("keep trying on this topic")
})

// the subject names the topic and follows the outcome, so the inbox line never contradicts the body
test("toManualScanSubject follows the scan outcome", () => {
	expect(toManualScanSubject({ status: "succeeded", topicName: "LLM tooling", findings: [] })).toBe(
		"Your brew of LLM tooling is ready",
	)
	expect(toManualScanSubject({ status: "failed", topicName: "LLM tooling", failureReason: "nope" })).toBe(
		"Your brew of LLM tooling didn't finish",
	)
})
