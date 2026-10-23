// the site search's podcast episode reader: the published podcast episodes the user or visitor may see whose title or
// description matches the query, title matches first, then the nearest by meaning over the episode vectors

import { isPublishedPodcastEpisode, type PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodeSearchRow } from "@carlnotes/contracts/search"
import { toPodcastEpisodePath } from "@carlnotes/contracts/seo"
import { DAY_MS } from "@carlnotes/contracts/time"
import { type DbHandle, db, isPublicAndShown, runWithIterativeIndexScan } from "@carlnotes/db"
import { cacheJson } from "@carlnotes/db/redis"
import { countRateLimitHit } from "@carlnotes/db/redisRateLimits"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { EMBED_MODEL_NAME } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { podcastEpisodeVectors } from "@carlnotes/db/schema/vectors"
import { loadUserOrPublicLiteLLMKey } from "@carlnotes/models/litellm"
import { isBudgetRejection } from "@carlnotes/models/models"
import { embedRetrievalQuery } from "@carlnotes/pipeline/chat/retrieveDocs"
import { reportError } from "@carlnotes/server/monitoring"
import { and, desc, eq, like, notInArray, or, type SQL, sql } from "drizzle-orm"
import { toContainsLikePattern } from "../likePattern"
import { toRateLimitKey } from "../rateLimit"
import { podcastEpisodeColumns, toPodcastEpisodeViewFilter } from "./podcastEpisodeRows"
import { loadPodcastEpisodeSummaries } from "./podcastEpisodeShapes"

// the farthest cosine distance a meaning match may be from the query
const MAX_MEANING_MATCH_DISTANCE = 0.6

// the shortest query that is matched by meaning. a shorter query's embedding is near unrelated episodes
export const MEANING_MATCH_MIN_CHARS = 3

// how long Redis keeps a query's vector
const QUERY_VECTOR_TTL_MS = DAY_MS

// how many embeddings a visitor's address may request in one rate limit window, and how long the window is
export const VISITOR_EMBEDDING_LIMIT = 20
const VISITOR_EMBEDDING_WINDOW_MS = 60_000

// who is searching, whether they are an admin, the trimmed query, the client address that a visitor's embedding rate
// limit counts under, and the most rows to read
export type SearchPodcastEpisodesOptions = {
	userId: string | null
	isAdmin: boolean
	query: string
	clientAddress: string | null
	limit: number
	// the filter the podcast episode's topic's tags must pass
	topicTagFilter?: SQL
}

// the columns each match read selects: the podcast episode's own, and its topic's id, name, and visibility
const podcastEpisodeMatchColumns = {
	...podcastEpisodeColumns,
	topicId: topics.id,
	topicName: topics.name,
	topicVisibility: topics.visibility,
}

/**
 * Returns the published podcast episodes the user may see: the title matches, then the description matches, then the
 * nearest by meaning. A query under three characters, and a search that may not embed its query, return the title
 * and description matches alone.
 */
export async function searchPodcastEpisodes(
	searchPodcastEpisodesOptions: SearchPodcastEpisodesOptions,
): Promise<PodcastEpisodeSearchRow[]> {
	const podcastEpisodeMatchRows = await loadPodcastEpisodeMatchRows(searchPodcastEpisodesOptions)
	return toPodcastEpisodeSearchRows(podcastEpisodeMatchRows)
}

