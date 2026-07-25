// the topic finding logic behind the api routes. it loads a topic's findings and records ratings, views, and consumed state
import type { TopicFinding } from "@shared/contracts"
import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "../../db"
import { consumptions, findings, resources } from "../../db/schema"
import { canRateFinding, isTopicFindingVisible } from "./permissions"

/**
 * Load a topic's findings joined to their resources with the user's consumed state, most relevant first.
 */
export async function loadTopicFindings(topicId: string, userId: string | null): Promise<TopicFinding[]> {
	// a signed-out visitor has no consumption history. sql`false` forces the left join to never match,
	// rather than comparing consumptions.user_id against null, which drizzle's column typing rejects
	const consumptionJoinCondition = userId
		? and(eq(consumptions.findingId, findings.id), eq(consumptions.userId, userId))
		: sql`false`

	// join each topic finding with its resource. a left join adds the user's consumed date when one exists
	const findingRows = await db
		.select({
			// load the finding identity and its resource metadata
			findingId: findings.id,
			resourceId: resources.id,
			url: resources.url,
			resourceKind: resources.kind,
			title: resources.title,
			resourceCreatedAt: resources.createdAt,
			fetchedAt: resources.fetchedAt,

			// load the finding metadata and the user's consumed date
			relevanceScore: findings.relevanceScore,
			relevanceExplanation: findings.relevanceExplanation,
			viewCount: findings.viewCount,
			rating: findings.rating,
			consumedAt: consumptions.consumedAt,
		})
		// join the resource and the user's consumed row. sort by relevance score descending
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.leftJoin(consumptions, consumptionJoinCondition)
		.where(eq(findings.topicId, topicId))
		.orderBy(desc(findings.relevanceScore))

	// shape each row into a topic finding and set its isConsumed flag
	return findingRows.map((row) => ({
		findingId: row.findingId,
		resourceId: row.resourceId,
		url: row.url,
		resourceKind: row.resourceKind,
		title: row.title,
		// the source host for the metadata, plus the published and fetched times
		source: toUrlHost(row.url),
		publishedAt: row.resourceCreatedAt.toISOString(),
		fetchedAt: row.fetchedAt.toISOString(),
		// the relevance judgment, view count, rating, and the user's consumed state
		relevanceScore: row.relevanceScore,
		relevanceExplanation: row.relevanceExplanation,
		viewCount: row.viewCount,
		rating: row.rating,
		isConsumed: row.consumedAt !== null,
	}))
}

// set a topic finding's rating to thumbs up or down, or clear it. returns false when the user may not act on it
export async function setRating(userId: string, findingId: string, rating: "up" | "down" | null): Promise<boolean> {
	if (!(await canRateFinding(userId, findingId))) {
		return false
	}
	await db.update(findings).set({ rating }).where(eq(findings.id, findingId))
	return true
}

// mark or unmark a topic finding consumed. returns false when the user may not act on it
export async function setConsumed(userId: string, findingId: string, isConsumed: boolean): Promise<boolean> {
	if (!(await isTopicFindingVisible(userId, findingId))) {
		return false
	}
	await writeConsumed(userId, findingId, isConsumed)
	return true
}

// increment the topic finding's view count and mark it consumed. returns false when the user may not act on it
export async function recordView(userId: string, findingId: string): Promise<boolean> {
	if (!(await isTopicFindingVisible(userId, findingId))) {
		return false
	}

	// increment the view count with a raw SQL expression, then mark the finding consumed
	await db
		.update(findings)
		.set({ viewCount: sql`${findings.viewCount} + 1` })
		.where(eq(findings.id, findingId))
	await writeConsumed(userId, findingId, true)
	return true
}

// insert or delete the consumed row. the exported callers run the access check first, so this one does not
async function writeConsumed(userId: string, findingId: string, isConsumed: boolean): Promise<void> {
	// to unmark isConsumed, delete the topic finding's consumed row
	if (!isConsumed) {
		await db.delete(consumptions).where(and(eq(consumptions.userId, userId), eq(consumptions.findingId, findingId)))
		return
	}

	// to mark isConsumed, insert the topic finding's consumed row. a duplicate insert does nothing
	await db.insert(consumptions).values({ userId, findingId }).onConflictDoNothing()
}

// the default topic feed hides consumed topic findings. the "All" view keeps them
export function filteredTopicFindings(topicFindings: TopicFinding[], includeConsumed: boolean): TopicFinding[] {
	return includeConsumed ? topicFindings : topicFindings.filter((finding) => !finding.isConsumed)
}

// "# new" is the count of topic findings that the user has not consumed
export function newTopicFindingCount(topicFindings: TopicFinding[]): number {
	return topicFindings.filter((finding) => !finding.isConsumed).length
}

// return the host for the url or null if the url is invalid
export function toUrlHost(url: string): string | null {
	try {
		return new URL(url).host
	} catch {
		return null
	}
}
