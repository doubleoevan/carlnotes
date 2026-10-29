// tests for the report contracts: which subjects a report names, the text it keeps, and the payload's block flag
import { expect, test } from "bun:test"
import { reportSubjectKinds } from "./enums"
import { flagContentPayload } from "./payloads"
import { REPORT_TEXT_MAX_CHARS, toReportText } from "./reports"

// every subject kind parses, and the block flag is optional
test("the report payload accepts every subject kind with an optional block", () => {
	for (const subjectKind of reportSubjectKinds) {
		expect(flagContentPayload.parse({ subjectKind, subjectId: "subject-1", reason: "spam" }).subjectKind).toBe(
			subjectKind,
		)
	}
	expect(
		flagContentPayload.parse({ subjectKind: "chatMessage", subjectId: "1", reason: "spam", shouldBlockAuthor: true })
			.shouldBlockAuthor,
	).toBe(true)
	expect(flagContentPayload.safeParse({ subjectKind: "comment", subjectId: "1", reason: "spam" }).success).toBe(false)
})

// a long body is cut to the report's length with an ellipsis, and a short one is kept whole
test("the report text is cut to its limit", () => {
	expect(toReportText("short")).toBe("short")
	const cutText = toReportText("x".repeat(REPORT_TEXT_MAX_CHARS + 10))
	expect(cutText.length).toBe(REPORT_TEXT_MAX_CHARS)
	expect(cutText.endsWith("…")).toBe(true)
})
