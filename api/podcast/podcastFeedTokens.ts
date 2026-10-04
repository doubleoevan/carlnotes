// a Topic's public podcast feed, and each listener's own podcast feed at a path after a feed token.
// a feed token is created on first use, checked against the listener's access, and deleted with that access
import { appUrl } from "@shared/appUrl"
import { toPodcastFeedPath } from "@shared/seo"
import { and, eq } from "drizzle-orm"
import type { Context } from "hono"
import { db } from "../../db"
import { toPodcastFeedCacheKey } from "../../db/podcastFeedCache"
import { deleteRedisKey, readRedisJson, saveRedisJson } from "../../db/redis"
import { podcastFeedTokens, topics } from "../../db/schema"
import { isAllowed } from "../authorization"
import { type PodcastFeedEpisode, toPodcastFeedXml } from "../share/podcastFeed"
import { loadPublishedPodcastEpisodeRows } from "./helpers"

// how long a rendered feed stays in Redis
const PODCAST_FEED_CACHE_TTL_MS = 15 * 60 * 1000

// how long a feed's etag and its modified time stay in Redis, so a rebuilt feed with the same etag keeps its time
const PODCAST_FEED_VERSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

// the most Podcast Episodes that a feed may list and still be cached in Redis. a longer feed is built for each request
const MAX_CACHED_PODCAST_FEED_EPISODES = 100

// how long a token's passing check stays in Redis. a feed works this long at most after its listener loses access
const PODCAST_FEED_TOKEN_CHECK_TTL_MS = 60 * 1000

// a topic row, and the listener and the Topic that a podcast feed token opens
type TopicRow = typeof topics.$inferSelect
type PodcastFeedTokenListener = { topicId: string; userId: string }

// a rendered feed with the etag and the modified time that a conditional request compares
export type RenderedPodcastFeed = { xml: string; etag: string; lastModifiedMs: number }

// the Topic, and the listener whose own podcast feed to build, or null for the public podcast feed
type LoadRenderedPodcastFeedOptions = { topic: TopicRow; listener: { userId: string; token: string } | null }

/**
 * Loads the user's podcast feed url, creating a feed token if needed, or null if the user may not see the Topic.
 */
export async function loadOrCreatePodcastFeedUrl(userId: string | null, topic: TopicRow): Promise<string | null> {
	// a public Topic has one feed for everyone, and a user who may not see the Topic has none
	if (topic.visibility === "public") {
		return `${appUrl()}${toPodcastFeedPath(topic.id)}`
	}
	if (!userId || !(await isAllowed(userId, "topic:view", topic))) {
		return null
	}

	// create the user's feed token on the user's first request, from 24 random bytes
	const newPodcastFeedToken = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url")
	await db
		.insert(podcastFeedTokens)
		.values({ topicId: topic.id, userId, token: newPodcastFeedToken })
		.onConflictDoNothing({ target: [podcastFeedTokens.topicId, podcastFeedTokens.userId] })

	// read the token back, no matter which request created it
	const [podcastFeedTokenRow] = await db
		.select({ token: podcastFeedTokens.token })
		.from(podcastFeedTokens)
		.where(and(eq(podcastFeedTokens.topicId, topic.id), eq(podcastFeedTokens.userId, userId)))
	return podcastFeedTokenRow ? toListenerPodcastFeedUrl(podcastFeedTokenRow.token) : null
}

/**
 * Deletes a listener's token for a Topic, with the token's cached check and the listener's cached feed.
 */
export async function deletePodcastFeedToken({ topicId, userId }: PodcastFeedTokenListener): Promise<void> {
	// delete the token's row, then its cached check and the listener's cached feed
	const deletedPodcastFeedTokenRows = await db
		.delete(podcastFeedTokens)
		.where(and(eq(podcastFeedTokens.topicId, topicId), eq(podcastFeedTokens.userId, userId)))
		.returning({ token: podcastFeedTokens.token })
	const podcastFeedTokenCheckKeys = deletedPodcastFeedTokenRows.map((deletedPodcastFeedTokenRow) =>
		toPodcastFeedTokenCheckKey(deletedPodcastFeedTokenRow.token),
	)
	await Promise.all(
		[toPodcastFeedCacheKey({ topicId, listenerUserId: userId }), ...podcastFeedTokenCheckKeys].map((redisKey) =>
			deleteRedisKey(redisKey),
		),
	)
}

