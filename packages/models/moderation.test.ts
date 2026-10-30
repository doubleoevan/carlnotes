// moderation tests: no proxy skips the check, the call sees the text fenced as data and returns the verdict through the
// schema, a verdict outside the schema fails, a failed call fails without throwing, and the image check maps OpenAI's
// flags onto Carl's categories
import { afterEach, expect, mock, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { toChatCompletionResponse } from "./chatCompletionTestFixtures"
import { buildModerationPrompt, classifyImage, classifyUserText } from "./moderation"
import { toUntrustedFences } from "./prompts/untrustedFenceTestFixtures"

// the proxy settings a model call needs, the real fetch, and the request bodies a stubbed fetch saw
const restoreEnvSettings = saveEnvSettings(["LITELLM_BASE_URL", "LITELLM_MASTER_KEY", "OPENAI_API_KEY"])
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
		return toChatCompletionResponse(content)
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

// a tiny png as the data url the image check sends
const PNG_IMAGE = { dataUrl: "data:image/png;base64,iVBORw==" }

// stub the moderation endpoint with the given category flags, or a thrown error, recording each request body
function stubImageModeration(categories: Record<string, boolean> | Error): void {
	Bun.env.OPENAI_API_KEY = "sk-test"
	globalThis.fetch = (async (_url: string, init: RequestInit) => {
		sentRequestBodies.push(JSON.parse(String(init.body)))
		if (categories instanceof Error) {
			throw categories
		}

		// one result with the given flags
		return Response.json({ id: "modr-1", model: "omni-moderation-latest", results: [{ flagged: true, categories }] })
	}) as unknown as typeof fetch
}

// without a key the image check is skipped and no call is made
test("no openai key skips the image check", async () => {
	delete Bun.env.OPENAI_API_KEY
	expect(await classifyImage(PNG_IMAGE)).toEqual({ outcome: "skipped" })
	expect(sentRequestBodies).toHaveLength(0)
})

// a flagged category maps onto Carl's, and the image goes as a data url
test("a flagged image comes back with Carl's category", async () => {
	stubImageModeration({ sexual: false, "sexual/minors": false, "violence/graphic": true, violence: true })
	expect(await classifyImage(PNG_IMAGE)).toEqual({
		outcome: "classified",
		verdict: { isViolation: true, category: "violence" },
	})
	expect(JSON.stringify(sentRequestBodies[0])).toContain("data:image/png;base64,")
})

// plain violence and the illicit categories do not count for an image, so a news photo posts
test("an image flagged only for plain violence is clean", async () => {
	stubImageModeration({ violence: true, illicit: true, sexual: false })
	expect(await classifyImage(PNG_IMAGE)).toEqual({
		outcome: "classified",
		verdict: { isViolation: false, category: null },
	})
})

// a response outside the schema and a call that throws, a timeout included, both fail without throwing
test("an off-schema response and a thrown image call both fail", async () => {
	Bun.env.OPENAI_API_KEY = "sk-test"
	globalThis.fetch = (async () => Response.json({ results: [] })) as unknown as typeof fetch
	expect((await classifyImage(PNG_IMAGE)).outcome).toBe("failed")
	stubImageModeration(new DOMException("timed out", "TimeoutError") as unknown as Error)
	expect((await classifyImage(PNG_IMAGE)).outcome).toBe("failed")
})

// a rejection of the image itself reads as unreadable, while a rate limit or a bad key stays a failure that lets the
// image through
test("an image the endpoint rejects is unreadable, and a rate limit or a bad key fails", async () => {
	Bun.env.OPENAI_API_KEY = "sk-test"
	globalThis.fetch = (async () => new Response("unsupported image", { status: 400 })) as unknown as typeof fetch
	expect(await classifyImage(PNG_IMAGE)).toEqual({ outcome: "unreadable" })

	// a rate limit and a bad key both fail open
	globalThis.fetch = (async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch
	expect((await classifyImage(PNG_IMAGE)).outcome).toBe("failed")
	globalThis.fetch = (async () => new Response("bad key", { status: 401 })) as unknown as typeof fetch
	expect((await classifyImage(PNG_IMAGE)).outcome).toBe("failed")
})
