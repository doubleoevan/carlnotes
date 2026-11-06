// carl's opener for an updates list, written from the list's Topic names and a sample of its titles
import { UPDATES_OPENER_MAX_CHARS } from "@carlnotes/contracts/updates"
import { premiumModelCost } from "@carlnotes/models/budget"
import { LOW_REASONING_PROVIDER_OPTIONS, scoreModel } from "@carlnotes/models/models"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { generateText } from "ai"

// the most Topic names and titles one prompt holds, and the characters each keeps
const MAX_OPENER_TOPIC_NAMES = 6
const MAX_OPENER_FINDING_TITLES = 6
const MAX_OPENER_LINE_CHARS = 200

// the output limit leaves room for reasoning, which the model bills as output
const MAX_OPENER_OUTPUT_TOKENS = 1024

// the most one opener can cost: the prompt's instructions, its lines at about two characters a token, and the output
const MAX_OPENER_INPUT_TOKENS =
	1024 + ((MAX_OPENER_TOPIC_NAMES + MAX_OPENER_FINDING_TITLES) * MAX_OPENER_LINE_CHARS) / 2
export const MAX_UPDATES_OPENER_DOLLARS = premiumModelCost({
	inputTokens: MAX_OPENER_INPUT_TOKENS,
	outputTokens: MAX_OPENER_OUTPUT_TOKENS,
})

// how long the opener's model call may take before it aborts
const OPENER_TIMEOUT_MS = 20_000

// what the opener is written from
type UpdatesOpenerInput = { topicNames: string[]; findingTitles: string[] }

/**
 * Builds the opener prompt, with the Topic names and titles fenced as untrusted and limited in count and length.
 */
export async function buildUpdatesOpenerPrompt({
	topicNames,
	findingTitles,
}: UpdatesOpenerInput): Promise<BuiltPrompt> {
	const { template, registryPrompt } = await fetchPromptTemplate("updates-opener")
	const prompt = writePrompt(
		template,
		{
			topicNames: toPromptLines(topicNames, MAX_OPENER_TOPIC_NAMES),
			findingTitles: toPromptLines(findingTitles, MAX_OPENER_FINDING_TITLES),
		},
		{ maxChars: String(UPDATES_OPENER_MAX_CHARS) },
	)
	return { prompt, name: "updates-opener", registryPrompt }
}

/**
 * Writes one opener within the opener limit, billed to the given key. Throws an error on an empty result.
 */
export async function writeUpdatesOpener({
	litellmApiKey,
	...input
}: UpdatesOpenerInput & { litellmApiKey?: string }): Promise<string> {
	const openerPrompt = await buildUpdatesOpenerPrompt(input)
	const { text } = await generateText({
		model: scoreModel(litellmApiKey),
		prompt: openerPrompt.prompt,
		maxOutputTokens: MAX_OPENER_OUTPUT_TOKENS,
		maxRetries: 0,
		abortSignal: AbortSignal.timeout(OPENER_TIMEOUT_MS),
		providerOptions: LOW_REASONING_PROVIDER_OPTIONS,
		...promptTelemetry(openerPrompt),
	})

	// an empty opener is a failed call
	const opener = text.trim().slice(0, UPDATES_OPENER_MAX_CHARS)
	if (!opener) {
		throw new Error("Empty updates opener")
	}
	return opener
}

// one line for each distinct entry, up to the count and length limits
function toPromptLines(entries: string[], maxLines: number): string {
	return [...new Set(entries)]
		.slice(0, maxLines)
		.map((entry) => `- ${entry.slice(0, MAX_OPENER_LINE_CHARS)}`)
		.join("\n")
}
