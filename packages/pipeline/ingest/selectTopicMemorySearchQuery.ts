import { CHEAP_COST_PER_MILLION_TOKENS, tokenCost } from "@carlnotes/models/budget"
import { cheapModel } from "@carlnotes/models/models"
import { PRIVATE_MODEL_OPTIONS } from "@carlnotes/models/privateModelOptions"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { reportError } from "@carlnotes/server/monitoring"
import { generateText, NoObjectGeneratedError, Output } from "ai"
import { z } from "zod"
import {
	loadTopicMemoryRatingNotes,
	loadTopicMemorySearchFindings,
	toTopicMemorySearchQueries,
} from "../topicMemorySearch"

const TOPIC_MEMORY_SEARCH_TIMEOUT_MS = 12_000

type SearchNote = Awaited<ReturnType<typeof loadTopicMemoryRatingNotes>>[number]

/** Keeps the notes and the numbered choices inside the selector's private prompt. */
export async function buildTopicMemorySearchPrompt(
	topic: string,
	queryOptions: string[],
	notes: SearchNote[],
): Promise<BuiltPrompt> {
	const { template, name, registryPrompt } = await fetchPromptTemplate("select-topic-memory-search")
	const numberedOptions = queryOptions.map((query, index) => ({ number: index + 1, query }))
	return {
		name,
		registryPrompt,
		prompt: writePrompt(template, {
			topic: topic.slice(0, 2000),
			options: JSON.stringify(numberedOptions),
			feedback: JSON.stringify(notes),
		}),
	}
}

type SearchOptions = { topicId: string; scanId: string; queries: string[]; topic: string; litellmApiKey?: string }

/** Falls back to the default searches when no public lead qualifies or selection fails. */
export async function selectTopicMemorySearchQuery({
	topicId,
	scanId,
	queries,
	topic,
	litellmApiKey,
}: SearchOptions): Promise<{ query?: string; costDollars: number }> {
	try {
		// Avoid reading private notes or billing the owner until a distinct source-backed lead exists.
		const queryOptions = toTopicMemorySearchQueries(queries, await loadTopicMemorySearchFindings(topicId, scanId))
		if (!queryOptions.length) {
			return { costDollars: 0 }
		}
		const notes = await loadTopicMemoryRatingNotes(topicId)
		if (!notes.length) {
			return { query: queryOptions[0], costDollars: 0 }
		}

		// A note may select or veto a public query. Model-authored text cannot enter the Exa request.
		const prompt = await buildTopicMemorySearchPrompt(topic, queryOptions, notes)
		const result = await generateText({
			model: cheapModel(litellmApiKey),
			prompt: prompt.prompt,
			output: Output.object({ schema: z.object({ number: z.number().int().min(0).max(queryOptions.length) }) }),
			maxRetries: 0,
			maxOutputTokens: 160,
			abortSignal: AbortSignal.timeout(TOPIC_MEMORY_SEARCH_TIMEOUT_MS),
			...promptTelemetry(prompt),
			...PRIVATE_MODEL_OPTIONS,
		})
		const costDollars = tokenCost(result.usage.totalTokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS)
		const queryNumber = result.output.number
		return { query: queryNumber > 0 ? queryOptions[queryNumber - 1] : undefined, costDollars }
	} catch (error) {
		// Provider errors may echo the prompt. Record only the Scan identifiers.
		reportError(new Error("Could not select a topic memory search query"), "ingest", { topicId, scanId })
		const tokens = NoObjectGeneratedError.isInstance(error) ? error.usage?.totalTokens : 0
		return { costDollars: tokenCost(tokens ?? 0, CHEAP_COST_PER_MILLION_TOKENS) }
	}
}
