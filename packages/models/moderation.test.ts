// moderation tests: no proxy skips the check, the call sees the text fenced as data and returns the verdict through the
// schema, a verdict outside the schema fails, a failed call fails without throwing, a text's verdict is kept for a day
// and each call that runs is the platform's spend, and the image check maps OpenAI's flags onto Carl's categories
import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { toChatCompletionResponse } from "./chatCompletionTestFixtures"
import { buildModerationPrompt, classifyImage, classifyUserText, MODERATION_TEXT_MAX_CHARS } from "./moderation"
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

// each test starts with no kept verdict and no recorded spend, over an in-memory Redis and a stubbed pool
let sentQueries: SentQuery[]
beforeEach(() => {
	stubRedisClient()
	sentQueries = stubConnectionPool(() => [])
})

// put back the proxy settings, fetch, Redis, the pool, and the spies, and forget the recorded requests
afterEach(() => {
	restoreEnvSettings()
	restoreRedisClient()
	restoreConnectionPool()
	mock.restore()
	globalThis.fetch = originalFetch
	sentRequestBodies.length = 0
})

test("no proxy url skips text moderation and fails configured image moderation", async () => {
	delete Bun.env.LITELLM_BASE_URL
	Bun.env.OPENAI_API_KEY = "sk-test"
	expect(await classifyUserText({ text: "hello", textKind: "a chat room message" })).toEqual({ outcome: "skipped" })
	expect(await classifyImage(PNG_IMAGE)).toMatchObject({ outcome: "failed" })
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
// an autosave and an edit that leaves a paragraph as it was send the same text again
test("a text saved again within a day is classified once, and each call that runs is the platform's spend", async () => {
	// the first save classifies the text, and its cost is a spends row with no user
	stubProxyReply(JSON.stringify({ isViolation: false, category: null }))
	const note = { text: "Flat burrs keep fines low.", textKind: "a note's body" } as const
	const firstClassification = await classifyUserText(note)
	expect(sentRequestBodies).toHaveLength(1)
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.text).toStartWith('insert into "spends"')
	expect(sentQueries[0]?.values).toContain("textModeration")

	// the same text saved again returns the kept verdict, with no call and no spend
	expect(await classifyUserText(note)).toEqual(firstClassification)
	expect(sentRequestBodies).toHaveLength(1)
	expect(sentQueries).toHaveLength(1)

	// an edited text, and the same words as another kind of text, are each classified
	await classifyUserText({ ...note, text: "Conical burrs keep fines low." })
	await classifyUserText({ ...note, textKind: "a chat room message" })
	expect(sentRequestBodies).toHaveLength(3)
})

test("an off-schema verdict and a thrown call both fail", async () => {
	stubProxyReply(JSON.stringify({ isViolation: true, category: "spam" }))
	expect((await classifyUserText({ text: "x", textKind: "a note's body" })).outcome).toBe("failed")
	stubProxyReply(new Error("proxy down"))
	expect((await classifyUserText({ text: "x", textKind: "a note's body" })).outcome).toBe("failed")
})

test("text moderation reports the status without the provider's echoed input", async () => {
	// give the real SDK an error response with the content in its error message
	const text = "private request content"
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "master"
	globalThis.fetch = (async () =>
		Response.json({ error: { message: text } }, { status: 400 })) as unknown as typeof fetch
	expect(await classifyUserText({ text, textKind: "a note's body" })).toEqual({
		outcome: "failed",
		error: new Error("the moderation endpoint returned HTTP 400"),
	})
})

// the prompt cuts a long text to its limit and leaves no placeholder behind
test("the prompt cuts the text and fills every placeholder", async () => {
	const { prompt } = await buildModerationPrompt({ text: "x".repeat(10_000), textKind: "a note's body" })
	expect(prompt).not.toContain("{{")
	expect(prompt).toContain("x".repeat(MODERATION_TEXT_MAX_CHARS))
	expect(prompt).not.toContain("x".repeat(MODERATION_TEXT_MAX_CHARS + 1))
})

// a tiny png as the data url the image check sends
const PNG_IMAGE = { dataUrl: "data:image/png;base64,iVBORw==" }

// stub the moderation endpoint with the given category flags, or a thrown error, recording each request body
function stubImageModeration(categories: Record<string, boolean> | Error): void {
	Bun.env.OPENAI_API_KEY = "sk-test"
	Bun.env.LITELLM_BASE_URL = "http://litellm.test/v1/"
	Bun.env.LITELLM_MASTER_KEY = "master"
	globalThis.fetch = (async (url: string, init: RequestInit) => {
		// the proxy receives the image with redaction and authenticates with the proxy key
		const headers = new Headers(init.headers)
		expect(url).toBe("http://litellm.test/v1/moderations")
		expect(headers.get("x-litellm-enable-message-redaction")).toBe("true")
		expect(headers.get("authorization")).toBe("Bearer master")
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
	expect(sentRequestBodies[0]).toMatchObject({ model: "image-moderation" })
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
	stubImageModeration({})
	globalThis.fetch = (async () => Response.json({ results: [] })) as unknown as typeof fetch
	expect((await classifyImage(PNG_IMAGE)).outcome).toBe("failed")
	stubImageModeration(new DOMException("timed out", "TimeoutError") as unknown as Error)
	expect((await classifyImage(PNG_IMAGE)).outcome).toBe("failed")
})

// a rejection of the image itself reads as unreadable, while a rate limit or a bad key stays a failure that lets the
// image through
test("an image the endpoint rejects is unreadable, and a rate limit or a bad key fails", async () => {
	stubImageModeration({})
	globalThis.fetch = (async () =>
		Response.json(
			{ error: { param: "input[0].image_url", code: "invalid_image_format" } },
			{ status: 400 },
		)) as unknown as typeof fetch
	expect(await classifyImage(PNG_IMAGE)).toEqual({ outcome: "unreadable" })

	// a rate limit and a bad key both fail open
	globalThis.fetch = (async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch
	expect((await classifyImage(PNG_IMAGE)).outcome).toBe("failed")
	globalThis.fetch = (async () => new Response("bad key", { status: 401 })) as unknown as typeof fetch
	expect((await classifyImage(PNG_IMAGE)).outcome).toBe("failed")
})

test("a missing proxy alias fails image moderation without reporting the provider's message", async () => {
	// the new app can reach an older proxy while the two services deploy
	stubImageModeration({})
	globalThis.fetch = (async () =>
		Response.json(
			{ error: { param: "model", code: "400", message: PNG_IMAGE.dataUrl } },
			{ status: 400 },
		)) as unknown as typeof fetch
	const classification = await classifyImage(PNG_IMAGE)
	expect(classification).toEqual({ outcome: "failed", error: new Error("the moderation endpoint returned 400") })
})
