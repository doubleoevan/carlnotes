import { expect, test } from "bun:test"
import type { PersonalSourcesExportPreview } from "./personalSourcesExport"
import { toSelectedPersonalSourcesImport } from "./personalSourcesImportSelection"

// preview text intentionally includes an unselected private canary
const preview: PersonalSourcesExportPreview = {
	provider: "claude",
	conversations: [
		{
			conversationId: "selected",
			title: "Research",
			text: "Keep this text",
			links: [],
			omittedLinkCount: 0,
			chatUrl: null,
			createdAt: "2026-11-02T00:00:00Z",
		},
		{
			conversationId: "unselected",
			title: "Private canary",
			text: "UNSELECTED_PRIVATE_CANARY",
			links: [],
			omittedLinkCount: 0,
			chatUrl: null,
			createdAt: null,
		},
	],
}

test("only explicitly selected text enters the upload, without local preview metadata", () => {
	const payload = toSelectedPersonalSourcesImport({
		preview,
		selectedIds: new Set(["selected"]),
		requestId: "test-request",
	})
	expect(payload.conversations).toHaveLength(1)
	expect(JSON.stringify(payload)).not.toContain("UNSELECTED_PRIVATE_CANARY")
	expect(JSON.stringify(payload)).not.toContain("createdAt")
	expect(payload.conversations[0]?.text).toBe("Keep this text")
})

test("empty, ambiguous, and oversized selections cannot be uploaded", () => {
	expect(() => toSelectedPersonalSourcesImport({ preview, selectedIds: new Set(), requestId: "empty" })).toThrow()
	const first = preview.conversations[0]
	if (!first) {
		throw new Error("missing fixture")
	}
	expect(() =>
		toSelectedPersonalSourcesImport({
			preview: { ...preview, conversations: [first, { ...first, text: "ambiguous" }] },
			selectedIds: new Set([first.conversationId]),
			requestId: "ambiguous",
		}),
	).toThrow()
	expect(() =>
		toSelectedPersonalSourcesImport({
			preview: { ...preview, conversations: [{ ...first, text: "a".repeat(10 * 1024 * 1024) }] },
			selectedIds: new Set([first.conversationId]),
			requestId: "oversized",
		}),
	).toThrow()
})
