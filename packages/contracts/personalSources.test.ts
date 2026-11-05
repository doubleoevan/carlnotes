// intake boundaries preserve private provenance, bounded text, and frozen source responses
import { describe, expect, test } from "bun:test"
import { TOPIC_ATTACHMENT_MAX_BYTES } from "./attachmentTypes"
import { fetchedSourceKinds, personalSourceKinds } from "./enums"
import { aiAgentSourceConfig, PERSONAL_SOURCES_DAILY_SEND_LIMIT } from "./personalSources"
import {
	personalSourcesImportPayload,
	personalSourcesSendPayload,
	suggestTopicsPayload,
} from "./personalSourcesPayloads"
import { personalSourcesCandidateUrl, personalSourcesReferenceUrl } from "./personalSourcesUrls"
import { PLANS } from "./plans"

// astral characters count once at the send boundary
test("sends accept 2,000 code points and ten canonical public links", () => {
	const links = Array.from({ length: 10 }, (_, i) => `https://example.com/research/${i}?utm_source=agent`)
	const acceptedSend = personalSourcesSendPayload.parse({
		topic_id: "topic",
		title: "Research",
		summary: "🦉".repeat(2000),
		links,
	})
	expect(acceptedSend.summary).toHaveLength(4000)
	expect(acceptedSend.links[0]).toBe("https://example.com/research/0")
})

test("sends reject excessive content, duplicate canonical links, and fabricated provenance", () => {
	const validSend = { topic_id: "topic", title: "Research", summary: "A useful finding" }
	expect(personalSourcesSendPayload.safeParse({ ...validSend, summary: "🦉".repeat(2001) }).success).toBe(false)
	expect(
		personalSourcesSendPayload.safeParse({
			...validSend,
			links: Array.from({ length: 11 }, (_, i) => `https://example.com/${i}`),
		}).success,
	).toBe(false)
	expect(
		personalSourcesSendPayload.safeParse({
			...validSend,
			links: ["https://example.com/p", "https://example.com/p?utm_source=x"],
		}).success,
	).toBe(false)

	// authority and lifecycle come from the accepted sender, never the submitted body
	for (const field of ["userId", "clientId", "sender", "origin", "expiresAt", "config"]) {
		expect(personalSourcesSendPayload.safeParse({ ...validSend, [field]: "forged" }).success).toBe(false)
	}
})

describe("unsafe public link candidates", () => {
	for (const url of [
		"file:///etc/passwd",
		"https://name:secret@example.com/",
		"http://localhost/",
		"http://localhost./",
		"http://127.1/",
		"http://2130706433/",
		"http://0x7f000001/",
		"http://10.0.0.1/",
		"http://169.254.169.254/",
		"http://100.64.0.1/",
		"http://[::1]/",
		"http://[::ffff:7f00:1]/",
		"http://[fc00::1]/",
		"http://[fe80::1]/",
		"https://wiki.internal/",
		"https://printer/",
		"https://example.com/?access_token=private",
		"https://chatgpt.com/c/private",
		"https://claude.ai/chat/private",
		"https://docs.google.com/document/d/private",
		"https://team.slack.com/archives/private",
		"https://example.com/share/secret",
		"https://click.example.com/abc",
		"https://example.com/unsubscribe?id=private",
	]) {
		test(url, () => expect(personalSourcesCandidateUrl.safeParse(url).success).toBe(false))
	}
})

test("private record links are owner references while ordinary public pages remain candidates", () => {
	expect(personalSourcesReferenceUrl.safeParse("https://claude.ai/chat/private").success).toBe(true)
	expect(personalSourcesCandidateUrl.parse("https://ff.example.com/p?utm_campaign=x")).toBe("https://ff.example.com/p")
	expect(personalSourcesCandidateUrl.parse("https://example.com/p?q=research")).toBe("https://example.com/p?q=research")
})

test("concrete source identities do not permit manufactured OAuth fields on an import", () => {
	expect(aiAgentSourceConfig.safeParse({ delivery: "import", provider: "claude" }).success).toBe(true)
	expect(aiAgentSourceConfig.safeParse({ delivery: "import", provider: "claude", clientId: "forged" }).success).toBe(
		false,
	)
	expect(
		aiAgentSourceConfig.safeParse({ delivery: "api_key", apiKeyId: "key-1", appDomain: "claude.ai" }).success,
	).toBe(false)
})

