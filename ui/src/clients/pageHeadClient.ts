// the api client for the page head of a topic, profile, team, or join page
import type { PageHead } from "@shared/contracts"
import { apiClient } from "./apiClient"

/**
 * A topic page's head, or null if no topic has that id. A private or invite topic still gets its card.
 */
export function fetchTopicPageHead(topicId: string): Promise<PageHead | null> {
	return readPageHead(apiClient.api.topics[":id"].head.$get({ param: { id: topicId } }))
}

/**
 * A profile page's head, or null if no user has that id.
 */
export function fetchProfilePageHead(userId: string): Promise<PageHead | null> {
	return readPageHead(apiClient.api.profiles[":userId"].head.$get({ param: { userId } }))
}

/**
 * A team page's head, or null for a private or missing team.
 */
export function fetchTeamPageHead(teamId: string): Promise<PageHead | null> {
	return readPageHead(apiClient.api.teams[":teamId"].head.$get({ param: { teamId } }))
}

/**
 * A join page's head, or null if no live invite has that token.
 */
export function fetchInvitePageHead(token: string): Promise<PageHead | null> {
	return readPageHead(apiClient.api.invites[":token"].head.$get({ param: { token } }))
}

// a page's head from one api response, or null if the api has no such page. a failed or unreachable api throws
async function readPageHead(pageHeadRequest: Promise<Response>): Promise<PageHead | null> {
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
