// the podcast episode search: a short query sends nothing, titles match first under the view rules, the nearest by
// meaning fill the rest from a cached or a new query vector, and a search that may not embed returns its text matches
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import {
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
} from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as redisRateLimits from "@carlnotes/db/redisRateLimits"
import * as litellm from "@carlnotes/models/litellm"
import * as retrieveDocs from "@carlnotes/pipeline/chat/retrieveDocs"
import * as monitoring from "@carlnotes/server/monitoring"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import {
	loadQueryVector,
	podcastEpisodeSearchRoute,
	searchPodcastEpisodes,
	toQueryVectorKey,
	VISITOR_EMBEDDING_LIMIT,
} from "./podcastEpisodeSearch"

// a query vector, and the proxy's spent-budget rejection
const QUERY_VECTOR = [0.6, 0.8]
const BUDGET_REJECTION = {
	statusCode: 429,
	responseBody: '{"error":{"message":"Budget has been exceeded!","type":"budget_exceeded","code":"429"}}',
}

// the public key, put back after each test
const restorePublicKeySetting = saveEnvSettings(["LITELLM_PUBLIC_KEY"])

// the Redis values each test stores, and the embedding spy
let storedValueByKey: Map<string, string>
let embedRetrievalQuerySpy: ReturnType<typeof spyOn<typeof retrieveDocs, "embedRetrievalQuery">>

// one Redis per test, an embedding that returns the query vector, and a quiet console
beforeEach(() => {
	storedValueByKey = stubRedisClient()
	embedRetrievalQuerySpy = spyOn(retrieveDocs, "embedRetrievalQuery").mockResolvedValue(QUERY_VECTOR)
	spyOn(console, "error").mockImplementation(() => {})
})

// everything back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	restorePublicKeySetting()
	mock.restore()
})

// a matched row in the column order the match reads select, with a distance on a meaning match
function toMatchRow(podcastEpisodeId: string, distance?: number): unknown[] {
	const matchFields = [podcastEpisodeId, `Episode ${podcastEpisodeId}`, 2026, 1, "topic-1", "Agents"]
	return distance === undefined ? matchFields : [...matchFields, distance]
}

// whether a sent query is the text match read
function isTextMatchRead(sentQuery: SentQuery): boolean {
	return sentQuery.text.includes('from "episodes" inner join "topics"') && sentQuery.text.includes("like")
}

// whether a sent query is the meaning match read
function isMeaningMatchRead(sentQuery: SentQuery): boolean {
	return sentQuery.text.includes('from "episode_vectors"')
}

// stub the pool with these text and meaning matches, and a free user's access row
function stubMatches(textMatchRows: unknown[][], meaningMatchRows: unknown[][] = []): SentQuery[] {
	return stubConnectionPool((sentQuery) => {
		// the matches
		if (isTextMatchRead(sentQuery)) {
			return textMatchRows
		}
		if (isMeaningMatchRead(sentQuery)) {
			return meaningMatchRows
		}

		// the user's access, and no rows for anything else
		return sentQuery.text.includes('"budget_override_cents" from "users"') ? [FREE_USER_ACCESS_ROW] : []
	})
}

test("a query shorter than the minimum sends no query", async () => {
	const sentQueries = stubMatches([])
	expect(await searchPodcastEpisodes({ userId: null, query: " a ", clientAddress: null })).toEqual([])
	expect(sentQueries).toHaveLength(0)
})

test("the text match orders title matches first, then the newest, under a visitor's view rules", async () => {
	const sentQueries = stubMatches([toMatchRow("episode-1")])
	await searchPodcastEpisodes({ userId: null, query: "Agents", clientAddress: null })

	// the published title and description matches, title matches first and then the newest
	const textMatchRead = sentQueries.find(isTextMatchRead) as SentQuery
	expect(textMatchRead.text).toContain('"episodes"."status" = $')
	expect(textMatchRead.text).toContain('(lower("episodes"."title") like $')
	expect(textMatchRead.text).toContain('or lower("episodes"."description") like $')
	expect(textMatchRead.text).toContain('order by (lower("episodes"."title") like $')
	expect(textMatchRead.text).toContain(') desc, "episodes"."published_at" desc')
	expect(textMatchRead.values).toContain("%agents%")

	// a visitor sees a listed public topic's episodes alone
	expect(textMatchRead.text).toContain('"topics"."visibility" = $')
	expect(textMatchRead.text).not.toContain('"subscriptions"')
})

