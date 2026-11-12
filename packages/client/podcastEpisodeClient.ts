// the api client for the podcast episode routes

import type { PodcastEpisodeListenPayload } from "@carlnotes/contracts/payloads"
import {
	nextUnplayedPodcastEpisodeResponse,
	type PodcastEpisode,
	type PodcastEpisodeAudio,
	type PodcastFeedUrlResponse,
	podcastEpisode,
	podcastEpisodeAudio,
	podcastFeedUrlResponse,
	type SeasonPodcastEpisodes,
	seasonPodcastEpisodes,
	type TopicPodcastEpisodeVideoFile,
	topicPodcastEpisodeVideoFile,
	type UpdatePodcastEpisodePayload,
} from "@carlnotes/contracts/podcast"
import { type PodcastEpisodePageResponse, podcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import {
	regenerateTopicImageResponse,
	type TopicImageUrls,
	uploadTopicImageResponse,
	uploadTopicPodcastEpisodeVideoImageResponse,
} from "@carlnotes/contracts/topicImages"
import {
	toDiscussionTopicPostId,
	topicPostResponse,
	toTopicPostDiscussionAudioPath,
	toTopicPostDiscussionPodcastEpisode,
} from "@carlnotes/contracts/topicPosts"
import { type ApiResponse, apiClient, fetchApi, readApiErrorMessage, readApiResponse } from "./apiClient"
import { readTopicGate, type TopicGate } from "./topicClient"

// the url params of a podcast episode's own page
export type PodcastEpisodePageParams = { topicId: string; season: string; episodeNumber: string }

/**
 * Loads one podcast episode with its chapters and the user's progress,
 * or null if the episode is missing or the user may not listen to the episode.
 */
export async function fetchPodcastEpisode(
	podcastEpisodeId: string,
	options: PodcastEpisodeRequestOptions = {},
): Promise<PodcastEpisode | null> {
	// a Topic Post's discussion is read from its Topic Post
	const discussionTopicPostId = toDiscussionTopicPostId(podcastEpisodeId)
	if (discussionTopicPostId) {
		return fetchTopicPostDiscussionPodcastEpisode(discussionTopicPostId, options)
	}

	// validate the response under the caller's error policy
	const response = await fetchApi(`/api/episodes/${encodeURIComponent(podcastEpisodeId)}`, { signal: options.signal })
	assertPodcastEpisodeResponse(response, options)
	return response.ok ? readApiResponse(podcastEpisode, response) : null
}

// a Topic Post's discussion in the shape the player plays, or null for a Topic Post that is missing, that the user
// may not read, or that has no recording to play
async function fetchTopicPostDiscussionPodcastEpisode(
	topicPostId: string,
	options: PodcastEpisodeRequestOptions,
): Promise<PodcastEpisode | null> {
	const response = await fetchApi(`/api/topic-posts/${encodeURIComponent(topicPostId)}`, { signal: options.signal })
	assertPodcastEpisodeResponse(response, options)
	return response.ok ? toTopicPostDiscussionPodcastEpisode(await readApiResponse(topicPostResponse, response)) : null
}

/**
 * Loads a podcast episode's page, the gate in front of its topic, or nothing if the topic has no such episode. Any
 * other rejected read throws.
 */
export async function fetchPodcastEpisodePage(
	{ topicId, season, episodeNumber }: PodcastEpisodePageParams,
	options: PodcastEpisodeRequestOptions = {},
): Promise<PodcastEpisodePageResult> {
	const response = await fetchApi(
		`/api/topics/${encodeURIComponent(topicId)}/episodes/${encodeURIComponent(season)}/${encodeURIComponent(episodeNumber)}`,
		{ signal: options.signal },
	)
	if (response.ok) {
		return { status: "visible", podcastEpisodePage: await readApiResponse(podcastEpisodePageResponse, response) }
	}

	if (response.status !== 403 && response.status !== 404) {
		throw new PodcastEpisodeRequestError(response.status)
	}
	// a gated podcast episode shows the gate in front of its topic, and a 404 is a missing episode
	const topicGate = await readTopicGate(response)
	return topicGate ? { status: "gated", topicGate } : { status: "missing" }
}

// what asking for a podcast episode page got: the page, the gate in front of its topic, or nothing
export type PodcastEpisodePageResult =
	| { status: "visible"; podcastEpisodePage: PodcastEpisodePageResponse }
	| { status: "gated"; topicGate: TopicGate }
	| { status: "missing" }

// a season's number and its podcast episodes
export type FetchedSeason = { season: number; seasonPodcastEpisodes: SeasonPodcastEpisodes }

/**
 * Loads a season's podcast episodes, or none if the request fails.
 */
export async function fetchSeasonPodcastEpisodes({
	topicId,
	season,
	hasVideo,
	...options
}: FetchSeasonPodcastEpisodesOptions): Promise<SeasonPodcastEpisodes> {
	// preserve the empty fallback unless the caller requests an error. the films list asks for the ones with a film
	const filmQuery = hasVideo ? { hasVideo: "true" as const } : {}
	const response = await apiClient()
		.api.topics[":id"].episodes.$get(
			{ param: { id: topicId }, query: { season: String(season), ...filmQuery } },
			{ init: { signal: options.signal } },
		)
		.catch((error) => {
			if (options.shouldThrowOnError) {
				throw error
			}
			return null
		})

	// a response that arrived is checked under the caller's error policy, and only an ok one is read
	if (response) {
		assertPodcastEpisodeResponse(response, options)
	}
	return response?.ok ? readApiResponse(seasonPodcastEpisodes, response) : { podcastEpisodes: [] }
}

/**
 * Loads the newest unplayed podcast episode from another topic that the user owns or subscribes to,
 * or null if there is none.
 */
export async function fetchNextUnplayedPodcastEpisode(currentTopicId: string): Promise<PodcastEpisode | null> {
	const response = await apiClient().api.episodes["next-unplayed"].$get({ query: { topicId: currentTopicId } })
	if (!response.ok) {
		return null
	}
	return (await readApiResponse(nextUnplayedPodcastEpisodeResponse, response)).podcastEpisode
}

/**
 * Saves the user's progress in a podcast episode with a request that outlives the page. A failed save is dropped.
 */
export function sendPodcastEpisodeListen({
	podcastEpisodeId,
	podcastEpisodeListen,
	signal,
}: SendPodcastEpisodeListenOptions): void {
	fetchApi(`/api/episodes/${podcastEpisodeId}/listen`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(podcastEpisodeListen),
		keepalive: true,
		signal,
	}).catch(() => {})
}

