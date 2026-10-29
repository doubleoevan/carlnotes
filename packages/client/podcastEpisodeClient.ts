// the api client for the podcast episode routes

import type { PodcastEpisodeListenPayload } from "@carlnotes/contracts/payloads"
import {
	type PodcastEpisode,
	type PodcastEpisodeAudio,
	podcastEpisode,
	podcastEpisodeAudio,
	type SeasonPodcastEpisodes,
	seasonPodcastEpisodes,
} from "@carlnotes/contracts/podcast"
import { type PodcastEpisodePageResponse, podcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { z } from "zod"
import { type ApiResponse, apiClient, fetchApi } from "./apiClient"
import { readTopicGate, type TopicGate } from "./topicClient"

// what a podcast feed url request returns
const podcastFeedUrlResponse = z.object({ podcastFeedUrl: z.string() })

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
	// validate the response under the caller's error policy
	const response = await fetchApi(`/api/episodes/${encodeURIComponent(podcastEpisodeId)}`, { signal: options.signal })
	assertPodcastEpisodeResponse(response, options)
	return response.ok ? podcastEpisode.parse(await response.json()) : null
}

/**
 * Loads a podcast episode's page, the gate in front of its topic, or nothing if the topic has no such episode.
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
		return { status: "visible", podcastEpisodePage: podcastEpisodePageResponse.parse(await response.json()) }
	}

	if (response.status >= 500) {
		assertPodcastEpisodeResponse(response, options)
	}
	// a gated podcast episode shows the gate in front of its topic, and any other response is a missing episode
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
	...options
}: FetchSeasonPodcastEpisodesOptions): Promise<SeasonPodcastEpisodes> {
	// preserve the empty fallback unless the caller requests an error
	const response = await apiClient()
		.api.topics[":id"].episodes.$get(
			{ param: { id: topicId }, query: { season: String(season) } },
			{ init: { signal: options.signal } },
		)
		.catch((error) => {
			if (options.shouldThrowOnError) {
				throw error
			}
			return null
		})
	if (response) {
		assertPodcastEpisodeResponse(response, options)
	}
	return response?.ok ? seasonPodcastEpisodes.parse(await response.json()) : { podcastEpisodes: [] }
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
	return z.object({ podcastEpisode: podcastEpisode.nullable() }).parse(await response.json()).podcastEpisode
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

// the topic, and whether its podcast should be on
type SendTopicPodcastOptions = { topicId: string; isPodcastEnabled: boolean }

/**
 * Turns a topic's podcast on or off and returns whether the change saved.
 * A request that never reaches the api did not save.
 */
export async function sendTopicPodcast({ topicId, isPodcastEnabled }: SendTopicPodcastOptions): Promise<boolean> {
	// a request that throws an error has no response
	const response = await apiClient()
		.api.topics[":id"].podcast.$put({ param: { id: topicId }, json: { isPodcastEnabled } })
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
 * Loads the url of the user's podcast feed for a topic, or null if the url does not load.
 */
export async function fetchPodcastFeedUrl(
	topicId: string,
	options: PodcastEpisodeRequestOptions = {},
): Promise<string | null> {
	// load the account-owned feed under the caller's error policy
	const response = await fetchApi(`/api/topics/${encodeURIComponent(topicId)}/podcast-feed`, { signal: options.signal })
	assertPodcastEpisodeResponse(response, options)
	return response.ok ? podcastFeedUrlResponse.parse(await response.json()).podcastFeedUrl : null
}

/**
 * Replaces the user's own podcast feed url and returns the new url, or null if the reset fails.
 * The old url stops working.
 */
export async function sendResetPodcastFeed(
	topicId: string,
	options: PodcastEpisodeRequestOptions = {},
): Promise<string | null> {
	// replace the account-owned token and validate the new feed URL
	const response = await fetchApi(`/api/topics/${encodeURIComponent(topicId)}/podcast-feed/reset`, {
		method: "POST",
		signal: options.signal,
	})
	assertPodcastEpisodeResponse(response, options)
	return response.ok ? podcastFeedUrlResponse.parse(await response.json()).podcastFeedUrl : null
}

// request cancellation and optional errors for retryable failures and denied access
export type PodcastEpisodeRequestOptions = { shouldThrowOnError?: boolean; signal?: AbortSignal }
type FetchSeasonPodcastEpisodesOptions = PodcastEpisodeRequestOptions & { topicId: string; season: number }
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
	// resolve audio through the authenticated API without forwarding credentials to storage
	const response = await fetchApi(`/api/episodes/${encodeURIComponent(podcastEpisodeId)}/audio.mp3`, {
		headers: { Accept: "application/json" },
		signal,
		redirect: "error",
		cache: "no-store",
	})
	assertPodcastEpisodeResponse(response, { shouldThrowOnError: true })
	const source = podcastEpisodeAudio.safeParse(await response.json())
	if (!source.success) {
		throw new Error("The audio source could not be read.")
	}
	return source.data
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
