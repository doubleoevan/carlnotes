// moderation gate tests: a violation names its category, a clean text and a skipped or failed check pass, a failed
// check is reported with the subject and never the text, an image check does the same, and a route turns a violation
// into Carl's 422
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as moderation from "@carlnotes/models/moderation"
import * as monitoring from "@carlnotes/server/monitoring"
import { toObjectionableCategory, toObjectionableImageCategory } from "./moderation"
import { noteCommentsRoute } from "./note/noteComments"
import { TEST_NOTE_ID, TEST_PUBLIC_TEAM_ROW, toNoteQueryRows } from "./note/noteTestFixtures"
import { toJsonRequest, toSignedInApp } from "./testSession"

// put the spied classification and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// a violation names its category, and a clean verdict names none
test("a violation names its category and a clean text passes", async () => {
	const classifyUserTextSpy = spyOn(moderation, "classifyUserText")
		.mockResolvedValueOnce({ outcome: "classified", verdict: { isViolation: true, category: "hate" } })
		.mockResolvedValueOnce({ outcome: "classified", verdict: { isViolation: false, category: null } })
	const checkOptions = { textKind: "a chat room message" as const, subjectKind: "chatMessage", subjectId: "1" }

	// the two verdicts, in order
	expect(await toObjectionableCategory({ ...checkOptions, text: "bad" })).toBe("hate")
	expect(await toObjectionableCategory({ ...checkOptions, text: "fine" })).toBeNull()
	expect(classifyUserTextSpy).toHaveBeenCalledTimes(2)
})

// an empty text is never sent, a skipped check passes, and a failed check passes with a report naming the subject
test("empty, skipped, and failed checks all pass, and the failure is reported without the text", async () => {
	const classifyUserTextSpy = spyOn(moderation, "classifyUserText")
		.mockResolvedValueOnce({ outcome: "skipped" })
		.mockResolvedValueOnce({ outcome: "failed", error: new Error("proxy down") })
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const checkOptions = { textKind: "a note's body" as const, subjectKind: "note", subjectId: "n1" }
	expect(await toObjectionableCategory({ ...checkOptions, text: "   " })).toBeNull()

	// the skipped check, then the failed one
	expect(await toObjectionableCategory({ ...checkOptions, text: "secret draft" })).toBeNull()
	expect(await toObjectionableCategory({ ...checkOptions, text: "secret draft" })).toBeNull()
	expect(classifyUserTextSpy).toHaveBeenCalledTimes(2)

	// the report names the note and never its text
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	const [, stage, extra] = reportErrorSpy.mock.calls[0] ?? []
	expect(stage).toBe("api-route")
	expect(extra).toEqual({ moderationSubjectKind: "note", moderationSubjectId: "n1" })
	expect(JSON.stringify(reportErrorSpy.mock.calls[0])).not.toContain("secret draft")
})

// a comment the check rejects gets Carl's 422 with the category, and nothing is stored
test("a rejected comment returns 422 with its category and stores nothing", async () => {
	spyOn(moderation, "classifyUserText").mockResolvedValue({
		outcome: "classified",
		verdict: { isViolation: true, category: "harassment" },
	})
	const sentQueries = stubConnectionPool((sentQuery) =>
		toNoteQueryRows(sentQuery, () => [], { teams: [TEST_PUBLIC_TEAM_ROW] }),
	)

	// the post
	const response = await toSignedInApp(noteCommentsRoute, "user-1").request(
		`/notes/${TEST_NOTE_ID}/comments`,
		toJsonRequest({ body: "you all smell" }),
	)
	expect(response.status).toBe(422)
	expect(await response.json()).toEqual({ rejection: "objectionable", category: "harassment" })
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("insert"))).toBe(false)
})

// an image's violation names its category, and a failed image check passes with a report naming the subject
test("an image check names a violation and passes a failure with a report", async () => {
	spyOn(moderation, "classifyImage")
		.mockResolvedValueOnce({ outcome: "classified", verdict: { isViolation: true, category: "sexual" } })
		.mockResolvedValueOnce({ outcome: "failed", error: new Error("endpoint down") })
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const imageOptions = { dataUrl: "data:image/png;base64,AA", subjectKind: "avatar", subjectId: "u1" }

	// the violation, then the failure that passes
	expect(await toObjectionableImageCategory(imageOptions)).toBe("sexual")
	expect(await toObjectionableImageCategory(imageOptions)).toBeNull()
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ moderationSubjectKind: "avatar", moderationSubjectId: "u1" })
})
