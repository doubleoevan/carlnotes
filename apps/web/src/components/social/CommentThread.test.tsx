// the shared comment thread and its view event, rendered through plain elements
import { afterEach, expect, mock, test } from "bun:test"
import { toTestComment, toTestCommentThread, toTestOwnComment } from "@carlnotes/contracts/socialTestFixtures"
import { CommentRow } from "@carlnotes/core/components/CommentRow"
import { useCommentThreadViewEvent } from "@carlnotes/core/hooks/useCommentThreadViewEvent"
import { COMMENT_DELETE_CONFIRMATION } from "@carlnotes/core/lib/confirmationCopy"
import { COMMENT_THREAD_LABELS, SCROLLING_COMMENT_CHARS, toReportLabel } from "@carlnotes/core/lib/socialLabels"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { renderTestHook, waitForHook } from "@/lib/hookTestHarness"
import {
	cleanups,
	closeSocialTests,
	ELEMENTS,
	press,
	queryClient,
	REPORT_LABEL,
	renderCommentThread,
	TARGET,
	toButtonLabels,
	toComposer,
	toRows,
} from "./socialTestHarness"

// keep each test's browser environment and transport isolated
afterEach(closeSocialTests)

test("a thread links each stored mention alone, names Carl on a comment with no author, and flags someone else's", async () => {
	const { harness } = await renderCommentThread({
		firstPage: toTestCommentThread({
			comments: [
				...toTestCommentThread().comments,
				toTestComment({
					id: "comment-3",
					body: "@nobody typed this and <b>markup</b>",
					isAuthor: true,
					isEditable: true,
					canDelete: true,
				}),
			],
		}),
	})

	// one link, on the stored mention, and the rest of every body as plain text
	const links = [...harness.container.querySelectorAll("a")]
	expect(links.map((link) => [link.getAttribute("href"), link.textContent])).toEqual([
		["/profiles/user-roast", "@roastmaster"],
	])
	expect(harness.container.querySelector("p b")).toBeNull()
	expect(harness.container.textContent).toContain("@nobody typed this and <b>markup</b>")

	// the first comment's reply nests inside its row, so the thread shows three top-level rows and one reply
	const rows = toRows(harness)
	expect(rows).toHaveLength(4)
	expect(rows[0]?.querySelectorAll(".replies article")).toHaveLength(1)

	// someone else's comment has a flag, Carl's has none, and the user's own has its edit and delete and no flag
	const toControlLabels = (row: HTMLElement | undefined): string[] =>
		toButtonLabels(row ?? document.createElement("div")).filter((label) => !/ \d+$/.test(label))
	expect(toControlLabels(rows[0]).filter((label) => label !== COMMENT_THREAD_LABELS.reply)).toEqual([
		REPORT_LABEL,
		REPORT_LABEL,
	])
	expect(toControlLabels(rows[2])).toEqual([COMMENT_THREAD_LABELS.reply])
	expect(toControlLabels(rows[3])).toEqual([
		COMMENT_THREAD_LABELS.edit,
		COMMENT_THREAD_LABELS.delete,
		COMMENT_THREAD_LABELS.reply,
	])
})

test("a visitor's press on the composer's button or Reply opens sign-up", async () => {
	const { harness, signIns, requests } = await renderCommentThread({ isSignedIn: false })
	await press(harness.container, COMMENT_THREAD_LABELS.composeButton)
	await press(harness.container, COMMENT_THREAD_LABELS.reply)
	expect(signIns).toHaveLength(2)
	expect(toComposer()).toBeNull()

	// a visitor is offered no flag, and the page's own first page needs no read
	expect(toButtonLabels(harness.container)).not.toContain(REPORT_LABEL)
	expect(requests).toHaveLength(0)
})

test("a post names the picked chapter and shows first, and a rejected post keeps the draft with Carl's words", async () => {
	const postedComment = toTestComment({ id: "comment-new", body: "On chapter two", chapterPosition: 1 })
	let isRejected = true
	const { harness, requests } = await renderCommentThread(
		{
			chapters: [
				{ position: 0, title: "Opening" },
				{ position: 1, title: "Replay sets" },
			],
			onChapterPress: () => undefined,
		},
		() =>
			isRejected
				? Response.json({ error: "Carl passed on that.", code: "objectionable_content" }, { status: 422 })
				: Response.json({ comment: postedComment, sharedCommentSlots: null }),
	)
	await press(harness.container, COMMENT_THREAD_LABELS.composeButton)
	await press(harness.container, "pick last chapter")
	await act(async () => toComposer()?.onChange("On chapter two"))

	// the rejected post keeps its draft
	await act(async () => toComposer()?.onSubmit())
	expect(toComposer()?.value).toBe("On chapter two")
	expect(harness.container.querySelector('[role="alert"]')).not.toBeNull()

	// the accepted post names the chapter by position, shows first with its chapter's tag, and closes the composer
	isRejected = false
	await act(async () => toComposer()?.onSubmit())
	await waitForHook(() => toRows(harness).length === 4)
	expect(requests.at(-1)).toEqual({
		method: "POST",
		url: "https://carlnotes.test/api/comments",
		body: { target: TARGET, body: "On chapter two", chapterPosition: 1 },
	})
	expect(toRows(harness)[0]?.textContent).toContain("tag Replay sets")
	expect(harness.container.querySelector("section")).toBeNull()
})

