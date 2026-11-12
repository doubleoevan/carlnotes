// the api client for the page head of a topic, profile, team, Dashboard, or join page
import type { DashboardSubject } from "@carlnotes/contracts/dashboards"
import type { PageHead } from "@carlnotes/contracts/pageHead"
import { type ApiResponse, apiClient } from "./apiClient"
import type { PodcastEpisodePageParams } from "./podcastEpisodeClient"

/**
 * A topic page's head, or null if no topic has that id. A private or invite topic still gets its card.
 */
export function fetchTopicPageHead(topicId: string): Promise<PageHead | null> {
	return readPageHead(apiClient().api.topics[":id"].head.$get({ param: { id: topicId } }))
}

/**
 * A public podcast episode page's head, or null if the topic is not public or has no such episode.
 */
export function fetchPodcastEpisodePageHead({
	topicId,
	season,
	episodeNumber,
}: PodcastEpisodePageParams): Promise<PageHead | null> {
	return readPageHead(
		apiClient().api.topics[":id"].episodes[":season"][":episodeNumber"].head.$get({
			param: { id: topicId, season, episodeNumber },
		}),
	)
}

/**
 * Returns a published Topic Post page's head, or null for a draft and for a post that is missing.
 */
export function fetchTopicPostPageHead(topicPostId: string): Promise<PageHead | null> {
	return readPageHead(apiClient().api["topic-posts"][":id"].head.$get({ param: { id: topicPostId } }))
}

/**
 * A profile page's head, or null if no user has that id.
 */
export function fetchProfilePageHead(userId: string): Promise<PageHead | null> {
	return readPageHead(apiClient().api.profiles[":userId"].head.$get({ param: { userId } }))
}

/**
 * A team page's head, or null for a private or missing team.
 */
export function fetchTeamPageHead(teamId: string): Promise<PageHead | null> {
	return readPageHead(apiClient().api.teams[":teamId"].head.$get({ param: { teamId } }))
}

/**
 * A Dashboard page's head, or null for a missing person, or a missing or private team.
 */
export function fetchDashboardPageHead({ dashboardKind, subjectId }: DashboardSubject): Promise<PageHead | null> {
	return readPageHead(
		apiClient().api.dashboards[":dashboardKind"][":subjectId"].head.$get({ param: { dashboardKind, subjectId } }),
	)
}

/**
 * A join page's head, or null if no live invite has that token.
 */
export function fetchInvitePageHead(token: string): Promise<PageHead | null> {
	return readPageHead(apiClient().api.invites[":token"].head.$get({ param: { token } }))
}

// a page's head from one api response, or null if the api has no such page. a failed or unreachable api throws
async function readPageHead(pageHeadRequest: Promise<ApiResponse>): Promise<PageHead | null> {
	const response = await pageHeadRequest
	// return null for a page the api does not have, and throw on any other failed response
	if (response.status === 404) {
		return null
	}
	if (!response.ok) {
		throw new Error(`the page head responded ${response.status}`)
	}
	return (await response.json()) as PageHead
}
