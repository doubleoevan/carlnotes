import { expect, test } from "bun:test"
import {
	toPersonalSourceConversationProvider,
	toPersonalSourceSenderIdentity,
	toPersonalSourceSenderProvider,
} from "./personalSourcesCopy"

// provider identity comes from the destination, not another platform mentioned in the URL
test.each([
	["https://claude.ai/chat/example", "claude"],
	["https://claude.ai/code/example", "claude_code"],
	["https://claude.ai/code", "claude_code"],
	["https://claude.ai/code-not-a-session", "claude"],
	["https://CHATGPT.COM/c/example", "chatgpt"],
	["https://chat.openai.com/c/example", "chatgpt"],
	["https://www.chatgpt.com./c/example", "chatgpt"],
	["https://gemini.google.com/app/example", "gemini"],
	["https://g.co/gemini/share/example", "gemini"],
	["https://g.co/other/example", "other"],
	["codex://threads/00000000-0000-4000-8000-000000000001", "codex"],
	["codex://threads/new", "other"],
	["https://m365.cloud.microsoft/chat/example", "copilot"],
	["https://github.com/copilot/c/example", "other"],
	["https://github.com/example/repository", "other"],
	["https://cursor.com/s/example", "cursor"],
	["https://grok.com/c/example", "grok"],
	["https://x.com/i/grok/example", "grok"],
	["https://x.com/someone/status/123", "other"],
	["https://www.perplexity.ai/search/example", "perplexity"],
	["https://chat.deepseek.com/a/chat/s/example", "deepseek"],
	["https://copilot.microsoft.com/chats/example", "copilot"],
	["https://cursor.com/agents/example", "cursor"],
	["https://claude.ai.example.com/chat/example", "other"],
	["https://example.com/?next=https://chatgpt.com/c/example", "other"],
	["https://chatgpt.com@example.com/c/example", "other"],
	["https://user@chatgpt.com/c/example", "other"],
	["javascript:alert('claude.ai')", "other"],
	["not a URL", "other"],
] as const)("%s selects %s", (url, provider) => {
	expect(toPersonalSourceConversationProvider(url)).toBe(provider)
})

test.each([
	["ChatGPT", "chatgpt"],
	["Codex", "codex"],
	["Claude", "claude"],
	["Claude Code", "claude_code"],
	["Claude import", "claude"],
	["Gemini", "gemini"],
	["My custom agent", "other"],
] as const)("sender %s uses the %s platform mark", (sender, provider) => {
	expect(toPersonalSourceSenderProvider(sender)).toBe(provider)
})

// reference destinations change display marks without changing stored sender provenance
test("known references select the destination and unknown references retain a generic mark", () => {
	expect(
		toPersonalSourceSenderIdentity({
			sender: "ChatGPT",
			origin: "send",
			chatUrl: "codex://threads/00000000-0000-4000-8000-000000000001",
		}),
	).toEqual({ label: "Codex", provider: "codex" })
	expect(
		toPersonalSourceSenderIdentity({
			sender: "ChatGPT",
			origin: "send",
			chatUrl: "https://chatgpt.com.example.com/chat/1",
		}),
	).toEqual({ label: "ChatGPT", provider: "other" })
	expect(toPersonalSourceSenderIdentity({ sender: "ChatGPT", origin: "send", chatUrl: null })).toEqual({
		label: "ChatGPT",
		provider: "chatgpt",
	})
})
