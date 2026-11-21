// a Topic Post's page read: the head of a published post with the post, served to visitors and to every signed-in
// reader of a public post who neither wrote it nor may edit its Topic from one copy per post
import type { TopicPostPageRead } from "@carlnotes/contracts/pageReads"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { readVisitorPage, toVisitorTopicPostPageKey } from "@carlnotes/db/visitorPageCaches"
import { isAllowed } from "../authorization"
import { loadTopicPostPageHead } from "../share/pageHead"
import { overlayUncheckedTopicPostImage } from "../uncheckedImageOverlays"
import { toTopicPostResponse } from "./topicPostResponse"
import { canReadTopicPost, loadTopicPostRow, type TopicPostRow } from "./topicPosts"
import { loadTopicPostUserState } from "./topicPostUserState"

// the user, null for a visitor, and the Topic Post
type ReadTopicPostPageReadOptions = { userId: string | null; topicPostId: string }

/**
 * Loads a Topic Post's page as the user may read it, with the first page of its comment thread and the unchecked upload
 * of whoever may change its image in the image's place, or null for a draft of someone else's, a post of a topic the
 * user may not open, or a missing post. A caller that already read the post's row passes it.
 */
export async function loadTopicPostPage({
	userId,
	topicPostId,
	topicPostRow: loadedTopicPostRow,
}: ReadTopicPostPageReadOptions & { topicPostRow?: TopicPostRow }): Promise<TopicPostResponse | null> {
	const topicPostRow = loadedTopicPostRow ?? (await loadTopicPostRow(topicPostId))
	if (!topicPostRow || !(await canReadTopicPost(userId, topicPostRow))) {
		return null
	}
	const topicPostResponse = await toTopicPostResponse(userId, topicPostRow, { isCommentThreadIncluded: true })
	return overlayUncheckedTopicPostImage(topicPostResponse, userId)
}

/**
 * Returns a Topic Post's page read, or null for a post that is neither published nor the user's to read. A visitor's
 * read of a published post they may read is served from its copy, and so is a signed-in read of a public published
 * post by anyone but its author and its Topic's editors, with the reader's own part beside it. Any other user's read is
 * built for them and never stored.
 */
export async function readTopicPostPageRead({
	userId,
	topicPostId,
}: ReadTopicPostPageReadOptions): Promise<TopicPostPageRead | null> {
	if (!userId) {
		return readVisitorTopicPostPageRead(topicPostId)
	}

	// the author, an editor or an admin, and a reader of a draft or of a post that is not public read the page built
	// for them
	const topicPostRow = await loadTopicPostRow(topicPostId)
	if (!topicPostRow) {
		return null
	}
	if (!(await isSharedCopyReader(userId, topicPostRow))) {
		return buildTopicPostPageRead({ userId, topicPostId, topicPostRow })
	}

	// anyone else reads the visitors' copy with their own part
	const visitorPageRead = await readVisitorTopicPostPageRead(topicPostId)
	if (!visitorPageRead?.topicPost) {
		return buildTopicPostPageRead({ userId, topicPostId, topicPostRow })
	}
	const userState = await loadTopicPostUserState({ userId, topicPostRow, topicPost: visitorPageRead.topicPost })
	return { ...visitorPageRead, userState }
}

// whether the user reads a Topic Post as a visitor does: a published post of a public Topic that they neither wrote nor
// may edit, which an admin may
async function isSharedCopyReader(userId: string, { topicPost, topic }: TopicPostRow): Promise<boolean> {
	if (topic.visibility !== "public" || !topicPost.publishedAt || topicPost.authorUserId === userId) {
		return false
	}
	return !(await isAllowed(userId, "topic:edit", topic))
}

// a visitor's page read of a Topic Post, from its copy, which only a published post a visitor may read fills
function readVisitorTopicPostPageRead(topicPostId: string): Promise<TopicPostPageRead | null> {
	return readVisitorPage({
		key: toVisitorTopicPostPageKey(topicPostId),
		pageKind: "topicPost",
		load: () => buildTopicPostPageRead({ userId: null, topicPostId }),
		isShared: (topicPostPageRead) => Boolean(topicPostPageRead?.head && topicPostPageRead.topicPost),
	})
}

// build the head and the post together. a read with neither is a missing post
async function buildTopicPostPageRead({
	userId,
	topicPostId,
	topicPostRow,
}: ReadTopicPostPageReadOptions & { topicPostRow?: TopicPostRow }): Promise<TopicPostPageRead | null> {
	const [head, topicPost] = await Promise.all([
		loadTopicPostPageHead(topicPostId),
		loadTopicPostPage({ userId, topicPostId, topicPostRow }),
	])
	return head || topicPost ? { head, topicPost, userState: null } : null
}
