// the classification of what a user shares with other users. text takes one cheap call that returns a schema-locked
// verdict on the operator's key, with no text in its trace. images use OpenAI moderation through the same proxy.
// failed checks publish a status without the submitted content

import {
	imageModerationResponse,
	type ModerationVerdict,
	moderationVerdict,
	toImageModerationCategory,
} from "@carlnotes/contracts/moderation"
import { APICallError, generateText, Output } from "ai"
import { cheapModel, fetchLiteLLMModel } from "./models"
import { type BuiltPrompt, fetchPromptTemplate } from "./prompts/fetch"
import { writePrompt } from "./prompts/write"

// how much of the text one classification reads, which bounds what it costs. a note body past it is read to here
export const MODERATION_TEXT_MAX_CHARS = 8000

// how long a classification may take before it fails open, shorter than any posting request's own timeout
const MODERATION_TIMEOUT_MS = 4000

// what the text is, said in the prompt. the model reads a topic prompt as a prompt and a message as a message
export type ModeratedTextKind =
	// a chat room message, and a Note with its comments
	| "a chat room message"
	| "a note's name"
	| "a note's body"
	| "a comment on a note"
	// the names and words a user gives a user, a team, a topic, an image, and a podcast episode
	| "a username"
	| "a team's name and description"
	| "a topic's name, prompt, and tags"
	| "an image prompt"
	| "a podcast episode's title and description"
	// a Comment, and a Topic Post
	| "a public comment on an article, a podcast episode, or a topic"
	| "a public post about a topic"
	// an editor's note for the hosts of a recorded conversation about a Topic Post
	| "a note that steers a recorded conversation about a post"

// what the classification came to: a verdict, a skip because no proxy or key is set, a failure, or an image the
// moderation endpoint could not read
export type ModerationClassification =
	| { outcome: "classified"; verdict: ModerationVerdict }
	| { outcome: "skipped" }
	| { outcome: "failed"; error: unknown }
	| { outcome: "unreadable" }

// the LiteLLM alias for OpenAI's free image moderation model
const IMAGE_MODERATION_MODEL = "image-moderation"

// the text under review and what it is
export type ClassifyUserTextOptions = { text: string; textKind: ModeratedTextKind }

/**
 * Classifies one text a user wrote for other users. Returns skipped with no proxy url set, and failed on a call that
 * errors, times out, or returns a verdict outside the schema.
 */
export async function classifyUserText({ text, textKind }: ClassifyUserTextOptions): Promise<ModerationClassification> {
	// a development stack with no proxy runs without the check, and reports nothing per call
	if (!Bun.env.LITELLM_BASE_URL) {
		return { outcome: "skipped" }
	}

	// one cheap call on the operator's key, with the text fenced as data and nothing of it recorded in the trace
	try {
		const moderationPrompt = await buildModerationPrompt({ text, textKind })
		const { output } = await generateText({
			model: cheapModel(),
			output: Output.object({ schema: moderationVerdict }),
			prompt: moderationPrompt.prompt,
			abortSignal: AbortSignal.timeout(MODERATION_TIMEOUT_MS),
			experimental_telemetry: {
				isEnabled: true,
				functionId: moderationPrompt.name,
				recordInputs: false,
				recordOutputs: false,
			},
		})
		return { outcome: "classified", verdict: moderationVerdict.parse(output) }
	} catch (error) {
		return { outcome: "failed", error: toReportableError(error) }
	}
}

// keep the status code only. the SDK error can include both the request and echoed text
function toReportableError(error: unknown): Error {
	return new Error(
		APICallError.isInstance(error) && error.statusCode
			? `the moderation endpoint returned HTTP ${error.statusCode}`
			: "the text moderation request failed",
	)
}

/**
 * Builds the classification's prompt from 'moderate-user-text.md', with the text fenced as data and cut to its limit.
 */
export async function buildModerationPrompt({ text, textKind }: ClassifyUserTextOptions): Promise<BuiltPrompt> {
	const { template, name, registryPrompt } = await fetchPromptTemplate("moderate-user-text")
	const prompt = writePrompt(template, { userText: text.slice(0, MODERATION_TEXT_MAX_CHARS) }, { textKind })
	return { prompt, name, registryPrompt }
}

// a 400 or 422 can also report a proxy configuration problem
const UNREADABLE_IMAGE_CODE_PATTERN =
	/^(?:invalid_(?:base64_)?image(?:_|$)|image_.*(?:error|large|small)$|unsupported_image_)/

// the image under review, as a data url that names its media type
export type ClassifyImageOptions = { dataUrl: string }

/**
 * Classifies one image a user shares with other users through LiteLLM's OpenAI moderation route. Returns skipped with
 * no key set, unreadable if the endpoint rejects the image itself, as it does a format it does not take, and failed on
 * a call that errors, times out, is rate limited, or returns a response outside the schema.
 */
export async function classifyImage({ dataUrl }: ClassifyImageOptions): Promise<ModerationClassification> {
	// the OpenAI key opts the stack into moderation
	if (!Bun.env.OPENAI_API_KEY) {
		return { outcome: "skipped" }
	}

	// report a missing proxy when image moderation is enabled
	const baseUrl = Bun.env.LITELLM_BASE_URL
	const litellmApiKey = Bun.env.LITELLM_MASTER_KEY
	if (!baseUrl || !litellmApiKey) {
		return { outcome: "failed", error: new Error("the image moderation proxy is not configured") }
	}

	// one call with the image as a data url, bounded like the text check
	try {
		const response = await fetchLiteLLMModel(`${baseUrl.replace(/\/$/, "")}/moderations`, {
			method: "POST",
			headers: { Authorization: `Bearer ${litellmApiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				model: IMAGE_MODERATION_MODEL,
				input: [{ type: "image_url", image_url: { url: dataUrl } }],
			}),
			signal: AbortSignal.timeout(MODERATION_TIMEOUT_MS),
		})
		if (!response.ok) {
			return (await isUnreadableImageResponse(response))
				? { outcome: "unreadable" }
				: { outcome: "failed", error: new Error(`the moderation endpoint returned ${response.status}`) }
		}

		// the first category that counts and is flagged names the violation
		const category = toImageModerationCategory(imageModerationResponse.parse(await response.json()))
		const verdict: ModerationVerdict = category
			? { isViolation: true, category }
			: { isViolation: false, category: null }
		return { outcome: "classified", verdict }
	} catch {
		return { outcome: "failed", error: new Error("the image moderation response could not be read") }
	}
}

// use the provider's input field or image error code without copying error text into reports
async function isUnreadableImageResponse(response: Response): Promise<boolean> {
	if (response.status === 413 || response.status === 415) {
		return true
	}
	if (response.status !== 400 && response.status !== 422) {
		return false
	}

	// LiteLLM forwards the parameter of a rejected request to the caller
	const payload = (await response.json().catch(() => null)) as { error?: { param?: unknown; code?: unknown } } | null
	const { param, code } = payload?.error ?? {}
	return (
		(typeof param === "string" && /^input(?:$|[.[])/.test(param)) ||
		(typeof code === "string" && UNREADABLE_IMAGE_CODE_PATTERN.test(code))
	)
}
