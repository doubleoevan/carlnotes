// the api client for reactions and comments on a social target: the reads, the writes, the share with the podcast, and
// the mention suggestions
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import {
	type CommentRepliesResponse,
	type CommentTarget,
	type CommentThreadResponse,
	commentRepliesResponse,
	commentThreadResponse,
	type DeleteCommentResponse,
	deleteCommentResponse,
	mentionSuggestionsResponse,
	type PostCommentPayload,
	type PostCommentResponse,
	postCommentResponse,
	type ReactionSummary,
	reactionSummaryResponse,
	type SaveReactionPayload,
	type ShareCommentResponse,
	type SharedComment,
	type SocialTarget,
	shareCommentResponse,
	sharedCommentsResponse,
} from "@carlnotes/contracts/social"
import { type ApiResponse, apiClient, readApiErrorMessage, readApiResponse } from "./apiClient"

// why a write changed nothing: the comment is past its edit time, or the write failed, with Carl's words if the text
// was rejected or the Terms are waiting
export type SocialWriteFailure = { status: "locked" } | { status: "failed"; message: string | null }

// how a reaction's save ended, and how a comment's post or edit ended
export type ReactionWriteResult =
	| { status: "saved"; summary: ReactionSummary }
	| { status: "failed"; message: string | null }
export type CommentWriteResult = ({ status: "saved" } & PostCommentResponse) | SocialWriteFailure

// the failure of a write whose request never arrived
const UNSENT_WRITE_FAILURE = { status: "failed", message: null } as const

// a comment write's result: the stored comment, the failure its response means, or the failure of a request that
// never arrived
async function toCommentWriteResult(sendRequest: () => Promise<ApiResponse>): Promise<CommentWriteResult> {
	try {
		const response = await sendRequest()

		// a comment past its edit time returns 409, and any other rejection says why
		if (response.status === 409) {
			return { status: "locked" }
		}
		if (!response.ok) {
			return { status: "failed", message: (await readApiErrorMessage(response)) ?? null }
		}

		// the comment and the shared comment slots the write returned
		return { status: "saved", ...(await readApiResponse(postCommentResponse, response)) }
	} catch {
		return UNSENT_WRITE_FAILURE
	}
}

/**
 * Reads one social target's reaction summary, for a list whose read came without it. Throws an error on a failed read.
 */
export async function fetchReactionSummary(target: SocialTarget): Promise<ReactionSummary> {
	const response = await apiClient().api.reactions.summary.$get({ query: target })
	if (!response.ok) {
		throw new Error(`reaction summary read failed: ${response.status}`)
	}
	return (await readApiResponse(reactionSummaryResponse, response)).summary
}

/**
 * Saves the user's reaction on a social target. No type removes it. Returns the social target's summary as it stands
 * now, or why nothing changed.
 */
export async function saveReaction(saveReactionPayload: SaveReactionPayload): Promise<ReactionWriteResult> {
	try {
		const response = await apiClient().api.reactions.$put({ json: saveReactionPayload })
		if (!response.ok) {
			return { status: "failed", message: (await readApiErrorMessage(response)) ?? null }
		}

		// the summary as it stands now
		return { status: "saved", summary: (await readApiResponse(reactionSummaryResponse, response)).summary }
	} catch {
		return UNSENT_WRITE_FAILURE
	}
}

/**
 * Reads one page of a social target's comment thread, newest first. Throws an error on a failed read.
 */
export async function fetchCommentThread(target: CommentTarget, cursor?: string): Promise<CommentThreadResponse> {
	const response = await apiClient().api.comments.$get({ query: { ...target, ...(cursor ? { cursor } : {}) } })
	if (!response.ok) {
		throw new Error(`comment thread read failed: ${response.status}`)
	}
	return readApiResponse(commentThreadResponse, response)
}

/**
 * Reads one page of a comment's replies, oldest first. Throws an error on a failed read.
 */
export async function fetchCommentReplies(commentId: string, cursor?: string): Promise<CommentRepliesResponse> {
	const response = await apiClient().api.comments[":id"].replies.$get({
		param: { id: commentId },
		query: cursor ? { cursor } : {},
	})
	if (!response.ok) {
		throw new Error(`comment replies read failed: ${response.status}`)
	}
	return readApiResponse(commentRepliesResponse, response)
}

/**
 * Posts a comment or a reply on a social target's thread. Returns the comment as its author reads it, or why nothing
 * was posted.
 */
export function postComment(postCommentPayload: PostCommentPayload): Promise<CommentWriteResult> {
	return toCommentWriteResult(() => apiClient().api.comments.$post({ json: postCommentPayload }))
}

/**
 * Changes the body of the user's own comment inside its edit time. Returns the comment, or why nothing changed.
 */
export function editComment(commentId: string, body: string): Promise<CommentWriteResult> {
	return toCommentWriteResult(() =>
		apiClient().api.comments[":id"].$patch({ param: { id: commentId }, json: { body } }),
	)
}

/**
 * Deletes a comment, the user's own or one on a Topic they own. Returns the shared comment slots as they stand now for
 * a user who may share, or false if nothing was deleted or the request never arrived.
 */
export async function deleteComment(commentId: string): Promise<DeleteCommentResponse | false> {
	try {
		const response = await apiClient().api.comments[":id"].$delete({ param: { id: commentId } })
		return response.ok ? await readApiResponse(deleteCommentResponse, response) : false
	} catch {
		return false
	}
}

/**
 * Shares a comment with the podcast or takes it back, for a user who may edit its Topic. Returns whether the comment is
 * shared now with the Topic's shared comment slots, or null if nothing changed.
 */
export async function shareComment(
	commentId: string,
	isSharedWithPodcast: boolean,
): Promise<ShareCommentResponse | null> {
	try {
		const response = await apiClient().api.comments[":id"].share.$put({
			param: { id: commentId },
			json: { isSharedWithPodcast },
		})
		return response.ok ? await readApiResponse(shareCommentResponse, response) : null
	} catch {
		return null
	}
}

/**
 * Reads the comments a Topic shares with the podcast, for a user who may edit the Topic. A failed read lists none.
 */
export async function fetchSharedComments(topicId: string): Promise<SharedComment[]> {
	try {
		const response = await apiClient().api.topics[":id"]["shared-comments"].$get({ param: { id: topicId } })
		return response.ok ? (await readApiResponse(sharedCommentsResponse, response)).comments : []
	} catch {
		return []
	}
}

/**
 * Reads the users whose usernames start with a prefix, for the composer's mention suggestions. A failed read
 * suggests nobody.
 */
export async function fetchMentionSuggestions(prefix: string): Promise<ProfileIdentity[]> {
	try {
		const response = await apiClient().api.usernames.$get({ query: { prefix } })
		return response.ok ? (await readApiResponse(mentionSuggestionsResponse, response)).users : []
	} catch {
		return []
	}
}
