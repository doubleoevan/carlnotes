// suggested reply tests: the prompt fences the latest turns and the draft and cuts each, the call returns the filtered
// line and its tokens, and a failed, slow, malformed, or budget-rejected call returns none
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { EMPTY_TOPIC_DRAFT } from "@carlnotes/contracts/topicPayloads"
import { toChatCompletionResponse } from "@carlnotes/models/chatCompletionTestFixtures"
import { toUntrustedFences } from "@carlnotes/models/prompts/untrustedFenceTestFixtures"
import * as monitoring from "@carlnotes/server/monitoring"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { buildSuggestedReplyPrompt, MAX_SUGGESTED_REPLY_DOLLARS, writeSuggestedReply } from "./suggestedReply"

// the proxy settings a model call needs, the real fetch, and the request bodies a stubbed fetch saw
const restoreEnvSettings = saveEnvSettings(["LITELLM_BASE_URL", "LITELLM_MASTER_KEY"])
const originalFetch = globalThis.fetch
const sentRequestBodies: { max_tokens?: number; messages: { content: string }[] }[] = []

// point the model at a stubbed proxy that answers with the given response
function stubProxy(toResponse: (init: RequestInit) => Promise<Response> | Response): void {
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "master"
	globalThis.fetch = (async (_url: string, init: RequestInit) => {
		sentRequestBodies.push(JSON.parse(String(init.body)))
		return toResponse(init)
	}) as unknown as typeof fetch
}

// put back the proxy settings, fetch, and the spies, and forget the recorded requests
afterEach(() => {
	restoreEnvSettings()
	mock.restore()
	globalThis.fetch = originalFetch
	sentRequestBodies.length = 0
})

// one turn of the new-topic chat
const CHAT_TURNS = [{ question: "I want to follow espresso machines", answer: "Nice. How often should I look?" }]

test("the prompt fences the latest three turns and the draft, and cuts each", async () => {
	// five turns, the latest answer long enough to be cut, and a draft with a name
	const chatTurns = Array.from({ length: 5 }, (_, index) => ({
		question: `question ${index} ${"q".repeat(600)}`,
		answer: `${"a".repeat(2000)} answer end ${index}`,
	}))
	const { prompt } = await buildSuggestedReplyPrompt({
		chatTurns,
		topicDraft: { ...EMPTY_TOPIC_DRAFT, name: "Espresso" },
	})

	// only the last three turns are read, each answer keeps its end, and every input is fenced
	expect(prompt).not.toContain("question 1 ")
	expect(prompt).toContain("question 2 ")
	expect(prompt).toContain("answer end 4")
	expect(prompt).not.toContain("{{")
	const fencedValues = toUntrustedFences(prompt).map((untrustedFence) => untrustedFence.value)
	expect(fencedValues.some((value) => value.includes("Title: Espresso"))).toBe(true)
	expect(fencedValues.find((value) => value.includes("Reader:"))?.length).toBeLessThan(3 * (500 + 1500 + 20))
})

test("the call returns the line and its tokens, within the output limit", async () => {
	stubProxy(() => toChatCompletionResponse('{"suggestedReply":"Weekly is fine"}'))
	expect(await writeSuggestedReply({ chatTurns: CHAT_TURNS, litellmApiKey: "key" })).toEqual({
		suggestedReply: "Weekly is fine",
		totalTokens: 126,
	})
	expect(sentRequestBodies[0]?.max_tokens).toBe(60)
})

test("an unsafe line is dropped but its tokens still count", async () => {
	stubProxy(() => toChatCompletionResponse('{"suggestedReply":"Invite sam@example.com"}'))
	expect(await writeSuggestedReply({ chatTurns: CHAT_TURNS, litellmApiKey: "key" })).toEqual({
		suggestedReply: null,
		totalTokens: 126,
	})
})

test("a null line and a line the schema rejects return none", async () => {
	stubProxy(() => toChatCompletionResponse('{"suggestedReply":null}'))
	expect((await writeSuggestedReply({ chatTurns: CHAT_TURNS, litellmApiKey: "key" })).suggestedReply).toBeNull()

	// output the schema cannot read is reported and returns none
	const reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})
	stubProxy(() => toChatCompletionResponse('{"reply":4}'))
	expect(await writeSuggestedReply({ chatTurns: CHAT_TURNS, litellmApiKey: "key" })).toEqual({
		suggestedReply: null,
		totalTokens: 0,
	})
	expect(reportError).toHaveBeenCalledTimes(1)
})

test("a call past its limit returns none", async () => {
	// a proxy that answers only once the call is aborted
	quietErrorReports()
	stubProxy(
		(init) =>
			new Promise((_resolve, reject) => {
				init.signal?.addEventListener("abort", () => reject(init.signal?.reason))
			}),
	)
	const startedAt = Date.now()
	expect(await writeSuggestedReply({ chatTurns: CHAT_TURNS, litellmApiKey: "key" })).toEqual({
		suggestedReply: null,
		totalTokens: 0,
	})
	expect(Date.now() - startedAt).toBeLessThan(3000)
})

test("a spent budget returns none and reports nothing", async () => {
	// the proxy's budget rejection, and a spy on the error report
	const reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})
	stubProxy(() => new Response('{"error":{"type":"budget_exceeded"}}', { status: 429 }))
	expect(await writeSuggestedReply({ chatTurns: CHAT_TURNS, litellmApiKey: "key" })).toEqual({
		suggestedReply: null,
		totalTokens: 0,
	})
	expect(reportError).not.toHaveBeenCalled()
})

test("an aborted request stops the call, and nothing is reported", async () => {
	// a proxy that answers only once the call is aborted, and the user leaving right away
	const reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})
	stubProxy(
		(init) =>
			new Promise((_resolve, reject) => {
				if (init.signal?.aborted) {
					reject(init.signal.reason)
				}
				init.signal?.addEventListener("abort", () => reject(init.signal?.reason))
			}),
	)
	const requestAbortController = new AbortController()
	const suggestion = writeSuggestedReply({
		chatTurns: CHAT_TURNS,
		litellmApiKey: "key",
		requestAbortSignal: requestAbortController.signal,
	})
	requestAbortController.abort()
	expect(await suggestion).toEqual({ suggestedReply: null, totalTokens: 0 })
	expect(reportError).not.toHaveBeenCalled()
})

test("the call's own largest cost is a small positive amount", () => {
	expect(MAX_SUGGESTED_REPLY_DOLLARS).toBeGreaterThan(0)
	expect(MAX_SUGGESTED_REPLY_DOLLARS).toBeLessThan(0.05)
})
