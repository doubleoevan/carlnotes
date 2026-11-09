// what a tool result gives its MCP view beside the structured result the model reads: the signed-in caller, the podcast
// episodes its play buttons play with a play token each, and the findings MCP view's topic and findings in the site's shape

import type { McpScanStatus } from "@carlnotes/contracts/mcpScanStatus"
import { MCP_VIEW_META_KEY, type McpViewData, type McpViewTopic } from "@carlnotes/contracts/mcpViews"
import type { PersonalSourcesSendResult } from "@carlnotes/contracts/personalSources"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import type { SearchResultsPage } from "@carlnotes/contracts/search"
import { toTopicImageUrlsOrNull } from "@carlnotes/contracts/topicImages"
import type { TopicSuggestionsResult } from "@carlnotes/contracts/topicSuggestions"
import { db } from "@carlnotes/db"
import { loadFindingPersonalAnnotations } from "@carlnotes/db/findingPersonalAnnotations"
import { loadPersonalSourcesConfirmationLinks } from "@carlnotes/db/personalSourceEntries"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { appUrl } from "@carlnotes/server/appUrl"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, inArray } from "drizzle-orm"
import { withAvatarVersion } from "../avatars"
import { toPlayToken } from "../podcast/playTokens"
import { podcastEpisodeColumns } from "../podcast/podcastEpisodeRows"
import { loadLatestPodcastEpisodeSummaries, loadPodcastEpisodes } from "../podcast/podcastEpisodeShapes"
import { attachReactionSummaries } from "../social/findingReactions"
import { loadTopicAccessAndFindings } from "../topic/accessibleFindings"
import { canBookmarkTopic, canRateTopic } from "../topic/findingPermissions"
import { hasSubscription } from "../topic/permissions"
import type { BuiltUpdates } from "../topic/updates"
import { loadVisibleTopic } from "./results"
import { type ToolCaller, toToolCallerUserId } from "./toolCaller"
import { loadTopicDraftMcpViewOptions } from "./topicDraftMcpViewOptions"

/**
 * Returns a tool result's _meta entry that only its MCP view reads.
 */
export function toMcpViewMeta(mcpViewData: McpViewData): Record<string, unknown> {
	return { [MCP_VIEW_META_KEY]: mcpViewData }
}

/**
 * Reads accepted send links for the MCP view without echoing private content to the model.
 */
export async function loadSendMcpViewData(userId: string, result: PersonalSourcesSendResult): Promise<McpViewData> {
	const metadata: McpViewData = { session: null, podcastEpisodes: [] }
	if (result.status !== "accepted") {
		return metadata
	}
	try {
		metadata.sendConfirmationLinks = await Promise.all(
			(result.confirmations ?? [result]).map(async (confirmation) => ({
				entryId: confirmation.entryId,
				links: await loadPersonalSourcesConfirmationLinks({
					userId,
					topicId: confirmation.topic.id,
					entryId: confirmation.entryId,
				}),
			})),
		)
	} catch {
		// a display read must preserve the successful send outcome
		reportError(new Error("MCP send confirmation links unavailable"), "api-route")
	}
	return metadata
}

/**
 * Loads the search MCP view's data: the caller, and the podcast episodes of the page's topics, podcast episode rows, and
 * findings' topics.
 */
export async function loadSearchMcpViewData(
	toolCaller: ToolCaller,
	searchPage: SearchResultsPage,
): Promise<McpViewData> {
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
	const findingIds = searchPage.rows.flatMap((searchRow) =>
		searchRow.kind === "finding" ? [searchRow.finding.findingId] : [],
	)
	const [session, mcpViewPodcastEpisodes, personalAnnotations] = await Promise.all([
		loadMcpViewSession(toolCaller),
		loadMcpViewPodcastEpisodes(toolCaller, podcastEpisodeIds),
		loadMcpViewPersonalAnnotations(toolCaller, findingIds),
	])
	return { session, podcastEpisodes: mcpViewPodcastEpisodes, personalAnnotations }
}

