// tests for the payload contracts that create and update topic are validated through
import { expect, test } from "bun:test"
import {
	chatRoomMessagePayload,
	chatTurnPayload,
	MAX_ATTACHMENT_CONTEXT_CHARS,
	MAX_TOPIC_SOURCES,
	suggestSourcesPayload,
	type UpdateTopicPayload,
	updateTopicPayload,
	userInvitePayload,
	withAttachmentNote,
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
		inviteEmails: [],
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

// the editor merges prompt urls into the same array before it saves, so they must count toward the limit
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

// a source suggestion request includes every ready attachment's context joined together
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

// the shape every user-invite request requires: exactly one identifier, with the email normalized
test("userInvitePayload accepts exactly one identifier and normalizes the email", () => {
	expect(userInvitePayload.safeParse({}).success).toBe(false)
	expect(userInvitePayload.safeParse({ username: "penny", email: "a@b.com" }).success).toBe(false)
	expect(userInvitePayload.safeParse({ username: "penny" }).success).toBe(true)
	const parsedInvite = userInvitePayload.safeParse({ email: "  A@B.COM " })
	expect(parsedInvite.success && parsedInvite.data.email).toBe("a@b.com")
})

// one staged file, the smallest attachment either chat payload accepts
const textAttachment = { kind: "text" as const, name: "notes.txt", text: "hello", keep: false }

// a chat turn or chat room message may be attachments alone, but never nothing at all
test("the chat payloads accept attachments alone and reject an empty send", () => {
	// a question or content may be empty while attachments go with the send
	expect(chatTurnPayload.safeParse({ question: "", attachments: [textAttachment] }).success).toBe(true)
	expect(chatRoomMessagePayload.safeParse({ content: "", attachments: [textAttachment] }).success).toBe(true)

	// a send with nothing at all is rejected by both
	expect(chatTurnPayload.safeParse({ question: "" }).success).toBe(false)
	expect(chatRoomMessagePayload.safeParse({ content: "" }).success).toBe(false)
})

// an attachments-only question reads as the note alone, with no leading blank lines
test("withAttachmentNote stands alone on an empty question", () => {
	expect(withAttachmentNote("", [{ name: "a.pdf" }])).toBe("[attached: a.pdf]")
})
