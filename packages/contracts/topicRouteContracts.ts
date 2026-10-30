// the topic routes the app reaches: topics, topic findings, viewer counts, notes, and the site search

import { z } from "zod"
import type { ApiRouteContract } from "./apiRouteContracts"
import { topicFindingLinkPreviewResponse } from "./chat"
import { inviteAcceptResponse, inviteCreateResponse } from "./invites"
import {
	note,
	noteBadgesResponse,
	noteBodyConflictResponse,
	noteBodyResponse,
	noteComment,
	noteCommentsResponse,
	noteResponse,
	notesResponse,
} from "./notes"
import {
	bookmarkPayload,
	consumedPayload,
	findingFeedbackPayload,
	inviteCreatePayload,
	noteBodyPayload,
	noteCommentPayload,
	noteCreatePayload,
	noteUpdatePayload,
	ratingPayload,
	subscriptionEmailPayload,
	subscriptionPayload,
	userInvitePayload,
} from "./payloads"
import {
	addableTopicsQuery,
	idParam,
	multipartFile,
	okResponse,
	stopScanResponse,
	topicAttachmentUploadResponse,
	topicFeedQuery,
	topicPageQuery,
} from "./routeShapes"
import { searchRequestPayload, searchResultsPage } from "./search"
import { attachmentContextPayload, suggestSourcesPayload, updateTopicPayload } from "./topicPayloads"
import {
	addableTopicsResponse,
	manualScanResponse,
	scanNote,
	suggestSourcesResponse,
	topicCreateResponse,
	topicFeedResponse,
	topicResponse,
} from "./topics"
import { podcastEpisodeCounts, topicCounts } from "./viewerCounts"

