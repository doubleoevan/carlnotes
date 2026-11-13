// what list_teams and read_team return: the caller's teams, and a team's page with its members, topics, and notes, and
// for a member the room's latest messages, with what people wrote fenced as untrusted
import type { ChatRoomMessagePage } from "@carlnotes/contracts/chat"
import type { NotesResponse } from "@carlnotes/contracts/notes"
import { toTeamPath } from "@carlnotes/contracts/seo"
import { SITE_URL } from "@carlnotes/contracts/site"
import type { TeamPageResponse, TeamSummary } from "@carlnotes/contracts/teams"
import { toUntrustedFence } from "@carlnotes/models/prompts/write"
import { type McpNote, toMcpNote } from "./noteResults"
import {
	MCP_PAGE_MAX_CHARS,
	type McpPage,
	type McpSection,
	type McpTopicTableRow,
	packPage,
	toFencedNullable,
	toMcpSection,
	toMcpTopicTableRow,
	UNTRUSTED_TEXT_NOTICE,
} from "./results"

// the most characters that each of a team page's members, topics, and notes returns
const TEAM_SECTION_MAX_CHARS = 8_000

// a team as list_teams returns it
type McpTeam = Pick<TeamSummary, "teamId" | "role" | "isPublic" | "memberCount" | "topicCount"> & {
	name: string
	description: string | null
	url: string
}

// one room message as the model reads it
type McpChatRoomMessage = {
	id: number
	authorUsername: string
	replyToChatMessageId: number | null
	content: string
	createdAt: string
}

// a team page as read_team returns it
type McpTeamPage = {
	notice: string
	teamId: string
	name: string
	description: string | null
	// what the caller is to the team, and the team's link
	isPublic: boolean
	role: TeamPageResponse["role"]
	hasRequestedToJoin: boolean
	pageUrl: string
	// the lists the page shows, each limited, and the members who keep off the public list
	members: McpSection<{ userId: string; username: string; role: string; isActive: boolean }>
	hiddenMemberCount: number
	topics: McpSection<McpTopicTableRow>
	notes: McpSection<McpNote>
	// the room's latest messages, newest last, and the cursor that reads the ones above, null for a non-member
	room: { messages: McpChatRoomMessage[]; earlierCursor: string | null } | null
}

/**
 * Returns the caller's teams as the model reads them, paged under the result limit, with their names fenced.
 */
export function toMcpTeamsPage(teamSummaries: TeamSummary[], offset: number): { notice: string } & McpPage<McpTeam> {
	// each team's name and description are someone's words
	const toFencedText = toUntrustedFence()
	const mcpTeams = teamSummaries.map((teamSummary) => ({
		teamId: teamSummary.teamId,
		name: toFencedText(teamSummary.name),
		description: toFencedNullable(toFencedText, teamSummary.description),
		// the caller's role, and the counts the teams page shows
		role: teamSummary.role,
		isPublic: teamSummary.isPublic,
		memberCount: teamSummary.memberCount,
		topicCount: teamSummary.topicCount,
		url: `${SITE_URL}${toTeamPath(teamSummary.teamId)}`,
	}))
	return { notice: UNTRUSTED_TEXT_NOTICE, ...packPage(mcpTeams, offset, MCP_PAGE_MAX_CHARS) }
}

/**
 * Returns a team page as the model reads it: the header, the members, topics, and notes the page shows, each limited,
 * and for a member the room's latest messages that fit in what is left of the result limit.
 */
export function toMcpTeamPage({
	teamPage,
	notesResponse,
	chatMessagePage,
}: {
	teamPage: TeamPageResponse
	notesResponse: NotesResponse | null
	chatMessagePage: ChatRoomMessagePage | null
}): McpTeamPage {
	// the names, descriptions, and messages are someone's words
	const toFencedText = toUntrustedFence()
	const mcpTeamPage: McpTeamPage = {
		notice: UNTRUSTED_TEXT_NOTICE,
		teamId: teamPage.teamId,
		name: toFencedText(teamPage.name),
		description: toFencedNullable(toFencedText, teamPage.description),
		// what the caller is to the team
		isPublic: teamPage.isPublic,
		role: teamPage.role,
		hasRequestedToJoin: teamPage.hasRequestedToJoin,
		pageUrl: `${SITE_URL}${toTeamPath(teamPage.teamId)}`,
		// the members, topics, and notes the page shows, each limited
		members: toMcpSection(
			teamPage.members.map((member) => ({
				userId: member.userId,
				username: toFencedText(member.username),
				role: member.role,
				isActive: member.isActive,
			})),
			TEAM_SECTION_MAX_CHARS,
		),
		hiddenMemberCount: teamPage.hiddenMemberCount,
		topics: toMcpSection(
			teamPage.topics.map((topic) => toMcpTopicTableRow(topic, toFencedText)),
			TEAM_SECTION_MAX_CHARS,
		),
		notes: toMcpSection(
			(notesResponse?.notes ?? []).map((note) => toMcpNote(note, toFencedText)),
			TEAM_SECTION_MAX_CHARS,
		),
		room: null,
	}

	// the room gets what the rest left of the result limit
	if (!chatMessagePage) {
		return mcpTeamPage
	}
	const roomMaxChars = MCP_PAGE_MAX_CHARS - JSON.stringify(mcpTeamPage).length
	return { ...mcpTeamPage, room: toMcpTeamRoom(chatMessagePage, roomMaxChars, toFencedText) }
}

// the newest room messages that fit the budget, newest last, and the cursor above the oldest one kept if more remain
function toMcpTeamRoom(
	chatMessagePage: ChatRoomMessagePage,
	maxChars: number,
	toFencedText: (text: string) => string,
): NonNullable<McpTeamPage["room"]> {
	// each message's author and words fenced
	const mcpChatRoomMessages = chatMessagePage.chatMessages.map((chatMessage) => ({
		id: chatMessage.id,
		authorUsername: toFencedText(chatMessage.authorUsername),
		replyToChatMessageId: chatMessage.replyToChatMessageId,
		content: toFencedText(chatMessage.content),
		createdAt: chatMessage.createdAt,
	}))

	// keep from the newest back while they fit, then put them back in order
	const keptChatRoomMessages = packPage(mcpChatRoomMessages.toReversed(), 0, maxChars).items.toReversed()
	const [oldestMessage] = keptChatRoomMessages
	const hasEarlierMessages =
		keptChatRoomMessages.length < mcpChatRoomMessages.length || chatMessagePage.hasEarlierChatMessages
	return {
		messages: keptChatRoomMessages,
		earlierCursor: hasEarlierMessages && oldestMessage ? String(oldestMessage.id) : null,
	}
}