test("a user's view rules add their topics and an invite topic's episodes published after they subscribed", async () => {
	const sentQueries = stubMatches([])
	await searchPodcastEpisodes({ userId: "user-1", query: "agents", clientAddress: null })

	// the user's own and their teams' topics, and the invite topic's subscription gate on the publish time
	const textMatchRead = sentQueries.find(isTextMatchRead) as SentQuery
	expect(textMatchRead.text).toContain('"topics"."owner_id" = $')
	expect(textMatchRead.text).toContain('from "team_members"')
	expect(textMatchRead.text).toContain('"episodes"."published_at" > "subscriptions"."created_at"')
	expect(textMatchRead.values).toContain("user-1")
})

test("a query under three characters gets its text matches alone and embeds nothing", async () => {
	// a two-character query, one text match, and a public key to embed with
	Bun.env.LITELLM_PUBLIC_KEY = "public-key"
	const sentQueries = stubMatches([toMatchRow("e1")])
	const podcastEpisodeSearchResults = await searchPodcastEpisodes({ userId: null, query: "ai", clientAddress: null })

	// the text match alone, with no embedding and no meaning match read
	expect(podcastEpisodeSearchResults.map((podcastEpisodeSearchResult) => podcastEpisodeSearchResult.id)).toEqual(["e1"])
	expect(embedRetrievalQuerySpy).not.toHaveBeenCalled()
	expect(sentQueries.some(isMeaningMatchRead)).toBe(false)
})

test("a full list of text matches embeds nothing and reads no meaning match", async () => {
	const textMatchRows = ["e1", "e2", "e3", "e4", "e5"].map((podcastEpisodeId) => toMatchRow(podcastEpisodeId))
	const sentQueries = stubMatches(textMatchRows)
	const podcastEpisodeSearchResults = await searchPodcastEpisodes({
		userId: null,
		query: "agents",
		clientAddress: null,
	})

	// five text matches, each with its topic and its page path, and no embedding
	expect(podcastEpisodeSearchResults).toHaveLength(5)
	expect(podcastEpisodeSearchResults[0]).toEqual({
		id: "e1",
		title: "Episode e1",
		topicName: "Agents",
		pagePath: "/topics/topic-1/agents/episodes/2026/1",
	})
	expect(embedRetrievalQuerySpy).not.toHaveBeenCalled()
	expect(sentQueries.some(isMeaningMatchRead)).toBe(false)
})

test("the nearest by meaning fill the rest from a cached vector, leaving out the text matches and far episodes", async () => {
	// two text matches, a cached query vector, and two meaning matches, one near and one too far
	storedValueByKey.set(toQueryVectorKey("agents"), JSON.stringify(QUERY_VECTOR))
	const sentQueries = stubMatches(
		[toMatchRow("e1"), toMatchRow("e2")],
		[toMatchRow("near", 0.3), toMatchRow("far", 0.7)],
	)
	const podcastEpisodeSearchResults = await searchPodcastEpisodes({
		userId: null,
		query: "Agents",
		clientAddress: null,
	})

	// the text matches, then the near meaning match, with no embedding
	expect(podcastEpisodeSearchResults.map((podcastEpisodeSearchResult) => podcastEpisodeSearchResult.id)).toEqual([
		"e1",
		"e2",
		"near",
	])
	expect(embedRetrievalQuerySpy).not.toHaveBeenCalled()

	// the meaning match leaves out the text matches, ranks by distance from the vector, and reads the three left
	const meaningMatchRead = sentQueries.find(isMeaningMatchRead) as SentQuery
	expect(meaningMatchRead.text).toContain('"episodes"."id" not in ($')
	expect(meaningMatchRead.text).toContain('order by "episode_vectors"."embedding" <=> $')
	expect(meaningMatchRead.values).toEqual(expect.arrayContaining(["e1", "e2", JSON.stringify(QUERY_VECTOR), 3]))

	// the visitor's read checks the vector's saved public and shown flag, then the topic itself
	expect(meaningMatchRead.text).toContain('("episode_vectors"."is_topic_public_and_shown" and')
	expect(meaningMatchRead.text).toContain('"topics"."visibility" = $')
})