/**
 * Loads the listener and the Topic id that a feed token opens, or null if the token or the listener's access is gone.
 */
export async function loadPodcastFeedTokenListener(podcastFeedToken: string): Promise<PodcastFeedTokenListener | null> {
	// return the listener of a check that passed within the last minute
	const cachedPodcastFeedTokenListener = await readRedisJson<PodcastFeedTokenListener>(
		toPodcastFeedTokenCheckKey(podcastFeedToken),
	)
	if (cachedPodcastFeedTokenListener) {
		return cachedPodcastFeedTokenListener
	}

	// load the feed token's row with its Topic, and return null if the listener may no longer see the Topic
	const [podcastFeedTokenRow] = await db
		.select({ userId: podcastFeedTokens.userId, topic: topics })
		.from(podcastFeedTokens)
		.innerJoin(topics, eq(podcastFeedTokens.topicId, topics.id))
		.where(eq(podcastFeedTokens.token, podcastFeedToken))
	if (!podcastFeedTokenRow || !(await isAllowed(podcastFeedTokenRow.userId, "topic:view", podcastFeedTokenRow.topic))) {
		return null
	}

	// cache the passing check for a minute
	const podcastFeedTokenListener = { topicId: podcastFeedTokenRow.topic.id, userId: podcastFeedTokenRow.userId }
	await saveRedisJson({
		key: toPodcastFeedTokenCheckKey(podcastFeedToken),
		value: podcastFeedTokenListener,
		ttlMs: PODCAST_FEED_TOKEN_CHECK_TTL_MS,
	})
	return podcastFeedTokenListener
}

/**
 * Loads a Topic's rendered feed from Redis, or builds the feed and caches it if it is within the episode limit.
 */
export async function loadRenderedPodcastFeed({
	topic,
	listener,
}: LoadRenderedPodcastFeedOptions): Promise<RenderedPodcastFeed> {
	// return the cached feed if there is one
	const podcastFeedCacheKey = toPodcastFeedCacheKey({ topicId: topic.id, listenerUserId: listener?.userId ?? null })
	const cachedPodcastFeed = await readRedisJson<RenderedPodcastFeed>(podcastFeedCacheKey)
	if (cachedPodcastFeed) {
		return cachedPodcastFeed
	}

	// the podcast episodes that the listener may listen to, newest first.
	// a podcast episode missing a field that a feed item needs is left out
	const publishedPodcastEpisodeRows = await loadPublishedPodcastEpisodeRows(topic, listener?.userId ?? null)
	const podcastFeedEpisodes = publishedPodcastEpisodeRows.flatMap((podcastEpisodeRow): PodcastFeedEpisode[] => {
		const { id, title, description, season, episodeNumber, durationSeconds, audioByteSize, publishedAt } =
			podcastEpisodeRow
		if (!title || season === null || episodeNumber === null || !publishedAt) {
			return []
		}
		// a description or a duration that was never saved is empty or zero
		const descriptionAndDuration = { description: description ?? "", durationSeconds: durationSeconds ?? 0 }
		return [
			{ id, title, season, episodeNumber, publishedAt, audioByteSize: audioByteSize ?? 0, ...descriptionAndDuration },
		]
	})

	// build the feed, and keep the previous build's modified time if the feed's etag is unchanged
	const builtPodcastFeed = toRenderedPodcastFeed({ topic, listener }, podcastFeedEpisodes)
	const podcastFeedVersionKey = `${podcastFeedCacheKey}:version`
	const previousPodcastFeedVersion = await readRedisJson<Omit<RenderedPodcastFeed, "xml">>(podcastFeedVersionKey)
	const lastModifiedMs =
		previousPodcastFeedVersion?.etag === builtPodcastFeed.etag
			? previousPodcastFeedVersion.lastModifiedMs
			: builtPodcastFeed.lastModifiedMs
	const renderedPodcastFeed = { ...builtPodcastFeed, lastModifiedMs }

	// save the etag with its modified time, and cache a feed of no more podcast episodes than the limit
	const podcastFeedVersion = { etag: renderedPodcastFeed.etag, lastModifiedMs }
	await saveRedisJson({ key: podcastFeedVersionKey, value: podcastFeedVersion, ttlMs: PODCAST_FEED_VERSION_TTL_MS })
	if (podcastFeedEpisodes.length <= MAX_CACHED_PODCAST_FEED_EPISODES) {
		await saveRedisJson({ key: podcastFeedCacheKey, value: renderedPodcastFeed, ttlMs: PODCAST_FEED_CACHE_TTL_MS })
	}
	return renderedPodcastFeed
}

