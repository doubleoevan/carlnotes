// tests for the payload contracts that create and update topic are validated through
import { expect, test } from "bun:test"
import {
	MAX_ATTACHMENT_CONTEXT_CHARS,
	MAX_TOPIC_SOURCES,
	suggestSourcesPayload,
	type UpdateTopicPayload,
	updateTopicPayload,
} from "./contracts"

// a valid topic payload, varied only by the source list each test case needs
function topicPayload(sources: UpdateTopicPayload["sources"]): UpdateTopicPayload {
	return {
		name: "A topic",
		prompt: "what to look for",
		tags: [],
		frequency: "weekly" as const,
		scheduledTime: "09:00",
		scheduledDayOfWeek: "monday" as const,
		visibility: "private" as const,
		maxResults: 10,
		invitees: [],
		sources,
	}
}

// a source list of the given length
function sourceList(count: number): UpdateTopicPayload["sources"] {
	return Array.from({ length: count }, (_, index) => ({
		sourceKind: "rss" as const,
		config: { url: `https://example.test/${index}/feed` },
	}))
}

// every Scan fetches every Source, so the list must have a limit
test("a topic holds at most the source limit", () => {
	expect(updateTopicPayload.safeParse(topicPayload(sourceList(MAX_TOPIC_SOURCES))).success).toBe(true)
	expect(updateTopicPayload.safeParse(topicPayload(sourceList(MAX_TOPIC_SOURCES + 1))).success).toBe(false)
})

// the editor folds prompt urls into the same array before it saves, so they must count toward the limit
test("prompt-derived url sources count toward the limit", () => {
	const promptUrls = Array.from({ length: 3 }, (_, index) => ({
		sourceKind: "url" as const,
		config: { url: `https://example.test/page-${index}` },
	}))
	const sources = [...sourceList(MAX_TOPIC_SOURCES - 2), ...promptUrls]
	expect(sources).toHaveLength(MAX_TOPIC_SOURCES + 1)
	expect(updateTopicPayload.safeParse(topicPayload(sources)).success).toBe(false)
})

// a topic with no sources at all is a topic that scans nothing, which the editor allows
test("an empty source list is still a valid payload", () => {
	expect(updateTopicPayload.safeParse(topicPayload([])).success).toBe(true)
})

// a source suggestion request carries every ready attachment's context joined together,
// so the joined value is what has to fit within the limit
test("a suggestion request accepts the attachment context up to the limit and rejects more", () => {
	const request = (attachmentContext: string): Record<string, unknown> => ({
		name: "Raccoons",
		prompt: "care",
		attachmentContext,
		excludeSources: [],
		limit: 3,
	})
	expect(suggestSourcesPayload.safeParse(request("a".repeat(MAX_ATTACHMENT_CONTEXT_CHARS))).success).toBe(true)
	expect(suggestSourcesPayload.safeParse(request("a".repeat(MAX_ATTACHMENT_CONTEXT_CHARS + 1))).success).toBe(false)

	// a request that names no attachment context at all is still valid
	expect(
		suggestSourcesPayload.safeParse({ name: "Raccoons", prompt: "care", excludeSources: [], limit: 3 }).success,
	).toBe(true)
})
