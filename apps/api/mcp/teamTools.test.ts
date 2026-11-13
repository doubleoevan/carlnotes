// the team read tools: a member reads the page with the room's newest messages fenced and a cursor above a cut room, a
// non-member on a public team reads the page with no room, the MCP view reads the page unfenced, a visitor sees a private team's gate alone and lists no
// teams, and a topic-bound server reads no team
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { ChatRoomMessage } from "@carlnotes/contracts/chat"
import { MCP_VIEW_META_KEY, type McpViewData } from "@carlnotes/contracts/mcpViews"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { UNTRUSTED_DATA_TAG } from "@carlnotes/models/prompts/write"
import * as roomReads from "../chat/roomReads"
import * as notePayloads from "../note/notePayloads"
import * as teamPage from "../team/teamPage"
import * as mcpViewData from "./mcpViewData"
import { BOUND_SERVER_TEXT, CONNECT_ACCOUNT_TEXT } from "./results"
import { toResultText, toToolHandler, USER, VISITOR } from "./toolTestFixtures"

// the caller's identity reads no database
beforeEach(() => {
	spyOn(mcpViewData, "loadMcpViewSession").mockResolvedValue(null)
	spyOn(mcpViewData, "loadMcpViewCardPodcastEpisodes").mockResolvedValue([])
})

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

// what read_team returns for a visible page
type ReadTeamResult = {
	members: { items: { username: string }[]; totalCount: number }
	notes: { items: unknown[] }
	room: { messages: { id: number; content: string }[]; earlierCursor: string | null } | null
}

// a public team's page with one member and one topic, as the caller with this role sees it
function toTeamPage(role: TeamPageResponse["role"]): TeamPageResponse {
	return {
		teamId: "team-1",
		name: "Roasters",
		avatarVersion: null,
		description: "We roast.",
		isPublic: true,
		role,
		hasRequestedToJoin: false,
		members: [
			{
				userId: "user-2",
				username: "vienna",
				avatarSource: null,
				avatarVersion: null,
				role: "leader",
				isMemberVisible: true,
				isActive: true,
			},
		],
		hiddenMemberCount: 0,
		chatMentions: [],
		topics: [],
		topicCards: [],
		podcastEpisodeCards: [],
		topicPostCards: [],
	}
}

// a room message with this id and words
function toChatMessage(id: number, content: string): ChatRoomMessage {
	return {
		id,
		authorUserId: "user-2",
		authorUsername: "vienna",
		authorAvatarSource: null,
		authorAvatarVersion: null,
		replyToChatMessageId: null,
		content,
		createdAt: "2026-11-01T00:00:00.000Z",
		isSpoken: false,
		attachments: [],
		linkPreviews: [],
	}
}

// a page holding no notes
function stubNoNotes(): void {
	spyOn(notePayloads, "loadNotesPayload").mockResolvedValue({
		pageName: "Roasters",
		notes: [],
		creatableVisibilities: [],
	} as never)
}

test("a member reads the newest room messages that fit, fenced, with a cursor above the oldest one kept", async () => {
	// a member's page, and a room of forty long messages
	spyOn(teamPage, "loadTeamPage").mockResolvedValue({ status: "visible", team: toTeamPage("member") })
	stubNoNotes()
	const chatMessages = Array.from({ length: 40 }, (_, i) => toChatMessage(i + 1, `message ${i + 1} `.repeat(150)))
	spyOn(roomReads, "loadChatRoomMessagePage").mockResolvedValue({
		chatMessages,
		hasEarlierChatMessages: false,
		isVoiceChatConfigured: false,
	})
	const toolResult = await toToolHandler("read_team")({ team_id: "team-1" })
	const readTeamResult = toolResult.structuredContent as ReadTeamResult

	// the members, and the newest messages last, fenced, cut under the limit with a cursor above them
	expect(readTeamResult.members.items[0]?.username).toContain(UNTRUSTED_DATA_TAG)
	const roomMessages = readTeamResult.room?.messages ?? []
	expect(roomMessages.at(-1)?.id).toBe(40)
	expect(roomMessages.length).toBeLessThan(40)
	expect(roomMessages[0]?.content).toContain(UNTRUSTED_DATA_TAG)
	expect(readTeamResult.room?.earlierCursor).toBe(String(roomMessages[0]?.id))
	expect(toResultText(toolResult).length).toBeLessThan(41_000)

	// the MCP view reads the whole page unfenced
	const { team } = (toolResult._meta?.[MCP_VIEW_META_KEY] ?? {}) as McpViewData
	expect(team?.teamPage.name).toBe("Roasters")
	expect(team?.chatMessagePage?.chatMessages).toHaveLength(40)
	expect(team?.chatMessagePage?.chatMessages[0]?.content).not.toContain(UNTRUSTED_DATA_TAG)
})

test("a non-member reads a public team's page with no room", async () => {
	spyOn(teamPage, "loadTeamPage").mockResolvedValue({ status: "visible", team: toTeamPage(null) })
	stubNoNotes()
	const roomSpy = spyOn(roomReads, "loadChatRoomMessagePage")
	const toolResult = await toToolHandler("read_team")({ team_id: "team-1" })
	expect((toolResult.structuredContent as ReadTeamResult).room).toBeNull()
	expect(roomSpy).not.toHaveBeenCalled()
})

test("a visitor sees a private team's gate alone and lists no teams", async () => {
	spyOn(teamPage, "loadTeamPage").mockResolvedValue({ status: "gated", teamName: "Secret", hasRequestedToJoin: false })
	const toolResult = await toToolHandler("read_team", VISITOR)({ team_id: "team-1" })
	expect(toolResult.structuredContent).toMatchObject({ status: "gated", hasRequestedToJoin: false })
	expect(toolResult.structuredContent).not.toHaveProperty("members")
	expect(toResultText(await toToolHandler("list_teams", VISITOR)({}))).toBe(CONNECT_ACCOUNT_TEXT)
})

test("a topic-bound server reads no team", async () => {
	const loadSpy = spyOn(teamPage, "loadTeamPage")
	const toolResult = await toToolHandler("read_team", USER, "topic-1")({ team_id: "team-1" })
	expect(toResultText(toolResult)).toBe(BOUND_SERVER_TEXT)
	expect(loadSpy).not.toHaveBeenCalled()
})
