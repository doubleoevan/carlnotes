import {
	type CommentWriteResult,
	deleteComment as deleteCommentRequest,
	editComment as editCommentRequest,
	fetchCommentReplies,
	fetchCommentThread,
	postComment as postCommentRequest,
	shareComment as shareCommentRequest,
} from "@carlnotes/client/socialClient"
import {
	type Comment,
	type CommentReply,
	type CommentTarget,
	type CommentThreadResponse,
	EMPTY_COMMENT_THREAD,
	type ReactionSummary,
	type SharedCommentSlots,
	toSocialTargetKey,
} from "@carlnotes/contracts/social"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

// how many top-level comments a thread shows until the user asks for more
const FIRST_SHOWN_COMMENT_COUNT = 5

// how long a reopened thread reuses its first page without another read
const COMMENT_THREAD_STALE_MS = 30_000

// what a post names beside its body: a Podcast Episode's chapter, the top-level comment a reply answers, and whether
// an editor shares it with the podcast, left out to take the api's default
type PostCommentOptions = {
	chapterPosition: number | null
	parentCommentId: string | null
	isSharedWithPodcast?: boolean
}

// a social target's comment thread, newest first, each comment with its replies, and the writes that change it
export type CommentThreadState = {
	// the top-level comments shown so far
	comments: Comment[]
	// how many comments the Topic shares with the podcast and how many it may, for a user who may share. null for anyone
	// else
	sharedCommentSlots: SharedCommentSlots | null
	// how many comments and replies the last seven days added
	weekCommentCount: number
	isLoading: boolean
	hasError: boolean
	retry: () => void
	// how many loaded top-level comments are not shown yet
	hiddenCommentCount: number
	hasMore: boolean
	hasLess: boolean
	// shows every loaded comment, reads the next page, and returns whether the read succeeded
	showMore: () => Promise<boolean>
	// returns to the first few comments
	showLess: () => void
	// loads the next page of a comment's replies, and returns whether the read succeeded
	loadMoreReplies: (commentId: string) => Promise<boolean>
	post: (body: string, options: PostCommentOptions) => Promise<CommentWriteResult>
	edit: (commentId: string, body: string) => Promise<CommentWriteResult>
	remove: (commentId: string) => Promise<boolean>
	// keeps the summary a comment's reaction save returned
	keepReactions: (commentId: string, summary: ReactionSummary) => void
	// shares a comment with the podcast or takes it back, and returns whether the write succeeded
	share: (commentId: string, isSharedWithPodcast: boolean) => Promise<boolean>
}

// the comments with one of them changed, a top-level comment or a reply. a top-level comment keeps its replies
function toChangedComments(comments: Comment[], commentId: string, change: Partial<CommentReply>): Comment[] {
	return comments.map((comment) => {
		if (comment.id === commentId) {
			return { ...comment, ...change }
		}

		// a comment with no such reply stays the same object, so its row does not render again
		if (!comment.replies.some((reply) => reply.id === commentId)) {
			return comment
		}
		return {
			...comment,
			replies: comment.replies.map((reply) => (reply.id === commentId ? { ...reply, ...change } : reply)),
		}
	})
}

// the comments without one of them, a top-level comment with its replies, or one reply
function toCommentsWithout(comments: Comment[], commentId: string): Comment[] {
	return comments
		.filter((comment) => comment.id !== commentId)
		.map((comment) => {
			// a removed reply lowers its parent's count
			const replies = comment.replies.filter((reply) => reply.id !== commentId)
			const removedReplyCount = comment.replies.length - replies.length
			return removedReplyCount > 0
				? { ...comment, replies, replyCount: comment.replyCount - removedReplyCount }
				: comment
		})
}

// the rows with a later page's rows behind them, without a row that is already there
function toAppendedRows<Row extends { id: string }>(rows: Row[], laterRows: Row[]): Row[] {
	const rowIds = new Set(rows.map((row) => row.id))
	return [...rows, ...laterRows.filter((row) => !rowIds.has(row.id))]
}

