// ranked Journal material shared by review, Coffee Break, and Topic Post Discussions
import { toUtcDay } from "@carlnotes/contracts/time"
import type { TopicMemoryPerson } from "@carlnotes/contracts/topicMemories"
import { TOPIC_MEMORY_PROMPT_LIMIT } from "@carlnotes/contracts/topicMemoryWork"
import { loadRankedTopicMemories, type TopicMemoryPromptFeedback } from "@carlnotes/db/topicMemories"
import { fetchPromptTemplate } from "@carlnotes/models/prompts/fetch"
import { writeTopicMemoryBackground } from "@carlnotes/models/prompts/topicMemoryBackground"

// UTF-8 bytes provide a conservative bound for byte-pair tokenization, even for short non-English text
const TAKEAWAY_TOKEN_BUDGET = 1800
const encoder = new TextEncoder()

type TopicMemoryPromptRow = {
	text: string
	correction: string | null
	lastSeenAt: Date
	factDate?: string | null
	person?: TopicMemoryPerson | null
	feedback?: TopicMemoryPromptFeedback[]
}

/** Reads ranked takeaways for one Topic. Published scripts request public Topics only. */
export async function loadTopicMemoryPrompt({
	topicId,
	embeddings,
	isPublicOnly,
}: {
	topicId: string
	embeddings?: number[][]
	isPublicOnly?: boolean
}): Promise<string> {
	// fetch the prompt fragment only when there is Journal material to render
	const memories = await loadRankedTopicMemories({ topicId, embeddings, isPublicOnly })
	if (memories.length === 0) {
		return ""
	}
	const { template } = await fetchPromptTemplate("topic-memory-background")
	return toTopicMemoryPromptText(memories, template)
}

/** Renders the fitting prefix of the ranked slice, with corrections inside the same fence as the claims. */
export function toTopicMemoryPromptText(rows: TopicMemoryPromptRow[], template?: string): string {
	// budget the formatted lines before fencing them with a fixed overhead
	const lines: string[] = []
	let remainingBytes = TAKEAWAY_TOKEN_BUDGET
	// a longer correction can exhaust the remaining budget before the page limit
	for (const row of rows.slice(0, TOPIC_MEMORY_PROMPT_LIMIT)) {
		const line = toDatedClaimLine(row)
		remainingBytes -= encoder.encode(line).length + 1
		// keep the ranked prefix and stop before splitting a dated claim
		if (remainingBytes < 0) {
			break
		}
		lines.push(line)
		for (const { rating, note } of row.feedback ?? []) {
			const feedbackLine = `  ${rating === "up" ? "Thumbs up" : "Thumbs down"} note: ${note}`
			const bytes = encoder.encode(feedbackLine).length + 1
			if (bytes <= remainingBytes) {
				lines.push(feedbackLine)
				remainingBytes -= bytes
			}
		}
	}

	return lines.length > 0 ? writeTopicMemoryBackground(lines.join("\n"), template) : ""
}

// keep event and observation dates separate so Carl can interpret dates in a historical Scan
function toDatedClaimLine({ text, correction, factDate, person, lastSeenAt }: TopicMemoryPromptRow): string {
	const claim = correction ? `do not say ${text}; the correction says ${correction}` : text
	const eventDate = factDate ? `Event date ${factDate}. ` : ""
	const identity = person ? `Person ${person.name} (${person.identifyingDetail}). ` : ""
	return `- [${eventDate}${identity}Last seen in the ${toUtcDay(lastSeenAt)} Scan] ${claim}`
}
