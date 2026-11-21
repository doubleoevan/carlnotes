// the site search's podcast episode reader: the published podcast episodes the user or visitor may see whose title or
// description matches the query, title matches first, then the nearest by meaning over the episode vectors

import { isPublishedPodcastEpisode, type PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodeSearchRow } from "@carlnotes/contracts/search"
import { toPodcastEpisodePath } from "@carlnotes/contracts/seo"
import { HOUR_MS } from "@carlnotes/contracts/time"
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
import { isUncountedToolCaller, toRateLimitKey } from "../rateLimit"
import { podcastEpisodeColumns, toPodcastEpisodeViewFilter } from "./podcastEpisodeRows"
import { loadPodcastEpisodeSummaries } from "./podcastEpisodeShapes"

// the farthest cosine distance a meaning match may be from the query
const MAX_MEANING_MATCH_DISTANCE = 0.6

// the shortest query that is matched by meaning. a shorter query's embedding is near unrelated episodes
const MEANING_MATCH_MIN_CHARS = 3

// how long Redis keeps a query's vector
const QUERY_VECTOR_TTL_MS = HOUR_MS

// how many embeddings one user or visitor's address may request in one rate limit window, and how long the window is
export const QUERY_EMBEDDING_LIMIT = 20

// how many query embeddings every page render's own searches send together a minute. a render brings no visitor to
// count, so the renders share one bucket, wide enough that one visitor's search never fills it
export const PAGE_RENDER_QUERY_EMBEDDING_LIMIT = 200
const QUERY_EMBEDDING_WINDOW_MS = 60_000

// how long a search waits on the query's embedding before it returns the text matches alone
const QUERY_EMBEDDING_TIME_LIMIT_MS = 2000

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
	topicImageHash: topics.imageHash,
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
 * Returns the query's vector from Redis, or embeds and caches it. Returns null for a user or visitor over the rate
 * limit, a visitor with no public key, a spent key, an embedding past its time limit, and a failed embedding, which is
 * reported.
 */
export async function loadQueryVector(loadQueryVectorOptions: LoadQueryVectorOptions): Promise<number[] | null> {
	// a cached vector costs no embedding, and a query the search could not embed caches nothing. the vector is kept as
	// base64 of its 32-bit floats
	const storedQueryVector = await cacheJson({
		key: toQueryVectorKey(loadQueryVectorOptions.query),
		ttlMs: QUERY_VECTOR_TTL_MS,
		load: async () => {
			const queryVector = await embedQuery(loadQueryVectorOptions)
			return queryVector ? toStoredQueryVector(queryVector) : null
		},
		isStorable: (storedQueryVector) => storedQueryVector !== null,
	})
	return storedQueryVector ? toQueryVector(storedQueryVector) : null
}

/**
 * Returns a query vector as Redis keeps it: base64 of its 32-bit floats, a quarter of the size of its json.
 */
export function toStoredQueryVector(queryVector: number[]): string {
	return Buffer.from(new Float32Array(queryVector).buffer).toString("base64")
}

// the query vector that Redis keeps as base64 of its 32-bit floats
function toQueryVector(storedQueryVector: string): number[] {
	const queryVectorBytes = Buffer.from(storedQueryVector, "base64")
	return [...new Float32Array(queryVectorBytes.buffer, queryVectorBytes.byteOffset, queryVectorBytes.byteLength / 4)]
}

// embed the query on the user's own key or the public key, within the user's or the address's rate limit, giving it
// two seconds and no retry. a visitor embeds only with a public key. a spent key and an embedding past its time limit
// return null, and any other failure is reported first
async function embedQuery({ userId, query, clientAddress }: LoadQueryVectorOptions): Promise<number[] | null> {
	const embedAbortSignal = AbortSignal.timeout(QUERY_EMBEDDING_TIME_LIMIT_MS)
	try {
		// the key, and whether the user or the visitor may embed
		const litellmApiKey = await loadUserOrPublicLiteLLMKey(userId)
		if (!litellmApiKey || !(await isQueryEmbeddingAllowed({ userId, clientAddress }))) {
			return null
		}
		return await embedRetrievalQuery(query, litellmApiKey, { maxRetries: 0, abortSignal: embedAbortSignal })
	} catch (error) {
		// report any failure except a spent key and an embedding past its time limit
		if (!isBudgetRejection(error) && !embedAbortSignal.aborted) {
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
	return `podcast-episode-search-vector-base64:${EMBED_MODEL_NAME}:${queryHash}`
}

// count one embedding against the user, else the visitor's address, and return whether it is within the rate limit. a
// request the search limit skips, a page render's own search, counts in the renders' own wider bucket, so no visitor
// shares the visitors' count and the renders' embeddings still have a limit
async function isQueryEmbeddingAllowed(toolCaller: {
	userId: string | null
	clientAddress: string | null
}): Promise<boolean> {
	if (isUncountedToolCaller(toolCaller)) {
		return countRateLimitHit({
			key: "rate-limit:podcast-episode-search:page-renders",
			rateLimitWindowMs: QUERY_EMBEDDING_WINDOW_MS,
			limit: PAGE_RENDER_QUERY_EMBEDDING_LIMIT,
		})
	}
	return countRateLimitHit({
		key: `rate-limit:podcast-episode-search:${toRateLimitKey(toolCaller)}`,
		rateLimitWindowMs: QUERY_EMBEDDING_WINDOW_MS,
		limit: QUERY_EMBEDDING_LIMIT,
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
			imageHash: podcastEpisodeMatchRow.topicImageHash,
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
