// a topic image render from a Gemini image model through LiteLLM's Gemini pass-through route, on the key that bills
// it

import { TOPIC_IMAGE_COST_DOLLARS } from "./budget"
import type { ModelCallFailure } from "./speech"
import { toModelCallFailure, toRetryableModelCallFailure } from "./speech"

// the model that draws a topic's image on creation, on the backfill, and on an admin's regenerate, and the better one
// that draws an owner's regenerate. TOPIC_IMAGE_MODEL and TOPIC_IMAGE_REGENERATE_MODEL name others
const DEFAULT_TOPIC_IMAGE_MODEL = "gemini-3.1-flash-lite-image"
const DEFAULT_TOPIC_IMAGE_REGENERATE_MODEL = "gemini-3.1-flash-image"

// how long one render may take before it aborts
const RENDER_TIMEOUT_MS = 60 * 1000

// the aspect ratios an image is drawn at: 3:2 for a topic's, a podcast episode's, and a Topic Post's image, and 16:9
// for a film's
export type TopicImageAspectRatio = "3:2" | "16:9"
const DEFAULT_TOPIC_IMAGE_ASPECT_RATIO: TopicImageAspectRatio = "3:2"

// the result of one render: the image's bytes with its content type and token count, or how the call failed
export type TopicImageRenderResult = { outcome: "rendered"; imageBytes: Uint8Array } | ModelCallFailure

// one render's prompt, the model, the aspect ratio, which is 3:2 if none is given, and the virtual key that it bills,
// or the master key if no key is given
export type RenderTopicImageOptions = {
	prompt: string
	model: string
	aspectRatio?: TopicImageAspectRatio
	litellmApiKey?: string
}

// the shape of the pass-through's generateContent response that the render reads
type ImageResponseBody = {
	candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[]
	usageMetadata?: { candidatesTokensDetails?: { modality?: string; tokenCount?: number }[] }
}

/**
 * Returns the model that draws a topic's image on creation, on the backfill, and on an admin's regenerate.
 */
export function topicImageModel(): string {
	return Bun.env.TOPIC_IMAGE_MODEL?.trim() || DEFAULT_TOPIC_IMAGE_MODEL
}

/**
 * Returns the model that draws an owner's regenerate.
 */
export function topicImageRegenerateModel(): string {
	return Bun.env.TOPIC_IMAGE_REGENERATE_MODEL?.trim() || DEFAULT_TOPIC_IMAGE_REGENERATE_MODEL
}

/**
 * Returns what one render on the model costs in dollars, from the fixed per-image rates.
 */
export function topicImageCostDollars(model: string): number {
	return TOPIC_IMAGE_COST_DOLLARS[model] ?? TOPIC_IMAGE_COST_DOLLARS[DEFAULT_TOPIC_IMAGE_REGENERATE_MODEL] ?? 0
}

/**
 * Renders one image at the aspect ratio from the prompt on the model, through the pass-through route on the key, and
 * returns its bytes or why the call failed.
 */
export async function renderTopicImage({
	prompt,
	model,
	aspectRatio = DEFAULT_TOPIC_IMAGE_ASPECT_RATIO,
	litellmApiKey,
}: RenderTopicImageOptions): Promise<TopicImageRenderResult> {
	// reject the call if the proxy or a key is not configured
	const baseUrl = Bun.env.LITELLM_BASE_URL
	const apiKey = litellmApiKey ?? Bun.env.LITELLM_MASTER_KEY
	if (!baseUrl || !apiKey) {
		return { outcome: "rejected", httpStatus: null, reason: "the LiteLLM proxy is not configured" }
	}

	// post the call to the pass-through route, which forwards the body to Gemini and charges the key
	try {
		const response = await fetch(`${baseUrl}/gemini/v1beta/models/${model}:generateContent`, {
			method: "POST",
			headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }],
				generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } },
			}),
			signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
		})
		if (!response.ok) {
			return toModelCallFailure(response.status, await response.text())
		}

		// read the image part. a response with no image is worth another attempt
		const imageResponseBody = (await response.json()) as ImageResponseBody
		const imagePart = imageResponseBody.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)
		if (!imagePart?.inlineData?.data) {
			return { outcome: "retryable", httpStatus: response.status, reason: "the image response had no image" }
		}

		return { outcome: "rendered", imageBytes: Buffer.from(imagePart.inlineData.data, "base64") }
	} catch (error) {
		// a timeout or a network failure is worth another attempt
		return toRetryableModelCallFailure(error)
	}
}
