// the first page of the comment thread on a Topic's page and a Podcast Episode's page
import type { CommentTarget, CommentThreadResponse } from "@carlnotes/contracts/social"
import { loadCommentPage } from "./commentRows"
import { toSocialReader } from "./socialTargets"

// the user, null for a visitor, the Topic the page belongs to, and the page's own social target
type LoadPageCommentThreadOptions = {
	userId: string | null
	topic: Parameters<typeof toSocialReader>[1]
	target: CommentTarget
}

/**
 * Loads the first page of the comment thread on a Topic's page or a Podcast Episode's page, as this user or visitor
 * reads it.
 */
export async function loadPageCommentThread({
	userId,
	topic,
	target,
}: LoadPageCommentThreadOptions): Promise<CommentThreadResponse> {
	return loadCommentPage({ reader: await toSocialReader(userId, topic), target, topic })
}