/**
 * Returns a reload's first page with the comments already loaded behind it. A comment on the page keeps the replies
 * loaded past the page's first few, and a comment past the page's last one stays unless the page is the whole thread.
 */
export function toReloadedComments(loadedComments: Comment[], commentPage: CommentThreadResponse): Comment[] {
	// the comments the page and the thread share, and where the page's last one sits in the thread
	const loadedCommentById = new Map(loadedComments.map((comment) => [comment.id, comment]))
	const pageCommentIds = new Set(commentPage.comments.map((comment) => comment.id))
	const lastPageCommentIndex = loadedComments.findLastIndex((comment) => pageCommentIds.has(comment.id))

	// the page in front, then the older comments it did not reach
	return [
		...commentPage.comments.map((comment) => toReloadedComment(comment, loadedCommentById.get(comment.id))),
		...(commentPage.nextCursor ? loadedComments.slice(lastPageCommentIndex + 1) : []),
	]
}

/**
 * Returns whether a reload's first page has more comments past it and shares no comment with the loaded ones, which
 * can leave a gap behind the page.
 */
export function isDetachedCommentPage(loadedComments: Comment[], commentPage: CommentThreadResponse): boolean {
	const loadedCommentIds = new Set(loadedComments.map((comment) => comment.id))
	return commentPage.nextCursor !== null && !commentPage.comments.some((comment) => loadedCommentIds.has(comment.id))
}

// a page's comment with the replies loaded past the page's first few, each reply the page has in the page's copy
function toReloadedComment(pageComment: Comment, loadedComment: Comment | undefined): Comment {
	if (!loadedComment || loadedComment.replies.length <= pageComment.replies.length) {
		return pageComment
	}
	const pageReplyById = new Map(pageComment.replies.map((reply) => [reply.id, reply]))
	return { ...pageComment, replies: loadedComment.replies.map((reply) => pageReplyById.get(reply.id) ?? reply) }
}

/**
 * Holds one social target's comment thread. It starts from the first page its page came with, or from a short-lived
 * cached read of that page, then loads older pages and later replies on request and keeps only acknowledged writes.
 * Another first page for the same social target joins the thread and keeps how many comments show.
 */