/**
 * Loads the suggestion MCP view's caller and authorized podcast playback data.
 */
export async function loadSuggestionMcpViewData(
	toolCaller: ToolCaller,
	suggestions: TopicSuggestionsResult,
): Promise<McpViewData> {
	const podcastEpisodeIds =
		suggestions.status === "suggested"
			? [...suggestions.editableTopics, ...suggestions.publicTopicsToFollow].flatMap((topic) =>
					topic.latestPodcastEpisode ? [topic.latestPodcastEpisode.id] : [],
				)
			: []
	const [session, mcpViewPodcastEpisodes, topicDraftOptions] = await Promise.all([
		loadMcpViewSession(toolCaller),
		loadMcpViewPodcastEpisodes(toolCaller, podcastEpisodeIds),
		loadTopicDraftMcpViewOptions(toolCaller),
	])
	return { session, podcastEpisodes: mcpViewPodcastEpisodes, topicDraftOptions }
}

/**
 * Loads the scan MCP view's data: the caller, the status, and the Podcast Episode a finished Scan's recap plays.
 */
export async function loadScanMcpViewData(toolCaller: ToolCaller, mcpScanStatus: McpScanStatus): Promise<McpViewData> {
	const podcastEpisodeIds =
		mcpScanStatus.state === "finished" && mcpScanStatus.podcastEpisode.state === "published"
			? [mcpScanStatus.podcastEpisode.podcastEpisodeId]
			: []
	const [session, mcpViewPodcastEpisodes] = await Promise.all([
		loadMcpViewSession(toolCaller),
		loadMcpViewPodcastEpisodes(toolCaller, podcastEpisodeIds),
	])
	return { session, podcastEpisodes: mcpViewPodcastEpisodes, scanStatus: mcpScanStatus }
}

/**
 * Loads the updates MCP view's data: the caller, the list, each row's Topic, each Topic's latest podcast episode, and the
 * caller's own private annotations on the rows.
 */
export async function loadUpdatesMcpViewData(
	toolCaller: ToolCaller,
	{ topics: updatesTopics, podcastEpisodes: latestPodcastEpisodes, ...updates }: BuiltUpdates,
): Promise<McpViewData> {
	const [session, personalAnnotations] = await Promise.all([
		loadMcpViewSession(toolCaller),
		loadMcpViewPersonalAnnotations(
			toolCaller,
			updates.findings.map((finding) => finding.findingId),
		),
	])
	const podcastEpisodes = toMcpViewPodcastEpisodes(toolCaller, latestPodcastEpisodes)
	return { session, podcastEpisodes, personalAnnotations, updatesTopics, updates }
}

/**
 * Loads the findings MCP view's data: the caller, the topic with its latest podcast episode and whether the caller
 * subscribes to it, and the page's findings in the site's shape with the caller's own marks, in the page's order.
 */
