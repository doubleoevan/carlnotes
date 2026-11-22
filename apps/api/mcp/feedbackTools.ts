// the mcp tools that rate, bookmark, and send feedback on a finding, and the tool that follows a topic. each needs an
// account

import { feedbackText, findingRatingPayload } from "@carlnotes/contracts/payloads"
import { z } from "zod"
import { loadFindingRatingNote } from "../topic/findingFeedback"
import { setTopicSubscription } from "../topic/subscriptions"
import { bookmarkFinding, CONNECT_ACCOUNT_TEXT, rateFinding, sendFindingFeedback, toToolTopicId } from "./results"
import { toMcpAnalyticsProperties } from "./toolCaller"
import { type RegisterToolsOptions, topicIdArgument, toStatusResult, toTextResult } from "./toolShapes"

/**
 * Registers the tool that saves the user's own words about a finding, which needs an account.
 */
export function registerFindingFeedbackTool({ mcpServer, toolCaller }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"send_finding_feedback",
		{
			title: "Send feedback on a finding",
			description:
				"Save the user's own words about why a CarlNotes finding was good or bad for the connected account. Use it when the user explains a rating, with phrases like tell Carl why or give Carl feedback.",
			inputSchema: z.object({ finding_id: z.string(), feedback: feedbackText }),
			annotations: {
				title: "Send feedback on a finding",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
			},
		},
		async ({ finding_id, feedback }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const isFindingFeedbackSaved = await sendFindingFeedback(toolCaller, finding_id, feedback)
			return toTextResult(
				isFindingFeedbackSaved ? "Sent." : "This account may not rate that finding.",
				!isFindingFeedbackSaved,
			)
		},
	)
}

/**
 * Registers the rating, bookmark, and follow tools. Each needs an account.
 */
export function registerFeedbackTools({ mcpServer, toolCaller, routeTopicId }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"rate_finding",
		{
			title: "Rate a finding",
			description:
				"Thumb a CarlNotes finding up or down for the connected account, or clear the rating with null. Ratings tell Carl what to keep. Use it when the user rates a finding, with phrases like thumbs up, thumbs down, or more like this.",
			inputSchema: findingRatingPayload.extend({ finding_id: z.string() }),
			annotations: { title: "Rate a finding", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		},
		async ({ finding_id, rating, note }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const isRated = await rateFinding(toolCaller, finding_id, rating, note)
			return toTextResult(isRated ? "Rated." : "This account may not rate that finding.", !isRated)
		},
	)
	mcpServer.registerTool(
		"read_finding_rating_note",
		{
			title: "Read rating note",
			description: "Restore the connected account's own note to Carl in the CarlNotes finding rating field.",
			inputSchema: z.object({ finding_id: z.string() }),
			annotations: { title: "Read rating note", readOnlyHint: true },
			_meta: { ui: { visibility: ["app"] } },
		},
		async ({ finding_id }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT, true)
			}
			// deliver the private words only to the view and only to the account that saved them
			const result = await loadFindingRatingNote(toolCaller.userId, finding_id)
			return result
				? { ...toTextResult("Rating note loaded."), _meta: { findingRatingNote: result } }
				: toTextResult("This account may not read that rating.", true)
		},
	)
	mcpServer.registerTool(
		"bookmark_finding",
		{
			title: "Bookmark a finding",
			description:
				"Keep a CarlNotes finding for the connected account so no later brew filters it out, or drop the bookmark. Bookmarking takes the topic's owner or a team that holds it. Use it when the user asks Carl or CarlNotes to keep a finding, with phrases like bookmark this or keep this finding.",
			inputSchema: z.object({ finding_id: z.string(), is_bookmarked: z.boolean() }),
			annotations: { title: "Bookmark a finding", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		},
		async ({ finding_id, is_bookmarked }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const isBookmarkSaved = await bookmarkFinding(toolCaller, finding_id, is_bookmarked)
			return toTextResult(
				isBookmarkSaved ? "Bookmark saved." : "This account may not bookmark that finding.",
				!isBookmarkSaved,
			)
		},
	)
	mcpServer.registerTool(
		"follow_topic",
		{
			title: "Follow a topic",
			description:
				"Follow a CarlNotes topic for the connected account, or unfollow it. Following puts the topic in the account's feed and its list. An owner always follows their own topic. Use it when the user asks Carl or CarlNotes to follow a topic, with phrases like follow this topic or unfollow this topic.",
			inputSchema: z.object({ topic_id: topicIdArgument, is_following: z.boolean() }),
			annotations: { title: "Follow a topic", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		},
		async ({ topic_id, is_following }) => {
			const toolTopic = toToolTopicId(routeTopicId, topic_id ?? null)
			if ("rejection" in toolTopic) {
				return toTextResult(toolTopic.rejection, true)
			}
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}

			// follow or unfollow through the topic page's own write and its rules
			const isTopicSubscriptionSet = await setTopicSubscription({
				userId: toolCaller.userId,
				topicId: toolTopic.topicId,
				isSubscribed: is_following,
				analyticsProperties: toMcpAnalyticsProperties(toolCaller),
				subscriptionSource: "mcp",
			})
			if (!isTopicSubscriptionSet) {
				return toTextResult(toSubscriptionRejectionText(is_following), true)
			}
			return toStatusResult(is_following ? "Following." : "Unfollowed.", {
				topicId: toolTopic.topicId,
				isFollowing: is_following,
			})
		},
	)
}

// what a rejected subscribe or unsubscribe says
function toSubscriptionRejectionText(isSubscribing: boolean): string {
	return isSubscribing
		? "No topic this account may follow has that id. A private topic is followed by its owner alone."
		: "This account can't unfollow that topic. An owner always follows their own topic."
}
