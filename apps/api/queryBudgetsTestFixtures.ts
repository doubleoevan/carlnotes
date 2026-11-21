// the query budget tests' fixtures: the stubbed connection pool and Redis each test starts from, a request through the
// api tree that counts its queries, the page read fixture with a row behind each page read's first branches, and the
// concurrent query tracker

import { spyOn } from "bun:test"
import type { PageReadKind } from "@carlnotes/contracts/pageReadRequests"
import { connectionPool } from "@carlnotes/db"
import {
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
	toSelectionRow,
	toTableRow,
} from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient } from "@carlnotes/db/redisClientStub"
import { runWithRequestMemo } from "@carlnotes/db/requestMemo"
import { teams } from "@carlnotes/db/schema/teams"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { gatedTopicColumns, namedTopicColumns } from "@carlnotes/db/topicPermissions"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { apiRoute } from "./api"
import { FIXTURE_DATE, PODCAST_EPISODE_ROW, toFullPageReadRows } from "./pageReadBudgetTestFixtures"
import { signInAs } from "./testSession"
import { stubRedisClientWithCentroid } from "./topic/relatednessTestFixtures"
import { isTopicWithOwnerRead, toTopicWithOwnerRow } from "./topic/topicTestFixtures"

// a public topic owned by someone else
export const TOPIC_ROW = toTableRow(topics, {
	id: "topic-1",
	ownerId: "owner-1",
	name: "Agents",
	prompt: "agents",
	frequency: "daily",
	scheduledTime: "09:00:00",
	scheduledDayOfWeek: "monday",
	visibility: "public",
	tags: [],
	maxTopicFindings: 10,
	subscriberCount: 3,
	isPodcastEnabled: true,
	createdAt: FIXTURE_DATE,
	updatedAt: FIXTURE_DATE,
})

// the queries the stubbed connection pool was sent, from the start of the test
let sentQueries: SentQuery[] = []

// return the topic's own read with the topic, a user's access read with a free user, and every other read with no rows
export function toBudgetQueryRows(sentQuery: SentQuery): unknown[] {
	// the topic's own read with its owner, and its own read alone
	if (isTopicWithOwnerRead(sentQuery.text)) {
		return [toTopicWithOwnerRow(TOPIC_ROW, "owner-1")]
	}
	if (sentQuery.text.includes('from "topics" where "topics"."id" = $1')) {
		return [TOPIC_ROW]
	}

	// the user's access read, and every other read
	if (sentQuery.text.includes('"budget_override_cents" from "users"')) {
		return [FREE_USER_ACCESS_ROW]
	}
	return []
}

// the speech model, which turns podcast episodes on, the secret that signs cover urls, and the page reads' edge setting,
// put back after each test
const restoreQueryBudgetSettings = saveEnvSettings([
	"PODCAST_SPEECH_MODEL",
	"BETTER_AUTH_SECRET",
	"PAGE_READS_EDGE_CACHED",
])

/**
 * Stubs one Redis with the related reads' centroid stored and one connection pool per test, with the console quiet, and
 * returns the queries the connection pool is sent.
 */
export function startQueryBudgetTest(): SentQuery[] {
	stubRedisClientWithCentroid()
	spyOn(console, "error").mockImplementation(() => {})
	return stubBudgetConnectionPool(toBudgetQueryRows)
}

/**
 * Puts the connection pool, Redis, and the query budget settings back after a test.
 */
export function endQueryBudgetTest(): void {
	restoreConnectionPool()
	restoreRedisClient()
	restoreQueryBudgetSettings()
}

/**
 * Stubs the connection pool with the given rows, and returns the queries it is sent, which requestAsUser counts.
 */
export function stubBudgetConnectionPool(toQueryRows: (sentQuery: SentQuery) => unknown[]): SentQuery[] {
	sentQueries = stubConnectionPool(toQueryRows)
	return sentQueries
}

/**
 * Requests a path through the api tree as the given user, with the request memo open as the server opens it, and
 * returns the response with how many queries the request sent.
 */
export async function requestAsUser(
	path: string,
	userId: string | null,
): Promise<{ response: Response; queryCount: number }> {
	signInAs(userId)
	const queryCountBefore = sentQueries.length
	const response = await runWithRequestMemo(() => apiRoute.request(path))
	return { response, queryCount: sentQueries.length - queryCountBefore }
}

// the ids each page read's request names on this fixture
export const PAGE_READ_PARAMS: Record<PageReadKind, Record<string, string>> = {
	profile: { userId: "owner-1" },
	team: { id: "team-1" },
	home: {},
	topic: { id: "topic-1" },
	podcastEpisode: { id: "topic-1", season: "2026", episodeNumber: "1" },
	topicPost: { id: "post-1" },
	dashboard: { dashboardKind: "topicDashboard", subjectId: "owner-1" },
}

/**
 * Returns the rows of a fixture with a row behind each page read's first branches: the person, their public topic, a
 * public team that holds it, a published podcast episode of it, and a published Topic Post on it. Any other read is
 * the budget fixture's.
 */
