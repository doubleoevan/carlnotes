// the social routes the app reaches: reactions, comment threads, the mention suggestions, and the open report count

import type { ApiRouteContract } from "./apiRouteContracts"
import { adminReportCountResponse } from "./reports"
import { idParam } from "./routeShapes"
import {
	commentRepliesQuery,
	commentRepliesResponse,
	commentThreadQuery,
	commentThreadResponse,
	deleteCommentResponse,
	editCommentPayload,
	mentionSuggestionsQuery,
	mentionSuggestionsResponse,
	postCommentPayload,
	postCommentResponse,
	reactionSummaryQuery,
	reactionSummaryResponse,
	saveReactionPayload,
	shareCommentPayload,
	shareCommentResponse,
	sharedCommentsResponse,
} from "./social"

// the social and report clients' routes, keyed as the client parity check names them
export const socialRouteContracts: Record<string, ApiRouteContract> = {
	// the open report count on an admin's badges
	"reportClient.fetchOpenReportCount": {
		method: "GET",
		path: "/api/admin/reports/count",
		response: adminReportCountResponse,
	},
	"socialClient.deleteComment": {
		method: "DELETE",
		path: "/api/comments/:id",
		params: idParam,
		response: deleteCommentResponse,
	},
	"socialClient.editComment": {
		method: "PATCH",
		path: "/api/comments/:id",
		params: idParam,
		body: { json: editCommentPayload },
		response: postCommentResponse,
	},
	"socialClient.fetchCommentReplies": {
		method: "GET",
		path: "/api/comments/:id/replies",
		params: idParam,
		query: commentRepliesQuery,
		response: commentRepliesResponse,
	},
	"socialClient.fetchCommentThread": {
		method: "GET",
		path: "/api/comments",
		query: commentThreadQuery,
		response: commentThreadResponse,
	},
	"socialClient.fetchMentionSuggestions": {
		method: "GET",
		path: "/api/usernames",
		query: mentionSuggestionsQuery,
		response: mentionSuggestionsResponse,
	},
	"socialClient.fetchReactionSummary": {
		method: "GET",
		path: "/api/reactions/summary",
		query: reactionSummaryQuery,
		response: reactionSummaryResponse,
	},
	"socialClient.fetchSharedComments": {
		method: "GET",
		path: "/api/topics/:id/shared-comments",
		params: idParam,
		response: sharedCommentsResponse,
	},
	"socialClient.postComment": {
		method: "POST",
		path: "/api/comments",
		body: { json: postCommentPayload },
		response: postCommentResponse,
	},
	"socialClient.saveReaction": {
		method: "PUT",
		path: "/api/reactions",
		body: { json: saveReactionPayload },
		response: reactionSummaryResponse,
	},
	"socialClient.shareComment": {
		method: "PUT",
		path: "/api/comments/:id/share",
		params: idParam,
		body: { json: shareCommentPayload },
		response: shareCommentResponse,
	},
}