// read the text matches, then the nearest by meaning to fill the rest of the limit
async function loadPodcastEpisodeMatchRows({
	userId,
	isAdmin,
	query,
	clientAddress,
	limit,
	topicTagFilter,
}: SearchPodcastEpisodesOptions): Promise<PodcastEpisodeMatchRow[]> {
	// an admin finds every published episode, and everyone else the episodes the view rules allow, with the topic's tags
	// filtered. the meaning match checks a public episode by its vector's saved public
	// and shown flag, so a visitor's read ranks through that flag's index
	const viewFilter = and(isAdmin ? undefined : toPodcastEpisodeViewFilter(userId), topicTagFilter)
	const meaningMatchViewFilter = and(
		isAdmin ? undefined : toPodcastEpisodeViewFilter(userId, isPublicAndShownPodcastEpisodeVector),
		topicTagFilter,
	)

	// the title and description matches, which a full list returns alone
	const textMatchRows = await toTextMatchQuery({ query: query, viewFilter, limit })
	if (textMatchRows.length >= limit) {
		return textMatchRows
	}

	// the nearest by meaning fill the rest, leaving out the text matches. a short query and a search that may not embed
	// have none
	const queryVector =
		query.length >= MEANING_MATCH_MIN_CHARS ? await loadQueryVector({ userId, query: query, clientAddress }) : null
	const meaningMatchRows = queryVector
		? await runWithIterativeIndexScan((transaction) =>
				toMeaningMatchQuery(transaction, {
					queryVector,
					viewFilter: meaningMatchViewFilter,
					textMatchIds: textMatchRows.map((textMatchRow) => textMatchRow.id),
					limit: limit - textMatchRows.length,
				}),
			)
		: []
	const nearMeaningMatchRows = meaningMatchRows.filter(
		(meaningMatchRow) => meaningMatchRow.distance <= MAX_MEANING_MATCH_DISTANCE,
	)
	return [...textMatchRows, ...nearMeaningMatchRows]
}

// a public shown topic's episode vector, by its saved flag and by its topic checked again
export const isPublicAndShownPodcastEpisodeVector = and(
	sql`${podcastEpisodeVectors.isTopicPublicAndShown}`,
	isPublicAndShown,
)

// the typed query, the view rules a match must pass, and the most rows to read
type ToTextMatchQueryOptions = { query: string; viewFilter: SQL | undefined; limit: number }

// one matched podcast episode's row: its own columns, and its topic's name and visibility
type PodcastEpisodeMatchRow = Awaited<ReturnType<typeof toTextMatchQuery>>[number]

/**
 * Returns the text match read: published podcast episodes whose lowercased title or description contains the query,
 * title matches first and then the newest, up to the limit.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
export function toTextMatchQuery({ query, viewFilter, limit }: ToTextMatchQueryOptions) {
	// the matches, with the typed characters escaped so none acts as a wildcard
	const likePattern = toContainsLikePattern(query)
	const isTitleMatch = like(sql`lower(${podcastEpisodes.title})`, likePattern)
	const isDescriptionMatch = like(sql`lower(${podcastEpisodes.description})`, likePattern)

	// the published matches the view rules allow, title matches first
	return db
		.select(podcastEpisodeMatchColumns)
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(and(eq(podcastEpisodes.status, "published"), or(isTitleMatch, isDescriptionMatch), viewFilter))
		.orderBy(sql`(${isTitleMatch}) desc`, desc(podcastEpisodes.publishedAt))
		.limit(limit)
}

// the query's vector, the view rules a match must pass, the text matches to leave out, and how many rows to read
type ToMeaningMatchQueryOptions = {
	queryVector: number[]
	viewFilter: SQL | undefined
	textMatchIds: string[]
	limit: number
}

/**
 * Returns the meaning match read: published podcast episodes with a current model vector, nearest the query first, each
 * with its distance.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
export function toMeaningMatchQuery(
	handle: DbHandle,
	{ queryVector, viewFilter, textMatchIds, limit }: ToMeaningMatchQueryOptions,
) {
	// the distance from the query, which orders the read through the vectors' index
	const distance = sql<number>`${podcastEpisodeVectors.embedding} <=> ${JSON.stringify(queryVector)}::vector`

	// the nearest published episodes the view rules allow, except the text matches
	return handle
		.select({ ...podcastEpisodeMatchColumns, distance })
		.from(podcastEpisodeVectors)
		.innerJoin(podcastEpisodes, eq(podcastEpisodeVectors.podcastEpisodeId, podcastEpisodes.id))
		.innerJoin(topics, eq(podcastEpisodeVectors.topicId, topics.id))
		.where(
			and(
				eq(podcastEpisodes.status, "published"),
				eq(podcastEpisodeVectors.embeddingModel, EMBED_MODEL_NAME),
				textMatchIds.length > 0 ? notInArray(podcastEpisodes.id, textMatchIds) : undefined,
				viewFilter,
			),
		)
		.orderBy(distance)
		.limit(limit)
}

// who is searching, the query to embed, and the client address that a visitor's embedding counts under
type LoadQueryVectorOptions = { userId: string | null; query: string; clientAddress: string | null }

/**
 * Returns the query's vector from Redis, or embeds and caches it. Returns null for a visitor over the rate limit, a
 * visitor with no public key, a spent key, and a failed embedding, which is reported.
 */
