// the image render: the pass-through request, the image part and its tokens, and how a failed call is sorted
import { afterEach, expect, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { renderTopicImage, topicImageCostDollars, topicImageModel, topicImageRegenerateModel } from "./topicImageModel"

// the real fetch and env to put back after each test
const realFetch = globalThis.fetch
const restoreEnvSettings = saveEnvSettings([
	"LITELLM_BASE_URL",
	"LITELLM_MASTER_KEY",
	"TOPIC_IMAGE_MODEL",
	"TOPIC_IMAGE_REGENERATE_MODEL",
])

// put fetch and the env back
afterEach(() => {
	globalThis.fetch = realFetch
	restoreEnvSettings()
})

// one request the stubbed fetch recorded: its url, the key header, and the parsed body
type SentRenderRequest = { url: string; apiKey: string | undefined; requestBody: Record<string, unknown> }

// stub fetch with one that records each call and returns the given response
function stubRenderFetch(sentRequests: SentRenderRequest[], toResponse: () => Response): void {
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		const requestHeaders = (init?.headers ?? {}) as Record<string, string>
		const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
		sentRequests.push({ url: String(url), apiKey: requestHeaders["x-goog-api-key"], requestBody })
		return toResponse()
	}) as typeof fetch
}

// a response with one image part and its usage
function toImageResponse(): Response {
	const imageBase64 = Buffer.from("not really a jpeg").toString("base64")
	return new Response(
		JSON.stringify({
			candidates: [{ content: { parts: [{ inlineData: { data: imageBase64, mimeType: "image/jpeg" } }] } }],
			usageMetadata: { candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }] },
		}),
		{ status: 200 },
	)
}

test("a render posts the prompt at 3:2 to the pass-through on the key and returns the image with its tokens", async () => {
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "sk-master"
	const sentRequests: SentRenderRequest[] = []
	stubRenderFetch(sentRequests, toImageResponse)

	// the call goes to the model's generateContent route with the user's key
	const renderResult = await renderTopicImage({
		prompt: "A car. Editorial illustration.",
		model: "gemini-3.1-flash-lite-image",
		litellmApiKey: "sk-user",
	})
	expect(renderResult.outcome).toBe("rendered")
	if (renderResult.outcome !== "rendered") {
		return
	}
	// the image comes back, and the one request went to the route on the user's key
	expect(Buffer.from(renderResult.imageBytes).toString()).toBe("not really a jpeg")
	expect(sentRequests).toHaveLength(1)
	expect(sentRequests[0]?.url).toBe(
		"http://litellm.test/gemini/v1beta/models/gemini-3.1-flash-lite-image:generateContent",
	)
	expect(sentRequests[0]?.apiKey).toBe("sk-user")
	expect(sentRequests[0]?.requestBody.generationConfig).toEqual({
		responseModalities: ["IMAGE"],
		imageConfig: { aspectRatio: "3:2" },
	})
})

test("a render asked for 16:9 posts that aspect ratio", async () => {
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "sk-master"
	const sentRequests: SentRenderRequest[] = []
	stubRenderFetch(sentRequests, toImageResponse)

	// the image config names the wide ratio
	await renderTopicImage({ prompt: "A harbor.", model: "gemini-3.1-flash-lite-image", aspectRatio: "16:9" })
	expect(sentRequests[0]?.requestBody.generationConfig).toEqual({
		responseModalities: ["IMAGE"],
		imageConfig: { aspectRatio: "16:9" },
	})
})

test("a spent budget, a rejection, a server failure, and an empty response are sorted", async () => {
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "sk-master"
	const render = (): ReturnType<typeof renderTopicImage> =>
		renderTopicImage({ prompt: "A car.", model: "gemini-3.1-flash-lite-image" })

	// a spent key budget, which LiteLLM names in the body
	stubRenderFetch([], () => new Response('{"error":"Budget has been exceeded"}', { status: 429 }))
	expect((await render()).outcome).toBe("budget-spent")

	// a bad request is rejected for good
	stubRenderFetch([], () => new Response("bad prompt", { status: 400 }))
	expect((await render()).outcome).toBe("rejected")

	// a server failure and a response with no image are worth another attempt
	stubRenderFetch([], () => new Response("down", { status: 503 }))
	expect((await render()).outcome).toBe("retryable")
	stubRenderFetch([], () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }))
	expect((await render()).outcome).toBe("retryable")
})

test("a missing proxy rejects the call before anything is sent", async () => {
	Bun.env.LITELLM_BASE_URL = ""
	const sentRequests: SentRenderRequest[] = []
	stubRenderFetch(sentRequests, toImageResponse)
	expect((await renderTopicImage({ prompt: "A car.", model: "gemini-3.1-flash-lite-image" })).outcome).toBe("rejected")
	expect(sentRequests).toHaveLength(0)
})

test("the models come from the env with their defaults, and each has a per-image rate", () => {
	Bun.env.TOPIC_IMAGE_MODEL = ""
	Bun.env.TOPIC_IMAGE_REGENERATE_MODEL = "gemini-3-pro-image"
	expect(topicImageModel()).toBe("gemini-3.1-flash-lite-image")
	expect(topicImageRegenerateModel()).toBe("gemini-3-pro-image")
	expect(topicImageCostDollars("gemini-3.1-flash-lite-image")).toBe(0.034)
	expect(topicImageCostDollars("gemini-3.1-flash-image")).toBe(0.067)
	// an unknown model is priced at the dearer known rate, never at nothing
	expect(topicImageCostDollars("gemini-3-pro-image")).toBe(0.067)
})