export async function loadFindingsMcpViewData(
	toolCaller: ToolCaller,
	{ topicId, findingIds }: { topicId: string; findingIds: string[] },
): Promise<McpViewData | null> {
	const topic = await loadVisibleTopic(toolCaller, topicId)
	if (!topic) {
		return null
	}

	// the caller's findings on the topic, behind the topic page's own gate, picked out in the page's order
	// ponytail: reads up to the topic page's read limit to pick one page out. read by id if a topic grows past it
	const userId = toToolCallerUserId(toolCaller)
	const [
		{ topicFindings },
		latestPodcastEpisodeByTopicId,
		session,
		isSubscribed,
		canRate,
		canBookmark,
		personalAnnotations,
	] = await Promise.all([
		loadTopicAccessAndFindings({ topic, userId, isRatedDownExcluded: true, isReactionReadSkipped: true }),
		loadLatestPodcastEpisodeSummaries([topic], userId),
		loadMcpViewSession(toolCaller),
		userId ? hasSubscription(userId, topicId) : Promise.resolve(null),
		canRateTopic(userId, topic),
		canBookmarkTopic(userId, topic),
		loadMcpViewPersonalAnnotations(toolCaller, findingIds),
	])
	const topicFindingById = new Map(topicFindings.map((topicFinding) => [topicFinding.findingId, topicFinding]))
	const pageTopicFindings = findingIds.flatMap((findingId) => topicFindingById.get(findingId) ?? [])
	await attachReactionSummaries({ topicFindings: pageTopicFindings, userId })

	// the topic header and the podcast episode its play button plays
	const latestPodcastEpisode = latestPodcastEpisodeByTopicId.get(topic.id) ?? null
	const mcpViewTopic: McpViewTopic = {
		id: topic.id,
		name: topic.name,
		prompt: topic.prompt,
		visibility: topic.visibility,
		latestPodcastEpisode,
		isSubscribed,
		canRate,
		canBookmark,
		image: toTopicImageUrlsOrNull(topic.id, topic.imageHash),
	}
	const mcpViewPodcastEpisodes = await loadMcpViewPodcastEpisodes(
		toolCaller,
		latestPodcastEpisode ? [latestPodcastEpisode.id] : [],
	)
	return {
		session,
		podcastEpisodes: mcpViewPodcastEpisodes,
		topic: mcpViewTopic,
		topicFindings: pageTopicFindings,
		personalAnnotations,
	}
}

// the caller's own private annotations on a page's findings, by finding id. a visitor has none
async function loadMcpViewPersonalAnnotations(
	toolCaller: ToolCaller,
	findingIds: string[],
): Promise<Record<string, string>> {
	if (toolCaller.kind !== "user") {
		return {}
	}
	const personalAnnotations = await loadFindingPersonalAnnotations({ userId: toolCaller.userId, findingIds })
	return Object.fromEntries(personalAnnotations)
}

// the signed-in caller's identity, or null for a visitor
async function loadMcpViewSession(toolCaller: ToolCaller): Promise<ProfileIdentity | null> {
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
async function loadMcpViewPodcastEpisodes(
	toolCaller: ToolCaller,
	podcastEpisodeIds: string[],
): Promise<PodcastEpisode[]> {
	if (podcastEpisodeIds.length === 0) {
		return []
	}

	// each podcast episode's row and its topic, then the player's shape with the caller's progress
	const userId = toToolCallerUserId(toolCaller)
	const podcastEpisodeRows = await db
		.select({
			...podcastEpisodeColumns,
			topic: { id: topics.id, name: topics.name, visibility: topics.visibility, imageHash: topics.imageHash },
		})
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(and(inArray(podcastEpisodes.id, [...new Set(podcastEpisodeIds)]), eq(podcastEpisodes.status, "published")))
	const playerPodcastEpisodes = await loadPodcastEpisodes(
		podcastEpisodeRows.map(({ topic, ...podcastEpisodeRow }) => ({ podcastEpisodeRow, topic })),
		userId,
	)
	return toMcpViewPodcastEpisodes(toolCaller, playerPodcastEpisodes)
}

// each podcast episode with the audio route's absolute url, the caller's play token in place of a session, and no
// voice chat
function toMcpViewPodcastEpisodes(toolCaller: ToolCaller, playerPodcastEpisodes: PodcastEpisode[]): PodcastEpisode[] {
	const userId = toToolCallerUserId(toolCaller)
	const siteUrl = appUrl()
	return playerPodcastEpisodes.map((podcastEpisode) => ({
		...podcastEpisode,
		isVoiceChatConfigured: false,
		audioUrl: `${siteUrl}/api/episodes/${podcastEpisode.id}/audio.mp3?play=${toPlayToken({ podcastEpisodeId: podcastEpisode.id, userId })}`,
	}))
}
