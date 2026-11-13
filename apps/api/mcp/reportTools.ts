// report_content and block_user: the report dialog's report, with its block of the author, and a block or unblock of
// one person, through the same functions the site's routes call
import { FLAG_REASON_MAX_CHARS } from "@carlnotes/contracts/chat"
import { reportSubjectKinds } from "@carlnotes/contracts/enums"
import { z } from "zod"
import { flagContent, type ReportContentResult } from "../report/flagContent"
import { deleteUserBlock, saveUserBlock } from "../userBlocks"
import { BOUND_SERVER_TEXT, CONNECT_ACCOUNT_TEXT } from "./results"
import { toMcpAnalyticsProperties } from "./toolCaller"
import { type RegisterToolsOptions, toTextResult } from "./toolShapes"

// what a report says for each result: sent, or why nothing was sent
const REPORT_RESULT_TEXTS: Record<ReportContentResult, string> = {
	sent: "Reported. An admin reviews the report.",
	unknownSubject: "Nothing this account may see has that id. Nothing was reported.",
	limitReached: "This account has sent enough reports for one day. Nothing was reported.",
	notConfigured: "Reports are not set up right now. Nothing was reported.",
	failed: "The report did not send. Try again.",
}

/**
 * Registers report_content and block_user.
 */
export function registerReportTools({ mcpServer, toolCaller, routeTopicId }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"report_content",
		{
			title: "Report something",
			description:
				"Report something on CarlNotes to its admins: a topic, profile, team, team chat message, tasting note, note comment, finding, podcast episode, hot take, topic image, or Open Mic post's image, whose kind is topicPostImage. The report goes to the same queue as a report from the site, under the same daily limit, and can block the author too. Use it when the user asks Carl or CarlNotes to report this, flag this, or report this person.",
			inputSchema: z.object({
				subject_kind: z
					.enum(reportSubjectKinds)
					.describe("What is reported. An Open Mic post's image is a topicPostImage."),
				subject_id: z.string().min(1).describe("The id of what is reported."),
				reason: z.string().trim().max(FLAG_REASON_MAX_CHARS).optional().describe("What is wrong, in the user's words."),
				should_block_author: z.boolean().optional().describe("Whether to block the author too."),
			}),
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
		},
		async ({ subject_kind, subject_id, reason, should_block_author }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			if (routeTopicId) {
				return toTextResult(BOUND_SERVER_TEXT, true)
			}

			// store and mail the report as the site's report dialog does
			const flagContentResult = await flagContent({
				userId: toolCaller.userId,
				payload: {
					subjectKind: subject_kind,
					subjectId: subject_id,
					reason: reason ?? "",
					shouldBlockAuthor: should_block_author,
				},
				analyticsProperties: toMcpAnalyticsProperties(toolCaller),
			})
			return toTextResult(REPORT_RESULT_TEXTS[flagContentResult], flagContentResult !== "sent")
		},
	)
	mcpServer.registerTool(
		"block_user",
		{
			title: "Block a person",
			description:
				"Block or unblock a person on CarlNotes for the connected account. A block hides each one's hot takes, chat messages, and mentions from the other. Use it when the user asks Carl or CarlNotes to block this person, unblock someone, or stop seeing someone.",
			inputSchema: z.object({
				user_id: z.string().min(1).describe("The person's id."),
				is_blocked: z.boolean().describe("true blocks the person, and false unblocks them."),
			}),
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		},
		async ({ user_id, is_blocked }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			if (routeTopicId) {
				return toTextResult(BOUND_SERVER_TEXT, true)
			}

			// an unblock always succeeds
			if (!is_blocked) {
				await deleteUserBlock(toolCaller.userId, user_id)
				return toTextResult("Unblocked.")
			}

			// a block, which is never of oneself or of a missing person
			const saveUserBlockResult = await saveUserBlock(toolCaller.userId, user_id)
			if (saveUserBlockResult === "selfBlock") {
				return toTextResult("A person cannot block themselves. Nothing was blocked.", true)
			}
			return saveUserBlockResult === "saved" ? toTextResult("Blocked.") : toTextResult("No person has that id.", true)
		},
	)
}