// a podcast episode, the position of one of its chapters, and the chapter's new rating, or null to clear it
type SendPodcastEpisodeChapterRatingOptions = {
	podcastEpisodeId: string
	position: number
	rating: "up" | "down" | null
}

/**
 * Rates a podcast episode's chapter, or clears its rating, and returns whether the rating saved.
 */
export async function sendPodcastEpisodeChapterRating({
	podcastEpisodeId,
	position,
	rating,
}: SendPodcastEpisodeChapterRatingOptions): Promise<boolean> {
	// a request that throws an error has no response
	const response = await apiClient()
		.api.episodes[":id"].chapters[":position"].rating.$post({
			param: { id: podcastEpisodeId, position: String(position) },
			json: { rating },
		})
		.catch(() => null)
	return Boolean(response?.ok)
}

// the topic, whether its podcast should be on, and whether the podcast should talk about comments, if that changed
type SendTopicPodcastOptions = { topicId: string; isPodcastEnabled: boolean; isPodcastCommentsEnabled?: boolean }

/**
 * Turns a topic's podcast on or off and returns whether the change saved.
 * A request that never reaches the api did not save.
 */
export async function sendTopicPodcast({
	topicId,
	isPodcastEnabled,
	isPodcastCommentsEnabled,
}: SendTopicPodcastOptions): Promise<boolean> {
	// a request that throws an error has no response
	const response = await apiClient()
		.api.topics[":id"].podcast.$put({ param: { id: topicId }, json: { isPodcastEnabled, isPodcastCommentsEnabled } })
		.catch(() => null)

	// only an ok response saved the change
	return response?.ok === true
}

/**
 * Removes a podcast episode and returns whether the episode was removed.
 */
export async function sendRemovePodcastEpisode(podcastEpisodeId: string): Promise<boolean> {
	const response = await apiClient().api.episodes[":id"].$delete({ param: { id: podcastEpisodeId } })
	return response.ok
}

/**
 * Saves a podcast episode's title and description. Throws an error naming the rejection.
 */
export async function sendPodcastEpisodeUpdate(
	podcastEpisodeId: string,
	payload: UpdatePodcastEpisodePayload,
): Promise<void> {
	const response = await apiClient().api.episodes[":id"].$patch({ param: { id: podcastEpisodeId }, json: payload })
	if (!response.ok) {
		throw new Error((await readApiErrorMessage(response)) ?? `update failed: ${response.status}`)
	}
}

/**
 * Starts a fresh render of a podcast episode's image, from the editor's image prompt if there is one. Returns the
 * render's id to poll. Throws an error naming the rejection, which the month's limit is one of.
 */