export function toPageReadFixtureRows(sentQuery: SentQuery): unknown[] {
	const { text } = sentQuery

	// the rows behind each page's fuller branches
	const fullPageReadRows = toFullPageReadRows(sentQuery)
	if (fullPageReadRows) {
		return fullPageReadRows
	}

	// the person, by the profile's and the Dashboard's shared user row
	if (text.includes('"profile_viewer_count" from "users" where "users"."id" = $1')) {
		return [["owner-1", "Owner", FIXTURE_DATE, null, null, null, 0]]
	}

	// the person's topics, the team's topics, and the team with no membership of a visitor
	if (text.includes('from "topics" where (("topics"."owner_id" = $1') || text.includes('"topics"."team_id" = $1 or')) {
		return [TOPIC_ROW]
	}
	if (text.includes('from "teams" left join "team_members"')) {
		return [
			[
				...toTableRow(teams, { id: "team-1", name: "Team", isPublic: true, viewerCount: 1, createdAt: FIXTURE_DATE }),
				null,
				null,
			],
		]
	}

	// the topic's preview for its head, with its owner
	if (text.startsWith('select "topics"."id", "topics"."name", "topics"."prompt", (select "scans"."scan_summary"')) {
		return [["topic-1", "Agents", "agents", null, "public", null, "owner-1", "Owner", null, null, null]]
	}

	// the published podcast episode at its page, with its page fields, its topic, its scan's start, its topic's owner,
	// and its head's topic fields
	if (text.includes('"episodes"."season" = $2')) {
		const ownerRow = ["owner-1", "Owner", null, null, null]
		return [[...PODCAST_EPISODE_ROW, null, null, null, null, ...TOPIC_ROW, FIXTURE_DATE, ...ownerRow, null, 3]]
	}

	// the podcast episode by its id, with its topic and when its scan started
	if (text.includes('left join "scans"') && text.includes('"episodes"."id" = $1')) {
		return [[...PODCAST_EPISODE_ROW, ...TOPIC_ROW, FIXTURE_DATE]]
	}

	// the person's id and the topic's gate columns, which a view POST checks before it counts
	if (text.startsWith('select "id" from "users" where "users"."id" = $1')) {
		return [["owner-1"]]
	}
	if (text.startsWith('select "id", "owner_id", "visibility", "team_id" from "topics" where "topics"."id" = $1')) {
		return [
			toSelectionRow(gatedTopicColumns, { id: "topic-1", ownerId: "owner-1", visibility: "public", teamId: null }),
		]
	}

	// the published Topic Post's access row, with no body, for its view and its counts
	const topicColumns = toSelectionRow(namedTopicColumns, {
		id: "topic-1",
		ownerId: "owner-1",
		visibility: "public",
		name: "Agents",
	})
	if (
		text.startsWith('select "topic_posts"."published_at", "topic_posts"."author_user_id", "topic_posts"."viewer_count"')
	) {
		return [[FIXTURE_DATE, "owner-1", 0, null, ...topicColumns]]
	}

	// the published Topic Post with its topic, its author with no provider photo, and its topic's saved counts
	if (text.includes('from "topic_posts" inner join "topics"') && text.includes('"topic_posts"."id" = $1')) {
		const topicPostRow = toTableRow(topicPosts, {
			id: "post-1",
			topicId: "topic-1",
			authorUserId: "owner-1",
			title: "A post",
			html: "<p>body</p>",
			publishedAt: FIXTURE_DATE,
			createdAt: FIXTURE_DATE,
			updatedAt: FIXTURE_DATE,
		})
		const authorRow = ["owner-1", "Owner", null, null, null]
		return [[...topicPostRow, ...topicColumns, null, ...authorRow, 0, 3]]
	}
	return toBudgetQueryRows(sentQuery)
}

/**
 * Stubs the connection pool with the page read fixture's rows, with podcast episodes on and cover urls signed, and
 * returns the queries it is sent.
 */
export function stubPageReadFixture(): SentQuery[] {
	Bun.env.PODCAST_SPEECH_MODEL = "test-speech-model"
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	restoreConnectionPool()
	return stubBudgetConnectionPool(toPageReadFixtureRows)
}

/**
 * Holds each stubbed query a turn of the event loop, and returns how many were in flight at most at once.
 */
export function trackMostConcurrentQueries(): () => number {
	// the stubbed query, and the queries in flight now and at most
	const stubbedQuery = connectionPool.query
	let inFlightCount = 0
	let mostConcurrentQueryCount = 0

	// each query counts itself in flight until it settles a turn later
	connectionPool.query = (async (...queryArgs: Parameters<typeof stubbedQuery>) => {
		inFlightCount += 1
		mostConcurrentQueryCount = Math.max(mostConcurrentQueryCount, inFlightCount)

		// the stubbed rows a turn later, with the query out of flight once it settles
		try {
			await new Promise((resolve) => setImmediate(resolve))
			return await (stubbedQuery as (...args: unknown[]) => Promise<unknown>).apply(connectionPool, queryArgs)
		} finally {
			inFlightCount -= 1
		}
	}) as typeof connectionPool.query

	// the most queries in flight at once so far
	return () => mostConcurrentQueryCount
}
