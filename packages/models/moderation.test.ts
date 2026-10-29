// moderation tests: no proxy skips the check, the call sees the text fenced as data and returns the verdict through the
// schema, a verdict outside the schema fails, and a failed call fails without throwing
import { afterEach, expect, mock, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { buildModerationPrompt, classifyUserText } from "./moderation"
import { toUntrustedFences } from "./prompts/untrustedFenceTestFixtures"

// the proxy settings a model call needs, the real fetch, and the request bodies a stubbed fetch saw
const restoreEnvSettings = saveEnvSettings(["LITELLM_BASE_URL", "LITELLM_MASTER_KEY"])
const originalFetch = globalThis.fetch
const sentRequestBodies: { messages: { role: string; content: string }[] }[] = []

// stub the proxy with a chat completion whose content is the given text, recording each request body
function stubProxyReply(content: string | Error): void {
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "master"
	globalThis.fetch = (async (_url: string, init: RequestInit) => {
		sentRequestBodies.push(JSON.parse(String(init.body)))
		if (content instanceof Error) {
			throw content
		}
		// one completion with the given content
		return Response.json({
			id: "chatcmpl-1",
			object: "chat.completion",
			created: 0,
			model: "cheap-model",
			choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
			usage: { prompt_tokens: 120, completion_tokens: 6, total_tokens: 126 },
		})
	}) as unknown as typeof fetch
}

// put back the proxy settings, fetch, and the spies, and forget the recorded requests
afterEach(() => {
	restoreEnvSettings()
	mock.restore()
	globalThis.fetch = originalFetch
	sentRequestBodies.length = 0
})

// without a proxy url the check is skipped and no call is made
test("no proxy url skips the check", async () => {
	delete Bun.env.LITELLM_BASE_URL
	expect(await classifyUserText({ text: "hello", textKind: "a chat room message" })).toEqual({ outcome: "skipped" })
	expect(sentRequestBodies).toHaveLength(0)
})

// the call sees the kind in the instructions and the text fenced as data, and the verdict comes back through the schema
test("a violation comes back with its category", async () => {
	stubProxyReply(JSON.stringify({ isViolation: true, category: "harassment" }))
	const classification = await classifyUserText({ text: "you all smell", textKind: "a chat room message" })
	expect(classification).toEqual({ outcome: "classified", verdict: { isViolation: true, category: "harassment" } })

	// the prompt names the kind and fences the text
	const sentPrompt = sentRequestBodies[0]?.messages.map((message) => message.content).join("\n") ?? ""
	expect(sentPrompt).toContain("It is a chat room message.")
	const [fencedText] = toUntrustedFences(sentPrompt)
	expect(fencedText?.value).toContain("you all smell")
})

// a verdict the schema does not accept, and a call that throws, both fail without throwing
test("an off-schema verdict and a thrown call both fail", async () => {
	stubProxyReply(JSON.stringify({ isViolation: true, category: "spam" }))
	expect((await classifyUserText({ text: "x", textKind: "a note's body" })).outcome).toBe("failed")
	stubProxyReply(new Error("proxy down"))
	expect((await classifyUserText({ text: "x", textKind: "a note's body" })).outcome).toBe("failed")
})

// the prompt cuts a long text to its limit and leaves no placeholder behind
test("the prompt cuts the text and fills every placeholder", async () => {
	const { prompt } = await buildModerationPrompt({ text: "x".repeat(10_000), textKind: "a note's body" })
	expect(prompt).not.toContain("{{")
	expect(prompt.length).toBeLessThan(9500)
})
