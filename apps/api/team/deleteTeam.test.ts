// team delete tests: a team deleted with nobody else on it leaves the edge with its avatar and its Team Dashboard, and
// a refused delete purges nothing
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as store from "@carlnotes/db/store"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { stubEdgePurge, toPurgedTags } from "../edgePurgeTestFixtures"
import { deleteTeam } from "./deleteTeam"

// the edge purge's settings, put back after each test with the spies, Redis, and the connection pool's own query
const restoreEnvSettings = saveEnvSettings(["CLOUDFLARE_ZONE_ID", "CLOUDFLARE_API_TOKEN"])
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
	restoreEnvSettings()
})

// the rows the stub returns for a delete's queries, with the caller's role, the locked team row, the caller as the one
// active member, a team row with no avatar, and no rows for the rest
function toSoloTeamRows({ text }: SentQuery, teamRole: string): unknown[] {
	if (text.includes('"role" from "team_members"')) {
		return [[teamRole]]
	}
	if (text.includes('"user_id" from "team_members"')) {
		return [["user-1"]]
	}

	// the locked team row, and the team row's delete with no avatar key
	if (text.includes('"id" from "teams"')) {
		return [["team-1"]]
	}
	return text.startsWith('delete from "teams"') ? [[null]] : []
}

test("a team deleted with nobody else on it purges its avatar and its Team Dashboard from the edge", async () => {
	// a leader alone on the team, with Redis and object storage stubbed
	const fetchSpy = stubEdgePurge()
	stubRedisClient()
	spyOn(store, "deleteStoredObjects").mockResolvedValue(undefined)
	stubConnectionPool((sentQuery) => toSoloTeamRows(sentQuery, "leader"))

	// the delete removes the team row and purges both of the team's tags
	expect(await deleteTeam("user-1", "team-1")).toEqual({ status: "deleted" })
	expect(toPurgedTags(fetchSpy)).toEqual(["dashboard:teamDashboard:team-1", "team-avatar:team-1"])
})

test("a member's delete purges nothing", async () => {
	const fetchSpy = stubEdgePurge()
	stubConnectionPool((sentQuery) => toSoloTeamRows(sentQuery, "member"))
	expect(await deleteTeam("user-1", "team-1")).toEqual({ status: "forbidden" })
	expect(toPurgedTags(fetchSpy)).toEqual([])
})