export async function sendPodcastEpisodeImageRegeneration(
	podcastEpisodeId: string,
	imagePrompt?: string,
): Promise<string> {
	const response = await apiClient().api.episodes[":id"].image.regenerate.$post({
		param: { id: podcastEpisodeId },
		json: imagePrompt ? { imagePrompt } : {},
	})
	if (!response.ok) {
		throw new Error((await readApiErrorMessage(response)) ?? `regenerate failed: ${response.status}`)
	}
	return (await readApiResponse(regenerateTopicImageResponse, response)).renderId
}

/**
 * Uploads a podcast episode's own image encoded by a browser or native file picker as the form's image field. Returns
 * the image's urls, which replace the current ones at once.
 */
export async function uploadPodcastEpisodeImageBody(podcastEpisodeId: string, body: FormData): Promise<TopicImageUrls> {
	const response = await fetchApi(`/api/episodes/${encodeURIComponent(podcastEpisodeId)}/image`, {
		method: "POST",
		body,
	})
	if (!response.ok) {
		throw new Error((await readApiErrorMessage(response)) ?? `upload failed: ${response.status}`)
	}
	return (await readApiResponse(uploadTopicImageResponse, response)).image
}

/**
 * Starts a fresh render of the own image of a podcast episode's film, from the editor's image prompt if there is one.
 * Returns the render's id to poll. Throws an error naming the rejection, which the month's limit is one of.
 */
export async function sendTopicPodcastEpisodeVideoImageRegeneration(
	podcastEpisodeId: string,
	imagePrompt?: string,
): Promise<string> {
	const response = await apiClient().api.episodes[":id"].video.image.regenerate.$post({
		param: { id: podcastEpisodeId },
		json: imagePrompt ? { imagePrompt } : {},
	})
	if (!response.ok) {
		throw new Error((await readApiErrorMessage(response)) ?? `regenerate failed: ${response.status}`)
	}
	return (await readApiResponse(regenerateTopicImageResponse, response)).renderId
}

/**
 * Uploads the own image of a podcast episode's film, encoded by a browser or native file picker as the form's image
 * field. Returns the film's poster url, which replaces the current one at once.
 */
export async function uploadTopicPodcastEpisodeVideoImageBody(
	podcastEpisodeId: string,
	body: FormData,
): Promise<string> {
	const response = await fetchApi(`/api/episodes/${encodeURIComponent(podcastEpisodeId)}/video/image`, {
		method: "POST",
		body,
	})
	if (!response.ok) {
		throw new Error((await readApiErrorMessage(response)) ?? `upload failed: ${response.status}`)
	}
	return (await readApiResponse(uploadTopicPodcastEpisodeVideoImageResponse, response)).posterUrl
}

/**
 * Loads the urls of the user's podcast feed and film feed for a topic, or null if the urls do not load.
 */
export async function fetchPodcastFeedUrl(
	topicId: string,
	options: PodcastEpisodeRequestOptions = {},
): Promise<PodcastFeedUrlResponse | null> {
	// load the account-owned feeds under the caller's error policy
	const response = await fetchApi(`/api/topics/${encodeURIComponent(topicId)}/podcast-feed`, { signal: options.signal })
	assertPodcastEpisodeResponse(response, options)
	return response.ok ? readApiResponse(podcastFeedUrlResponse, response) : null
}

/**
 * Replaces the user's own podcast feed url and returns the new podcast feed and film feed urls, or null if the reset
 * fails. The old urls of both feeds stop working.
 */
export async function sendResetPodcastFeed(
	topicId: string,
	options: PodcastEpisodeRequestOptions = {},
): Promise<PodcastFeedUrlResponse | null> {
	// replace the account-owned token and validate the new feed urls
	const response = await fetchApi(`/api/topics/${encodeURIComponent(topicId)}/podcast-feed/reset`, {
		method: "POST",
		signal: options.signal,
	})
	assertPodcastEpisodeResponse(response, options)
	return response.ok ? readApiResponse(podcastFeedUrlResponse, response) : null
}

// request cancellation and optional errors for retryable failures and denied access
export type PodcastEpisodeRequestOptions = { shouldThrowOnError?: boolean; signal?: AbortSignal }
type FetchSeasonPodcastEpisodesOptions = PodcastEpisodeRequestOptions & {
	topicId: string
	season: number
	hasVideo?: boolean
}
// one podcast episode's listen report
type SendPodcastEpisodeListenOptions = {
	podcastEpisodeId: string
	podcastEpisodeListen: PodcastEpisodeListenPayload
	signal?: AbortSignal
}

/**
 * Reports a podcast request failure without retaining private response bodies or URLs.
 */
