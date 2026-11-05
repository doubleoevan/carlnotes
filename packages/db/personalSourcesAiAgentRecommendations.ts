import type { ConnectedAiAgent } from "@carlnotes/contracts/personalSourcesAccounts"
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm"
import { loadConnectedAiAgents } from "./aiAgentConnections"
import { isAllowed } from "./authorization"
import { db } from "./index"
import { decryptPersonalSourceEntry } from "./personalSourcesLifecycle"
import { personalSourceEntries } from "./schema/personalSources"
import { sources, topics } from "./schema/topics"
import { toEditableTopicFilter } from "./topicPermissions"

// compare topic words locally. setup never sends saved private text to a model or search service
const COMMON_WORDS = new Set(
	"a an and are as at be by for from has have how i in is it its me my of on or our that the their this to was we what when where which who will with you your".split(
		" ",
	),
)
const HISTORY_PAGE_SIZE = 100
const MATCH_COUNT = 3
type RecommendationEntry = { id: string; encryptedPayload: string; identity: string | null }

/**
 * Suggests connected apps from matching accepted sends without writing profiles, counters, or Sources.
 */
export async function loadPersonalSourcesAiAgentRecommendations({
	userId,
	topicId,
}: {
	userId: string
	topicId: string
}): Promise<string[] | null> {
	// authorize the destination before reading any accepted history
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1)
	if (!topic || !(await isAllowed(userId, "personalSources:read", topic))) {
		return null
	}

	// only live concrete OAuth registrations can supply an app recommendation
	const connectedAiAgents = (await loadConnectedAiAgents(userId)).filter((aiAgent) => aiAgent.isConnected)
	if (connectedAiAgents.length === 0 || toMatchWords(topic.prompt).size === 0) {
		return []
	}
	return collectMatchingAiAgents({ userId, description: topic.prompt, connectedAiAgents })
}

/**
 * Matches distinct description words against an already accepted title and summary.
 */
export function matchesPersonalSourcesTopicDescription({
	description,
	text,
}: {
	description: string
	text: string
}): boolean {
	// require half the description's meaningful words, with at least two when the description contains two
	const descriptionWords = toMatchWords(description)
	const entryWords = toMatchWords(text)
	const minimumMatches = Math.max(Math.min(2, descriptionWords.size), Math.ceil(descriptionWords.size / 2))
	const matchCount = [...descriptionWords].filter((word) => entryWords.has(word)).length
	return minimumMatches > 0 && matchCount >= minimumMatches
}

// retain at most one ciphertext page and one decrypted entry while walking the live thirty-day window
async function collectMatchingAiAgents({
	userId,
	description,
	connectedAiAgents,
}: {
	userId: string
	description: string
	connectedAiAgents: ConnectedAiAgent[]
}): Promise<string[]> {
	// group concrete registrations by their validated account identity
	const aiAgentIds = new Map(
		connectedAiAgents.flatMap((aiAgent) => aiAgent.clientIds.map((id) => [`oauth:${id}`, aiAgent.id])),
	)
	const matchCounts = new Map<string, number>()
	let cursor: string | undefined
	while (connectedAiAgents.some((aiAgent) => (matchCounts.get(aiAgent.id) ?? 0) < MATCH_COUNT)) {
		// read the next page of recent sends from the connected apps
		const entries = await loadRecommendationPage({ userId, identities: [...aiAgentIds.keys()], cursor })
		for (const entry of entries) {
			const aiAgentId = aiAgentIds.get(entry.identity ?? "")
			if (!aiAgentId || (matchCounts.get(aiAgentId) ?? 0) >= MATCH_COUNT) {
				continue
			}
			if (matchesAcceptedEntry({ description, entry })) {
				matchCounts.set(aiAgentId, (matchCounts.get(aiAgentId) ?? 0) + 1)
			}
		}
		if (entries.length < HISTORY_PAGE_SIZE) {
			break
		}
		cursor = entries.at(-1)?.id
	}
	return [...matchCounts].filter(([, count]) => count >= MATCH_COUNT).map(([aiAgentId]) => aiAgentId)
}

// release each decrypted payload after its comparison
function matchesAcceptedEntry({ description, entry }: { description: string; entry: RecommendationEntry }): boolean {
	const payload = decryptPersonalSourceEntry(entry.encryptedPayload)
	return (
		payload !== null &&
		matchesPersonalSourcesTopicDescription({ description, text: `${payload.title}\n${payload.text}` })
	)
}

// read accepted sends only from this sender's currently editable Topics
async function loadRecommendationPage({
	userId,
	identities,
	cursor,
}: {
	userId: string
	identities: string[]
	cursor?: string
}): Promise<RecommendationEntry[]> {
	return db
		.select({
			id: personalSourceEntries.id,
			encryptedPayload: personalSourceEntries.encryptedPayload,
			identity: sources.personalSourcesIdentity,
		})
		.from(personalSourceEntries)
		.innerJoin(sources, eq(sources.id, personalSourceEntries.sourceId))
		.innerJoin(topics, eq(topics.id, personalSourceEntries.topicId))
		.where(
			and(
				eq(personalSourceEntries.userId, userId),
				eq(personalSourceEntries.origin, "send"),

				gte(personalSourceEntries.receivedAt, sql`clock_timestamp() - interval '720 hours'`),
				inArray(sources.personalSourcesIdentity, identities),
				toEditableTopicFilter(userId),
				cursor ? lt(personalSourceEntries.id, cursor) : undefined,
			),
		)
		.orderBy(desc(personalSourceEntries.id))
		.limit(HISTORY_PAGE_SIZE)
}

// normalize whole Unicode words without retaining a private search index
function toMatchWords(text: string): Set<string> {
	const words =
		text
			.normalize("NFKC")
			.toLocaleLowerCase("en-US")
			.match(/[\p{L}\p{N}]+/gu) ?? []
	return new Set(words.filter((word) => word.length > 1 && !COMMON_WORDS.has(word)))
}
