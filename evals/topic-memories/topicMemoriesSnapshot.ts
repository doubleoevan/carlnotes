// copies the public evidence from the fullest dev Journals with ten completed Scans
import { db } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import { topicMemories } from "@carlnotes/db/schema/topicMemories"
import { topics } from "@carlnotes/db/schema/topics"
import { loadTopicMemoryFindings } from "@carlnotes/pipeline/topicMemoryEvidence"
import { and, count, desc, eq, sql } from "drizzle-orm"

const SCANS_TO_REPLAY = 10

type Finding = Awaited<ReturnType<typeof loadTopicMemoryFindings>>[number]
type ScanSnapshot = { id: string; startedAt: string; evidence?: Finding[] }
export type TopicMemorySnapshot = {
	topicId: string
	name: string
	prompt?: string
	previouslyActive: number
	isPublic: boolean
	brews: ScanSnapshot[]
}

/** Loads the five fullest eligible Journals, retaining the Scan dates that drive cleanup and recency. */
export async function loadTopicMemorySnapshot(topicCount = 5): Promise<TopicMemorySnapshot[]> {
	// rank actual active memory counts, excluding Topics whose history is too short
	const eligible = await db
		.select({
			topicId: topics.id,
			name: topics.name,
			prompt: sql<string>`left(${topics.prompt}, 2400)`,
			visibility: topics.visibility,
			previouslyActive: count(),
		})
		.from(topics)
		.innerJoin(topicMemories, and(eq(topicMemories.topicId, topics.id), eq(topicMemories.status, "active")))
		.where(
			sql`(select count(*) from ${scans} where ${scans.topicId} = ${topics.id} and ${scans.status} = 'succeeded') >= ${SCANS_TO_REPLAY}`,
		)
		.groupBy(topics.id)
		.orderBy(desc(count()), topics.id)
		.limit(topicCount)
	if (eligible.length < 5) {
		throw new Error(`Expected at least five eligible dev Topics, found ${eligible.length}`)
	}

	// use the same public Finding query the worker uses and keep Topic titles out of model input
	return Promise.all(
		eligible.map(async ({ topicId, name, prompt, visibility, previouslyActive }) => {
			const brews = await db
				.select({ id: scans.id, startedAt: scans.startedAt })
				.from(scans)
				.where(and(eq(scans.topicId, topicId), eq(scans.status, "succeeded")))
				.orderBy(scans.startedAt, scans.id)
			const replayStart = brews.length - SCANS_TO_REPLAY
			return {
				topicId,
				name,
				prompt,
				previouslyActive,
				isPublic: visibility === "public",
				brews: await Promise.all(
					brews.map(async ({ id, startedAt }, index) => ({
						id,
						startedAt: startedAt.toISOString(),
						evidence: index >= replayStart ? await loadTopicMemoryFindings(id, topicId) : undefined,
					})),
				),
			}
		}),
	)
}
