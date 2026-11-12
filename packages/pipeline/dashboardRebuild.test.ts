// the Dashboard rebuild: a topic made private takes its owner's snapshots down at once, purges their edge copies, and
// starts their rebuilds
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as edgePurge from "@carlnotes/server/edgePurge"
import { rebuildTopicDashboards } from "./dashboardRebuild"
import * as temporalClient from "./temporalClient"

afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

test("a personal topic's change deletes, purges, and rebuilds its owner's Topic and Podcast Dashboards", async () => {
	const sentQueries = stubConnectionPool()
	const purgeSpy = spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue()
	const startSpy = spyOn(temporalClient, "startDashboardRebuildWorkflow").mockResolvedValue()
	await rebuildTopicDashboards({ ownerId: "user-1", teamId: null }, { ownerId: "user-1", teamId: null })

	// each Dashboard once: its snapshots deleted, its tag purged, and its rebuild started
	const snapshotDeletes = sentQueries.filter(({ text }) => text.startsWith('delete from "dashboard_snapshots"'))
	expect(snapshotDeletes.map(({ values }) => values)).toEqual([
		["topicDashboard", "user-1"],
		["podcastDashboard", "user-1"],
	])
	expect(purgeSpy.mock.calls).toEqual([["dashboard:topicDashboard:user-1"], ["dashboard:podcastDashboard:user-1"]])
	expect(startSpy.mock.calls.map(([subject]) => subject)).toEqual([
		{ dashboardKind: "topicDashboard", subjectId: "user-1" },
		{ dashboardKind: "podcastDashboard", subjectId: "user-1" },
	])
})

test("a team topic's change rebuilds the team's Team Dashboard, and a failed start fails nothing", async () => {
	stubConnectionPool()
	spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue()
	const startSpy = spyOn(temporalClient, "startDashboardRebuildWorkflow").mockRejectedValue(new Error("down"))
	await rebuildTopicDashboards({ ownerId: "user-1", teamId: "team-1" })
	expect(startSpy.mock.calls.map(([subject]) => subject)).toEqual([
		{ dashboardKind: "teamDashboard", subjectId: "team-1" },
	])
})