// a feed request's context, the rendered feed, and the headers that the route adds to the response
type ToPodcastFeedResponseOptions = {
	context: Context
	renderedPodcastFeed: RenderedPodcastFeed
	routeHeaders: Record<string, string>
}

/**
 * Returns the podcast feed, or a 304 if the request's validators show that the request's copy is current.
 */
export function toPodcastFeedResponse({
	context,
	renderedPodcastFeed,
	routeHeaders,
}: ToPodcastFeedResponseOptions): Response {
	// an etag decides alone if the request sent an etag, and the modified time decides otherwise
	const requestEtag = context.req.header("If-None-Match")
	const modifiedSinceMs = Date.parse(context.req.header("If-Modified-Since") ?? "")
	const isRequestCopyCurrent = requestEtag
		? requestEtag === renderedPodcastFeed.etag
		: !Number.isNaN(modifiedSinceMs) && renderedPodcastFeed.lastModifiedMs <= modifiedSinceMs

	// respond 304 if the request's copy is current, or 200 with the feed. both include the validators
	const validatorHeaders = {
		ETag: renderedPodcastFeed.etag,
		"Last-Modified": new Date(renderedPodcastFeed.lastModifiedMs).toUTCString(),
	}
	if (isRequestCopyCurrent) {
		return context.body(null, 304, { ...validatorHeaders, ...routeHeaders })
	}
	const contentTypeHeader = { "Content-Type": "application/rss+xml; charset=utf-8" }
	return context.body(renderedPodcastFeed.xml, 200, { ...contentTypeHeader, ...validatorHeaders, ...routeHeaders })
}

// a feed's xml with the etag and the modified time that a conditional request compares
function toRenderedPodcastFeed(
	{ topic, listener }: LoadRenderedPodcastFeedOptions,
	podcastFeedEpisodes: PodcastFeedEpisode[],
): RenderedPodcastFeed {
	// a listener's own feed links its files at paths after the token and is blocked from podcast directories
	const podcastFeedXml = toPodcastFeedXml({
		appUrl: appUrl(),
		topic,
		feedUrl: listener ? toListenerPodcastFeedUrl(listener.token) : `${appUrl()}${toPodcastFeedPath(topic.id)}`,
		podcastEpisodeFilesBaseUrl: `${appUrl()}/api${listener ? `/podcast-feeds/${listener.token}` : ""}/episodes`,
		isBlockedFromPodcastDirectories: listener !== null,
		podcastEpisodes: podcastFeedEpisodes,
	})

	// the feed's etag, and this build's time rounded down to the second like an http date
	return {
		xml: podcastFeedXml,
		etag: `"${Bun.hash(podcastFeedXml).toString(36)}"`,
		lastModifiedMs: Math.floor(Date.now() / 1000) * 1000,
	}
}

// the url of a listener's own feed
function toListenerPodcastFeedUrl(podcastFeedToken: string): string {
	return `${appUrl()}/podcast-feeds/${podcastFeedToken}.xml`
}

// the key that a token's check is cached under
function toPodcastFeedTokenCheckKey(podcastFeedToken: string): string {
	return `podcast-feed-token:${podcastFeedToken}`
}