test("a reply names its parent and joins the parent's replies, after the ones already shown", async () => {
	const postedReply = toTestComment({
		id: "reply-new",
		body: "Same here on 7B.",
		parentCommentId: "comment-1",
		isAuthor: true,
	})
	const { harness, requests } = await renderCommentThread({}, () =>
		Response.json({ comment: postedReply, sharedCommentSlots: null }),
	)
	const [parentRow] = toRows(harness)
	expect(parentRow).toBeDefined()
	await press(parentRow as HTMLElement, COMMENT_THREAD_LABELS.reply)
	expect(harness.container.querySelector("section")?.getAttribute("aria-label")).toBe(COMMENT_THREAD_LABELS.reply)
	await act(async () => toComposer()?.onChange("Same here on 7B."))
	await act(async () => toComposer()?.onSubmit())
	await waitForHook(() => (parentRow as HTMLElement).querySelectorAll(".replies article").length === 2)

	// the post names the top-level comment, and the reply shows last under it
	expect(requests.at(-1)?.body).toEqual({ target: TARGET, body: "Same here on 7B.", parentCommentId: "comment-1" })
	const replyBodies = [...(parentRow as HTMLElement).querySelectorAll(".replies article p")].map(
		(body) => body.textContent,
	)
	expect(replyBodies).toEqual(["It held up on a 3B model for me.", "Same here on 7B."])
	expect(toRows(harness)).toHaveLength(4)
})

test("the author's Edit stays disabled past the edit time and says why", async () => {
	const { harness } = await renderCommentThread({
		firstPage: toTestCommentThread({ comments: [toTestOwnComment({ isEditable: false })] }),
	})
	const editButton = harness.container.querySelector<HTMLButtonElement>(
		`button[title="${COMMENT_THREAD_LABELS.editLocked}"]`,
	)
	expect(editButton?.disabled).toBe(true)
	expect(editButton?.textContent).toBe(COMMENT_THREAD_LABELS.edit)
	expect(toButtonLabels(harness.container)).toContain(COMMENT_THREAD_LABELS.delete)
})

test("Delete waits for its confirmation, then removes the comment", async () => {
	const { harness, requests } = await renderCommentThread(
		{ firstPage: toTestCommentThread({ comments: [toTestOwnComment(), toTestComment({ id: "comment-2" })] }) },
		() => Response.json({ ok: true, weekCommentCount: 0, sharedCommentSlots: null }),
	)
	await press(harness.container, COMMENT_THREAD_LABELS.delete)
	expect(requests).toHaveLength(0)
	await press(harness.container, COMMENT_DELETE_CONFIRMATION.title)
	await waitForHook(() => toRows(harness).length === 1)
	expect(requests).toEqual([{ method: "DELETE", url: "https://carlnotes.test/api/comments/comment-own", body: null }])
	expect(harness.container.textContent).not.toContain(COMMENT_DELETE_CONFIRMATION.title)
})

test("the week's count rises with a post, and takes the api's count after a delete", async () => {
	const weekCommentCounts: number[] = []
	const { harness } = await renderCommentThread(
		{
			firstPage: toTestCommentThread({ comments: [toTestComment({ canDelete: true })], weekCommentCount: 3 }),
			onWeekCommentCountChange: (weekCommentCount) => weekCommentCounts.push(weekCommentCount),
		},
		({ method }) =>
			method === "DELETE"
				? Response.json({ ok: true, weekCommentCount: 2, sharedCommentSlots: null })
				: Response.json({ comment: toTestComment({ id: "comment-new" }), sharedCommentSlots: null }),
	)
	expect(weekCommentCounts).toEqual([3])

	// a post adds one
	await press(harness.container, COMMENT_THREAD_LABELS.composeButton)
	await act(async () => toComposer()?.onChange("One more"))
	await act(async () => toComposer()?.onSubmit())
	await waitForHook(() => weekCommentCounts.at(-1) === 4)

	// a delete, with its replies, takes the count the api read
	await press(toRows(harness)[1] as HTMLElement, COMMENT_THREAD_LABELS.delete)
	await press(harness.container, COMMENT_DELETE_CONFIRMATION.title)
	await waitForHook(() => weekCommentCounts.at(-1) === 2)
})