export class PodcastEpisodeRequestError extends Error {
	readonly status: number
	readonly isAccessDenied: boolean

	constructor(status: number) {
		// retain the status without private response details
		super("The podcast request could not be completed.")
		this.name = "PodcastEpisodeRequestError"
		this.status = status
		this.isAccessDenied = status === 401 || status === 403 || status === 404
	}
}

/**
 * Resolves an authorized audio source without following a redirect with session headers.
 */
export async function fetchPodcastEpisodeAudio(
	podcastEpisodeId: string,
	signal?: AbortSignal,
): Promise<PodcastEpisodeAudio> {
	// a Topic Post's discussion has its audio on its Topic Post, and a podcast episode on its own route
	const discussionTopicPostId = toDiscussionTopicPostId(podcastEpisodeId)
	const audioPath = discussionTopicPostId
		? toTopicPostDiscussionAudioPath(discussionTopicPostId)
		: `/api/episodes/${encodeURIComponent(podcastEpisodeId)}/audio.mp3`

	// resolve audio through the authenticated API without forwarding credentials to storage
	const response = await fetchApi(audioPath, {
		headers: { Accept: "application/json" },
		signal,
		redirect: "error",
		cache: "no-store",
	})
	assertPodcastEpisodeResponse(response, { shouldThrowOnError: true })
	return readApiResponse(podcastEpisodeAudio, response)
}

/**
 * Resolves an authorized film source without following a redirect with session headers.
 */
export async function fetchTopicPodcastEpisodeVideo(
	podcastEpisodeId: string,
	signal?: AbortSignal,
): Promise<TopicPodcastEpisodeVideoFile> {
	// resolve the film through the authenticated api without forwarding credentials to storage
	const response = await fetchApi(`/api/episodes/${encodeURIComponent(podcastEpisodeId)}/video.mp4`, {
		headers: { Accept: "application/json" },
		signal,
		redirect: "error",
		cache: "no-store",
	})
	assertPodcastEpisodeResponse(response, { shouldThrowOnError: true })
	return readApiResponse(topicPodcastEpisodeVideoFile, response)
}

/**
 * Identifies a confirmed podcast access denial separately from transport failures.
 */
export function isPodcastEpisodeAccessDenied(error: unknown): boolean {
	return error instanceof PodcastEpisodeRequestError && error.isAccessDenied
}

function assertPodcastEpisodeResponse(response: ApiResponse, options: PodcastEpisodeRequestOptions): void {
	if (!response.ok && options.shouldThrowOnError) {
		throw new PodcastEpisodeRequestError(response.status)
	}
}

/**
 * Sets a podcast episode's position among the podcast episodes its topic's owner pinned to their profile. Position
 * zero clears it. Throws an error on a rejected write.
 */
export async function sendPodcastEpisodeProfileOrder(podcastEpisodeId: string, position: number): Promise<void> {
	const response = await apiClient().api["podcast-episodes"][":id"]["profile-order"].$patch({
		param: { id: podcastEpisodeId },
		json: { position },
	})
	if (!response.ok) {
		throw new Error(`podcast episode profile order update failed: ${response.status}`)
	}
}

/**
 * Sets a podcast episode's film's position among the films its topic's owner pinned to their profile. Position zero
 * clears it. Throws an error on a rejected write.
 */
export async function sendTopicPodcastEpisodeVideoProfileOrder(
	podcastEpisodeId: string,
	position: number,
): Promise<void> {
	const response = await apiClient().api["podcast-episodes"][":id"].video["profile-order"].$patch({
		param: { id: podcastEpisodeId },
		json: { position },
	})
	if (!response.ok) {
		throw new Error(`film profile order update failed: ${response.status}`)
	}
}

/**
 * Sets a podcast episode's position among the home podcast episodes, admin only. Position zero clears it.
 */
export async function sendPodcastEpisodeHomeOrder(podcastEpisodeId: string, position: number): Promise<void> {
	const response = await apiClient().api["podcast-episodes"][":id"]["home-order"].$patch({
		param: { id: podcastEpisodeId },
		json: { position },
	})
	if (!response.ok) {
		throw new Error(`podcast episode home order update failed: ${response.status}`)
	}
}

/**
 * Sets a podcast episode's film's position among the home films, admin only. Position zero clears it.
 */
export async function sendTopicPodcastEpisodeVideoHomeOrder(podcastEpisodeId: string, position: number): Promise<void> {
	const response = await apiClient().api["podcast-episodes"][":id"].video["home-order"].$patch({
		param: { id: podcastEpisodeId },
		json: { position },
	})
	if (!response.ok) {
		throw new Error(`film home order update failed: ${response.status}`)
	}
}
