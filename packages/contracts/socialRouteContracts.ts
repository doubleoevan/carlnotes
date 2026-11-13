// the social routes the app reaches: reactions, comment threads, the news, Topic Posts, the mention suggestions, and
// the open report count

import type { ApiRouteContract } from "./apiRouteContracts"
import { commentMentionsSeenPayload, unseenCommentMentionsResponse } from "./commentMentions"
import { newsQuery, newsResponse } from "./news"
import { adminReportCountResponse } from "./reports"
import { idParam, multipartFile, okResponse, userIdParam } from "./routeShapes"
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
import { regenerateTopicImagePayload, regenerateTopicImageResponse, uploadTopicImageResponse } from "./topicImages"
import { pinnedOrderPayload } from "./topicPayloads"
import { topicPostBodyImageUploadResponse } from "./topicPostBodyImages"
import {
	topicPostDiscussionRegeneratePayload,
	topicPostDiscussionRegenerateResponse,
	topicPostResponse,
	topicPostSavePayload,
	topicPostSaveResponse,
} from "./topicPosts"

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
	// the user's unseen Comment Mentions, and their seen mark
	"commentMentionClient.fetchUnseenCommentMentions": {
		method: "GET",
		path: "/api/comment-mentions/unseen",
		response: unseenCommentMentionsResponse,
	},
	"commentMentionClient.sendCommentMentionsSeen": {
		method: "POST",
		path: "/api/comment-mentions/seen",
		body: { json: commentMentionsSeenPayload },
		response: okResponse,
	},
	// the news: the user's own, and a profile's
	"newsClient.fetchNews": { method: "GET", path: "/api/news", query: newsQuery, response: newsResponse },
	"newsClient.fetchProfileNews": {
		method: "GET",
		path: "/api/profiles/:userId/news",
		params: userIdParam,
		query: newsQuery,
		response: newsResponse,
	},
	// a Topic's Topic Posts, one post's read, and its author's writes
	"topicPostClient.createTopicPostDraft": {
		method: "POST",
		path: "/api/topics/:id/topic-posts",
		params: idParam,
		response: topicPostResponse,
	},
	"topicPostClient.deleteTopicPost": {
		method: "DELETE",
		path: "/api/topic-posts/:id",
		params: idParam,
		response: okResponse,
	},
	"topicPostClient.fetchTopicPost": {
		method: "GET",
		path: "/api/topic-posts/:id",
		params: idParam,
		response: topicPostResponse,
	},
	"topicPostClient.publishTopicPost": {
		method: "POST",
		path: "/api/topic-posts/:id/publish",
		params: idParam,
		response: topicPostResponse,
	},
	"topicPostClient.sendTopicPostProfileOrder": {
		method: "PATCH",
		path: "/api/topic-posts/:id/profile-order",
		params: idParam,
		body: { json: pinnedOrderPayload },
		response: okResponse,
	},
	"topicPostClient.sendTopicPostImageRegeneration": {
		method: "POST",
		path: "/api/topic-posts/:id/image/regenerate",
		params: idParam,
		body: { json: regenerateTopicImagePayload },
		response: regenerateTopicImageResponse,
	},
	"topicPostClient.sendTopicPostDiscussionRegeneration": {
		method: "POST",
		path: "/api/topic-posts/:id/discussion/regenerate",
		params: idParam,
		body: { json: topicPostDiscussionRegeneratePayload },
		response: topicPostDiscussionRegenerateResponse,
	},
	"topicPostClient.uploadTopicPostImageBody": {
		method: "POST",
		path: "/api/topic-posts/:id/image",
		params: idParam,
		body: { multipart: multipartFile("image") },
		response: uploadTopicImageResponse,
	},
	"topicPostClient.uploadTopicPostBodyImage": {
		method: "POST",
		path: "/api/topic-posts/:id/body-images",
		params: idParam,
		body: { multipart: multipartFile("image") },
		response: topicPostBodyImageUploadResponse,
	},
	"topicPostClient.saveTopicPost": {
		method: "PUT",
		path: "/api/topic-posts/:id",
		params: idParam,
		body: { json: topicPostSavePayload },
		response: topicPostSaveResponse,
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
