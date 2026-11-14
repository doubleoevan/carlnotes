// the team write tools: request_to_join_team, send_invite, respond_to_invite, and post_to_team_room, each through the
// module its web route calls, under the same checks
import {
	CHAT_PAUSED_ERROR,
	CHAT_PAUSED_LINE,
	EMAIL_UNVERIFIED_ERROR,
	EMAIL_UNVERIFIED_LINE,
} from "@carlnotes/contracts/chat"
import { toModerationRejectionMessage } from "@carlnotes/contracts/moderation"
import { chatRoomMessagePayload, userInvitePayload } from "@carlnotes/contracts/payloads"
import type { CallToolResult } from "@modelcontextprotocol/server"
import { z } from "zod"
import { type ChatRoomPostResult, postCheckedChatRoomMessage } from "../chat/roomPosts"
import type { InviteAcceptResult } from "../invite/inviteAcceptance"
import { acceptInvite, declineInvite } from "../invite/receivedInvites"
import { createUserInvite, type InviteTarget } from "../invite/userInvites"
import { deleteJoinTeamRequest, requestToJoinTeam } from "../team/members"
import { hasAcceptedCurrentTerms } from "../termsAcceptance"
import { BOUND_SERVER_TEXT, CONNECT_ACCOUNT_TEXT, TERMS_REJECTION_TEXT, toToolTopicId } from "./results"
import { toMcpAnalyticsProperties } from "./toolCaller"
import { type RegisterToolsOptions, topicIdArgument, toStatusResult, toTextResult } from "./toolShapes"

// the team argument every team write takes
const teamIdArgument = z.string().min(1).describe("The team's id, from list_teams or read_team.")

// what send_invite says about each way an invite is rejected
const SEND_INVITE_REJECTION_TEXTS = {
	forbidden: "Only a team's members invite to it, and only a topic's editors invite to a topic. Nothing was sent.",
	"unknown-username": "No CarlNotes account has that username. Nothing was sent.",
	"not-accepting": "That person is not accepting invites from you. Nothing was sent.",
	limited: "Today's email invite limit is reached. Nothing was sent. An invite by username still works.",
} as const

/**
 * Registers request_to_join_team, send_invite, respond_to_invite, and post_to_team_room.
 */
export function registerTeamWriteTools({ mcpServer, toolCaller, routeTopicId }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"request_to_join_team",
		{
			title: "Ask to join a team",
			description:
				"Ask to join a CarlNotes team, or take the ask back with is_requesting false. A team leader approves the ask on the team's page. Use it when the user asks Carl or CarlNotes to join this team or ask to join a team.",
			inputSchema: z.object({ team_id: teamIdArgument, is_requesting: z.boolean() }),
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		},
		async ({ team_id, is_requesting }) => {
			// an account asks, and a team page is never the bound topic
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			if (routeTopicId) {
				return toTextResult(BOUND_SERVER_TEXT, true)
			}

			// take the ask back, or ask
			if (!is_requesting) {
				await deleteJoinTeamRequest(toolCaller.userId, team_id)
				return toTextResult("Took back the ask to join.")
			}
			const isRequested = await requestToJoinTeam({
				userId: toolCaller.userId,
				teamId: team_id,
				analyticsProperties: toMcpAnalyticsProperties(toolCaller),
			})
			return isRequested
				? toTextResult("Asked to join. A team leader approves the ask on the team's page.")
				: toTextResult("No team you may ask to join has that id. You may already be a member.", true)
		},
	)
	mcpServer.registerTool(
		"send_invite",
		{
			title: "Invite someone",
			description:
				"Invite a person to a CarlNotes team you belong to, or to a topic you edit, by their username or their email address. An email invite sends an email and counts toward a daily limit. Use it when the user asks Carl or CarlNotes to invite someone, invite a friend to my team, or share this topic with a person.",
			inputSchema: z.object({
				team_id: teamIdArgument.optional().describe("The team to invite to, in place of topic_id."),
				topic_id: topicIdArgument,
				username: z.string().trim().min(1).optional().describe("The person's CarlNotes username."),
				email: z.string().trim().optional().describe("The person's email address, in place of username."),
			}),
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
		},
		async ({ team_id, topic_id, username, email }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}

			// one address, and the team or topic it opens
			const inviteAddressResult = userInvitePayload.safeParse({ username, email })
			if (!inviteAddressResult.success) {
				return toTextResult("Name a username or an email address, one of them. Nothing was sent.", true)
			}
			const inviteTarget = toInviteTarget({ routeTopicId, teamId: team_id, topicId: topic_id })
			if ("rejection" in inviteTarget) {
				return toTextResult(inviteTarget.rejection, true)
			}

			// the invite, through the invite route's own create
			const createUserInviteResult = await createUserInvite(toolCaller.userId, inviteTarget, inviteAddressResult.data)
			if (typeof createUserInviteResult === "string") {
				return toTextResult(SEND_INVITE_REJECTION_TEXTS[createUserInviteResult], true)
			}
			return toStatusResult(`Invited ${inviteAddressResult.data.username ?? inviteAddressResult.data.email}.`, {
				status: "sent",
				inviteId: createUserInviteResult.id,
			})
		},
	)
	mcpServer.registerTool(
		"respond_to_invite",
		{
			title: "Answer an invite",
			description:
				"Accept or decline a CarlNotes team or topic invite waiting for you, by the invite id read_activity lists. Accepting a team invite joins the team, or asks to join it if a member sent an open link. Use it when the user asks Carl or CarlNotes to accept an invite, decline an invite, or join the team I was invited to.",
			inputSchema: z.object({ invite_id: z.string().min(1), is_accepted: z.boolean() }),
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		},
		async ({ invite_id, is_accepted }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}

			// a decline, or an accept through the invite routes' own writes
			const analyticsProperties = toMcpAnalyticsProperties(toolCaller)
			if (!is_accepted) {
				const isDeclined = await declineInvite(toolCaller.userId, invite_id, analyticsProperties)
				return isDeclined
					? toTextResult("Declined the invite.")
					: toTextResult("No invite waiting for you has that id.", true)
			}
			return toAcceptInviteResult(await acceptInvite(toolCaller.userId, invite_id, analyticsProperties))
		},
	)
	mcpServer.registerTool(
		"post_to_team_room",
		{
			title: "Post in a team chat",
			description:
				"Post a message to a CarlNotes team's chat as a member, optionally as a reply to one of its messages. A message that names Carl gets his reply in the chat. Use it when the user asks Carl or CarlNotes to post in the team chat, tell my team, or reply in the team chat.",
			inputSchema: z.object({
				team_id: teamIdArgument,
				// the message, and the one it replies to
				message: chatRoomMessagePayload.shape.content.min(1),
				reply_to_chat_message_id: z
					.number()
					.int()
					.positive()
					.optional()
					.describe("A message id from read_team to reply to."),
			}),
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
		},
		async ({ team_id, message, reply_to_chat_message_id }) => {
			// a member's account that accepted the Terms posts, and a team page is never the bound topic
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			if (routeTopicId) {
				return toTextResult(BOUND_SERVER_TEXT, true)
			}

			// the post, through the chat room route's own checks
			const postCheckedChatRoomMessageResult = await postCheckedChatRoomMessage({
				userId: toolCaller.userId,
				isTermsCurrent: await hasAcceptedCurrentTerms(toolCaller.userId),
				topicId: null,
				teamId: team_id,
				content: message,
				replyToChatMessageId: reply_to_chat_message_id ?? null,
				attachments: [],
				analyticsProperties: toMcpAnalyticsProperties(toolCaller),
			})
			return toPostResult(postCheckedChatRoomMessageResult)
		},
	)
}

