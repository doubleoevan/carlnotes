// carl's recap for an updates list, written from the list's Topic names and a sample of its titles
import { UPDATES_RECAP_MAX_CHARS } from "@carlnotes/contracts/updates"
import { premiumModelCost } from "@carlnotes/models/budget"
import { LOW_REASONING_PROVIDER_OPTIONS, scoreModel } from "@carlnotes/models/models"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { generateText } from "ai"

// the most Topic names and titles one prompt holds, and the characters each keeps
const MAX_RECAP_TOPIC_NAMES = 6
const MAX_RECAP_FINDING_TITLES = 6
const MAX_RECAP_LINE_CHARS = 200

// the output limit leaves room for reasoning, which the model bills as output
const MAX_RECAP_OUTPUT_TOKENS = 1024

// the most one recap can cost: the prompt's instructions, its lines at about two characters a token, and the output
const MAX_RECAP_INPUT_TOKENS = 1024 + ((MAX_RECAP_TOPIC_NAMES + MAX_RECAP_FINDING_TITLES) * MAX_RECAP_LINE_CHARS) / 2
export const MAX_UPDATES_RECAP_DOLLARS = premiumModelCost({
	inputTokens: MAX_RECAP_INPUT_TOKENS,
	outputTokens: MAX_RECAP_OUTPUT_TOKENS,
})

// how long the recap's model call may take before it aborts
const RECAP_TIMEOUT_MS = 20_000

// what the recap is written from
type UpdatesRecapInput = { topicNames: string[]; findingTitles: string[] }

/**
 * Builds the recap prompt, with the Topic names and titles fenced as untrusted and limited in count and length.
 */
export async function buildUpdatesRecapPrompt({ topicNames, findingTitles }: UpdatesRecapInput): Promise<BuiltPrompt> {
	const { template, registryPrompt } = await fetchPromptTemplate("updates-recap")
	const prompt = writePrompt(
		template,
		{
			topicNames: toPromptLines(topicNames, MAX_RECAP_TOPIC_NAMES),
			findingTitles: toPromptLines(findingTitles, MAX_RECAP_FINDING_TITLES),
		},
		{ maxChars: String(UPDATES_RECAP_MAX_CHARS) },
	)
	return { prompt, name: "updates-recap", registryPrompt }
}

/**
 * Writes one recap within the recap limit, billed to the given key. Throws an error on an empty result.
 */
export async function writeUpdatesRecap({
	litellmApiKey,
	...input
}: UpdatesRecapInput & { litellmApiKey?: string }): Promise<string> {
	const recapPrompt = await buildUpdatesRecapPrompt(input)
	const { text } = await generateText({
		model: scoreModel(litellmApiKey),
		prompt: recapPrompt.prompt,
		maxOutputTokens: MAX_RECAP_OUTPUT_TOKENS,
		maxRetries: 0,
		abortSignal: AbortSignal.timeout(RECAP_TIMEOUT_MS),
		providerOptions: LOW_REASONING_PROVIDER_OPTIONS,
		...promptTelemetry(recapPrompt),
	})

	// an empty recap is a failed call
	const recap = text.trim().slice(0, UPDATES_RECAP_MAX_CHARS)
	if (!recap) {
		throw new Error("Empty updates recap")
	}
	return recap
}

// one line for each distinct entry, up to the count and length limits
function toPromptLines(entries: string[], maxLines: number): string {
	return [...new Set(entries)]
		.slice(0, maxLines)
		.map((entry) => `- ${entry.slice(0, MAX_RECAP_LINE_CHARS)}`)
		.join("\n")
}
