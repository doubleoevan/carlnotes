// Exercise the Gemini adapter through the same headers and usage shape as the dev pilot.
import { afterEach, expect, spyOn, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { buildChapterPictureVideoPrompt, generateChapterPictureVideo } from "./chapterPictureVideo"

// Restore the real transport and credentials after each fixture.
const originalFetch = globalThis.fetch
const restore = saveEnvSettings(["LITELLM_BASE_URL"])
afterEach(() => {
	globalThis.fetch = originalFetch
	restore()
})

test("one private Gemini request uses the owner key and prices the returned video", async () => {
	Bun.env.LITELLM_BASE_URL = "http://proxy.test"
	let requests = 0
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		requests++
		expect(String(input)).toBe("http://proxy.test/gemini/v1beta/interactions")
		const headers = new Headers(init?.headers)
		expect(headers.get("x-litellm-enable-message-redaction")).toBe("true")
		expect(headers.get("x-goog-api-key")).toBe("owner")
		expect(JSON.parse(String(init?.body))).toMatchObject({
			store: false,
			model: "gemini-omni-1.2-flash",
			response_format: { duration: "5s", resolution: "720p" },
		})
		return Response.json({
			status: "completed",
			steps: [{ content: [{ type: "video", mime_type: "video/mp4", data: "eA==" }] }],
			usage: { total_input_tokens: 1213, total_output_tokens: 28960, total_thought_tokens: 843 },
		})
	}) as typeof fetch

	// Resolve the bundled instruction and decode only the video output.
	const prompt = await buildChapterPictureVideoPrompt("foliage", "120, 200, 600, 800")
	expect(prompt).toContain("foliage")
	expect(prompt).not.toContain("{{")
	const result = await generateChapterPictureVideo({ jpeg: Uint8Array.of(3), prompt, apiKey: "owner" })
	expect(requests).toBe(1)
	expect([...result.video]).toEqual([120])
	expect(result.dollars).toBeCloseTo(0.3569265, 6)
})

test("a response without video still records its reported spend", async () => {
	Bun.env.LITELLM_BASE_URL = "http://proxy.test"
	spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: "failed", usage: { total_input_tokens: 1000 } }))
	const charges: number[] = []
	await expect(
		generateChapterPictureVideo({
			jpeg: Uint8Array.of(3),
			prompt: "move",
			apiKey: "owner",
			recordCost: async (dollars) => {
				charges.push(dollars)
			},
		}),
	).rejects.toThrow("no usable video")
	expect(charges).toEqual([0.0015])
})

test("a local validation failure or cancellation leaves the monthly allowance available", async () => {
	Bun.env.LITELLM_BASE_URL = "http://proxy.test"
	const fetch = spyOn(globalThis, "fetch")
	let submissions = 0
	const options = {
		prompt: "move",
		apiKey: "owner",
		onSubmit: () => {
			submissions++
		},
	}
	await expect(generateChapterPictureVideo({ ...options, jpeg: new Uint8Array(3 * 1024 * 1024 + 1) })).rejects.toThrow()
	await expect(
		generateChapterPictureVideo({ ...options, jpeg: Uint8Array.of(1), signal: AbortSignal.abort() }),
	).rejects.toThrow()
	expect(submissions).toBe(0)
	expect(fetch).not.toHaveBeenCalled()
})
