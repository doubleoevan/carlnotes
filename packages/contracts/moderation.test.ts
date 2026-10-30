// tests for the moderation contracts: the verdict's shape, the rejection body, and Carl's words for each category
import { expect, test } from "bun:test"
import {
	isObjectionableContentResponse,
	moderationCategories,
	moderationVerdict,
	toModerationRejectionMessage,
} from "./moderation"

// a verdict names a category only for a violation, and an unknown category fails the schema
test("the verdict parses a violation with its category and rejects an unknown one", () => {
	expect(moderationVerdict.parse({ isViolation: true, category: "harassment" }).category).toBe("harassment")
	expect(moderationVerdict.parse({ isViolation: false, category: null }).isViolation).toBe(false)
	expect(moderationVerdict.safeParse({ isViolation: true, category: "spam" }).success).toBe(false)
})

// every category gets a rejection that names it and never an empty label
test("each category has Carl's rejection", () => {
	for (const category of moderationCategories) {
		const message = toModerationRejectionMessage(category)
		expect(message.startsWith("Carl looked at that twice")).toBe(true)
		expect(message).not.toContain("undefined")
	}
	expect(toModerationRejectionMessage("sexual")).toContain("sexual content")
})

// the rejection body is recognized by its marker and category
test("the objectionable-text response is recognized", () => {
	expect(isObjectionableContentResponse({ rejection: "objectionable", category: "hate" })).toBe(true)
	expect(isObjectionableContentResponse({ error: "not found" })).toBe(false)
})
