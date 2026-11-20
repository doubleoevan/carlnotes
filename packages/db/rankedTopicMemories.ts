// the ranked topic memories a prompt reads: a Topic's active set ordered by feedback, relevance, and importance
import { toNamedTopicMemoryText } from "@carlnotes/contracts/topicMemories"
import { TOPIC_MEMORY_FINDING_LIMIT, TOPIC_MEMORY_PROMPT_LIMIT } from "@carlnotes/contracts/topicMemoryWork"
import { and, cosineDistance, desc, eq, sql } from "drizzle-orm"
import { db } from "./index"
import { scans } from "./schema/scans"
import { TOPIC_MEMORY_EMBEDDING_MODEL, topicMemories } from "./schema/topicMemories"
import { topics } from "./schema/topics"
import {
	TOPIC_MEMORY_FEEDBACK_PER_PROMPT,
	type TopicMemoryPromptFeedback,
	toActiveTopicMemories,
	topicMemoryCorrection,
	topicMemoryGroupingColumns,
	topicMemoryIsSaved,
	topicMemoryPromptFeedback,
} from "./topicMemories"
import { groupTopicMemories, preferTopicMemoryRepresentative } from "./topicMemoryGroups"

// a saved topic memory ranks first in a prompt, then a corrected one
const feedbackPriority = sql`case when ${topicMemoryIsSaved} then 0 when ${topicMemoryCorrection} is not null then 1 else 2 end`

// one group of topic memories as a prompt reads it
type RankedTopicMemory = {
	text: string
	correction: string | null
	factDate: string | null
	feedback: TopicMemoryPromptFeedback[]
	findingIds: string[]
	lastSeenAt: Date
}

/**
 * Selects a bounded prompt slice. Cosine distance is exact over this Topic's active set.
 */
export async function loadRankedTopicMemories({
	topicId,
	embeddings = [],
	isPublicOnly,
}: {
	topicId: string
	embeddings?: number[][]
	isPublicOnly?: boolean
}): Promise<RankedTopicMemory[]> {
	// the best match to any chapter leads within its feedback tier
	const distances = embeddings.map((embedding) => cosineDistance(topicMemories.embedding, embedding))
	const relevance =
		distances.length > 0
			? [
					sql`case when ${topicMemories.embeddingModel} = ${TOPIC_MEMORY_EMBEDDING_MODEL}
			then least(${sql.join(distances, sql`, `)}) end asc nulls last`,
				]
			: []
	const publicOnly = isPublicOnly
		? sql`exists (select 1 from ${topics} where ${topics.id} = ${topicMemories.topicId} and ${topics.visibility} = 'public')`
		: undefined
	const rankedTopicMemoryRows = await db
		.select({
			id: topicMemories.id,
			text: topicMemories.text,
			...topicMemoryGroupingColumns(),
			correction: topicMemoryCorrection,
			factDate: topicMemories.factDate,
			person: topicMemories.person,
			feedback: topicMemoryPromptFeedback.as("prompt_feedback"),
			findingIds: sql<string[]>`${topicMemories.findingIds}[1:${TOPIC_MEMORY_FINDING_LIMIT}]`,
			lastSeenAt: scans.startedAt,
		})
		.from(topicMemories)
		.innerJoin(scans, eq(scans.id, topicMemories.lastSeenScanId))
		.where(and(toActiveTopicMemories(topicId), eq(topicMemories.needsReview, false), publicOnly))
		.orderBy(
			feedbackPriority,
			...relevance,
			desc(topicMemories.importance),
			desc(topicMemories.updatedAt),
			topicMemories.id,
		)
	// use the Journal grouping and retain each group's bounded feedback and source links
	return groupTopicMemories(rankedTopicMemoryRows, preferTopicMemoryRepresentative)
		.slice(0, TOPIC_MEMORY_PROMPT_LIMIT)
		.flatMap((group) => {
			const [first] = group
			if (!first) {
				return []
			}
			// the group's first member gives the prompt row its wording, and a correction of any member applies to it
			return [
				{
					text: toNamedTopicMemoryText(first.text, first.person) ?? first.text,
					correction: group.find(({ correction }) => correction !== null)?.correction ?? null,
					factDate: first.factDate,
					person: first.person,
					lastSeenAt: first.lastSeenAt,
					feedback: group.flatMap(({ feedback }) => feedback).slice(0, TOPIC_MEMORY_FEEDBACK_PER_PROMPT),
					findingIds: [...new Set(group.flatMap(({ findingIds }) => findingIds))].slice(0, TOPIC_MEMORY_FINDING_LIMIT),
				},
			]
		})
}
