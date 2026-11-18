// Generate five seconds of picture animation through Google's native LiteLLM route.
import { fetchLiteLLMModel } from "./models"
import { fetchPromptTemplate } from "./prompts/fetch"
import { writePrompt } from "./prompts/write"

const MODEL = "gemini-omni-1.2-flash"
const MAX_VIDEO_BYTES = 12 * 1024 * 1024
const MAX_RESPONSE_BYTES = MAX_VIDEO_BYTES * 2

type Interaction = {
	status?: string
	usage?: { total_input_tokens?: number; total_output_tokens?: number; total_thought_tokens?: number }
	steps?: { content?: { type?: string; mime_type?: string; data?: string }[] }[]
}

/** Builds the animation instruction from the chapter planner's selection. */
export async function buildChapterPictureVideoPrompt(effect: string, region: string): Promise<string> {
	const { template } = await fetchPromptTemplate("animate-chapter-picture")
	return writePrompt(template, { effect, region })
}

/** Generates one video and returns its measured token cost at Google's standard rates. */
export async function generateChapterPictureVideo(options: {
	jpeg: Uint8Array
	prompt: string
	apiKey: string
	onSubmit?: () => void
	recordCost?: (dollars: number) => Promise<void>
	signal?: AbortSignal
}): Promise<{ video: Uint8Array; dollars: number }> {
	// Bound the image, duration, provider deadline and response size.
	const base = Bun.env.LITELLM_BASE_URL
	if (!base || !options.apiKey || options.jpeg.byteLength > 3 * 1024 * 1024) {
		throw Error("Invalid proxy or picture for chapter animation")
	}
	const deadline = AbortSignal.timeout(120_000)
	const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline
	const endpoint = new URL(`${base}/gemini/v1beta/interactions`)
	const request: RequestInit = {
		method: "POST",
		headers: { "x-goog-api-key": options.apiKey, "Content-Type": "application/json" },
		redirect: "error",
		signal,
		body: JSON.stringify({
			model: MODEL,
			store: false,
			input: [
				{ type: "image", mime_type: "image/jpeg", data: Buffer.from(options.jpeg).toString("base64") },
				{ type: "text", text: options.prompt },
			],
			response_format: { type: "video", resolution: "720p", aspect_ratio: "16:9", duration: "5s" },
		}),
	}
	// Local validation and cancellation leave the owner's monthly slot available.
	signal.throwIfAborted()
	options.onSubmit?.()
	const response = await fetchLiteLLMModel(endpoint, request)
	if (!response.ok || !response.body) {
		throw Error(`Chapter animation returned HTTP ${response.status}`)
	}

	// Limit the streamed payload before decoding the provider's inline video.
	const chunks: Uint8Array[] = []
	let length = 0
	for await (const chunk of response.body) {
		length += chunk.byteLength
		if (length > MAX_RESPONSE_BYTES) {
			throw Error("Chapter animation response exceeds the size limit")
		}
		chunks.push(chunk)
	}
	const body: Interaction = JSON.parse(Buffer.concat(chunks).toString())
	const videoData = body.steps
		?.flatMap((step) => step.content ?? [])
		.find((part) => part.type === "video" && part.mime_type === "video/mp4")?.data
	// Record reported usage even when the provider returns an unusable video.
	const usage = body.usage
	const hasVideo = !!videoData && body.status === "completed"
	const dollars = chapterPictureCost(usage, hasVideo ? 28_960 : 0)
	if (dollars > 0) {
		await options.recordCost?.(dollars)
	}
	if (!hasVideo || videoData.length > Math.ceil(MAX_VIDEO_BYTES / 3) * 4) {
		throw Error("Chapter animation returned no usable video")
	}
	return { video: Buffer.from(videoData, "base64"), dollars }
}

// Standard per-million-token rates for video, reasoning and the supplied picture.
function chapterPictureCost(usage: Interaction["usage"], fallbackOutputTokens: number): number {
	return (
		((usage?.total_input_tokens ?? 0) * 1.5 +
			(usage?.total_thought_tokens ?? 0) * 9 +
			(usage?.total_output_tokens ?? fallbackOutputTokens) * 12) /
		1_000_000
	)
}
