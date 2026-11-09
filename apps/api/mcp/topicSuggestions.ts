// read-only routing uses the list_topics cursor and result budgets

import type { SuggestTopicsPayload } from "@carlnotes/contracts/personalSourcesPayloads"
import {
	START_TOPIC_DRAFT_LABEL,
	TOPIC_SUGGESTIONS_PAGE_SIZE,
	type TopicSuggestionsResult,
} from "@carlnotes/contracts/topicSuggestions"
import { db, isFindingShown } from "@carlnotes/db"
import { findings } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { matchPersonalSourcesTopics } from "@carlnotes/pipeline/personalSources/matchTopics"
import { and, count, gte, inArray, sql } from "drizzle-orm"
import { loadLatestPodcastEpisodeSummaries } from "../podcast/podcastEpisodeShapes"
import { fromCursor, packPageFromWindow, toCursor } from "./results"
import { suggestTopicNames } from "./topicSuggestionsAutocomplete"

// every page retains this action; drafting still requires the reader to choose it
const NEW_TOPIC_OFFER = {
	label: START_TOPIC_DRAFT_LABEL,
	instructions:
		"Offer this choice and wait. Only if the user picks it, draft a private Topic through the existing Topic Draft settings. Use suggest_sources for verified Sources within its existing daily limit, then create_topic to preview the Topic Draft. Create only after the user confirms that draft. Finally send with the created Topic ID. Never draft, create, or send on your own initiative.",
}

/**
 * Returns editable destinations and offers the existing Topic Draft flow on every page.
 */
export async function suggestTopics(userId: string, payload: SuggestTopicsPayload): Promise<TopicSuggestionsResult> {
	// autocomplete needs current editable names, not paid content matching
	if (payload.autocomplete) {
		const page = await suggestTopicNames({ userId, query: payload.query, cursor: payload.cursor })
		return {
			status: "suggested",
			editableTopics: page.topics,
			publicTopicsToFollow: [],
			nextCursor: page.nextCursor,
			newPrivateTopic: NEW_TOPIC_OFFER,
		}
	}

	// rank every editable destination before taking a five-Topic page
	const offset = fromCursor(payload.cursor ?? null)
	const matches = await matchPersonalSourcesTopics({
		userId,
		payload,
		offset,
		includeAllEditableTopics: true,
		limit: TOPIC_SUGGESTIONS_PAGE_SIZE + 1,
	})
	if (matches.status === "unavailable") {
		return { status: "unavailable" as const }
	}
	// load only displayed editable Topics' recent Finding counts, in one indexed query
	const windowTopics = matches.topics.slice(0, TOPIC_SUGGESTIONS_PAGE_SIZE)
	const topicIds = windowTopics.map((topic) => topic.id)
	const [weeklyFindingCounts, displayTopics] = await Promise.all([
		loadWeeklyFindingCounts(topicIds),
		loadSuggestionDisplayTopics(topicIds),
	])
	const latestEpisodes = await loadLatestPodcastEpisodeSummaries(displayTopics, userId)
	const displayTopicsById = new Map(displayTopics.map((topic) => [topic.id, topic]))
	const countedTopics = matches.topics.map((topic) => ({
		...topic,
		viewerCount: displayTopicsById.get(topic.id)?.viewerCount,
		latestPodcastEpisode: latestEpisodes.get(topic.id) ?? null,
		weeklyFindingCount: weeklyFindingCounts.get(topic.id) ?? 0,
	}))
	const page = packPageFromWindow(countedTopics, { offset, pageSize: TOPIC_SUGGESTIONS_PAGE_SIZE })
	const hasRegularPage = offset % TOPIC_SUGGESTIONS_PAGE_SIZE === 0 && page.items.length === windowTopics.length
	const hasKnownTotal = offset === 0 || matches.totalCount > offset
	const pageCount = Math.max(1, Math.ceil(matches.totalCount / TOPIC_SUGGESTIONS_PAGE_SIZE))
	const currentPage = Math.floor(offset / TOPIC_SUGGESTIONS_PAGE_SIZE) + 1
	// Only the first, last and nearby page numbers can be selected. Issue their cursors with the current result.
	const jumps = new Set([
		1,
		2,
		3,
		currentPage - 1,
		currentPage,
		currentPage + 1,
		pageCount - 2,
		pageCount - 1,
		pageCount,
	])
	const pageCursors = Object.fromEntries(
		[...jumps]
			.filter((page) => page > 0 && page <= pageCount)
			.map((page) => [page, toCursor((page - 1) * TOPIC_SUGGESTIONS_PAGE_SIZE)]),
	)
	return {
		status: "suggested" as const,
		editableTopics: page.items,
		publicTopicsToFollow: [],
		nextCursor: page.nextCursor,
		...(hasRegularPage && hasKnownTotal ? { pageCount, pageCursors } : {}),
		newPrivateTopic: NEW_TOPIC_OFFER,
	}
}

// count visible Findings from Monday at 00:00 UTC without reading sent text or private annotations
async function loadWeeklyFindingCounts(topicIds: string[]): Promise<Map<string, number>> {
	if (!topicIds.length) {
		return new Map()
	}

	// one count per topic over the week's findings
	const weeklyFindings = await db
		.select({ topicId: findings.topicId, findingCount: count() })
		.from(findings)
		.where(
			and(
				inArray(findings.topicId, topicIds),
				isFindingShown,
				gte(findings.createdAt, sql`date_trunc('week', now() at time zone 'UTC') at time zone 'UTC'`),
			),
		)
		.groupBy(findings.topicId)
	return new Map(weeklyFindings.map((topic) => [topic.topicId, topic.findingCount]))
}

// only displayed, already-authorized Topics supply standard search-row metadata
async function loadSuggestionDisplayTopics(topicIds: string[]): Promise<
	{
		id: string
		name: string
		ownerId: string
		visibility: "public" | "invite" | "private"
		// the topic's image hash
		imageHash: string | null
		viewerCount: number
	}[]
> {
	if (!topicIds.length) {
		return []
	}

	// the fields the suggestion rows and their podcast episode covers read
	return db
		.select({
			id: topics.id,
			name: topics.name,
			ownerId: topics.ownerId,
			visibility: topics.visibility,
			imageHash: topics.imageHash,
			viewerCount: topics.viewerCount,
		})
		.from(topics)
		.where(inArray(topics.id, topicIds))
}
