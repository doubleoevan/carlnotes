// the site search's finding reader: the findings whose resource title, else its url, contains the query, on the
// topics the user may open, under the same invite activation gate the topic page reads, each as its topic's feed shows
// it with the user's marks and whether the user may rate and bookmark it
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { FindingSearchRow, FindingSearchTopic, SearchRow } from "@carlnotes/contracts/search"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { db, isFindingShown } from "@carlnotes/db"
import { bookmarks, consumptions, findings, resources, scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { and, eq, inArray, like, type SQL, sql } from "drizzle-orm"
import { toContainsLikePattern } from "../likePattern"
import { loadLatestPodcastEpisodes } from "../podcast/podcastEpisodeShapes"
import { loadTopicFindingPermissions } from "../topic/findingPermissions"
import { toTopicFinding } from "../topic/findings"
import { topicSubscriptionStartDates } from "../topic/helpers"
import { toTopicViewFilter } from "../topic/permissions"

// who is searching, whether they are an admin, the trimmed query, the most rows to read, the filter the finding's
// topic's tags must pass, and the finding filter, the shown findings by default
export type SearchFindingsOptions = {
	userId: string | null
	isAdmin: boolean
	query: string
	limit: number
	topicTagFilter?: SQL
	findingFilter?: SQL
}

// the shortest query the finding search reads. a trigram index narrows nothing under three characters, so a shorter
// query would read every resource
const FINDING_SEARCH_MIN_CHARS = 3

/**
 * Returns the shown findings whose resource title, else its url, contains the query, on the topics the user may open,
 * shorter titles first. An invite topic's findings are kept only from the user's subscription's activation on.
 */
export async function searchFindings(searchFindingsOptions: SearchFindingsOptions): Promise<FindingSearchRow[]> {
	// a query too short for the trigram index finds no finding
	if (searchFindingsOptions.query.length < FINDING_SEARCH_MIN_CHARS) {
		return []
	}

	// the matching findings
	const findingRows = await toFindingSearchQuery(searchFindingsOptions)
	if (findingRows.length === 0) {
		return []
	}

	// the activation date of each invite topic that gates the user's findings
	const topicRows = findingRows.map((findingRow) => findingRow.topic)
	const subscriberActivatedAtByTopicId = await topicSubscriptionStartDates(topicRows, searchFindingsOptions.userId)

	// keep a gated topic's findings only from scans after the activation. a gated topic with no activation keeps none
	// ponytail: the gate filters after the limit, so a user gated out of many matches sees fewer rows. move the gate into
	// the statement if that happens
	const readableFindingRows = findingRows.filter((findingRow) =>
		isReadableFinding(findingRow, subscriberActivatedAtByTopicId),
	)

	// whether the user may rate and bookmark each topic's findings, read for every topic at once
	const findingPermissionsByTopicId = await loadTopicFindingPermissions(
		searchFindingsOptions.userId,
		readableFindingRows.map((findingRow) => findingRow.topic),
	)

	// shape each finding as its topic's feed shows it, in a search row linked to its topic's page
	return readableFindingRows.map((findingRow) => ({
		kind: "finding",
		id: findingRow.findingId,
		name: findingRow.title ?? findingRow.url,
		path: toTopicPath(findingRow.topic),
		date: findingRow.resourceCreatedAt.toISOString(),
		count: findingRow.viewCount,
		finding: toTopicFinding(findingRow),
		topic: toFindingSearchTopic(findingRow.topic, findingPermissionsByTopicId),
	}))
}

// a finding row's topic, with whether the user may rate and bookmark its findings
function toFindingSearchTopic(
	{ id, name, prompt, visibility }: Pick<typeof topics.$inferSelect, "id" | "name" | "prompt" | "visibility">,
	findingPermissionsByTopicId: Map<string, { canRate: boolean; canBookmark: boolean }>,
): FindingSearchTopic {
	const topicFindingPermissions = findingPermissionsByTopicId.get(id) ?? { canRate: false, canBookmark: false }
	return { id, name, prompt, visibility, ...topicFindingPermissions }
}

/**
 * Returns the latest podcast episode the user may listen to of each finding row's topic, once per topic, with its chapters.
 */
export async function loadFindingTopicPodcastEpisodes(
	searchRows: SearchRow[],
	userId: string | null,
): Promise<PodcastEpisode[]> {
	// the finding rows' topics, each once
	const topicIds = [
		...new Set(searchRows.flatMap((searchRow) => (searchRow.kind === "finding" ? [searchRow.topic.id] : []))),
	]
	if (topicIds.length === 0) {
		return []
	}

	// the topics' access fields, then each one's latest podcast episode
	const topicRows = await db
		.select({ id: topics.id, name: topics.name, ownerId: topics.ownerId, visibility: topics.visibility })
		.from(topics)
		.where(inArray(topics.id, topicIds))
	return [...(await loadLatestPodcastEpisodes(topicRows, userId)).values()]
}

/**
 * Returns the finding search's query: the title or url match through its trigram index, on the shown findings of the
 * topics the user may open, shorter titles first.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
export function toFindingSearchQuery({
	userId,
	isAdmin,
	query,
	limit,
	topicTagFilter,
	findingFilter = isFindingShown,
}: SearchFindingsOptions) {
	// the title, else the url, as the trigram index holds it, matched with the typed characters escaped
	const titleOrUrl = sql`lower(coalesce(${resources.title}, ${resources.url}))`
	const isTitleOrUrlMatch = like(titleOrUrl, toContainsLikePattern(query))

	// a user's own columns are consumed and bookmarked. a visitor's are null
	const userColumns = userId
		? { consumedAt: consumptions.consumedAt, bookmarkedAt: bookmarks.createdAt }
		: { consumedAt: sql<Date | null>`null`, bookmarkedAt: sql<Date | null>`null` }

	// each matched resource's findings as the topic feed reads them, their topics, and the scans that last reviewed them
	const findingQuery = db
		.select({
			// the finding, its scan, and its resource
			findingId: findings.id,
			scanId: findings.scanId,
			resourceId: resources.id,
			url: resources.url,
			title: resources.title,
			resourceKind: resources.kind,
			// the resource's dates, the finding's notes, rating, and view count, and the user's marks
			resourceCreatedAt: resources.createdAt,
			fetchedAt: resources.fetchedAt,
			relevanceScore: findings.relevanceScore,
			relevanceExplanation: findings.relevanceExplanation,
			viewCount: findings.viewCount,
			rating: findings.rating,
			...userColumns,
			// when the finding's scan started for the invite gate, and the topic the row names and checks
			scanStartedAt: scans.startedAt,
			topic: {
				id: topics.id,
				name: topics.name,
				prompt: topics.prompt,
				ownerId: topics.ownerId,
				visibility: topics.visibility,
				teamId: topics.teamId,
			},
		})
		.from(resources)
		.innerJoin(findings, eq(findings.resourceId, resources.id))
		.innerJoin(topics, eq(findings.topicId, topics.id))
		.innerJoin(scans, eq(findings.scanId, scans.id))
		.$dynamic()

	// left join a user's consumed and bookmark rows. a visitor skips the join
	const markedQuery = userId
		? findingQuery
				.leftJoin(consumptions, and(eq(consumptions.findingId, findings.id), eq(consumptions.userId, userId)))
				.leftJoin(bookmarks, and(eq(bookmarks.findingId, findings.id), eq(bookmarks.userId, userId)))
		: findingQuery

	// an admin may read every topic's findings, and everyone else the topics the view rules allow, shorter titles first
	const topicViewFilter = isAdmin ? undefined : toTopicViewFilter(userId)
	return markedQuery
		.where(and(isTitleOrUrlMatch, findingFilter, topicViewFilter, topicTagFilter))
		.orderBy(sql`length(${titleOrUrl})`, findings.id)
		.limit(limit)
}

// whether a finding is past its topic's invite gate: an ungated topic's finding always is, and a gated one's only if
// its scan started after the user's subscription activated
function isReadableFinding(
	findingRow: { topic: { id: string }; scanStartedAt: Date },
	subscriberActivatedAtByTopicId: Map<string, Date | null>,
): boolean {
	if (!subscriberActivatedAtByTopicId.has(findingRow.topic.id)) {
		return true
	}
	const subscriberActivatedAt = subscriberActivatedAtByTopicId.get(findingRow.topic.id)
	return subscriberActivatedAt ? findingRow.scanStartedAt > subscriberActivatedAt : false
}
