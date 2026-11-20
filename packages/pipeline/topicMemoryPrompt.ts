// ranked Journal material shared by review, Coffee Break, and Topic Post Discussions
import { toOneLineText } from "@carlnotes/contracts/text"
import { toUtcDay } from "@carlnotes/contracts/time"
import type { TopicMemoryPerson } from "@carlnotes/contracts/topicMemories"
import { TOPIC_MEMORY_PROMPT_LIMIT } from "@carlnotes/contracts/topicMemoryWork"
import { loadRankedTopicMemories } from "@carlnotes/db/rankedTopicMemories"
import type { TopicMemoryPromptFeedback } from "@carlnotes/db/topicMemories"
import { fetchPromptTemplate } from "@carlnotes/models/prompts/fetch"
import { writeTopicMemoryBackground } from "@carlnotes/models/prompts/topicMemoryBackground"
import { reportError } from "@carlnotes/server/monitoring"

// UTF-8 bytes provide a conservative bound for byte-pair tokenization, even for short non-English text
const TOPIC_MEMORY_PROMPT_BYTE_LIMIT = 1800
const encoder = new TextEncoder()

type TopicMemoryPromptRow = {
	text: string
	correction: string | null
	lastSeenAt: Date
	factDate?: string | null
	person?: TopicMemoryPerson | null
	feedback?: TopicMemoryPromptFeedback[]
}

/** Reads ranked topic memories for one Topic. Published scripts request public Topics only. */
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
	const memories = await loadBackgroundTopicMemories({ topicId, embeddings, isPublicOnly })
	if (memories.length === 0) {
		return ""
	}
	const { template } = await fetchPromptTemplate("topic-memory-background")
	return toTopicMemoryPromptText(memories, template)
}

/**
 * Reads the ranked topic memories that a prompt or a podcast episode plan uses as background. A failed read is reported
 * and returns none.
 */
export async function loadBackgroundTopicMemories(
	options: Parameters<typeof loadRankedTopicMemories>[0],
): ReturnType<typeof loadRankedTopicMemories> {
	try {
		return await loadRankedTopicMemories(options)
	} catch (error) {
		// the caller goes on with no topic memories
		console.error(`could not read the topic memories of topic ${options.topicId}`, error)
		reportError(new Error("the topic memories could not be read"), "worker", { topicId: options.topicId })
		return []
	}
}

/**
 * Renders the ranked rows that fit, with corrections inside the same fence as the claims.
 */
export function toTopicMemoryPromptText(rows: TopicMemoryPromptRow[], template?: string): string {
	// budget the formatted lines before fencing them with a fixed overhead
	const lines: string[] = []
	let remainingBytes = TOPIC_MEMORY_PROMPT_BYTE_LIMIT
	// a longer correction can exhaust the remaining budget before the page limit
	for (const row of rows.slice(0, TOPIC_MEMORY_PROMPT_LIMIT)) {
		const line = toDatedClaimLine(row)
		const lineBytes = encoder.encode(line).length + 1
		// a dated claim is never split. one that does not fit is left out, and a shorter one after it still fits
		if (lineBytes > remainingBytes) {
			continue
		}
		lines.push(line)
		remainingBytes -= lineBytes
		// each of the claim's notes follows it on a line of its own
		for (const { rating, note } of row.feedback ?? []) {
			const feedbackLine = `  ${rating === "up" ? "Thumbs up" : "Thumbs down"} note: ${toOneLineText(note)}`
			const bytes = encoder.encode(feedbackLine).length + 1
			// a note past the remaining bytes is left out
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
	const datePrecision = factDate?.length === 4 ? "year" : factDate?.length === 7 ? "month" : "date"
	const eventDate = factDate ? `Event ${datePrecision} ${factDate}. ` : ""
	const identity = person ? `Person ${person.name} (${person.identifyingDetail}). ` : ""
	// a row saved with a line break stays one row of the block
	return toOneLineText(`- [${eventDate}${identity}Last seen in the ${toUtcDay(lastSeenAt)} Scan] ${claim}`)
}
