// the shared comment thread's pages, reloads, and cache, rendered through plain elements
import { afterEach, expect, test } from "bun:test"
import { EMPTY_COMMENT_THREAD } from "@carlnotes/contracts/social"
import { toTestComment, toTestCommentReply, toTestCommentThread } from "@carlnotes/contracts/socialTestFixtures"
import type { CommentThreadProps } from "@carlnotes/core/components/CommentThread"
import { COMMENT_THREAD_LABELS, toMoreCommentsLabel } from "@carlnotes/core/lib/socialLabels"
import { act } from "react"
import { waitForHook } from "@/lib/hookTestHarness"
import {
	cleanups,
	closeSocialTests,
	LESS_LABEL,
	press,
	queryClient,
	renderCommentThread,
	toButtonLabels,
	toComposer,
	toNumberedComments,
	toRows,
} from "./socialTestHarness"

// keep each test's browser environment and transport isolated
afterEach(closeSocialTests)

test("a thread shows five comments, and its toggle shows the rest and returns to five", async () => {
	const comments = [1, 2, 3, 4, 5, 6, 7].map((index) => toTestComment({ id: `comment-${index}` }))
	const { harness, requests } = await renderCommentThread({ firstPage: toTestCommentThread({ comments }) })
	expect(toRows(harness)).toHaveLength(5)

	// the loaded comments need no read, and with every comment shown the toggle offers less
	await press(harness.container, toMoreCommentsLabel(2))
	await waitForHook(() => toRows(harness).length === 7)
	expect(requests).toHaveLength(0)

	// the toggle returns to the first five
	await press(harness.container, LESS_LABEL)
	await waitForHook(() => toRows(harness).length === 5)
	expect(toButtonLabels(harness.container)).toContain(toMoreCommentsLabel(2))
})

test("the toggle reads the next page ahead, and counts what that page added", async () => {
	const comments = [1, 2, 3, 4, 5, 6, 7].map((index) => toTestComment({ id: `comment-${index}` }))
	const { harness, requests } = await renderCommentThread(
		{ firstPage: toTestCommentThread({ comments, nextCursor: "next-page" }) },
		() => Response.json(toTestCommentThread({ comments: [toTestComment({ id: "comment-8" })] })),
	)
	await press(harness.container, toMoreCommentsLabel(2))
	await waitForHook(() => toButtonLabels(harness.container).includes(toMoreCommentsLabel(1)))
	expect(toRows(harness)).toHaveLength(7)
	expect(requests).toHaveLength(1)

	// the last press shows the last comment and needs no read
	await press(harness.container, toMoreCommentsLabel(1))
	await waitForHook(() => toRows(harness).length === 8)
	expect(requests).toHaveLength(1)
	expect(toButtonLabels(harness.container)).toContain(LESS_LABEL)
})

test("Show more replies loads a comment's replies in place of the few that came with the thread", async () => {
	const replies = [1, 2, 3, 4, 5].map((index) => toTestCommentReply({ id: `reply-${index}`, body: `Reply ${index}` }))
	const { harness, requests } = await renderCommentThread(
		{
			firstPage: toTestCommentThread({
				comments: [toTestComment({ replyCount: 5, replies: [replies[0] as (typeof replies)[number]] })],
			}),
		},
		() => Response.json({ replies, nextCursor: null }),
	)
	expect(toButtonLabels(harness.container)).toContain("Show 4 more replies")
	await press(harness.container, "Show 4 more replies")
	await waitForHook(() => harness.container.querySelectorAll(".replies article").length === 5)

	// the read names the comment, and with every reply shown the control goes
	expect(requests).toEqual([
		{ method: "GET", url: "https://carlnotes.test/api/comments/comment-1/replies", body: null },
	])
	expect(toButtonLabels(harness.container)).not.toContain("Show 4 more replies")
})

