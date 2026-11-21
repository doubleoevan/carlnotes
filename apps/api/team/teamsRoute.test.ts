// team route tests: an unchecked avatar over a team's avatar is named on the team's page to the leader who uploaded it,
// and to nobody else. a visitor's page read is served from the team's copy, and a user's read and a gate never fill it
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as uncheckedImagesDb from "@carlnotes/db/uncheckedImages"
import { toVisitorTeamPageKey } from "@carlnotes/db/visitorPageCaches"
import { toTestPageHead } from "../pageReadTestFixtures"
import * as pageHead from "../share/pageHead"
import { toSignedInApp } from "../testSession"
import * as teamPage from "./teamPage"
import type { TeamPageAccess } from "./teamPageAccess"
import * as teamPageAccess from "./teamPageAccess"
import { teamsRoute } from "./teamsRoute"

// the team page's head, which these tests do not build from rows, and what each reader is to the public team
beforeEach(() => {
	spyOn(pageHead, "toTeamPageHeadFromPage").mockReturnValue(toTestPageHead("Roasters Franchise"))
	spyOn(teamPageAccess, "loadTeamPageAccess").mockImplementation(async (userId) => ({
		team: { id: "team-1", name: "Roasters Franchise", isPublic: true } as TeamPageAccess["team"],
		role: TEAM_ROLE_BY_USER_ID[userId ?? ""] ?? null,
		hasRequestedToJoin: false,
		isInvited: false,
		canOpen: true,
	}))
})

// put every spy and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
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

test("a visitor's team page read is built once into the team's copy, and a user's read and a gate store nothing", async () => {
	// a public team's page, and one Redis
	const storedValueByKey = stubRedisClient()
	const loadTeamPageSpy = spyOn(teamPage, "loadTeamPage").mockImplementation(async (userId) => ({
		status: "visible",
		team: { teamId: "team-1", role: TEAM_ROLE_BY_USER_ID[userId ?? ""] ?? null } as TeamPageResponse,
	}))

	// a user's read is built for them and stores nothing
	const memberPage = await readTeamPage("member-1")
	expect(memberPage.team.role).toBe("member")
	expect(storedValueByKey.has(toVisitorTeamPageKey("team-1"))).toBe(false)

	// two visitors share one build, which holds the head and no role
	const firstVisitorPage = await readTeamPage(null)
	const secondVisitorPage = await readTeamPage(null)
	expect(loadTeamPageSpy).toHaveBeenCalledTimes(2)
	expect(firstVisitorPage.team).toEqual(secondVisitorPage.team)
	expect(firstVisitorPage.team.role).toBeNull()
	expect(firstVisitorPage.team.head?.title).toBe("Roasters Franchise")
	expect(firstVisitorPage.response.headers.get("cache-control")).toBe("private, no-cache")

	// a private team's gate is returned and never stored
	storedValueByKey.clear()
	loadTeamPageSpy.mockResolvedValue({ status: "gated", teamName: "Secret", hasRequestedToJoin: false })
	expect((await readTeamPage(null)).response.status).toBe(403)
	expect(storedValueByKey.has(toVisitorTeamPageKey("team-1"))).toBe(false)
})

// a public team with eight Topic Posts: one full page of six and a second page of two
const TEAM_TOPIC_POST_IDS = ["post-1", "post-2", "post-3", "post-4", "post-5", "post-6", "post-7", "post-8"]

// stub team-1's page build with its eight Topic Posts, returning the build's spy
function stubTeamPageWithTopicPosts(): ReturnType<typeof spyOn> {
	stubRedisClient()
	return spyOn(teamPage, "loadTeamPage").mockResolvedValue({
		status: "visible",
		team: { teamId: "team-1", topicPostCards: TEAM_TOPIC_POST_IDS.map((id) => ({ id })) } as TeamPageResponse,
	})
}

test("a team page read that asks for no pages holds every Topic Post, and a paged read holds the page it names", async () => {
	stubTeamPageWithTopicPosts()

	// the whole list, as a released app reads it
	const wholeTeamPage = (await (await teamsRoute.request("/teams/team-1/page")).json()) as TeamPageResponse
	expect(wholeTeamPage.topicPostCards.map(({ id }) => id)).toEqual(TEAM_TOPIC_POST_IDS)
	expect(wholeTeamPage.topicPostCardsPage).toBeUndefined()

	// the second page, with where it sits
	const pagedResponse = await teamsRoute.request("/teams/team-1/page?paged=1&topicPostsPage=1")
	const pagedTeamPage = (await pagedResponse.json()) as TeamPageResponse
	expect(pagedTeamPage.topicPostCards.map(({ id }) => id)).toEqual(["post-7", "post-8"])
	expect(pagedTeamPage.topicPostCardsPage).toEqual({ page: 1, totalCount: 8 })
})

test("a later page of a team's Topic Posts is cut from the copy for a visitor and built for a member", async () => {
	const loadTeamPageSpy = stubTeamPageWithTopicPosts()

	// a visitor's page, and a second page from the copy the first filled
	const visitorResponse = await teamsRoute.request("/teams/team-1/topic-posts?page=1")
	expect(await visitorResponse.json()).toEqual({ topicPosts: [{ id: "post-7" }, { id: "post-8" }], totalCount: 8 })
	await teamsRoute.request("/teams/team-1/topic-posts?page=0")
	expect(loadTeamPageSpy.mock.calls.map(([userId]: [string | null]) => userId)).toEqual([null])

	// a member's page is built for them
	const memberResponse = await toSignedInApp(teamsRoute, "member-1").request("/teams/team-1/topic-posts?page=0")
	expect(((await memberResponse.json()) as { topicPosts: unknown[] }).topicPosts).toHaveLength(6)
	expect(loadTeamPageSpy.mock.calls.at(-1)?.[0]).toBe("member-1")
})

test("a later page of a gated team's Topic Posts is not found", async () => {
	stubTeamPageWithTopicPosts().mockResolvedValue({ status: "gated", teamName: "Secret", hasRequestedToJoin: false })
	expect((await teamsRoute.request("/teams/team-1/topic-posts?page=0")).status).toBe(404)
})