export async function loadQueryVector(loadQueryVectorOptions: LoadQueryVectorOptions): Promise<number[] | null> {
	// a cached vector costs no embedding, and a query the search could not embed caches nothing
	return cacheJson({
		key: toQueryVectorKey(loadQueryVectorOptions.query),
		ttlMs: QUERY_VECTOR_TTL_MS,
		load: () => embedQuery(loadQueryVectorOptions),
		isStorable: (queryVector) => queryVector !== null,
	})
}

// embed the query on the user's own key or the public key. a visitor embeds only with a public key and within the
// address's rate limit. a spent key returns null, and any other failure is reported first
async function embedQuery({ userId, query, clientAddress }: LoadQueryVectorOptions): Promise<number[] | null> {
	try {
		// the key, and whether a visitor may embed
		const litellmApiKey = await loadUserOrPublicLiteLLMKey(userId)
		if (!litellmApiKey || (!userId && !(await isVisitorEmbeddingAllowed(clientAddress)))) {
			return null
		}
		return await embedRetrievalQuery(query, litellmApiKey)
	} catch (error) {
		// report any failure except a spent key
		if (!isBudgetRejection(error)) {
			reportError(error, "api-route", { route: "podcast-episode-search" })
		}
		return null
	}
}

/**
 * Returns the Redis key of a query's vector: the embedding model and a hash of the query lowercased with its spaces
 * collapsed, so the same words with other capitals or spacing share one vector.
 */
export function toQueryVectorKey(query: string): string {
	const normalizedQuery = query.toLowerCase().split(/\s+/).filter(Boolean).join(" ")
	const queryHash = new Bun.CryptoHasher("sha256").update(normalizedQuery).digest("hex")
	return `podcast-episode-search-vector:${EMBED_MODEL_NAME}:${queryHash}`
}

// count one embedding against the visitor's address and return whether it is within the rate limit. a visitor whose
// address cannot be trusted counts in the shared bucket
async function isVisitorEmbeddingAllowed(clientAddress: string | null): Promise<boolean> {
	const rateLimitKey = toRateLimitKey({ userId: null, clientAddress })
	return countRateLimitHit({
		key: `rate-limit:podcast-episode-search:${rateLimitKey}`,
		rateLimitWindowMs: VISITOR_EMBEDDING_WINDOW_MS,
		limit: VISITOR_EMBEDDING_LIMIT,
	})
}

// shape the published matches as search rows, each with its summary and chapter count
async function toPodcastEpisodeSearchRows(
	podcastEpisodeMatchRows: PodcastEpisodeMatchRow[],
): Promise<PodcastEpisodeSearchRow[]> {
	// the published matches with their topics, and each one's summary
	const publishedMatchRows = podcastEpisodeMatchRows.filter(isPublishedPodcastEpisode)
	const podcastEpisodeRowTopics = publishedMatchRows.map((podcastEpisodeMatchRow) => ({
		podcastEpisodeRow: podcastEpisodeMatchRow,
		topic: {
			id: podcastEpisodeMatchRow.topicId,
			name: podcastEpisodeMatchRow.topicName,
			visibility: podcastEpisodeMatchRow.topicVisibility,
		},
	}))
	const podcastEpisodeSummaries = await loadPodcastEpisodeSummaries(podcastEpisodeRowTopics)

	// one row per match, in match order
	return podcastEpisodeRowTopics.map(({ podcastEpisodeRow, topic }, i) => ({
		kind: "podcastEpisode",
		id: podcastEpisodeRow.id,
		name: podcastEpisodeRow.title ?? "",
		path: toPodcastEpisodePath(topic, podcastEpisodeRow),
		date: podcastEpisodeRow.publishedAt?.toISOString() ?? null,
		count: podcastEpisodeRow.listenerCount,
		podcastEpisode: podcastEpisodeSummaries[i] as PodcastEpisodeSummary,
		topic: { id: topic.id, name: topic.name },
	}))
}
