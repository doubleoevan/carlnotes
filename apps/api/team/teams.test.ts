// team update tests: a saved update clears the team's Team Dashboard copy and purges it from the edge, and a refused
// one purges nothing
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as redis from "@carlnotes/db/redis"
import * as visitorPageCaches from "@carlnotes/db/visitorPageCaches"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { stubEdgePurge, toPurgedTags } from "../edgePurgeTestFixtures"
import { updateTeam } from "./teams"

// the edge purge's settings, put back after each test with the spies and the connection pool's own query
const restoreEnvSettings = saveEnvSettings(["CLOUDFLARE_ZONE_ID", "CLOUDFLARE_API_TOKEN"])
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
	restoreEnvSettings()
})

// a unique index's violation, as Postgres reports a rename onto a taken name
const UNIQUE_VIOLATION = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" })

// the caller leads the public team "Roasters"
function stubLeaderOfPublicTeam(): void {
	stubConnectionPool(({ text }) => {
		if (text.includes('"role" from "team_members"')) {
			return [["leader"]]
		}
		return text.startsWith('select "name", "is_public" from "teams"') ? [["Roasters", true]] : []
	})
}

test("a rename or a visibility change clears and purges the Team Dashboard, and a visibility change its page", async () => {
	const fetchSpy = stubEdgePurge()
	const deleteRedisKeysSpy = spyOn(redis, "deleteRedisKeys").mockResolvedValue(0)
	stubLeaderOfPublicTeam()

	// a team made private purges its Team Dashboard and its page in one request, and a rename its Team Dashboard alone
	expect(await updateTeam("user-1", "team-1", { isPublic: false })).toBe("saved")
	expect(await updateTeam("user-1", "team-1", { name: "Night Roasters" })).toBe("saved")
	expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith("/purge_cache"))).toHaveLength(2)
	expect(toPurgedTags(fetchSpy)).toEqual([
		"dashboard:teamDashboard:team-1",
		"dashboard:teamDashboard:team-1",
		"team:team-1",
	])
	// each edit clears the team page's copy, a visibility change with its Team Dashboard's and a rename its Team
	// Dashboard's alone
	const teamPageKey = visitorPageCaches.toVisitorTeamPageKey("team-1")
	const teamDashboardKey = visitorPageCaches.toVisitorDashboardPageKey({
		dashboardKind: "teamDashboard",
		subjectId: "team-1",
	})
	expect(deleteRedisKeysSpy.mock.calls).toEqual([
		[teamPageKey],
		[teamPageKey, teamDashboardKey],
		[teamPageKey],
		[teamDashboardKey],
	])
})

test("a description edit that keeps the name and visibility purges nothing", async () => {
	const fetchSpy = stubEdgePurge()
	stubLeaderOfPublicTeam()

	// the form sends the unchanged name and visibility with the new description
	const payload = { name: "Roasters", description: "Light roasts only", isPublic: true }
	expect(await updateTeam("user-1", "team-1", payload)).toBe("saved")
	expect(toPurgedTags(fetchSpy)).toEqual([])
})

test("an update by a member or onto a taken name purges nothing", async () => {
	const fetchSpy = stubEdgePurge()

	// a member may not update the team
	stubConnectionPool(({ text }) => (text.includes('"role" from "team_members"') ? [["member"]] : []))
	expect(await updateTeam("user-2", "team-1", { isPublic: false })).toBe("forbidden")

	// a leader's rename onto a taken name fails the team row's update
	stubConnectionPool(({ text }) => {
		if (text.startsWith('update "teams"')) {
			throw UNIQUE_VIOLATION
		}
		return text.includes('"role" from "team_members"') ? [["leader"]] : []
	})
	expect(await updateTeam("user-1", "team-1", { name: "Roasters" })).toBe("name-taken")

	// neither refused update sends a purge
	expect(toPurgedTags(fetchSpy)).toEqual([])
})