// the team or topic an invite opens: a team on an unbound server, or the topic the route binds or the call names
function toInviteTarget({
	routeTopicId,
	teamId,
	topicId,
}: {
	routeTopicId: string | null
	teamId: string | undefined
	topicId: string | undefined
}): InviteTarget | { rejection: string } {
	// a team page is never the bound topic
	if (teamId) {
		return routeTopicId ? { rejection: BOUND_SERVER_TEXT } : { teamId }
	}
	return toToolTopicId(routeTopicId, topicId ?? null)
}

// what an accept says: the team or topic joined, the ask a leader approves, or why it did not join
function toAcceptInviteResult(acceptResult: InviteAcceptResult): CallToolResult {
	switch (acceptResult.status) {
		case "joined":
			return toStatusResult("Accepted. You follow the topic now.", { status: "joined", topicId: acceptResult.topicId })
		case "joinedTeam":
			return toStatusResult("Accepted. You are a member of the team now.", {
				status: "joinedTeam",
				teamId: acceptResult.teamId,
			})
		case "requestedTeam":
			return toStatusResult("Accepted. A team leader approves the ask to join on the team's page.", {
				status: "requestedTeam",
				teamId: acceptResult.teamId,
			})
		// a full team and a spent or missing invite join nothing
		case "teamFull":
			return toTextResult("The team is at its member limit. Nothing was joined.", true)
		case "expired":
			return toTextResult("That invite expired. Ask for a new one.", true)
		default:
			return toTextResult("No invite waiting for you has that id.", true)
	}
}

// the line a caller reads for each rejection reason that has one of its own
const REJECTION_LINES: Record<string, string> = {
	[CHAT_PAUSED_ERROR]: CHAT_PAUSED_LINE,
	[EMAIL_UNVERIFIED_ERROR]: EMAIL_UNVERIFIED_LINE,
}

// what a post says: posted, held back with Carl's reason, or why nothing posted
function toPostResult(chatRoomPostResult: ChatRoomPostResult): CallToolResult {
	switch (chatRoomPostResult.status) {
		// a message to Carl past the daily spend cutoff or the budget, or from an unverified account while the unverified
		// accounts switch is on, posts nothing and says why
		case "posted":
			if (chatRoomPostResult.rejectionReason) {
				const reasonText = REJECTION_LINES[chatRoomPostResult.rejectionReason] ?? chatRoomPostResult.rejectionReason
				return toTextResult(`Nothing was posted. ${reasonText}`, true)
			}

			// a posted message names its id
			return toStatusResult("Posted to the team chat.", {
				status: "posted",
				chatMessageId: chatRoomPostResult.chatMessageId,
			})
		// the Terms, the moderation, and a team the caller is not a member of
		case "termsOutdated":
			return toTextResult(TERMS_REJECTION_TEXT, true)
		case "objectionable":
			return toTextResult(toModerationRejectionMessage(chatRoomPostResult.category), true)
		default:
			return toTextResult("Only a team's members post in its chat. Nothing was posted.", true)
	}
}
