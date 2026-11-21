// the api client for the page reads: one read per page that holds the page's head and its first screen
import type { DashboardSubject } from "@carlnotes/contracts/dashboards"
import {
	type DashboardPageRead,
	dashboardPageRead,
	type PodcastEpisodePageRead,
	type ProfilePageRead,
	podcastEpisodePageRead,
	profilePageRead,
	type TopicPageRead,
	type TopicPostPageRead,
	topicPageRead,
	topicPostPageRead,
} from "@carlnotes/contracts/pageReads"
import type { ProfileAudience } from "@carlnotes/contracts/profiles"
import type { z } from "zod"
import { type ApiResponse, apiClient, readApiResponse } from "./apiClient"
import { toPageQuery, toTopicPostsPagedQuery } from "./cardPagesQuery"
import type { PodcastEpisodePageParams } from "./podcastEpisodeClient"

/**
 * Returns a profile's page read for the audience, or null if no person has that id. The read holds one page of the
 * person's Topic Posts.
 */
export function fetchProfilePageRead(
	userId: string,
	audience?: ProfileAudience,
	{ topicPostsPage }: { topicPostsPage?: number } = {},
): Promise<ProfilePageRead | null> {
	// the read holds one zero-based page of the person's Topic Posts
	const pageQuery = { paged: "1" as const, topicPostsPage: toPageQuery(topicPostsPage) }
	return readPageRead(
		profilePageRead,
		apiClient().api.profiles[":userId"].page.$get({ param: { userId }, query: { audience, ...pageQuery } }),
	)
}

/**
 * Returns a topic's page read, or null if no topic has that id. A private topic's read holds its head alone, and an
 * invite topic's its head and its gate. The read holds the newest page of scans, whose later pages
 * fetchTopicScansPage reads, and a paged read holds one page of the topic's Topic Posts.
 */
export function fetchTopicPageRead(
	topicId: string,
	{ isPaged = false, topicPostsPage }: { isPaged?: boolean; topicPostsPage?: number } = {},
): Promise<TopicPageRead | null> {
	// a paged read holds one zero-based page of the topic's Topic Posts
	const pageQuery = toTopicPostsPagedQuery({ isPaged, topicPostsPage })
	return readPageRead(
		topicPageRead,
		apiClient().api.topics[":id"].page.$get({ param: { id: topicId }, query: { ...pageQuery, scans: "newest" } }),
	)
}

/**
 * Returns a podcast episode's page read, or null if its topic has no published podcast episode there.
 */
export function fetchPodcastEpisodePageRead({
	topicId,
	season,
	episodeNumber,
}: PodcastEpisodePageParams): Promise<PodcastEpisodePageRead | null> {
	return readPageRead(
		podcastEpisodePageRead,
		apiClient().api.topics[":id"].episodes[":season"][":episodeNumber"].page.$get({
			param: { id: topicId, season, episodeNumber },
		}),
	)
}

/**
 * Returns a Topic Post's page read, or null for a draft of someone else's and for a missing post.
 */
export function fetchTopicPostPageRead(topicPostId: string): Promise<TopicPostPageRead | null> {
	return readPageRead(
		topicPostPageRead,
		apiClient().api["topic-posts"][":id"].page.$get({ param: { id: topicPostId } }),
	)
}

/**
 * Returns a Dashboard's page read, or null for a missing person, or a missing or private team.
 */
export function fetchDashboardPageRead({
	dashboardKind,
	subjectId,
}: DashboardSubject): Promise<DashboardPageRead | null> {
	return readPageRead(
		dashboardPageRead,
		apiClient().api.dashboards[":dashboardKind"][":subjectId"].page.$get({ param: { dashboardKind, subjectId } }),
	)
}

// a page read from one api response, or null if the api has no such page. a failed or unreachable api throws
async function readPageRead<Schema extends z.ZodType>(
	schema: Schema,
	pageReadRequest: Promise<ApiResponse>,
): Promise<z.output<Schema> | null> {
	// a missing page is null
	const response = await pageReadRequest
	if (response.status === 404) {
		return null
	}

	// any other failure throws, and a page read is parsed by its contract
	if (!response.ok) {
		throw new Error(`the page read responded ${response.status}`)
	}
	return readApiResponse(schema, response)
}
