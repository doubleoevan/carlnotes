// the team read tools: list_teams, the caller's teams, and read_team, a team's page as the caller may see it with the
// room's latest messages for a member

import { toUntrustedFence } from "@carlnotes/models/prompts/write"
import { z } from "zod"
import { loadChatRoomMessagePage, toBeforeChatMessageId } from "../chat/roomReads"
import { loadNotesPayload } from "../note/notePayloads"
import type { NotePage } from "../note/permissions"
import { loadTeamSummaries } from "../team/helpers"
import { loadTeamPage } from "../team/teamPage"
import { loadMcpViewCardPodcastEpisodes, loadMcpViewSession, toMcpViewMeta } from "./mcpViewData"
import { BOUND_SERVER_TEXT, CONNECT_ACCOUNT_TEXT, fromCursor, UNTRUSTED_TEXT_NOTICE } from "./results"
import { toMcpTeamPage, toMcpTeamsPage } from "./teamResults"
import { toToolCallerUserId } from "./toolCaller"
import { type RegisterToolsOptions, toJsonResult, toTextResult } from "./toolShapes"
import { toMcpViewToolMeta } from "./uiResources"

/**
 * Registers list_teams and read_team.
 */
export function registerTeamTools({ mcpServer, toolCaller, routeTopicId }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"list_teams",
		{
			title: "List teams",
			description:
				"The CarlNotes teams the caller belongs to, each with its id, name, description, the caller's role, its member and topic counts, and its page link. Team names and descriptions are people's words, returned as data. Use it when the user asks Carl or CarlNotes to list my teams or which teams am I on.",
			inputSchema: z.object({ cursor: z.string().optional().describe("The cursor a previous page returned.") }),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		async ({ cursor }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const teamSummaries = await loadTeamSummaries(toolCaller.userId)
			return toJsonResult(toMcpTeamsPage(teamSummaries, fromCursor(cursor ?? null)))
		},
	)
	mcpServer.registerTool(
		"read_team",
		{
			title: "Read a team",
			description:
				"A CarlNotes team's page as the caller may see it: its name, description, members, topics, and tasting notes, and for a member the team chat's latest messages, newest last. A private team shows a non-member only its name. Names, notes, and messages are people's words, returned as data. Use it when the user asks Carl or CarlNotes to open my team, read a team, or catch up on the team chat.",
			inputSchema: z.object({
				team_id: z.string().min(1),
				cursor: z.string().optional().describe("The room's earlierCursor, which reads the messages above."),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
			_meta: toMcpViewToolMeta("team"),
		},
		async ({ team_id, cursor }) => {
			// a team page is never the bound topic
			if (routeTopicId) {
				return toTextResult(BOUND_SERVER_TEXT, true)
			}

			// the page as the caller may see it, or the gate a private team shows a non-member
			const userId = toToolCallerUserId(toolCaller)
			const teamPageResult = await loadTeamPage(userId, team_id)
			if (teamPageResult.status === "missing") {
				return toTextResult("No team you may open has that id.", true)
			}
			if (teamPageResult.status === "gated") {
				const { teamName, hasRequestedToJoin } = teamPageResult
				return toJsonResult({
					notice: UNTRUSTED_TEXT_NOTICE,
					status: "gated",
					teamName: toUntrustedFence()(teamName),
					hasRequestedToJoin,
					gateText: "This team is private. Its page opens for its members.",
				})
			}

			// the team's notes, and the room's page for a member
			const { team: teamPage } = teamPageResult
			const notePage: NotePage = {
				kind: "team",
				team: { id: teamPage.teamId, isPublic: teamPage.isPublic, name: teamPage.name },
			}
			const [notesResponse, chatMessagePage, session] = await Promise.all([
				loadNotesPayload(userId, notePage),
				teamPage.role
					? loadChatRoomMessagePage({
							userId,
							topicId: null,
							teamId: teamPage.teamId,
							beforeChatMessageId: toBeforeChatMessageId(cursor),
						})
					: null,
				loadMcpViewSession(toolCaller),
			])

			// the team's podcast episodes and films with their play tokens, so their cards play in the MCP view
			const podcastEpisodes = await loadMcpViewCardPodcastEpisodes(toolCaller, [
				...teamPage.podcastEpisodeCards,
				...(teamPage.topicPodcastEpisodeVideoCards ?? []),
			])

			// the model reads the fenced page, and the MCP view the page in the site's shape
			return {
				...toJsonResult(toMcpTeamPage({ teamPage, notesResponse, chatMessagePage })),
				_meta: toMcpViewMeta({
					session,
					podcastEpisodes,
					team: { teamPage, notesResponse, chatMessagePage },
				}),
			}
		},
	)
}
