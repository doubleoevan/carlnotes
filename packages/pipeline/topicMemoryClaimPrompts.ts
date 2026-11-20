// the claim check and split prompts for a topic memory, and the claim, Findings, and rating notes that they fence

import { topicMemoryClaimTypes } from "@carlnotes/contracts/topicMemories"
import { type BuiltPrompt, fetchPromptTemplate } from "@carlnotes/models/prompts/fetch"
import { loadPromptFragment } from "@carlnotes/models/prompts/fragment"
import { loadTopicMemoryClaimBlocks } from "@carlnotes/models/prompts/topicMemoryClaimBlocks"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { type TopicMemoryWrite, toStandaloneTopicMemory } from "./topicMemoryOperations"
import type { TopicMemorySubject } from "./topicMemorySubjects"

// the fields of a write that a check reads
export type TopicMemoryClaim = Pick<TopicMemoryWrite, "text" | "factDate" | "person">

// a public Finding as a claim check reads it
export type TopicMemoryClaimFinding = {
	id: string
	title: string | null
	snippet: string | null
	description: string
	articleContext?: string | null
	publicationDateHint?: string | null
}

// a rating and its note
type ClaimFeedback = { rating: "up" | "down"; note: string | null }

// a split's claim, its Findings, its rating notes, and the known subjects
export type TopicMemorySplitPromptOptions = {
	claim: TopicMemoryClaim
	findings: TopicMemoryClaimFinding[]
	feedback?: ClaimFeedback[]
	subjects?: TopicMemorySubject[]
}

/**
 * Fences only the claim text and its own factual fields.
 */
export async function buildTopicMemoryClaimCheckPrompt(
	claims: TopicMemoryClaim[],
	extractFields = false,
	subjects: TopicMemorySubject[] = [],
): Promise<BuiltPrompt> {
	const [{ template, name, registryPrompt }, topicMemoryClaimContextBlock] = await Promise.all([
		fetchPromptTemplate("check-topic-memory-claims"),
		loadPromptFragment("topic-memory-claim-context"),
	])
	const indexed = claims.map(({ text, factDate, person }, index) => ({
		index,
		text: toStandaloneTopicMemory({ text, person })?.text ?? text,
		factDate,
		person,
	}))
	return {
		prompt: writePrompt(
			template,
			{ claims: JSON.stringify(indexed), existingSubjects: JSON.stringify(subjects) },
			{
				extractFields: extractFields ? "yes" : "no",
				claimTypes: topicMemoryClaimTypes.join(", "),
				topicMemoryClaimContextBlock,
			},
		),
		name,
		registryPrompt,
	}
}

/**
 * Fences the original claim, eligible evidence, and the notes needed for routing.
 */
export async function buildTopicMemorySplitPrompt({
	claim,
	findings,
	feedback,
	subjects,
}: TopicMemorySplitPromptOptions): Promise<BuiltPrompt> {
	const [{ template, name, registryPrompt }, topicMemoryClaimBlocks] = await Promise.all([
		fetchPromptTemplate("split-topic-memory"),
		loadTopicMemoryClaimBlocks(),
	])
	const { text, factDate, person } = claim
	const topicMemoryAndEvidence = JSON.stringify({
		original: { text, factDate, person },
		existingSubjects: subjects,
		findings: findings.map(({ title, snippet, description, articleContext, publicationDateHint }, index) => ({
			index,
			title,
			snippet,
			description,
			articleContext,
			publicationDateHint,
		})),
		feedback: feedback?.map(({ note, rating }, index) => ({ index, note, rating })),
	})
	return {
		prompt: writePrompt(
			template,
			{ topicMemoryAndEvidence },
			{ claimTypes: topicMemoryClaimTypes.join(", "), ...topicMemoryClaimBlocks },
		),
		name,
		registryPrompt,
	}
}
