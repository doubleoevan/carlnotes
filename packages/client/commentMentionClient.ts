// the api client for the signed-in user's unseen Comment Mentions: the list their badges count, and the seen mark
import {
	type CommentMentionsSeenPayload,
	type UnseenCommentMention,
	unseenCommentMentionsResponse,
} from "@carlnotes/contracts/commentMentions"
import { apiClient, readApiResponse } from "./apiClient"

/**
 * Fetches the signed-in user's unseen Comment Mentions, newest first. A failed read throws an error.
 */
export async function fetchUnseenCommentMentions(): Promise<UnseenCommentMention[]> {
	const response = await apiClient().api["comment-mentions"].unseen.$get()
	if (!response.ok) {
		throw new Error(`comment mentions read failed: ${response.status}`)
	}
	return (await readApiResponse(unseenCommentMentionsResponse, response)).commentMentions
}

/**
 * Marks Comment Mentions seen: the Comments scrolled to, or every unseen mention. A rejection throws an error.
 */
export async function sendCommentMentionsSeen(payload: CommentMentionsSeenPayload): Promise<void> {
	const response = await apiClient().api["comment-mentions"].seen.$post({ json: payload })
	if (!response.ok) {
		throw new Error(`comment mentions seen mark failed: ${response.status}`)
	}
}
