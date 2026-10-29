// the classification of text a user wrote for other users: one cheap call that returns a schema-locked verdict, on the
// operator's key, with no text in its trace. an unset proxy skips it, and a failed call reports itself without the text

import { type ModerationVerdict, moderationVerdict } from "@carlnotes/contracts/moderation"
import { generateText, Output } from "ai"
import { cheapModel } from "./models"
import { type BuiltPrompt, fetchPromptTemplate } from "./prompts/fetch"
import { writePrompt } from "./prompts/write"

// how much of the text one classification reads, which bounds what it costs. a note body past it is read to here
export const MODERATION_TEXT_MAX_CHARS = 8000

// how long a classification may take before it fails open, shorter than any posting request's own timeout
export const MODERATION_TIMEOUT_MS = 4000

// what the text is, said in the prompt. the model reads a topic prompt as a prompt and a message as a message
export type ModeratedTextKind =
	| "a chat room message"
	| "a note's name"
	| "a note's body"
	| "a comment on a note"
	| "a username"
	| "a team's name and description"
	| "a topic's name and prompt"

// what the classification came to: a verdict, a skip because no proxy is set, or a failure
export type ModerationClassification =
	| { outcome: "classified"; verdict: ModerationVerdict }
	| { outcome: "skipped" }
	| { outcome: "failed"; error: unknown }

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

// the error's name and message alone. the sdk's error holds the request, and the request holds the user's text
function toReportableError(error: unknown): Error {
	const name = error instanceof Error ? error.name : "Error"
	const message = error instanceof Error ? error.message : String(error)
	return new Error(`${name}: ${message}`)
}

/**
 * Builds the classification's prompt from 'moderate-user-text.md', with the text fenced as data and cut to its limit.
 */
export async function buildModerationPrompt({ text, textKind }: ClassifyUserTextOptions): Promise<BuiltPrompt> {
	const { template, name, registryPrompt } = await fetchPromptTemplate("moderate-user-text")
	const prompt = writePrompt(template, { userText: text.slice(0, MODERATION_TEXT_MAX_CHARS) }, { textKind })
	return { prompt, name, registryPrompt }
}