test("selected import batches enforce bytes as well as transcript count", () => {
	const conversation = {
		conversationId: "1",
		title: "Selected",
		text: "Private text",
		links: [],
		omittedLinkCount: 0,
		chatUrl: null,
	}
	const selectedImport = { requestId: "batch-1", provider: "transcript", conversations: [conversation] }
	expect(personalSourcesImportPayload.safeParse(selectedImport).success).toBe(true)
	expect(personalSourcesImportPayload.safeParse({ ...selectedImport, conversations: [] }).success).toBe(false)
	expect(
		personalSourcesImportPayload.safeParse({
			...selectedImport,
			conversations: [{ ...conversation, text: "🦉".repeat(TOPIC_ATTACHMENT_MAX_BYTES / 4) }],
		}).success,
	).toBe(false)
})

test("receiving kinds stay separate from frozen source projections and receiving capabilities", () => {
	expect(personalSourceKinds).toEqual(["ai_agent", "email"])
	expect(fetchedSourceKinds).not.toContain("ai_agent")
	expect(fetchedSourceKinds).not.toContain("email")
	expect(PERSONAL_SOURCES_DAILY_SEND_LIMIT).toBe(200)
	expect(Object.values(PLANS).map((plan) => plan.canEmailCarl)).toEqual([false, true, true])
	expect(Object.values(PLANS).map((plan) => plan.canUseAiAgentApiKeys)).toEqual([false, false, true])
})

test("multi-Topic sends require exactly one target shape with one to twenty distinct ids", () => {
	const content = { title: "Research", summary: "Useful conclusions", links: [] }
	for (const topicIds of [["one"], ["one", "two"], Array.from({ length: 20 }, (_, index) => String(index))]) {
		expect(personalSourcesSendPayload.safeParse({ ...content, topic_ids: topicIds }).success).toBe(true)
	}
	for (const targets of [
		{},
		{ topic_ids: [] },
		{ topic_ids: ["one", "one"] },
		{ topic_id: "one", topic_ids: ["one"] },
		{ topic_ids: Array.from({ length: 21 }, (_, index) => String(index)) },
	]) {
		expect(personalSourcesSendPayload.safeParse({ ...content, ...targets }).success).toBe(false)
	}
})

test("the picker preserves a valid conversation reference and rejects unsafe schemes", () => {
	const input = {
		title: "Research",
		summary: "A concise summary",
		links: ["https://example.com/research"],
		chat_url: "https://chatgpt.com/c/private-reference",
	}
	expect(suggestTopicsPayload.parse(input).chat_url).toBe(input.chat_url)
	expect(personalSourcesSendPayload.parse({ ...input, topic_ids: ["topic"] }).chat_url).toBe(input.chat_url)
	for (const chat_url of [
		"javascript:alert(1)",
		"file:///tmp/chat",
		"http://localhost/chat",
		"https://user:password@example.com/chat",
	]) {
		expect(suggestTopicsPayload.safeParse({ ...input, chat_url }).success).toBe(false)
	}
})

// only the documented existing-thread action may open the Codex app
test("existing Codex references survive intake without becoming public candidates", () => {
	const chat_url = "codex://threads/00000000-0000-4000-8000-000000000001"
	const input = { title: "Research", summary: "A concise summary", chat_url }
	expect(suggestTopicsPayload.parse(input).chat_url).toBe(chat_url)
	expect(personalSourcesSendPayload.parse({ ...input, topic_ids: ["topic"] }).chat_url).toBe(chat_url)
	expect(personalSourcesCandidateUrl.safeParse(chat_url).success).toBe(false)
	expect(personalSourcesReferenceUrl.safeParse(chat_url).success).toBe(false)
	for (const rejected of [
		"codex://threads/new",
		"codex://settings",
		"codex://threads/not-an-id",
		`${chat_url}?prompt=run`,
		`${chat_url}#fragment`,
		"vscode://chat/private",
	]) {
		expect(suggestTopicsPayload.safeParse({ ...input, chat_url: rejected }).success).toBe(false)
	}
})

test.each([
	"https://grok.com/c/private",
	"https://chat.deepseek.com/share/private",
	"https://g.co/gemini/share/private",
	"https://cursor.com/s/private",
	"https://cursor.com/agents/private",
	"https://github.com/copilot/c/private",
	"https://m365.cloud.microsoft/chat/private",
	"https://x.com/i/grok/private",
	"https://www.perplexity.ai/search/private",
])("conversation reference %s stays outside the public page queue", (url) => {
	expect(personalSourcesReferenceUrl.safeParse(url).success).toBe(true)
	expect(personalSourcesCandidateUrl.safeParse(url).success).toBe(false)
})
