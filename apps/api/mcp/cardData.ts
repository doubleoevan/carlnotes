// what a tool result gives its card beside the structured result the model reads: the signed-in caller, the podcast
// episodes its play buttons play with a play token each, and the findings card's topic and findings in the site's shape
import { MCP_CARD_META_KEY, type McpCardData, type McpCardTopic } from "@carlnotes/contracts/mcpCards"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import type { SearchResultsPage } from "@carlnotes/contracts/search"
import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { appUrl } from "@carlnotes/server/appUrl"
import { and, eq, inArray } from "drizzle-orm"
import { withAvatarVersion } from "../avatars"
import { toPlayToken } from "../podcast/playTokens"
import { podcastEpisodeColumns } from "../podcast/podcastEpisodeRows"
import { loadLatestPodcastEpisodeSummaries, loadPodcastEpisodes } from "../podcast/podcastEpisodeShapes"
import { loadTopicAccessAndFindings } from "../topic/accessibleFindings"
import { canBookmarkTopic, canRateTopic } from "../topic/findingPermissions"
import { hasSubscription } from "../topic/permissions"
import { loadVisibleTopic } from "./results"
import type { ToolCaller } from "./toolCaller"

/**
 * Returns a tool result's _meta entry that only its card reads.
 */
export function toCardMeta(mcpCardData: McpCardData): Record<string, unknown> {
	return { [MCP_CARD_META_KEY]: mcpCardData }
}

/**
 * Loads the search card's data: the caller, and the podcast episodes of the page's topics, podcast episode rows, and
 * findings' topics.
 */
export async function loadSearchCardData(toolCaller: ToolCaller, searchPage: SearchResultsPage): Promise<McpCardData> {
	// the latest podcast episode of each topic row, each podcast episode row's own, and the page's finding topics' ones
	const rowPodcastEpisodeIds = searchPage.rows.flatMap((searchRow) => {
		if (searchRow.kind === "topic") {
			return searchRow.topic.latestPodcastEpisode ? [searchRow.topic.latestPodcastEpisode.id] : []
		}
		return searchRow.kind === "podcastEpisode" ? [searchRow.podcastEpisode.id] : []
	})
	const podcastEpisodeIds = [
		...rowPodcastEpisodeIds,
		...searchPage.podcastEpisodes.map((podcastEpisode) => podcastEpisode.id),
	]
	const [session, cardPodcastEpisodes] = await Promise.all([
		loadCardSession(toolCaller),
		loadCardPodcastEpisodes(toolCaller, podcastEpisodeIds),
	])
	return { session, podcastEpisodes: cardPodcastEpisodes }
}

/**
 * Loads the findings card's data: the caller, the topic with its latest podcast episode and whether the caller
 * subscribes to it, and the page's findings in the site's shape with the caller's own marks, in the page's order.
 */
export async function loadFindingsCardData(
	toolCaller: ToolCaller,
	{ topicId, findingIds }: { topicId: string; findingIds: string[] },
): Promise<McpCardData | null> {
	const topic = await loadVisibleTopic(toolCaller, topicId)
	if (!topic) {
		return null
	}

	// the caller's findings on the topic, behind the topic page's own gate, picked out in the page's order
	// ponytail: reads up to the topic page's read limit to pick one page out. read by id if a topic grows past it
	const userId = toolCaller.kind === "user" ? toolCaller.userId : null
	const [{ topicFindings }, latestPodcastEpisodeByTopicId, session, isSubscribed, canRate, canBookmark] =
		await Promise.all([
			loadTopicAccessAndFindings({ topic, userId, isRatedDownExcluded: true }),
			loadLatestPodcastEpisodeSummaries([topic], userId),
			loadCardSession(toolCaller),
			userId ? hasSubscription(userId, topicId) : Promise.resolve(null),
			canRateTopic(userId, topic),
			canBookmarkTopic(userId, topic),
		])
	const topicFindingById = new Map(topicFindings.map((topicFinding) => [topicFinding.findingId, topicFinding]))
	const pageTopicFindings = findingIds.flatMap((findingId) => topicFindingById.get(findingId) ?? [])

	// the topic header and the podcast episode its play button plays
	const latestPodcastEpisode = latestPodcastEpisodeByTopicId.get(topic.id) ?? null
	const cardTopic: McpCardTopic = {
		id: topic.id,
		name: topic.name,
		prompt: topic.prompt,
		visibility: topic.visibility,
		latestPodcastEpisode,
		isSubscribed,
		canRate,
		canBookmark,
	}
	const cardPodcastEpisodes = await loadCardPodcastEpisodes(
		toolCaller,
		latestPodcastEpisode ? [latestPodcastEpisode.id] : [],
	)
	return { session, podcastEpisodes: cardPodcastEpisodes, topic: cardTopic, topicFindings: pageTopicFindings }
}

// the signed-in caller's identity, or null for a visitor
async function loadCardSession(toolCaller: ToolCaller): Promise<ProfileIdentity | null> {
	if (toolCaller.kind !== "user") {
		return null
	}

	// the user's username and avatar, as a profile link shows them
	const [userRow] = await db
		.select({
			userId: users.id,
			username: users.username,
			avatarSource: users.avatarSource,
			avatarKey: users.avatarKey,
		})
		.from(users)
		.where(eq(users.id, toolCaller.userId))
	return userRow ? withAvatarVersion(userRow) : null
}

// the published podcast episodes by id in the player's shape, each audio url with a play token for the caller
async function loadCardPodcastEpisodes(toolCaller: ToolCaller, podcastEpisodeIds: string[]): Promise<PodcastEpisode[]> {
	if (podcastEpisodeIds.length === 0) {
		return []
	}

	// each podcast episode's row and its topic, then the player's shape with the caller's progress
	const userId = toolCaller.kind === "user" ? toolCaller.userId : null
	const podcastEpisodeRows = await db
		.select({ ...podcastEpisodeColumns, topic: { id: topics.id, name: topics.name, visibility: topics.visibility } })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(and(inArray(podcastEpisodes.id, [...new Set(podcastEpisodeIds)]), eq(podcastEpisodes.status, "published")))
	const playerPodcastEpisodes = await loadPodcastEpisodes(
		podcastEpisodeRows.map(({ topic, ...podcastEpisodeRow }) => ({ podcastEpisodeRow, topic })),
		userId,
	)

	// the audio route's absolute url, with the caller's play token in place of a session. a card has no voice chat, so
	// its player shows no mic
	const siteUrl = appUrl()
	return playerPodcastEpisodes.map((podcastEpisode) => ({
		...podcastEpisode,
		isVoiceChatConfigured: false,
		audioUrl: `${siteUrl}/api/episodes/${podcastEpisode.id}/audio.mp3?play=${toPlayToken({ podcastEpisodeId: podcastEpisode.id, userId })}`,
	}))
}