// the entries, in client module order
export const topicRouteContracts: Record<string, ApiRouteContract> = {
	// topics
	"topicClient.fetchAddableTopics": {
		method: "GET",
		path: "/api/topics/addable",
		query: addableTopicsQuery,
		response: addableTopicsResponse,
	},
	"topicClient.fetchScanNote": { method: "GET", path: "/api/scans/:id", params: idParam, response: scanNote },
	"topicClient.fetchSourceSuggestions": {
		method: "POST",
		path: "/api/topics/suggest-sources",
		body: { json: suggestSourcesPayload },
		response: suggestSourcesResponse,
	},
	"topicClient.fetchTopicAttachment": { method: "GET", path: "/api/attachments/:id/download", params: idParam },
	"topicClient.fetchTopicFeed": {
		method: "GET",
		path: "/api/topic-feed",
		query: topicFeedQuery,
		response: topicFeedResponse,
	},
	"topicClient.fetchTopicPage": {
		method: "GET",
		path: "/api/topics/:id",
		params: idParam,
		query: topicPageQuery,
		response: topicResponse,
	},
	"topicClient.removeTopicSource": {
		method: "DELETE",
		path: "/api/topics/:id/sources/:sourceId",
		params: z.object({ id: z.string(), sourceId: z.string() }),
	},
	"topicClient.sendAcceptInvite": {
		method: "POST",
		path: "/api/invite/:token",
		params: z.object({ token: z.string() }),
		response: inviteAcceptResponse,
	},
	"topicClient.sendAttachmentContext": {
		method: "PATCH",
		path: "/api/attachments/:id/context",
		params: idParam,
		body: { json: attachmentContextPayload },
		response: okResponse,
	},
	"topicClient.sendCreateTopic": {
		method: "POST",
		path: "/api/topics",
		body: { json: updateTopicPayload },
		response: topicCreateResponse,
	},
	"topicClient.sendCreateTopicInvite": {
		method: "POST",
		path: "/api/topics/:id/invites",
		params: idParam,
		body: { json: inviteCreatePayload },
		response: inviteCreateResponse,
	},
	"topicClient.sendDeleteAttachment": {
		method: "DELETE",
		path: "/api/attachments/:id",
		params: idParam,
		response: okResponse,
	},
	"topicClient.sendDeleteSubscription": {
		method: "DELETE",
		path: "/api/topics/:id/subscription",
		params: idParam,
		response: okResponse,
	},
	"topicClient.sendDeleteTopic": { method: "DELETE", path: "/api/topics/:id", params: idParam, response: okResponse },
	"topicClient.sendManualScan": {
		method: "POST",
		path: "/api/topics/:id/scan",
		params: idParam,
		response: manualScanResponse,
	},
	"topicClient.sendStopScan": {
		method: "POST",
		path: "/api/topics/:id/scan/stop",
		params: idParam,
		response: stopScanResponse,
	},
	"topicClient.sendSubscriptionEmail": {
		method: "POST",
		path: "/api/topics/:id/subscription-email",
		params: idParam,
		body: { json: subscriptionEmailPayload },
		response: okResponse,
	},
	"topicClient.sendTopicSubscription": {
		method: "POST",
		path: "/api/topics/:id/subscription",
		params: idParam,
		body: { json: subscriptionPayload },
		response: okResponse,
	},
	"topicClient.sendUpdateTopic": {
		method: "PATCH",
		path: "/api/topics/:id",
		params: idParam,
		body: { json: updateTopicPayload },
		response: okResponse,
	},
	"topicClient.sendUserInvite": {
		method: "POST",
		path: "/api/topics/:id/invites/user",
		params: idParam,
		body: { json: userInvitePayload },
		response: inviteCreateResponse,
	},
	"topicClient.sendUserInvite#team": {
		method: "POST",
		path: "/api/teams/:id/invites/user",
		params: idParam,
		body: { json: userInvitePayload },
		response: inviteCreateResponse,
	},
	"topicClient.uploadTopicAttachmentBody": {
		method: "POST",
		path: "/api/topics/:id/attachments",
		params: idParam,
		body: { multipart: multipartFile("file") },
		response: topicAttachmentUploadResponse,
	},

	// topic findings
	"topicFindingClient.fetchTopicFindingLinkPreview": {
		method: "GET",
		path: "/api/topic-findings/:id/link-preview",
		params: idParam,
		response: topicFindingLinkPreviewResponse,
	},
	"topicFindingClient.sendFindingFeedback": {
		method: "POST",
		path: "/api/topic-findings/:id/feedback",
		params: idParam,
		body: { json: findingFeedbackPayload },
		response: okResponse,
	},
	"topicFindingClient.sendTopicFindingBookmark": {
		method: "POST",
		path: "/api/topic-findings/:id/bookmark",
		params: idParam,
		body: { json: bookmarkPayload },
		response: okResponse,
	},
	"topicFindingClient.sendTopicFindingConsumed": {
		method: "POST",
		path: "/api/topic-findings/:id/consume",
		params: idParam,
		body: { json: consumedPayload },
		response: okResponse,
	},
	"topicFindingClient.sendTopicFindingOpened": {
		method: "POST",
		path: "/api/topic-findings/:id/view",
		params: idParam,
		response: okResponse,
	},
	"topicFindingClient.sendTopicFindingRating": {
		method: "POST",
		path: "/api/topic-findings/:id/rating",
		params: idParam,
		body: { json: ratingPayload },
		response: okResponse,
	},

	// viewer counts
	"viewerCountsClient.fetchPodcastEpisodeCounts": {
		method: "GET",
		path: "/api/counts/episodes/:id",
		params: idParam,
		response: podcastEpisodeCounts,
	},
	"viewerCountsClient.fetchTopicCounts": {
		method: "GET",
		path: "/api/counts/topics/:id",
		params: idParam,
		response: topicCounts,
	},
	"viewerCountsClient.sendTopicView": { method: "POST", path: "/api/topics/:id/view", params: idParam },

	// notes, on a topic and on a team
	"noteClient.createNote": {
		method: "POST",
		path: "/api/topics/:id/notes",
		params: idParam,
		body: { json: noteCreatePayload },
		response: note,
	},
	"noteClient.createNote#team": {
		method: "POST",
		path: "/api/teams/:id/notes",
		params: idParam,
		body: { json: noteCreatePayload },
		response: note,
	},
	"noteClient.deleteNote": { method: "DELETE", path: "/api/notes/:id", params: idParam, response: okResponse },
	"noteClient.deleteNoteComment": {
		method: "DELETE",
		path: "/api/notes/:id/comments/:commentId",
		params: z.object({ id: z.string(), commentId: z.string() }),
		response: okResponse,
	},
	"noteClient.fetchNote": { method: "GET", path: "/api/notes/:id", params: idParam, response: noteResponse },
	"noteClient.fetchNoteBadges": { method: "GET", path: "/api/note-badges", response: noteBadgesResponse },
	"noteClient.fetchNoteComments": {
		method: "GET",
		path: "/api/notes/:id/comments",
		params: idParam,
		response: noteCommentsResponse,
	},
	"noteClient.fetchNotes": { method: "GET", path: "/api/topics/:id/notes", params: idParam, response: notesResponse },
	"noteClient.fetchNotes#team": {
		method: "GET",
		path: "/api/teams/:id/notes",
		params: idParam,
		response: notesResponse,
	},
	"noteClient.postNoteComment": {
		method: "POST",
		path: "/api/notes/:id/comments",
		params: idParam,
		body: { json: noteCommentPayload },
		response: noteComment,
	},
	"noteClient.saveNoteBody": {
		method: "PUT",
		path: "/api/notes/:id/body",
		params: idParam,
		body: { json: noteBodyPayload },
		response: noteBodyResponse,
	},
	"noteClient.saveNoteBody#conflict": {
		method: "PUT",
		path: "/api/notes/:id/body",
		params: idParam,
		body: { json: noteBodyPayload },
		response: noteBodyConflictResponse,
	},
	"noteClient.sendNoteRead": { method: "POST", path: "/api/notes/:id/read", params: idParam, response: okResponse },
	"noteClient.updateNote": {
		method: "PATCH",
		path: "/api/notes/:id",
		params: idParam,
		body: { json: noteUpdatePayload },
		response: okResponse,
	},

	// search
	"searchClient.searchSite": {
		method: "GET",
		path: "/api/search",
		query: searchRequestPayload,
		response: searchResultsPage,
	},
}
