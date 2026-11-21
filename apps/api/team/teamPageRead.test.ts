// team page read tests: a signed-in non-member of a public team who asks for it shares the visitors' copy with their own
// part, and a member's read and a read that asks for no shared copy are built for the reader
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { toVisitorTeamPageKey } from "@carlnotes/db/visitorPageCaches"
import * as chatMentions from "../chat/mentions"
import { toTestPageHead } from "../pageReadTestFixtures"
import * as pageHead from "../share/pageHead"
import * as topicsUserStates from "../topic/topicsUserState"
import * as uncheckedImageOverlays from "../uncheckedImageOverlays"
import * as userBlocks from "../userBlocks"
import * as teamPage from "./teamPage"
import type { TeamPageAccess } from "./teamPageAccess"
import * as teamPageAccess from "./teamPageAccess"
import { readTeamPageRead } from "./teamPageRead"

// a public team's page as the visitors' copy holds it
const TEAM_PAGE = { teamId: "team-1", topics: [], topicCards: [] } as unknown as TeamPageResponse
const TEAM = { id: "team-1", isPublic: true } as TeamPageAccess["team"]
const TOPICS_USER_STATE = { teamByTopicId: {}, isEmailEnabledByTopicId: {}, reactionCountByTopicId: null }

// the Redis map, and the page loader's spy, which counts the page builds and the reader each is built for
let storedValueByKey: Map<string, string>
let loadTeamPageSpy: ReturnType<typeof spyOn>

// a fresh Redis, the team's page and head, and the reader's own part before each test
beforeEach(() => {
	storedValueByKey = stubRedisClient()
	loadTeamPageSpy = spyOn(teamPage, "loadTeamPage").mockResolvedValue({ status: "visible", team: TEAM_PAGE })
	spyOn(pageHead, "toTeamPageHeadFromPage").mockReturnValue(toTestPageHead("the team"))
	spyOn(uncheckedImageOverlays, "overlayUncheckedTeamAvatar").mockImplementation(async (team) => team)

	// the reader in no user block, with no chat mention, and the topics' part
	spyOn(userBlocks, "loadUserBlocksBetween").mockResolvedValue({
		blockedUserIds: new Set(),
		userBlockUserIds: new Set(),
	})
	spyOn(chatMentions, "loadTeamChatMentions").mockResolvedValue(new Map())
	spyOn(topicsUserStates, "loadTopicsUserState").mockResolvedValue(TOPICS_USER_STATE)
})

// the Redis client and every spy back after each test
afterEach(() => {
	restoreRedisClient()
	mock.restore()
})

// what the reader is to the team: a role, a join request, and a pending invite
function stubTeamPageAccess(access: { role?: "member" | null; hasRequestedToJoin?: boolean }): void {
	spyOn(teamPageAccess, "loadTeamPageAccess").mockResolvedValue({
		team: TEAM,
		role: access.role ?? null,
		hasRequestedToJoin: access.hasRequestedToJoin ?? false,
		isInvited: false,
		canOpen: true,
	})
}

test("a non-member who asks for it shares the copy with their join request beside it", async () => {
	stubTeamPageAccess({ hasRequestedToJoin: true })
	const teamPageResult = await readTeamPageRead({ userId: "reader-1", teamId: "team-1", isUserStateAsked: true })

	// the copy is built once for no one and stored, and the reader's part rides beside it
	expect(loadTeamPageSpy.mock.calls.map(([userId]: [string | null]) => userId)).toEqual([null])
	expect(storedValueByKey.has(toVisitorTeamPageKey("team-1"))).toBe(true)
	expect(teamPageResult.status === "visible" && teamPageResult.team.userState).toEqual({
		...TOPICS_USER_STATE,
		hasRequestedToJoin: true,
		chatMentions: [],
	})
})

test("a member's read, and a read that asks for no shared copy, are built for the reader and store nothing", async () => {
	// a member who asks for the shared copy still reads their own page
	stubTeamPageAccess({ role: "member" })
	await readTeamPageRead({ userId: "member-1", teamId: "team-1", isUserStateAsked: true })

	// a released app's read asks for no shared copy
	stubTeamPageAccess({})
	await readTeamPageRead({ userId: "reader-1", teamId: "team-1" })
	expect(loadTeamPageSpy.mock.calls.map(([userId]: [string | null]) => userId)).toEqual(["member-1", "reader-1"])
	expect(storedValueByKey.has(toVisitorTeamPageKey("team-1"))).toBe(false)
})
