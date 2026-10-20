// agreement check tests: a message with no words makes no call, the call sees only the user's words and the proposal,
// its decision comes back through the schema, and a failed call agrees to nothing
import { afterEach, expect, mock, test } from "bun:test"
import { quietErrorReports } from "@shared/monitoringTestFixtures"
import { saveEnvSettings } from "@shared/savedEnvSettings"
import { toUntrustedFences } from "../prompts/untrustedFenceTestFixtures"
import { checkAgreement } from "./agreement"

// the proxy settings a model call needs, the real fetch, and the request bodies a stubbed fetch saw
const restoreEnvSettings = saveEnvSettings(["LITELLM_BASE_URL", "LITELLM_MASTER_KEY"])
const originalFetch = globalThis.fetch
const sentRequestBodies: { messages: { role: string; content: string }[] }[] = []

// stub the proxy with a chat completion whose content is the given text, recording each request body
function stubProxyReply(content: string): void {
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "master"
	globalThis.fetch = (async (_url: string, init: RequestInit) => {
		sentRequestBodies.push(JSON.parse(String(init.body)))
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

// a message with no words is unclear, and no model call is made
test("a message with no words is unclear with no call", async () => {
	stubProxyReply('{"decision":"agree"}')
	expect(await checkAgreement({ userWords: "   ", proposal: "frequency: daily" })).toEqual({
		decision: "unclear",
		totalTokens: 0,
	})
	expect(sentRequestBodies).toHaveLength(0)
})

// the call sends one message holding only the user's words and the proposal, and returns the decision and its tokens
test("the check sees only the user's words and the proposal and returns the decision", async () => {
	// a proxy that reads the reply as agreement
	stubProxyReply('{"decision":"agree"}')
	const checkAgreementResult = await checkAgreement({ userWords: "sounds good, do it", proposal: "frequency: daily" })
	expect(checkAgreementResult).toEqual({ decision: "agree", totalTokens: 126 })

	// one user message, with the words and the proposal fenced as untrusted data
	const [requestBody] = sentRequestBodies
	expect(requestBody?.messages).toHaveLength(1)
	expect(requestBody?.messages[0]?.content).toContain("sounds good, do it")
	expect(requestBody?.messages[0]?.content).toContain("frequency: daily")
	const fencedValues = toUntrustedFences(String(requestBody?.messages[0]?.content)).map(
		(untrustedFence) => untrustedFence.value,
	)
	expect(fencedValues).toContain("sounds good, do it")
})

// a call that fails agrees to nothing
test("a failed check is unclear", async () => {
	// a proxy that cannot be reached, and a quiet error report
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "master"
	globalThis.fetch = (async () => {
		throw new TypeError("fetch failed")
	}) as unknown as typeof fetch
	quietErrorReports()

	// the check is unclear and spent nothing it can count
	expect(await checkAgreement({ userWords: "yes", proposal: "frequency: daily" })).toEqual({
		decision: "unclear",
		totalTokens: 0,
	})
})
