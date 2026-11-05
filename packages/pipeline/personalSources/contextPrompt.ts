// one bounded private rewrite uses fresh fences and a deterministic coverage disclosure
import {
	PERSONAL_SOURCES_CONTEXT_INPUT_CHARS,
	PERSONAL_SOURCES_CONTEXT_OUTPUT_CHARS,
} from "@carlnotes/contracts/personalSources"
import { type BuiltPrompt, fetchPromptTemplate } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"

/**
 * Builds a nonce-fenced prompt over the selected live excerpts and the Topic description.
 */
export async function buildPersonalSourcesContextPrompt({
	topic,
	entries,
	hasIncompleteCoverage,
}: {
	topic: string
	entries: string
	hasIncompleteCoverage: boolean
}): Promise<BuiltPrompt> {
	// bound both untrusted inputs within the shared input budget
	const boundedTopic = topic.slice(0, 2000)
	const boundedEntries = entries.slice(0, PERSONAL_SOURCES_CONTEXT_INPUT_CHARS - boundedTopic.length)
	const { template, name, registryPrompt } = await fetchPromptTemplate("summarize-personal-sources-context")
	return {
		name,
		registryPrompt,
		prompt: writePrompt(
			template,
			{ topic: boundedTopic, entries: boundedEntries },
			{
				outputLimit: String(PERSONAL_SOURCES_CONTEXT_OUTPUT_CHARS),
				coverage: hasIncompleteCoverage
					? "Some entries or text were omitted by the input bound."
					: "The current live entries fit within the input bound.",
			},
		),
	}
}