test("a reload of the same thread keeps the shown comments and the loaded replies, and another thread starts over", async () => {
	const replies = [1, 2, 3].map((index) => toTestCommentReply({ id: `reply-${index}`, body: `Reply ${index}` }))
	const comments = toNumberedComments(7).map((comment, index) =>
		index === 0 ? { ...comment, replyCount: 3, replies: replies.slice(0, 1) } : comment,
	)
	const threadProps: Partial<CommentThreadProps> = {
		firstPage: toTestCommentThread({ comments, nextCursor: "next-page" }),
	}
	const { harness, requests } = await renderCommentThread(threadProps, ({ url }) =>
		url.includes("/replies") ? Response.json({ replies, nextCursor: null }) : Response.json(EMPTY_COMMENT_THREAD),
	)

	// show every comment and every reply
	await press(harness.container, toMoreCommentsLabel(2))
	await waitForHook(() => toRows(harness).length === 8)
	await press(harness.container, "Show 2 more replies")
	await waitForHook(() => toRows(harness).length === 10)
	const requestCount = requests.length

	// a page read with a new first page, as a bookmark, a read, or a rating reloads it
	threadProps.firstPage = toTestCommentThread({
		comments: toNumberedComments(5).map((comment, index) =>
			index === 0 ? { ...comment, body: "Edited elsewhere", replyCount: 3, replies: replies.slice(0, 1) } : comment,
		),
		nextCursor: "next-page",
		weekCommentCount: 9,
	})
	await harness.render()
	expect(toRows(harness)).toHaveLength(10)
	expect(toRows(harness)[0]?.textContent).toContain("Edited elsewhere")
	expect(requests).toHaveLength(requestCount)

	// another social target starts from its own five
	threadProps.target = { kind: "finding", id: "finding-other" }
	threadProps.firstPage = toTestCommentThread({ comments: toNumberedComments(7) })
	await harness.render()
	await waitForHook(() => toRows(harness).length === 5)
})

test("a comment posted during a read of the next page stays in the thread", async () => {
	const olderPage = Promise.withResolvers<Response>()
	const postedComment = toTestComment({ id: "comment-new", body: "Posted during the read" })
	const { harness } = await renderCommentThread(
		{ firstPage: toTestCommentThread({ comments: toNumberedComments(6), nextCursor: "next-page" }) },
		({ method }) =>
			method === "GET" ? olderPage.promise : Response.json({ comment: postedComment, sharedCommentSlots: null }),
	)

	// the read starts, and a post lands before it ends
	await press(harness.container, toMoreCommentsLabel(1))
	await press(harness.container, COMMENT_THREAD_LABELS.composeButton)
	await act(async () => toComposer()?.onChange("Posted during the read"))
	await act(async () => toComposer()?.onSubmit())
	await waitForHook(() => (toRows(harness)[0]?.textContent ?? "").includes("Posted during the read"))

	// the read ends, and the thread holds the post, the six, and the older page
	await act(async () =>
		olderPage.resolve(Response.json(toTestCommentThread({ comments: [toTestComment({ id: "comment-older" })] }))),
	)
	await waitForHook(() => toButtonLabels(harness.container).includes(toMoreCommentsLabel(2)))
	await press(harness.container, toMoreCommentsLabel(2))
	await waitForHook(() => toRows(harness).length === 8)
	expect(toRows(harness)[0]?.textContent).toContain("Posted during the read")
})

test("a reopened thread shows its cached first page with no read, and a write reads it again", async () => {
	const target = { kind: "finding", id: "finding-cached" } as const
	const firstOpen = await renderCommentThread({ target, firstPage: undefined }, () =>
		Response.json(toTestCommentThread()),
	)
	await waitForHook(() => toRows(firstOpen.harness).length === 3)
	expect(firstOpen.requests).toHaveLength(1)
	await firstOpen.harness.close()
	cleanups.pop()

	// the reopened thread shows its rows at once and reads nothing
	const postedComment = toTestComment({ id: "comment-new", body: "A fresh one" })
	const { harness, requests } = await renderCommentThread({ target, firstPage: undefined }, ({ method }) =>
		method === "GET"
			? Response.json(toTestCommentThread({ comments: [postedComment] }))
			: Response.json({ comment: postedComment, sharedCommentSlots: null }),
	)
	expect(toRows(harness)).toHaveLength(3)
	expect(requests).toHaveLength(0)

	// a post marks the cached page out of date, and the read that follows joins the thread with the post kept
	await press(harness.container, COMMENT_THREAD_LABELS.composeButton)
	await act(async () => toComposer()?.onChange("A fresh one"))
	await act(async () => toComposer()?.onSubmit())
	await waitForHook(() => requests.at(-1)?.method === "GET")
	await waitForHook(() => toRows(harness).length === 1)
	expect(toRows(harness)[0]?.textContent).toContain("A fresh one")
	queryClient.clear()
})