test("a query's vector is cached once under its lowercased words", async () => {
	// the same words with other capitals and spacing share one key
	expect(toQueryVectorKey("  Poetry   LOVERS ")).toBe(toQueryVectorKey("poetry lovers"))
	expect(toQueryVectorKey("poetry lovers")).not.toBe(toQueryVectorKey("poetry"))

	// a user's first search embeds on their own key and caches the vector, and the second reads the cache
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("user-key")
	expect(await loadQueryVector({ userId: "user-1", query: "Poetry lovers", clientAddress: null })).toEqual(QUERY_VECTOR)
	expect(await loadQueryVector({ userId: "user-1", query: "poetry  lovers", clientAddress: null })).toEqual(
		QUERY_VECTOR,
	)
	expect(embedRetrievalQuerySpy).toHaveBeenCalledTimes(1)
	expect(embedRetrievalQuerySpy).toHaveBeenCalledWith("Poetry lovers", "user-key")
	expect(storedValueByKey.get(toQueryVectorKey("poetry lovers"))).toBe(JSON.stringify(QUERY_VECTOR))
})

test("a visitor embeds on the public key within the address's rate limit, and over it gets text matches", async () => {
	Bun.env.LITELLM_PUBLIC_KEY = "public-key"

	// the visitor's embeddings up to the limit run on the public key
	for (let i = 0; i < VISITOR_EMBEDDING_LIMIT; i++) {
		await loadQueryVector({ userId: null, query: `query ${i}`, clientAddress: "203.0.113.9" })
	}
	expect(embedRetrievalQuerySpy).toHaveBeenCalledTimes(VISITOR_EMBEDDING_LIMIT)
	expect(embedRetrievalQuerySpy).toHaveBeenLastCalledWith(`query ${VISITOR_EMBEDDING_LIMIT - 1}`, "public-key")

	// the next uncached search is over the limit: the route returns the text match with a 200 and embeds nothing
	stubMatches([toMatchRow("e1")])
	const routeRequest = new Request("http://localhost/episodes/search?q=new%20query", {
		headers: { "x-forwarded-for": "203.0.113.9" },
	})
	const routeResponse = await podcastEpisodeSearchRoute.request(routeRequest)
	expect(routeResponse.status).toBe(200)
	expect(((await routeResponse.json()) as { podcastEpisodes: { id: string }[] }).podcastEpisodes).toEqual([
		expect.objectContaining({ id: "e1" }),
	])
	expect(embedRetrievalQuerySpy).toHaveBeenCalledTimes(VISITOR_EMBEDDING_LIMIT)
})

test("a visitor with no public key embeds nothing and counts no rate limit hit", async () => {
	delete Bun.env.LITELLM_PUBLIC_KEY
	const incrementRateLimitWindowSpy = spyOn(redisRateLimits, "incrementRateLimitWindow")
	expect(await loadQueryVector({ userId: null, query: "agents", clientAddress: "203.0.113.9" })).toBeNull()
	expect(embedRetrievalQuerySpy).not.toHaveBeenCalled()
	expect(incrementRateLimitWindowSpy).not.toHaveBeenCalled()
})

test("a spent key returns no vector without a report, and any other failure is reported", async () => {
	// a spent public key
	Bun.env.LITELLM_PUBLIC_KEY = "public-key"
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	embedRetrievalQuerySpy.mockRejectedValueOnce(BUDGET_REJECTION)
	expect(await loadQueryVector({ userId: null, query: "agents", clientAddress: null })).toBeNull()
	expect(reportErrorSpy).not.toHaveBeenCalled()

	// a failed embedding
	embedRetrievalQuerySpy.mockRejectedValueOnce(new Error("proxy down"))
	expect(await loadQueryVector({ userId: null, query: "robots", clientAddress: null })).toBeNull()
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
})

test("a full rate limit window counts in Redis under the visitor's address", async () => {
	// one embedding counts one hit under the address's key
	Bun.env.LITELLM_PUBLIC_KEY = "public-key"
	const incrementRateLimitWindowSpy = spyOn(redisRateLimits, "incrementRateLimitWindow")
	await loadQueryVector({ userId: null, query: "agents", clientAddress: "203.0.113.9" })
	expect(incrementRateLimitWindowSpy).toHaveBeenCalledWith(
		"rate-limit:podcast-episode-search:address:203.0.113.9",
		60_000,
	)

	// a cached query counts nothing
	await loadQueryVector({ userId: null, query: "agents", clientAddress: "203.0.113.9" })
	expect(incrementRateLimitWindowSpy).toHaveBeenCalledTimes(1)
})