test("the thread's whole count rises with a post, and takes the api's count after a delete", async () => {
	const commentCounts: (number | null)[] = []
	const { harness } = await renderCommentThread(
		{
			firstPage: toTestCommentThread({ comments: [toTestComment({ canDelete: true })], commentCount: 9 }),
			onCommentCountChange: (commentCount) => commentCounts.push(commentCount),
		},
		({ method }) =>
			method === "DELETE"
				? Response.json({ ok: true, weekCommentCount: 2, commentCount: 7, sharedCommentSlots: null })
				: Response.json({ comment: toTestComment({ id: "comment-new" }), sharedCommentSlots: null }),
	)
	expect(commentCounts).toEqual([9])

	// a post adds one
	await press(harness.container, COMMENT_THREAD_LABELS.composeButton)
	await act(async () => toComposer()?.onChange("One more"))
	await act(async () => toComposer()?.onSubmit())
	await waitForHook(() => commentCounts.at(-1) === 10)

	// a delete, with its replies, takes the count the api read
	await press(toRows(harness)[1] as HTMLElement, COMMENT_THREAD_LABELS.delete)
	await press(harness.container, COMMENT_DELETE_CONFIRMATION.title)
	await waitForHook(() => commentCounts.at(-1) === 7)
})

test("a first page from an api that does not count the thread reports a null whole count", async () => {
	const commentCounts: (number | null)[] = []
	await renderCommentThread({
		firstPage: toTestCommentThread(),
		onCommentCountChange: (commentCount) => commentCounts.push(commentCount),
	})
	expect(commentCounts).toEqual([null])
})

test("a row's flag fills if a read found the user's report, or once they send one", async () => {
	const { harness } = await renderCommentThread({
		firstPage: toTestCommentThread({
			comments: [
				toTestComment({ id: "reported-on-load", isReported: true }),
				toTestComment({ id: "reported-just-now" }),
				toTestComment({ id: "not-reported" }),
			],
		}),
	})

	// the cache write of a sent report, under the key the sending hook uses
	const toReportLabels = (): string[] => toButtonLabels(harness.container).filter((label) => label.includes("eport"))
	act(() => {
		queryClient.setQueryData(["reportedSubject", "comment", "reported-just-now"], true)
	})
	await waitForHook(() => toReportLabels()[1]?.endsWith("(reported)") === true)

	// the first two filled and the third left alone
	expect(toReportLabels()).toEqual([
		`${toReportLabel(true)} (reported)`,
		`${toReportLabel(true)} (reported)`,
		REPORT_LABEL,
	])
})

test("a thread with no first page reads it, and a failed read offers a retry", async () => {
	let isFailing = true
	const { harness, requests } = await renderCommentThread({ firstPage: undefined }, () =>
		isFailing ? new Response(null, { status: 500 }) : Response.json(toTestCommentThread()),
	)
	await waitForHook(() => (harness.container.textContent ?? "").includes(COMMENT_THREAD_LABELS.loadError))
	isFailing = false
	await press(harness.container, "Try again")
	await waitForHook(() => toRows(harness).length === 3)
	expect(requests.map((request) => request.url)).toEqual([
		"https://carlnotes.test/api/comments?kind=finding&id=finding-1",
		"https://carlnotes.test/api/comments?kind=finding&id=finding-1",
	])
})

test("a thread's showing sends one view event with ids and no text, and another thread sends its own", async () => {
	const captureVisitEvent = mock((_event: string, _properties: object) => {})
	const toHook = (id: string) => () =>
		useCommentThreadViewEvent({
			target: { kind: "podcastEpisode", id },
			topicId: "topic-1",
			isTopicOwner: true,
			captureVisitEvent,
		})
	const harness = await renderTestHook(toHook("podcast-episode-1"))
	cleanups.push(harness.close)

	// a second render of the same thread sends nothing more
	await harness.render()
	expect(captureVisitEvent.mock.calls).toEqual([
		["social_podcast_episode_hot_takes_view", { objectId: "podcast-episode-1", topicId: "topic-1", isOwner: true }],
	])
	await harness.render(toHook("podcast-episode-2"))
	expect(captureVisitEvent).toHaveBeenCalledTimes(2)
})

test("only a super long comment scrolls", () => {
	const toRowHtml = (body: string): string =>
		renderToStaticMarkup(
			<QueryClientProvider client={new QueryClient()}>
				<CommentRow
					comment={toTestComment({ body })}
					chapterByPosition={new Map()}
					isSignedIn
					sharedCommentSlots={null}
					onSignIn={() => {}}
					onError={() => {}}
					onReactionsChange={() => {}}
					onReport={() => {}}
					onReply={() => {}}
					onEdit={() => {}}
					onDelete={() => {}}
					onShare={() => {}}
					onMoreReplies={() => {}}
					elements={ELEMENTS}
				/>
			</QueryClientProvider>,
		)
	expect(toRowHtml("a".repeat(SCROLLING_COMMENT_CHARS))).toContain('data-scrolling="false"')
	expect(toRowHtml("a".repeat(SCROLLING_COMMENT_CHARS + 1))).toContain('data-scrolling="true"')
})
