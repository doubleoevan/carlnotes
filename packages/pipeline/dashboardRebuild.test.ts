// the Dashboard rebuild: a topic made private takes its owner's snapshots down at once, purges their edge copies, and
// starts their rebuilds, with Redis unreachable too. a publication starts the rebuilds and leaves the snapshots, the
// share images, and the edge copies in place, so a rebuild that fails leaves the last snapshots readable, and starts
// a new snapshot generation, so a build that loaded before it skips its write
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { readDashboardSnapshotGeneration } from "@carlnotes/db/dashboardSnapshotRows"
import { restoreRedisClient, stubRedisClient, stubUnreachableRedisClient } from "@carlnotes/db/redisClientStub"
import * as edgePurge from "@carlnotes/server/edgePurge"
import * as monitoring from "@carlnotes/server/monitoring"
import {
	rebuildTopicDashboards,
	rebuildTopicDashboardsAfterPublication,
	rebuildTopicDashboardsById,
} from "./dashboardRebuild"
import * as temporalClient from "./temporalClient"

// the Dashboards of topic-1, which user-1 owns on team-1
const TOPIC_DASHBOARD_SUBJECTS = [
	{ dashboardKind: "teamDashboard", subjectId: "team-1" },
	{ dashboardKind: "topicDashboard", subjectId: "user-1" },
	{ dashboardKind: "podcastDashboard", subjectId: "user-1" },
]

// start each test on an empty in-memory Redis
beforeEach(() => {
	stubRedisClient()
})

// put the connection pool, the Redis client, and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

// stub the pool with topic-1's owner and team, and return each query sent
function stubTopicRead(): SentQuery[] {
	return stubConnectionPool(({ text }) => (text.includes('from "topics"') ? [["user-1", "team-1"]] : []))
}

// the queries that read or write a Dashboard's snapshots
function toSnapshotQueries(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter(({ text }) => text.includes('"dashboard_snapshots"'))
}

// the values of each snapshot delete sent, one Dashboard's kind and subject each
function toSnapshotDeleteValues(sentQueries: SentQuery[]): unknown[][] {
	const snapshotDeletes = sentQueries.filter(({ text }) => text.startsWith('delete from "dashboard_snapshots"'))
	return snapshotDeletes.map(({ values }) => values)
}

// values as sorted json, which compares what the Dashboards' concurrent rebuilds did in one order
function toSortedJson(values: unknown[]): string[] {
	return values.map((value) => JSON.stringify(value)).sort()
}

test("a personal topic's change deletes, purges, and rebuilds its owner's Topic and Podcast Dashboards", async () => {
	const sentQueries = stubConnectionPool()
	const purgeSpy = spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue()
	const startSpy = spyOn(temporalClient, "startDashboardRebuildWorkflow").mockResolvedValue()
	await rebuildTopicDashboards({ ownerId: "user-1", teamId: null }, { ownerId: "user-1", teamId: null })

	// each Dashboard once: its snapshots deleted, its tag purged, and its rebuild started
	expect(toSortedJson(toSnapshotDeleteValues(sentQueries))).toEqual(
		toSortedJson([
			["topicDashboard", "user-1"],
			["podcastDashboard", "user-1"],
		]),
	)
	expect(toSortedJson(purgeSpy.mock.calls)).toEqual(
		toSortedJson([["dashboard:topicDashboard:user-1"], ["dashboard:podcastDashboard:user-1"]]),
	)
	expect(toSortedJson(startSpy.mock.calls.map(([subject]) => subject))).toEqual(
		toSortedJson([
			{ dashboardKind: "topicDashboard", subjectId: "user-1" },
			{ dashboardKind: "podcastDashboard", subjectId: "user-1" },
		]),
	)
})

test("a team topic's change rebuilds its Team Dashboard and its owner's, and a failed start fails nothing", async () => {
	stubConnectionPool()
	spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue()
	const startSpy = spyOn(temporalClient, "startDashboardRebuildWorkflow").mockRejectedValue(new Error("down"))
	await rebuildTopicDashboards({ ownerId: "user-1", teamId: "team-1" })
	expect(toSortedJson(startSpy.mock.calls.map(([subject]) => subject))).toEqual(toSortedJson(TOPIC_DASHBOARD_SUBJECTS))
})

