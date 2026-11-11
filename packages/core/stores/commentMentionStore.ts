// the signed-in user's unseen Comment Mentions, as the last page load read them. every mention badge and the mentions
// list count from this one list
import { fetchUnseenCommentMentions, sendCommentMentionsSeen } from "@carlnotes/client/commentMentionClient"
import type { UnseenCommentMention } from "@carlnotes/contracts/commentMentions"
import type { CommentTarget } from "@carlnotes/contracts/social"
import { toStoreListeners } from "./storeListeners"

// how many Comments one seen mark names at most, the api's own limit
const SEEN_COMMENT_MAX_COUNT = 100

// what the last read returned, newest first
let commentMentions: UnseenCommentMention[] = []
const { publish, useStoreVersion } = toStoreListeners()

/**
 * Replaces the unseen mentions with what a read returned, and publishes only a changed list.
 */
export function setCommentMentions(updatedCommentMentions: UnseenCommentMention[]): void {
	const isUnchanged = toCommentMentionsKey(updatedCommentMentions) === toCommentMentionsKey(commentMentions)
	commentMentions = updatedCommentMentions
	if (!isUnchanged) {
		publish()
	}
}

// the list as one string: each mention's Comment id, so a read that matches the last one publishes nothing
function toCommentMentionsKey(listedCommentMentions: UnseenCommentMention[]): string {
	return listedCommentMentions.map((commentMention) => commentMention.commentId).join(",")
}

/**
 * Reads the user's unseen mentions into the store, as a page loads and after the user's own Comment write. A failed
 * read keeps the last list.
 */
export async function loadCommentMentions(): Promise<void> {
	try {
		setCommentMentions(await fetchUnseenCommentMentions())
	} catch {
		// the badges keep what the last read returned
	}
}

/**
 * Marks the mentions of the Comments scrolled to as seen. They leave the list at once, and a rejected mark reads the
 * list again.
 */
export async function markCommentMentionsSeen(commentIds: string[]): Promise<void> {
	// only a Comment the list still holds has a mention to mark
	const seenCommentIds = commentIds
		.filter((commentId) => commentMentions.some((commentMention) => commentMention.commentId === commentId))
		.slice(0, SEEN_COMMENT_MAX_COUNT)
	if (seenCommentIds.length === 0) {
		return
	}

	// drop them from the list at once, then send the mark
	setCommentMentions(commentMentions.filter((commentMention) => !seenCommentIds.includes(commentMention.commentId)))
	try {
		await sendCommentMentionsSeen({ commentIds: seenCommentIds })
	} catch {
		await loadCommentMentions()
	}
}

/**
 * Marks every unseen mention as seen, which empties the list at once. A rejected mark reads the list again.
 */
export async function markEveryCommentMentionSeen(): Promise<void> {
	if (commentMentions.length === 0) {
		return
	}

	// empty the list at once, then send the mark
	setCommentMentions([])
	try {
		await sendCommentMentionsSeen({ isEveryMention: true })
	} catch {
		await loadCommentMentions()
	}
}

/**
 * Reads the user's unseen Comment Mentions, newest first.
 */
export function useCommentMentions(): UnseenCommentMention[] {
	useStoreVersion()
	return commentMentions
}

/**
 * Reads the user's unseen Comment Mentions on one page, which its title's badge counts.
 */
export function usePageCommentMentions(
	page: Pick<UnseenCommentMention["page"], "kind" | "id">,
): UnseenCommentMention[] {
	return toPageCommentMentions(useCommentMentions(), page)
}

/**
 * Returns the mentions in one comment thread, which its section's badge counts.
 */
export function toThreadCommentMentions(
	listedCommentMentions: UnseenCommentMention[],
	target: CommentTarget,
): UnseenCommentMention[] {
	return listedCommentMentions.filter(
		(commentMention) => commentMention.target.kind === target.kind && commentMention.target.id === target.id,
	)
}

/**
 * Returns the mentions on one page, which its title's badge counts. A Topic's page holds its own thread and its
 * Findings' threads.
 */
export function toPageCommentMentions(
	listedCommentMentions: UnseenCommentMention[],
	page: Pick<UnseenCommentMention["page"], "kind" | "id">,
): UnseenCommentMention[] {
	return listedCommentMentions.filter(
		(commentMention) => commentMention.page.kind === page.kind && commentMention.page.id === page.id,
	)
}
