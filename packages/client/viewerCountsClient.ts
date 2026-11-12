// the api client for a topic, a profile, a team, and a Topic Post page's view, and the topic, podcast episode, profile,
// team, and Topic Post counts
import {
	type PodcastEpisodeCounts,
	podcastEpisodeCounts,
	type TopicCounts,
	topicCounts,
	type ViewerCounts,
	viewerCounts,
} from "@carlnotes/contracts/viewerCounts"
import { apiClient, readApiResponse, toReadRequestInit } from "./apiClient"

/**
 * Sends a topic page's view, which outlives a page that unloads first. The response says nothing, so a failure is left
 * alone.
 */
export function sendTopicView(topicId: string): void {
	apiClient()
		.api.topics[":id"].view.$post({ param: { id: topicId } }, { init: { keepalive: true } })
		.catch(() => {})
}

/**
 * Fetches a topic's viewers and followers, or null if the read fails. A public topic's counts are fetched without
 * credentials.
 */
export async function fetchTopicCounts(
	topicId: string,
	isPublic: boolean,
	signal?: AbortSignal,
): Promise<TopicCounts | null> {
	const response = await apiClient()
		.api.counts.topics[":id"].$get({ param: { id: topicId } }, { init: toReadRequestInit({ isPublic, signal }) })
		.catch(() => null)
	return response?.ok ? readApiResponse(topicCounts, response) : null
}

/**
 * Fetches a podcast episode's listeners, or null if the read fails. A public topic's podcast episode counts are
 * fetched without credentials.
 */
export async function fetchPodcastEpisodeCounts(
	podcastEpisodeId: string,
	isPublic: boolean,
	signal?: AbortSignal,
): Promise<PodcastEpisodeCounts | null> {
	const response = await apiClient()
		.api.counts.episodes[":id"].$get(
			{ param: { id: podcastEpisodeId } },
			{ init: toReadRequestInit({ isPublic, signal }) },
		)
		.catch(() => null)
	return response?.ok ? readApiResponse(podcastEpisodeCounts, response) : null
}

/**
 * Sends a profile page's view, which outlives a page that unloads first. A failure is left alone.
 */
export function sendProfileView(userId: string): void {
	apiClient()
		.api.profiles[":userId"].view.$post({ param: { userId } }, { init: { keepalive: true } })
		.catch(() => {})
}

/**
 * Sends a team page's view, which outlives a page that unloads first. A failure is left alone.
 */
export function sendTeamView(teamId: string): void {
	apiClient()
		.api.teams[":id"].view.$post({ param: { id: teamId } }, { init: { keepalive: true } })
		.catch(() => {})
}

/**
 * Fetches a profile's viewers, or null if the read fails. A profile is public, so the read leaves the session cookie
 * behind.
 */
export async function fetchProfileViewerCounts(userId: string, signal?: AbortSignal): Promise<ViewerCounts | null> {
	const response = await apiClient()
		.api.counts.profiles[":userId"].$get({ param: { userId } }, { init: toReadRequestInit({ isPublic: true, signal }) })
		.catch(() => null)
	return response?.ok ? readApiResponse(viewerCounts, response) : null
}

/**
 * Fetches a team's viewers, or null if the read fails. A public team's count is fetched without credentials.
 */
export async function fetchTeamViewerCounts(
	teamId: string,
	isPublic: boolean,
	signal?: AbortSignal,
): Promise<ViewerCounts | null> {
	const response = await apiClient()
		.api.counts.teams[":id"].$get({ param: { id: teamId } }, { init: toReadRequestInit({ isPublic, signal }) })
		.catch(() => null)
	return response?.ok ? readApiResponse(viewerCounts, response) : null
}

/**
 * Sends a Topic Post page's view, which outlives a page that unloads first. A failure is left alone.
 */
export function sendTopicPostView(topicPostId: string): void {
	apiClient()
		.api.topicPosts[":id"].view.$post({ param: { id: topicPostId } }, { init: { keepalive: true } })
		.catch(() => {})
}

/**
 * Fetches a Topic Post's viewers, or null if the read fails. A Topic Post on a public Topic is read without
 * credentials.
 */
export async function fetchTopicPostViewerCounts(
	topicPostId: string,
	isPublic: boolean,
	signal?: AbortSignal,
): Promise<ViewerCounts | null> {
	const response = await apiClient()
		.api.counts.topicPosts[":id"].$get(
			{ param: { id: topicPostId } },
			{ init: toReadRequestInit({ isPublic, signal }) },
		)
		.catch(() => null)
	return response?.ok ? readApiResponse(viewerCounts, response) : null
}