test("a change that takes an item out of a topic deletes its Dashboards' snapshots at once, by the topic's id", async () => {
	const sentQueries = stubTopicRead()
	spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue()
	const startSpy = spyOn(temporalClient, "startDashboardRebuildWorkflow").mockResolvedValue()
	await rebuildTopicDashboardsById("topic-1")

	// the team's and the owner's Dashboards each have their snapshots deleted and their rebuild started
	expect(toSortedJson(toSnapshotDeleteValues(sentQueries))).toEqual(
		toSortedJson(TOPIC_DASHBOARD_SUBJECTS.map(({ dashboardKind, subjectId }) => [dashboardKind, subjectId])),
	)
	expect(toSortedJson(startSpy.mock.calls.map(([subject]) => subject))).toEqual(toSortedJson(TOPIC_DASHBOARD_SUBJECTS))
})

test("a publication starts the rebuilds and leaves the snapshots, share images, and edge copies in place", async () => {
	const sentQueries = stubTopicRead()
	const purgeSpy = spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue()
	const startSpy = spyOn(temporalClient, "startDashboardRebuildWorkflow").mockResolvedValue()
	await rebuildTopicDashboardsAfterPublication("topic-1")

	// nothing reads, writes, or deletes a snapshot, no share image is recorded for deletion, and no tag is purged
	expect(toSnapshotQueries(sentQueries)).toEqual([])
	expect(sentQueries.filter(({ text }) => text.includes('"pending_object_deletions"'))).toEqual([])
	expect(purgeSpy).not.toHaveBeenCalled()

	// the team's and the owner's Dashboards each start a rebuild, which replaces the snapshots as it writes
	expect(toSortedJson(startSpy.mock.calls.map(([subject]) => subject))).toEqual(toSortedJson(TOPIC_DASHBOARD_SUBJECTS))
})

test("a publication starts a new snapshot generation for each Dashboard before its rebuild starts", async () => {
	// each Dashboard's generation as its rebuild starts, with none started before the publication
	stubTopicRead()
	const [teamDashboardSubject] = TOPIC_DASHBOARD_SUBJECTS as [{ dashboardKind: "teamDashboard"; subjectId: string }]
	expect(await readDashboardSnapshotGeneration(teamDashboardSubject)).toBe("")
	const startedGenerations: (string | null)[] = []
	spyOn(temporalClient, "startDashboardRebuildWorkflow").mockImplementation(async (subject) => {
		startedGenerations.push(await readDashboardSnapshotGeneration(subject))
	})
	await rebuildTopicDashboardsAfterPublication("topic-1")

	// a build that read the generation before the publication no longer holds the current one, so it skips its write
	expect(startedGenerations).toHaveLength(3)
	expect(startedGenerations.every((startedGeneration) => Boolean(startedGeneration))).toBe(true)
})

test("a publication with Redis unreachable leaves the last snapshots, and a rebuild that cannot start is reported", async () => {
	// Redis down, with the failed connection's log quiet, and a rebuild that cannot start
	stubUnreachableRedisClient()
	spyOn(console, "error").mockImplementation(() => {})
	const sentQueries = stubTopicRead()
	const startSpy = spyOn(temporalClient, "startDashboardRebuildWorkflow").mockRejectedValue(new Error("down"))
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	await rebuildTopicDashboardsAfterPublication("topic-1")

	// the snapshots the Specials pages read are untouched
	expect(toSnapshotQueries(sentQueries)).toEqual([])

	// each failed start is reported with its Dashboard, and the publication itself fails nothing
	expect(startSpy).toHaveBeenCalledTimes(3)
	expect(toSortedJson(reportErrorSpy.mock.calls.map(([, stage, subject]) => [stage, subject]))).toEqual(
		toSortedJson(TOPIC_DASHBOARD_SUBJECTS.map((subject) => ["dashboard", subject])),
	)
})

test("a topic made private with Redis unreachable still deletes its owner's snapshots at once", async () => {
	// Redis down, so no snapshot generation starts, with the failed connection's log quiet
	stubUnreachableRedisClient()
	spyOn(console, "error").mockImplementation(() => {})
	const sentQueries = stubConnectionPool()
	spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue()
	spyOn(temporalClient, "startDashboardRebuildWorkflow").mockResolvedValue()
	await rebuildTopicDashboards({ ownerId: "user-1", teamId: null })

	// both of the owner's Dashboards lose their snapshots before any rebuild writes
	expect(toSortedJson(toSnapshotDeleteValues(sentQueries))).toEqual(
		toSortedJson([
			["topicDashboard", "user-1"],
			["podcastDashboard", "user-1"],
		]),
	)
})