export function useCommentThread(
	target: CommentTarget,
	firstPage: CommentThreadResponse | undefined,
): CommentThreadState {
	// the first page the page came with, or the cached read of it. a failed or slow read stays with its own query key
	const queryClient = useQueryClient()
	const commentThreadKey = ["comment-thread", target.kind, target.id]
	const commentThreadQuery = useQuery({
		queryKey: commentThreadKey,
		queryFn: () => fetchCommentThread(target),
		enabled: !firstPage,
		staleTime: COMMENT_THREAD_STALE_MS,
		retry: false,
		networkMode: "always",
	})
	const commentPage = firstPage ?? commentThreadQuery.data

	// the pages loaded so far, how many show, the cursor of the next page, and the counts
	const [comments, setComments] = useState<Comment[]>(commentPage?.comments ?? [])
	const [shownCommentCount, setShownCommentCount] = useState(FIRST_SHOWN_COMMENT_COUNT)
	const [nextCursor, setNextCursor] = useState<string | null>(commentPage?.nextCursor ?? null)
	const [sharedCommentSlots, setSharedCommentSlots] = useState<SharedCommentSlots | null>(
		commentPage?.sharedCommentSlots ?? null,
	)
	const [weekCommentCount, setWeekCommentCount] = useState(commentPage?.weekCommentCount ?? 0)
	const isLoadingMoreRef = useRef(false)

	// the cursor of each comment's next page of replies, once its first full page has loaded. null for no next page
	const replyCursorsRef = useRef(new Map<string, string | null>())

	// the social target whose first page the thread holds. null until a first page arrives
	const keptTargetKeyRef = useRef<string | null>(null)

	// keep one page of the thread as the whole thread
	function keepFirstPage(firstCommentPage: CommentThreadResponse): void {
		setComments(firstCommentPage.comments)
		setShownCommentCount(FIRST_SHOWN_COMMENT_COUNT)
		setNextCursor(firstCommentPage.nextCursor)
		setSharedCommentSlots(firstCommentPage.sharedCommentSlots)
		setWeekCommentCount(firstCommentPage.weekCommentCount)
		replyCursorsRef.current = new Map()
	}

	// join a reload's first page to the thread, with the shown count and the reply cursors as they are. a detached page
	// starts the thread over, so its cursor reaches every older comment
	function keepReloadedPage(reloadedPage: CommentThreadResponse): void {
		if (isDetachedCommentPage(comments, reloadedPage)) {
			keepFirstPage(reloadedPage)
			return
		}

		// the page in front, and the loaded cursor while older comments stay
		setComments((loadedComments) => toReloadedComments(loadedComments, reloadedPage))
		setNextCursor((loadedCursor) => (reloadedPage.nextCursor ? loadedCursor : null))
		setSharedCommentSlots(reloadedPage.sharedCommentSlots)
		setWeekCommentCount(reloadedPage.weekCommentCount)
	}

	// another social target starts over, and the same one's next first page joins what is loaded
	const targetKey = toSocialTargetKey(target)
	// biome-ignore lint/correctness/useExhaustiveDependencies: the target's key stands for the target
	useEffect(() => {
		if (keptTargetKeyRef.current === targetKey) {
			if (commentPage) {
				keepReloadedPage(commentPage)
			}
			return
		}

		// keep the target only once its page has come, so a page read later starts the thread too
		keptTargetKeyRef.current = commentPage ? targetKey : null
		keepFirstPage(commentPage ?? EMPTY_COMMENT_THREAD)
	}, [targetKey, commentPage])

	// mark the cached first page out of date after a write, so the next open reads the write
	function invalidateCachedPage(): void {
		void queryClient.invalidateQueries({ queryKey: commentThreadKey })
	}

	// load the page after the last one loaded
	async function loadMore(): Promise<boolean> {
		if (!nextCursor || isLoadingMoreRef.current) {
			return true
		}

		// one read at a time
		isLoadingMoreRef.current = true
		try {
			// a comment posted since the last read is already in the thread, so it is not added twice
			const olderPage = await fetchCommentThread(target, nextCursor)
			setComments((currentComments) => toAppendedRows(currentComments, olderPage.comments))
			setNextCursor(olderPage.nextCursor)
			return true
		} catch {
			// a failed read keeps the pages loaded so far
			return false
		} finally {
			isLoadingMoreRef.current = false
		}
	}

	// show every loaded comment, and read the next page so the next press knows how many are left
	function showMore(): Promise<boolean> {
		setShownCommentCount(comments.length)
		return loadMore()
	}

	// load a comment's replies past the ones shown. the first read replaces the few that came with the thread
	async function loadMoreReplies(commentId: string): Promise<boolean> {
		const replyCursor = replyCursorsRef.current.get(commentId)
		try {
			// read the page and remember where the next one starts
			const replyPage = await fetchCommentReplies(commentId, replyCursor ?? undefined)
			replyCursorsRef.current.set(commentId, replyPage.nextCursor)
			setComments((currentComments) =>
				currentComments.map((comment) => {
					if (comment.id !== commentId) {
						return comment
					}

					// a later page follows the replies already shown, without one posted since
					const shownReplies = replyCursor === undefined ? [] : comment.replies
					return { ...comment, replies: toAppendedRows(shownReplies, replyPage.replies) }
				}),
			)
			return true
		} catch {
			return false
		}
	}

	// put a posted comment first, as the newest, and a posted reply last under the comment it answers
	async function post(
		body: string,
		{ chapterPosition, parentCommentId, isSharedWithPodcast }: PostCommentOptions,
	): Promise<CommentWriteResult> {
		const commentWriteResult = await postCommentRequest({
			target,
			body,
			chapterPosition: chapterPosition ?? undefined,
			parentCommentId: parentCommentId ?? undefined,
			isSharedWithPodcast,
		})
		if (commentWriteResult.status !== "saved") {
			return commentWriteResult
		}

		// a top-level comment by a user who may share can take a shared comment slot, so keep the shared comment slots the
		// post returned
		const { comment: postedComment } = commentWriteResult
		setSharedCommentSlots(commentWriteResult.sharedCommentSlots ?? sharedCommentSlots)
		setWeekCommentCount((count) => count + 1)
		setComments((currentComments) =>
			postedComment.parentCommentId
				? currentComments.map((comment) =>
						comment.id === postedComment.parentCommentId
							? { ...comment, replies: [...comment.replies, postedComment], replyCount: comment.replyCount + 1 }
							: comment,
					)
				: [postedComment, ...currentComments],
		)
		invalidateCachedPage()
		return commentWriteResult
	}

	// replace an edited comment's words in place
	async function edit(commentId: string, body: string): Promise<CommentWriteResult> {
		const commentWriteResult = await editCommentRequest(commentId, body)

		// the saved words and mentions replace the row's
		if (commentWriteResult.status === "saved") {
			const { body: editedBody, mentions } = commentWriteResult.comment
			setComments((currentComments) => toChangedComments(currentComments, commentId, { body: editedBody, mentions }))
			invalidateCachedPage()
		}
		return commentWriteResult
	}

	// take a deleted comment out of the thread, with its replies
	async function remove(commentId: string): Promise<boolean> {
		const deletedComment = await deleteCommentRequest(commentId)
		if (deletedComment) {
			// the delete returns the shared comment slots and the week's count
			setComments((currentComments) => toCommentsWithout(currentComments, commentId))
			setSharedCommentSlots(deletedComment.sharedCommentSlots ?? sharedCommentSlots)
			setWeekCommentCount(deletedComment.weekCommentCount)
			invalidateCachedPage()
		}
		return Boolean(deletedComment)
	}

	// keep the summary a comment's reaction save returned
	function keepReactions(commentId: string, summary: ReactionSummary): void {
		setComments((currentComments) => toChangedComments(currentComments, commentId, { reactions: summary }))
		invalidateCachedPage()
	}

	// share a comment with the podcast or take it back, and keep the shared comment slots the write returned
	async function share(commentId: string, isSharedWithPodcast: boolean): Promise<boolean> {
		const sharedComment = await shareCommentRequest(commentId, isSharedWithPodcast)
		if (sharedComment) {
			// the flame and the count change together
			setComments((currentComments) =>
				toChangedComments(currentComments, commentId, { isSharedWithPodcast: sharedComment.isSharedWithPodcast }),
			)
			setSharedCommentSlots(sharedComment.sharedCommentSlots)
			invalidateCachedPage()
		}
		return Boolean(sharedComment)
	}

	// the thread and its writes
	return {
		comments: comments.slice(0, shownCommentCount),
		sharedCommentSlots,
		weekCommentCount,
		isLoading: !commentPage && commentThreadQuery.isFetching,
		hasError: !commentPage && commentThreadQuery.isError && !commentThreadQuery.isFetching,
		retry: () => void commentThreadQuery.refetch(),
		hiddenCommentCount: Math.max(comments.length - shownCommentCount, 0),
		hasMore: comments.length > shownCommentCount || nextCursor !== null,
		hasLess: shownCommentCount > FIRST_SHOWN_COMMENT_COUNT && comments.length > FIRST_SHOWN_COMMENT_COUNT,
		showMore,
		showLess: () => setShownCommentCount(FIRST_SHOWN_COMMENT_COUNT),
		loadMoreReplies,
		post,
		edit,
		remove,
		keepReactions,
		share,
	}
}
