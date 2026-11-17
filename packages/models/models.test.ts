// budget-rejection tests: the shapes LiteLLM's rejection arrives in, and what must not be read as a rejection.
import { expect, spyOn, test } from "bun:test"
import { EMBED_DIMENSIONS } from "@carlnotes/db/schema/scans"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { generateText, streamText } from "ai"
import { toChatCompletionResponse } from "./chatCompletionTestFixtures"
import {
	chatModel,
	cheapModel,
	embedPrivateVectors,
	embedVector,
	embedVectors,
	isBudgetRejection,
	scoreModel,
} from "./models"

// the body LiteLLM answers a spent key with, as the AI sdk hands it over
const BUDGET_BODY = JSON.stringify({
	error: {
		message: "Budget has been exceeded! Key=user:reader@example.com Current cost: 3.008, Max budget: 3.0",
		type: "budget_exceeded",
		code: "429",
	},
})

// the proxy's own rejection names the budget in its body on either status it sends for spent keys
test("a spent budget is read as a budget rejection", () => {
	expect(isBudgetRejection({ statusCode: 429, responseBody: BUDGET_BODY })).toBe(true)
	expect(isBudgetRejection({ statusCode: 422, responseBody: BUDGET_BODY })).toBe(true)
})

// the AI sdk retries a 429. the rejection reaches the caller wrapped in a retry error that includes each attempt
test("a rejection wrapped by the retry error is still found", () => {
	const retryError = {
		reason: "maxRetriesExceeded",
		errors: [
			{ statusCode: 429, responseBody: BUDGET_BODY },
			{ statusCode: 429, responseBody: BUDGET_BODY },
		],
	}
	expect(isBudgetRejection(retryError)).toBe(true)
	// and nested one level deeper, the way a cause chain arrives
	expect(isBudgetRejection({ cause: retryError })).toBe(true)
})

// only a budget rejection posts the spent-budget message. every other failure reports itself
test("other failures are not budget rejections", () => {
	// a rate limit is also a 429, and it says nothing about a budget
	expect(isBudgetRejection({ statusCode: 429, responseBody: '{"error":{"type":"rate_limit_exceeded"}}' })).toBe(false)
	expect(isBudgetRejection({ statusCode: 422, responseBody: '{"error":{"type":"validation_error"}}' })).toBe(false)
	// the budget wording on any other status is not the proxy turning the call down for spend
	expect(isBudgetRejection({ statusCode: 500, responseBody: BUDGET_BODY })).toBe(false)
	// the shapes with no status at all
	expect(isBudgetRejection(new Error("Budget has been exceeded!"))).toBe(false)
	expect(isBudgetRejection(null)).toBe(false)
	expect(isBudgetRejection(undefined)).toBe(false)
	expect(isBudgetRejection("Budget has been exceeded!")).toBe(false)
})

// an error whose cause points back at itself must not spin the chain walk
test("a self-referencing cause terminates", () => {
	const circular: { statusCode: number; cause?: unknown } = { statusCode: 500 }
	circular.cause = circular
	expect(isBudgetRejection(circular)).toBe(false)
})

test("SDK generation, streaming, and embeddings send LiteLLM redaction on the wire", async () => {
	// run each SDK transport on the user's key and capture the real HTTP request headers
	const restoreEnv = saveEnvSettings(["LITELLM_BASE_URL", "LITELLM_MASTER_KEY"])
	Bun.env.LITELLM_BASE_URL = "http://litellm.test/v1"
	Bun.env.LITELLM_MASTER_KEY = "master"
	const requests: { model: string; headers: Headers }[] = []
	const stubFetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
		// record the sent model and return a response in its endpoint's format
		const { model, stream, input } = JSON.parse(String(init?.body))
		requests.push({ model, headers: new Headers(init?.headers) })
		if (stream) {
			const chunk = {
				id: "chatcmpl-1",
				model,
				choices: [{ index: 0, delta: { content: "hello" }, finish_reason: "stop" }],
			}
			return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
				headers: { "Content-Type": "text/event-stream" },
			})
		}
		if (model === "embed-model") {
			return Response.json({
				data: input.map((_text: string, index: number) => ({ index, embedding: Array(EMBED_DIMENSIONS).fill(1) })),
				usage: { prompt_tokens: 1, total_tokens: 1 },
			})
		}
		return toChatCompletionResponse("hello")
	}) as typeof fetch
	const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(stubFetch)
	try {
		// cover both generation tiers, streaming, single and batched embeddings, and private embeddings
		const litellmApiKey = "sk-user"
		await generateText({
			model: cheapModel(litellmApiKey),
			prompt: "hello",
			headers: { "X-LiteLLM-Enable-Message-Redaction": "false", "litellm-disable-message-redaction": "true" },
		})
		await generateText({ model: scoreModel(litellmApiKey), prompt: "hello" })
		expect(await streamText({ model: chatModel(litellmApiKey), prompt: "hello" }).text).toBe("hello")
		await embedVector("hello", { litellmApiKey })
		await embedVectors(["hello", "hi"], { litellmApiKey })
		await embedPrivateVectors(["hello"], { litellmApiKey })

		// verify redaction wins over caller headers and the user's key is preserved
		expect(requests.map(({ model }) => model)).toEqual([
			"cheap-model",
			"score-model",
			"chat-model",
			"embed-model",
			"embed-model",
			"embed-model",
		])
		for (const { headers } of requests) {
			expect(headers.get("x-litellm-enable-message-redaction")).toBe("true")
			expect(headers.has("litellm-disable-message-redaction")).toBe(false)
			expect(headers.get("authorization")).toBe("Bearer sk-user")
		}
	} finally {
		fetchSpy.mockRestore()
		restoreEnv()
	}
})
