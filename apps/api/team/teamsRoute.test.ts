// team route tests: an unchecked avatar over a team's avatar is named on the team's page to the leader who uploaded it,
// and to nobody else
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import * as uncheckedImagesDb from "@carlnotes/db/uncheckedImages"
import { toSignedInApp } from "../testSession"
import * as teamPage from "./teamPage"
import { teamsRoute } from "./teamsRoute"

// put every spy back after each test
afterEach(() => {
	mock.restore()
})

// the role each signed-in user has on team-1. anyone else, and a visitor, has none
const TEAM_ROLE_BY_USER_ID: Record<string, "leader" | "member"> = {
	"leader-1": "leader",
	"leader-2": "leader",
	"member-1": "member",
}

// team-1's page as the given user reads it, or as a visitor for null
async function readTeamPage(userId: string | null): Promise<{ response: Response; team: TeamPageResponse }> {
	const app = userId ? toSignedInApp(teamsRoute, userId) : teamsRoute
	const response = await app.request("/teams/team-1/page")
	return { response, team: (await response.clone().json()) as TeamPageResponse }
}

test("an unchecked team avatar is named on the team's page to the leader who uploaded it alone", async () => {
	// a public team with a published avatar, and leader-1's unchecked upload
	spyOn(teamPage, "loadTeamPage").mockImplementation(async (userId) => ({
		status: "visible",
		team: {
			teamId: "team-1",
			avatarVersion: "published-version",
			role: TEAM_ROLE_BY_USER_ID[userId ?? ""] ?? null,
		} as TeamPageResponse,
	}))
	const loadUncheckedImageSpy = spyOn(uncheckedImagesDb, "loadUncheckedImageForUploader").mockImplementation(
		async (_uncheckedImageSubject, userId) =>
			userId === "leader-1"
				? ({ avatarKey: "avatars/teams/team-1/unchecked-version.png" } as uncheckedImagesDb.UncheckedImageRow)
				: null,
	)

	// the uploader reads the unchecked avatar's version beside the published one, in a response that names no shared
	// cache
	const uploaderPage = await readTeamPage("leader-1")
	expect(uploaderPage.team).toMatchObject({
		avatarVersion: "published-version",
		uncheckedAvatarVersion: "unchecked-version",
	})
	expect(uploaderPage.response.headers.get("cdn-cache-control")).toBeNull()
	expect(uploaderPage.response.headers.get("cache-tag")).toBeNull()

	// a second leader, a member, and a visitor each read the published avatar alone
	for (const userId of ["leader-2", "member-1", null]) {
		const { team } = await readTeamPage(userId)
		expect(team.avatarVersion).toBe("published-version")
		expect(team.uncheckedAvatarVersion).toBeUndefined()
	}

	// only the two leaders' reads looked for an unchecked image
	expect(loadUncheckedImageSpy.mock.calls).toEqual([
		[{ subjectKind: "teamAvatar", subjectId: "team-1" }, "leader-1"],
		[{ subjectKind: "teamAvatar", subjectId: "team-1" }, "leader-2"],
	])
})
