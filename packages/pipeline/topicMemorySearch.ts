import { TOPIC_MEMORY_NOTE_LIMIT } from "@carlnotes/contracts/topicMemories"
import { db } from "@carlnotes/db"
import { findings, resources } from "@carlnotes/db/schema/scans"
import { topicMemories, topicMemoryFeedback } from "@carlnotes/db/schema/topicMemories"
import { toActiveTopicMemories, topicMemoryIsSaved } from "@carlnotes/db/topicMemories"
import { and, desc, eq, isNotNull, isNull, notExists, sql } from "drizzle-orm"
import { toTopicMemoryFindingFilter } from "./topicMemoryEvidence"
import { readTopicMemorySubjectName } from "./topicMemorySubjects"

type TopicMemorySearchFinding = {
	subject: string | null
	value: string | null
	title: string | null
	snippet: string | null
}

// A Scan tries a small selection even when protected memories exceed the Journal limit.
const TOPIC_MEMORY_SEARCH_NOTE_LIMIT = 12
const MAX_TOPIC_MEMORIES_PER_SEARCH = 12
const SEARCH_FINDINGS_PER_MEMORY = 3

/** Reads structured facts and public source excerpts. Ratings affect selection within CarlNotes. */
export async function loadTopicMemorySearchFindings(
	topicId: string,
	scanId: string,
): Promise<TopicMemorySearchFinding[]> {
	// A disputed fact stays out of search even when another reader rated it up.
	const downRating = db
		.select({ id: topicMemoryFeedback.topicMemoryId })
		.from(topicMemoryFeedback)
		.where(and(eq(topicMemoryFeedback.topicMemoryId, topicMemories.id), eq(topicMemoryFeedback.rating, "down")))
	const scanOrder = sql<string>`md5(${topicMemories.id} || ${scanId})`
	const memoriesToCheck = db.$with("search_memories").as(
		db
			.select({
				subject: topicMemories.subject,
				value: topicMemories.value,
				findingIds: sql<string[]>`(${topicMemories.findingIds})[1:${SEARCH_FINDINGS_PER_MEMORY}]`.as(
					"cited_finding_ids",
				),
				saved: topicMemoryIsSaved.as("saved"),
				scanOrder: scanOrder.as("scan_order"),
			})
			.from(topicMemories)
			.where(
				and(
					toActiveTopicMemories(topicId),
					eq(topicMemories.kind, "fact"),
					isNull(topicMemories.replacedById),
					eq(topicMemories.needsReview, false),
					notExists(downRating),
				),
			)
			.orderBy(desc(topicMemoryIsSaved), scanOrder, topicMemories.id)
			.limit(MAX_TOPIC_MEMORIES_PER_SEARCH),
	)

	// Recheck each citation's Topic, visibility and source before returning publisher text.
	return db
		.with(memoriesToCheck)
		.select({
			subject: memoriesToCheck.subject,
			value: memoriesToCheck.value,
			title: sql<string | null>`left(${resources.title}, 240)`,
			snippet: sql<string | null>`left(${resources.snippet}, 800)`,
		})
		.from(memoriesToCheck)
		.innerJoin(findings, sql`${findings.id} = any(${memoriesToCheck.findingIds})`)
		.innerJoin(resources, eq(resources.id, findings.resourceId))
		.where(and(toTopicMemoryFindingFilter(topicId), sql`${resources.url} ~* '^https?://' `))
		.orderBy(desc(memoriesToCheck.saved), memoriesToCheck.scanOrder, findings.id)
}

// Search phrases use complete words, with punctuation and provider operators stripped.
function searchWords(text: string): string {
	return (text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+[+#]*/gu) ?? []).join(" ")
}

/** Lists distinct follow-ups whose subject and value appear in the same public citation. */
export function toTopicMemorySearchQueries(queries: string[], citedFindings: TopicMemorySearchFinding[]): string[] {
	const existing = new Set(queries.map(searchWords))
	const queryOptions = new Set<string>()
	for (const row of citedFindings) {
		// Preserve word boundaries so a short name cannot match part of a different one.
		const subject = searchWords(readTopicMemorySubjectName(row.subject ?? ""))
		const value = searchWords(row.value ?? "")
		if (!subject || !value || subject.length > 80 || value.length > 80 || ` ${subject} `.includes(` ${value} `)) {
			continue
		}
		const excerpts = [row.title, row.snippet].map((text) => ` ${searchWords(text ?? "")} `)
		if (![subject, value].every((part) => excerpts.some((excerpt) => excerpt.includes(` ${part} `)))) {
			continue
		}

		// Strip provider syntax and suppress follow-ups already covered by another query.
		const query = ` ${value} `.includes(` ${subject} `) ? value : `${subject} ${value}`
		if (!existing.has(query)) {
			queryOptions.add(query)
		}
	}
	return [...queryOptions]
}

/** Reads recent notes beside their claims so the selector can interpret praise and corrections. */
export async function loadTopicMemoryRatingNotes(
	topicId: string,
): Promise<{ claim: string; rating: "up" | "down"; note: string }[]> {
	return db
		.select({
			claim: sql<string>`left(${topicMemories.text}, 320)`,
			rating: topicMemoryFeedback.rating,
			note: sql<string>`left(${topicMemoryFeedback.note}, ${TOPIC_MEMORY_NOTE_LIMIT})`,
		})
		.from(topicMemories)
		.innerJoin(topicMemoryFeedback, eq(topicMemoryFeedback.topicMemoryId, topicMemories.id))
		.where(and(toActiveTopicMemories(topicId), isNotNull(topicMemoryFeedback.note)))
		.orderBy(desc(topicMemoryFeedback.updatedAt), topicMemoryFeedback.topicMemoryId, topicMemoryFeedback.userId)
		.limit(TOPIC_MEMORY_SEARCH_NOTE_LIMIT)
}
