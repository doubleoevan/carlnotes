import { expect, test } from "bun:test"
import { toTestNote } from "@carlnotes/contracts/noteTestFixtures"
import {
	canSaveNoteDraft,
	parseNoteDrafts,
	serializeNoteDrafts,
	toNoteBodyDraft,
	toNoteDraftKey,
	toNoteDraftState,
	transitionNoteDraft,
} from "./noteDrafts"

test("acknowledgement advances the base without dropping a newer revision", () => {
	// take a snapshot while one body is on its way and another is being edited
	const original = toNoteDraftState("base", 3)
	const edited = transitionNoteDraft(original, { type: "edit", html: "first" })
	const sending = transitionNoteDraft(edited, { type: "start" })
	const latest = transitionNoteDraft(sending, { type: "edit", html: "second" })
	const accepted = transitionNoteDraft(latest, {
		type: "result",
		html: "first",
		result: { status: "saved", version: 4 },
	})
	expect(toNoteBodyDraft(accepted)).toMatchObject({ html: "second", version: 4, revision: 2, hasPendingChanges: true })
	expect(canSaveNoteDraft(accepted)).toBe(true)
	expect(original.latestHtml).toBe("base")
})

test("uncertain acknowledgement keeps the old version and a later conflict blocks transport", () => {
	// preserve the version until an accepted response rather than assuming an offline request was saved
	const edited = transitionNoteDraft(toNoteDraftState("base", 3), { type: "edit", html: "words" })
	const uncertain = transitionNoteDraft(edited, { type: "result", html: "words", result: { status: "failed" } })
	const restored = toNoteDraftState("server at 4", 4, toNoteBodyDraft(uncertain))
	const conflict = transitionNoteDraft(restored, {
		type: "result",
		html: "words",
		result: { status: "conflict", version: 4, lastEditorUsername: null },
	})
	const continued = transitionNoteDraft(conflict, { type: "edit", html: "more words" })
	expect(toNoteBodyDraft(continued)).toMatchObject({ html: "more words", version: 3, conflict: { version: 4 } })
	expect(canSaveNoteDraft(continued)).toBe(false)
	expect(
		toNoteBodyDraft(transitionNoteDraft(continued, { type: "reload", html: "server at 4", version: 4 })),
	).toMatchObject({ html: "server at 4", version: 4, hasPendingChanges: false, conflict: null })
})

test("retirement fences every late transition and account keys remain isolated", () => {
	const draft = transitionNoteDraft(toNoteDraftState("base", 3), { type: "edit", html: "private" })
	const retired = transitionNoteDraft(draft, { type: "retire" })
	expect(
		transitionNoteDraft(retired, { type: "result", html: "private", result: { status: "saved", version: 4 } }),
	).toBe(retired)
	expect(transitionNoteDraft(retired, { type: "edit", html: "late" })).toBe(retired)
	expect(canSaveNoteDraft(retired)).toBe(false)
	expect(toNoteDraftKey("a/b")).not.toBe(toNoteDraftKey("a%2Fb"))
})

test("draft storage restores legacy Topic drafts and keeps Team drafts on their own page", () => {
	// preserve the original version and text while upgrading the page context
	const note = toTestNote()
	const draft = toNoteBodyDraft(
		transitionNoteDraft(toNoteDraftState(note.html, note.version), { type: "edit", html: "offline words" }),
	)
	const legacy = {
		accountId: "reader",
		topicId: "same-id",
		pageName: "Topic",
		creatableVisibilities: ["private"],
		note,
		draft,
	}
	const [restored] = parseNoteDrafts(JSON.stringify({ schema: 1, notes: [legacy] }), "reader")
	expect(restored).toMatchObject({
		pageType: "topic",
		pageId: "same-id",
		draft: { html: "offline words", version: note.version },
	})
	expect(restored).not.toHaveProperty("topicId")
	if (!restored) {
		throw new Error("missing restored draft")
	}

	// retain the page kind even when identifiers happen to match
	const teamDraft = { ...restored, pageType: "team" as const, pageName: "Team" }
	expect(parseNoteDrafts(serializeNoteDrafts([restored, teamDraft]), "reader").map((entry) => entry.pageType)).toEqual([
		"topic",
		"team",
	])
	expect(() => parseNoteDrafts(serializeNoteDrafts([teamDraft]), "other-reader")).toThrow("invalid note draft storage")
})
